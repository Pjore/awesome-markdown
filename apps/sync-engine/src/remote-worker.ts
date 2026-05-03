/**
 * Remote sync worker: Mutex, context interface, and pull/push/conflict tasks
 * extracted from engine.ts to keep each file ≤ 400 lines (AC-8).
 */
import path from 'node:path';
import { pullOnce } from './puller.js';
import { pushOnce } from './pusher.js';
import { detectConflict } from './conflict-detector.js';
import { simpleGit } from 'simple-git';
import type { TaskOutcome } from './retry-scheduler.js';
import type { PullResult, PushResult } from './types.js';
import type { RemoteConfig } from './remote-config.js';
import type { PullFault } from './puller.js';
import type { PushFault } from './pusher.js';
import type { OfflineState } from './offline-state.js';
import type { ConflictSessionManager } from './conflict/session.js';
import type { SseHub } from './sse-hub.js';
import type { RetryScheduler } from './retry-scheduler.js';

// ---------------------------------------------------------------------------
// Mutex
// ---------------------------------------------------------------------------

/**
 * Serialises asynchronous tasks so that commit, push, and pull operations
 * never run concurrently against the same git repository.
 */
export class Mutex {
  private pending: Promise<void> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.pending.then(() => fn());
    this.pending = result.then(
      () => {},
      () => {},
    );
    return result;
  }
}

// ---------------------------------------------------------------------------
// Shared context passed to every remote worker function
// ---------------------------------------------------------------------------

export interface RemoteContext {
  readonly repoRoot: string;
  readonly contentDir: string;
  readonly pushTimeoutMs: number | undefined;
  readonly hub: SseHub;
  readonly offlineState: OfflineState;
  readonly conflictSessionManager: ConflictSessionManager;
  readonly mutex: Mutex;
  /** Always non-null when a remote worker function is invoked. */
  readonly remoteConfig: RemoteConfig;
  readonly pullFault: PullFault | undefined;
  readonly pushFault: PushFault | undefined;
  /**
   * When false, targetBranch was auto-detected at startup and may be stale
   * if the user switches branches. refresh() is called before each push/pull
   * to re-read the current local branch from git.
   */
  readonly hasExplicitTargetBranch: boolean;
  isRunning(): boolean;
  isConflictPending(): boolean;
  setConflictPending(v: boolean): void;
  getPullScheduler(): RetryScheduler | null;
  getPushScheduler(): RetryScheduler | null;
  recordPullAt(ts: number): void;
  recordPushAt(ts: number): void;
}

// ---------------------------------------------------------------------------
// Worker functions
// ---------------------------------------------------------------------------

/**
 * Execute one pull iteration.
 * Guards (remoteConfig non-null, not conflictPending, running) must be checked
 * by the caller before invoking this function.
 */
export async function pullTask(ctx: RemoteContext): Promise<TaskOutcome> {
  let result!: PullResult;
  await ctx.mutex.run(async () => {
    if (!ctx.hasExplicitTargetBranch) {
      await ctx.remoteConfig.refresh();
    }
    result = await pullOnce({
      repoRoot: ctx.repoRoot,
      contentDir: ctx.contentDir,
      remoteConfig: ctx.remoteConfig,
      fault: ctx.pullFault,
    });
  });

  ctx.recordPullAt(Date.now());

  if (result.kind === 'up-to-date') {
    ctx.offlineState.reportSuccess();
    return 'success';
  }

  if (result.kind === 'fast-forwarded') {
    ctx.offlineState.reportSuccess();
    const firstPath = result.paths[0] ?? '';
    ctx.hub.broadcast({
      type: 'change',
      path: firstPath,
      paths: result.paths,
      commitSha: result.toSha,
      source: 'external',
    });
    ctx.hub.broadcast({ type: 'synced' });
    return 'success';
  }

  if (result.kind === 'cannot-fast-forward') {
    ctx.offlineState.reportSuccess(); // remote was reachable
    await handleConflict(ctx, result.localSha, result.remoteSha);
    return 'conflict';
  }

  if (result.kind === 'network-failure') {
    ctx.offlineState.reportFailure(result.reason);
    return 'network-failure';
  }

  return 'skip';
}

/**
 * Execute one push iteration (used by the retry scheduler).
 * Guards (remoteConfig non-null, not conflictPending, running) must be checked
 * by the caller before invoking this function.
 */
export async function pushTask(ctx: RemoteContext): Promise<TaskOutcome> {
  let result!: PushResult;
  await ctx.mutex.run(async () => {
    if (!ctx.hasExplicitTargetBranch) {
      await ctx.remoteConfig.refresh();
    }
    result = await pushOnce({
      repoRoot: ctx.repoRoot,
      remoteConfig: ctx.remoteConfig,
      timeoutMs: ctx.pushTimeoutMs,
      fault: ctx.pushFault,
    });
  });

  return handlePushResult(ctx, result);
}

