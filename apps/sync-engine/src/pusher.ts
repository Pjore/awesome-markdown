import { simpleGit } from 'simple-git';
import type { NetworkFailureReason, PushResult } from './types.js';
import type { RemoteConfig } from './remote-config.js';
import { classifyGitError } from './puller.js';

/**
 * Optional fault injector for testing.
 * When enabled, pushOnce returns a network-failure without invoking git.
 */
export interface PushFault {
  shouldFail(): boolean;
  getReason(): NetworkFailureReason;
}

export interface PushOnceParams {
  repoRoot: string;
  remoteConfig: RemoteConfig;
  /** Timeout in milliseconds. Not enforced on git subprocess; used as a hint. */
  timeoutMs?: number;
  /** Optional fault injector (test use only). */
  fault?: PushFault;
}

/**
 * Push the current branch to origin using the authenticated URL.
 *
 * Returns a typed PushResult without throwing.
 * Does NOT force-push. Does NOT emit SSE events.
 */
export async function pushOnce(params: PushOnceParams): Promise<PushResult> {
  const { repoRoot, remoteConfig, fault } = params;

  if (fault?.shouldFail()) {
    return { kind: 'network-failure', reason: fault.getReason() };
  }

  const git = simpleGit({ baseDir: repoRoot });
  const branch = remoteConfig.branch;
  const authenticatedUrl = remoteConfig.getAuthenticatedUrl();

  // Capture current HEAD for the result
  let sha: string;
  try {
    sha = (await git.revparse(['HEAD'])).trim();
  } catch {
    sha = 'unknown';
  }

  // Check if there's anything to push: compare HEAD with remote tracking ref
  try {
    const remoteSha = (
      await git.revparse([`refs/remotes/origin/${branch}`])
    ).trim();
    if (sha === remoteSha) {
      return { kind: 'up-to-date' };
    }
  } catch {
    // Remote tracking ref doesn't exist yet — proceed with push
  }

  try {
    await git.raw(['push', authenticatedUrl, `HEAD:refs/heads/${branch}`]);
    return { kind: 'pushed', sha };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const lowerMsg = msg.toLowerCase();

    // Rejected non-fast-forward (remote has diverged)
    if (
      lowerMsg.includes('rejected') ||
      lowerMsg.includes('non-fast-forward') ||
      lowerMsg.includes('[rejected]')
    ) {
      return { kind: 'rejected-non-ff' };
    }

    // Classify network/auth failures
    const reason = classifyGitError(err);
    if (reason) return { kind: 'network-failure', reason };

    return { kind: 'network-failure', reason: 'unknown' };
  }
}
