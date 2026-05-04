import { simpleGit } from 'simple-git';
import type { ResolveDecision, ResolveResponse } from '@awesome-markdown/contracts';
import type { ConflictSessionData } from './session.js';
import type { ConflictSessionManager } from './session.js';
import type { SseHub } from '../sse-hub.js';
import type { RemoteConfig } from '../remote-config.js';

export interface ResolveParams {
  session: ConflictSessionData;
  sessionManager: ConflictSessionManager;
  decisions: Record<string, ResolveDecision>;
  hub: SseHub;
  remoteConfig: RemoteConfig | null;
  commitAuthorName: string;
  commitAuthorEmail: string;
}

/**
 * Apply per-path conflict decisions to the working tree.
 *
 * For 'ours':     git checkout --ours <path> && git add <path>
 * For 'theirs':   git checkout --theirs <path> && git add <path>
 * For 'external': record decision, do NOT stage (user will edit manually)
 *
 * If all pending paths are resolved after applying, completes the merge commit,
 * pushes to the remote (if configured), emits `synced`, and clears the session.
 *
 * Idempotent: re-applying decisions to already-staged paths is a git no-op.
 */
export async function applyConflictDecisions(
  params: ResolveParams,
): Promise<ResolveResponse> {
  const { session, sessionManager, decisions, hub, remoteConfig, commitAuthorName, commitAuthorEmail } = params;

  const git = simpleGit({
    baseDir: session.repoRoot,
    config: [
      `user.name=${commitAuthorName}`,
      `user.email=${commitAuthorEmail}`,
    ],
  });

  // Apply each decision
  for (const [filePath, decision] of Object.entries(decisions)) {
    if (decision === 'external') {
      sessionManager.recordDecision(filePath, 'external');
      continue;
    }

    // 'ours' or 'theirs': checkout the appropriate side and stage
    await git.raw(['checkout', `--${decision}`, '--', filePath]);
    await git.add(filePath);
    sessionManager.recordDecision(filePath, decision);
  }

  const remainingPaths = sessionManager.getPendingPaths();

  if (remainingPaths.length > 0) {
    return { status: 'pending', remainingPaths };
  }

  // All paths resolved — complete the merge
  sessionManager.setCompleting();
  try {
    await git.raw(['commit', '--no-edit']);
  } catch (commitErr) {
    const errMsg = commitErr instanceof Error ? commitErr.message : String(commitErr);
    // If the working tree is already clean (e.g. file watcher committed the merge
    // before us), check whether MERGE_HEAD is gone — if so, the merge commit was
    // already made and we can proceed normally.
    const nothingToCommit =
      errMsg.includes('nothing to commit') ||
      errMsg.includes('nothing added to commit');
    if (!nothingToCommit) {
      // Try with explicit message for cases where MERGE_MSG is absent
      const msg = `Merge: resolved ${session.paths.length} conflict(s)`;
      await git.raw(['commit', '-m', msg]);
    }
    // else: merge was already committed (race with file watcher) — continue to push + synced
  }

  // Push if remote is configured
  if (remoteConfig) {
    try {
      const { pushOnce } = await import('../pusher.js');
      await pushOnce({
        repoRoot: session.repoRoot,
        remoteConfig,
      });
    } catch {
      // Push failure is non-fatal for the resolution itself
    }
  }

  // Emit synced and clear session
  hub.broadcast({ type: 'synced' });
  const tempDirs = sessionManager.complete();

  // Clean up temp dirs from inject endpoint
  if (tempDirs.length > 0) {
    const { rm } = await import('node:fs/promises');
    for (const dir of tempDirs) {
      try {
        await rm(dir, { recursive: true, force: true });
      } catch {
        // Best-effort
      }
    }
  }

  return { status: 'completed', remainingPaths: [] };
}