/**
 * Map a PushResult to a TaskOutcome and apply side-effects (SSE, scheduler).
 */
export function handlePushResult(ctx: RemoteContext, result: PushResult): TaskOutcome {
  ctx.recordPushAt(Date.now());

  if (result.kind === 'pushed') {
    ctx.offlineState.reportSuccess();
    ctx.hub.broadcast({ type: 'synced' });
    return 'success';
  }

  if (result.kind === 'up-to-date') {
    ctx.offlineState.reportSuccess();
    ctx.hub.broadcast({ type: 'synced' });
    return 'success';
  }

  if (result.kind === 'rejected-non-ff') {
    // Remote has diverged — trigger an immediate pull
    ctx.offlineState.reportSuccess();
    void ctx.getPullScheduler()?.manualTick();
    return 'success';
  }

  if (result.kind === 'network-failure') {
    ctx.offlineState.reportFailure(result.reason);
    // Activate push retry scheduler
    const pushScheduler = ctx.getPushScheduler();
    if (pushScheduler && !pushScheduler['running' as never]) {
      pushScheduler.start();
    }
    return 'network-failure';
  }

  return 'skip';
}

/**
 * Attempt a real git merge, produce conflict markers, create a session, and
 * broadcast the conflict event over SSE.
 * Caller must ensure remoteConfig is non-null (available via ctx).
 */
export async function handleConflict(
  ctx: RemoteContext,
  localSha: string,
  remoteSha: string,
): Promise<void> {
  ctx.setConflictPending(true);
  ctx.getPullScheduler()?.setConflictPending(true);
  ctx.getPushScheduler()?.setConflictPending(true);

  const conflictEvent = await detectConflict({
    repoRoot: ctx.repoRoot,
    contentDir: ctx.contentDir,
    branch: ctx.remoteConfig.branch,
    localSha,
    remoteSha,
  });

  if (!conflictEvent) return;

  // M8: Attempt the real merge to produce conflict markers in the working tree.
  const git = simpleGit({ baseDir: ctx.repoRoot });
  const branch = ctx.remoteConfig.branch;
  let actualConflictedPaths: string[] = conflictEvent.paths;

  // NOTE: simpleGit.raw(['merge', ...]) does NOT throw on conflict — it returns
  // the stdout string containing "Automatic merge failed". We must check both
  // the return value and git status to determine whether a conflict occurred.
  let mergeOutput = '';
  let mergeThrew = false;
  try {
    mergeOutput = await git.raw(['merge', `refs/remotes/origin/${branch}`]);
  } catch (err) {
    mergeThrew = true;
    mergeOutput = String(err);
  }

  const mergeConflicted =
    mergeThrew || mergeOutput.includes('Automatic merge failed');

  if (!mergeConflicted) {
    // Merge succeeded without conflicts — broadcast synced and clear pending
    ctx.setConflictPending(false);
    ctx.getPullScheduler()?.setConflictPending(false);
    ctx.getPushScheduler()?.setConflictPending(false);
    ctx.hub.broadcast({ type: 'synced' });
    return;
  }

  // Conflict markers were written to disk — refine the path list from status
  try {
    const status = await git.status();
    const contentAbsPath = path.join(ctx.repoRoot, ctx.contentDir);
    const fromStatus = status.conflicted.filter((p) => {
      const abs = path.resolve(ctx.repoRoot, p);
      return (
        abs.startsWith(contentAbsPath + path.sep) ||
        abs.startsWith(contentAbsPath + '/')
      );
    });
    if (fromStatus.length > 0) actualConflictedPaths = fromStatus;
  } catch {
    // Keep detectConflict paths as fallback
  }

  // M8: Create conflict session
  try {
    ctx.conflictSessionManager.create({
      repoRoot: ctx.repoRoot,
      branch,
      paths: actualConflictedPaths,
    });
  } catch {
    // Session already exists — skip creation but still broadcast
  }

  const session = ctx.conflictSessionManager.getActive();
  ctx.hub.broadcast({
    type: 'conflict',
    paths: actualConflictedPaths,
    diffHunks: conflictEvent.diffHunks,
    mergeId: session?.mergeId,
  });
}

/**
 * Immediately push after a local commit.
 * Guards (remoteConfig non-null, not conflictPending) must be checked by the
 * caller before invoking this function.
 */
export async function pushAfterCommit(ctx: RemoteContext): Promise<void> {
  let result: PushResult;
  try {
    result = await ctx.mutex.run(async () => {
      if (!ctx.hasExplicitTargetBranch) {
        await ctx.remoteConfig.refresh();
      }
      return pushOnce({
        repoRoot: ctx.repoRoot,
        remoteConfig: ctx.remoteConfig,
        timeoutMs: ctx.pushTimeoutMs,
        fault: ctx.pushFault,
      });
    });
  } catch {
    result = { kind: 'network-failure', reason: 'unknown' };
  }
  handlePushResult(ctx, result);
}
