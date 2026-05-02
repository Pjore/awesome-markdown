import path from 'node:path';
import { simpleGit } from 'simple-git';
import type { NetworkFailureReason, PullResult } from './types.js';
import type { RemoteConfig } from './remote-config.js';
import { MintFailureError } from './github-app/index.js';

/**
 * Classifies a git error into a NetworkFailureReason.
 * Returns null if the error does not look like a network/auth failure.
 */
export function classifyGitError(error: unknown): NetworkFailureReason | null {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();

  if (lower.includes('could not resolve host') || lower.includes('name or service not known') || lower.includes('enotfound')) {
    return 'dns';
  }
  if (lower.includes('connection refused') || lower.includes('econnrefused')) {
    return 'refused';
  }
  if (lower.includes('timed out') || lower.includes('etimedout') || lower.includes('operation timed out')) {
    return 'timeout';
  }
  if (lower.includes('ssl') || lower.includes('tls') || lower.includes('certificate')) {
    return 'tls';
  }
  if (lower.includes('401') || lower.includes('403') || lower.includes('authentication failed') || lower.includes('invalid credentials')) {
    return 'auth';
  }
  if (/5\d\d/.test(lower) && lower.includes('http')) {
    return 'http-5xx';
  }
  // Repository not found often means auth failure for private repos
  if (lower.includes('repository not found') || lower.includes('remote: not found')) {
    return 'auth';
  }
  return null;
}

/**
 * Optional fault injector for testing.
 * When enabled, pullOnce returns a network-failure without invoking git.
 */
export interface PullFault {
  shouldFail(): boolean;
  getReason(): NetworkFailureReason;
}

export interface PullOnceParams {
  repoRoot: string;
  contentDir: string;
  remoteConfig: RemoteConfig;
  /** Optional fault injector (test use only). */
  fault?: PullFault;
}

/**
 * Perform a single pull cycle:
 *   1. git fetch <authenticatedUrl> <branch>
 *   2. git merge --ff-only refs/remotes/origin/<branch>
 *
 * Returns a typed PullResult without throwing.
 * Does NOT emit SSE events; the caller (Engine) handles broadcasts.
 */
export async function pullOnce(params: PullOnceParams): Promise<PullResult> {
  const { repoRoot, contentDir, remoteConfig, fault } = params;

  if (fault?.shouldFail()) {
    return { kind: 'network-failure', reason: fault.getReason() };
  }

  const git = simpleGit({ baseDir: repoRoot });
  const branch = remoteConfig.branch;

  let authenticatedUrl: string;
  try {
    authenticatedUrl = await remoteConfig.getAuthenticatedUrl();
  } catch (err) {
    if (err instanceof MintFailureError) {
      return { kind: 'network-failure', reason: 'auth' };
    }
    return { kind: 'network-failure', reason: 'unknown' };
  }

  const contentAbsPath = path.join(repoRoot, contentDir);

  // Check for uncommitted changes in contentDir — defer if present
  try {
    const status = await git.status();
    const dirtyInContent = [
      ...status.modified,
      ...status.created,
      ...status.deleted,
      ...status.not_added,
    ].some((p) => {
      const abs = path.resolve(repoRoot, p);
      return abs.startsWith(contentAbsPath);
    });
    if (dirtyInContent) {
      // Defer — the committer will clean this up
      return { kind: 'up-to-date' };
    }
  } catch (err) {
    const reason = classifyGitError(err);
    return { kind: 'network-failure', reason: reason ?? 'unknown' };
  }

  // Record current HEAD before fetch
  let fromSha: string;
  try {
    fromSha = (await git.revparse(['HEAD'])).trim();
  } catch {
    fromSha = 'unknown';
  }

  // Step 1: Fetch
  try {
    await git.raw([
      'fetch',
      authenticatedUrl,
      `+refs/heads/${branch}:refs/remotes/origin/${branch}`,
    ]);
  } catch (err) {
    const reason = classifyGitError(err);
    if (reason) return { kind: 'network-failure', reason };
    // Non-network error (e.g. local repo issue) — classify as unknown failure
    return { kind: 'network-failure', reason: 'unknown' };
  }

  // Check if already up to date
  let remoteSha: string;
  try {
    remoteSha = (await git.revparse([`refs/remotes/origin/${branch}`])).trim();
  } catch {
    return { kind: 'up-to-date' };
  }

  if (fromSha === remoteSha) {
    return { kind: 'up-to-date' };
  }

  // Step 2: Attempt fast-forward merge
  try {
    await git.raw(['merge', '--ff-only', `refs/remotes/origin/${branch}`]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const lowerMsg = msg.toLowerCase();

    // Classify: cannot fast-forward (diverged branches)
    if (
      lowerMsg.includes('not possible to fast-forward') ||
      lowerMsg.includes('not a fast-forward') ||
      lowerMsg.includes('refusing to merge unrelated') ||
      lowerMsg.includes('fatal: not possible') ||
      lowerMsg.includes('diverged')
    ) {
      return { kind: 'cannot-fast-forward', localSha: fromSha, remoteSha };
    }

    // Network or other failure
    const reason = classifyGitError(err);
    if (reason) return { kind: 'network-failure', reason };
    return { kind: 'cannot-fast-forward', localSha: fromSha, remoteSha };
  }

  // Fast-forward succeeded — compute changed paths
  const toSha = (await git.revparse(['HEAD'])).trim();

  let changedPaths: string[] = [];
  try {
    const diffOutput = await git.raw([
      'diff', '--name-only', fromSha, toSha,
    ]);
    changedPaths = diffOutput
      .split('\n')
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
      .filter((p) => {
        const abs = path.resolve(repoRoot, p);
        return abs.startsWith(contentAbsPath);
      });
  } catch {
    changedPaths = [];
  }

  return { kind: 'fast-forwarded', paths: changedPaths, fromSha, toSha };
}
