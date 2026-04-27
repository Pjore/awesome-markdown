import path from 'node:path';
import { simpleGit } from 'simple-git';
import type { SyncEvent } from '@awesome-markdown/contracts';

/**
 * Conflict detection for the sync-engine.
 *
 * When a pull returns `cannot-fast-forward`, this module computes:
 *  - The set of paths modified on BOTH local and remote sides since their
 *    common ancestor (filtered to contentDir).
 *  - Per-path unified-diff hunks (local side) for the conflict event payload.
 *
 * Does NOT mutate the working tree or refs.
 */

/** Maximum bytes per diff hunk included in the conflict event payload. */
const MAX_HUNK_BYTES = 16 * 1024; // 16 KB per file

export interface DetectConflictParams {
  repoRoot: string;
  contentDir: string;
  branch: string;
  /** Local HEAD SHA (from PullResult.cannot-fast-forward). */
  localSha: string;
  /** Remote SHA (from PullResult.cannot-fast-forward). */
  remoteSha: string;
}

/**
 * Compute conflict information after a failed fast-forward pull.
 *
 * Returns a `conflict` SyncEvent conforming to the M1 contract, or null if
 * no overlapping paths are found in contentDir (i.e. the diverge is outside
 * the watched directory — not a conflict from the engine's perspective).
 */
export async function detectConflict(
  params: DetectConflictParams,
): Promise<SyncEvent & { type: 'conflict' } | null> {
  const { repoRoot, contentDir, branch, localSha, remoteSha } = params;

  const git = simpleGit({ baseDir: repoRoot });
  const contentAbsPath = path.join(repoRoot, contentDir);

  // Find the common ancestor
  let baseSha: string;
  try {
    baseSha = (
      await git.raw(['merge-base', localSha, `refs/remotes/origin/${branch}`])
    ).trim();
  } catch {
    // If merge-base fails, use the remote SHA as a fallback
    baseSha = remoteSha;
  }

  // Paths changed on the local side since base
  let localPaths: string[] = [];
  try {
    const output = await git.raw(['diff', '--name-only', baseSha, localSha]);
    localPaths = parseNameOnly(output, repoRoot, contentAbsPath);
  } catch {
    localPaths = [];
  }

  // Paths changed on the remote side since base
  let remotePaths: string[] = [];
  try {
    const output = await git.raw([
      'diff', '--name-only', baseSha, `refs/remotes/origin/${branch}`,
    ]);
    remotePaths = parseNameOnly(output, repoRoot, contentAbsPath);
  } catch {
    remotePaths = [];
  }

  // Intersection: paths modified on both sides
  const remoteSet = new Set(remotePaths);
  const conflictPaths = localPaths.filter((p) => remoteSet.has(p));

  if (conflictPaths.length === 0) {
    return null;
  }

  // Build diff hunks (local side relative to base) for each conflicting path
  const diffHunks: string[] = [];
  for (const relPath of conflictPaths) {
    let hunk = '';
    try {
      hunk = await git.raw(['diff', baseSha, localSha, '--', relPath]);
    } catch {
      hunk = '';
    }
    // Cap size to keep payload bounded
    if (Buffer.byteLength(hunk) > MAX_HUNK_BYTES) {
      hunk = hunk.slice(0, MAX_HUNK_BYTES) + '\n... (truncated)';
    }
    diffHunks.push(hunk);
  }

  return {
    type: 'conflict',
    paths: conflictPaths,
    diffHunks,
  };
}

/** Parse `git diff --name-only` output into an array of relative paths,
 *  filtered to files inside contentAbsPath. */
function parseNameOnly(
  output: string,
  repoRoot: string,
  contentAbsPath: string,
): string[] {
  return output
    .split('\n')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .filter((p) => {
      const abs = path.resolve(repoRoot, p);
      return abs.startsWith(contentAbsPath);
    });
}
