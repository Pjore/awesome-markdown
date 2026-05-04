import path from 'node:path';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { FileWatcher } from './watcher.js';
import { Debouncer } from './debouncer.js';
import { Committer } from './committer.js';
import { SourceClassifier } from './source-classifier.js';
import { SseHub } from './sse-hub.js';
import { createRemoteConfig } from './remote-config.js';
import { RetryScheduler } from './retry-scheduler.js';
import { OfflineState } from './offline-state.js';
import { ConflictSessionManager } from './conflict/session.js';
import { simpleGit } from 'simple-git';
import { createGitCredentialProvider, MintFailureError } from './github-app/index.js';
import {
  Mutex,
  pullTask,
  pushTask,
  handlePushResult,
  handleConflict,
  pushAfterCommit as pushAfterCommitWorker,
  type RemoteContext,
} from './remote-worker.js';
import type { EngineConfig, EngineStatus, CommitResult, PushResult, WebhookTriggerReason } from './types.js';
import type { RawFsEvent, Batch } from './types.js';
import type { RemoteConfig } from './remote-config.js';
import type { GitCredentialProvider } from './github-app/index.js';
import type { PullFault } from './puller.js';
import type { PushFault } from './pusher.js';
import type { ConflictState } from '@awesome-markdown/contracts';

/**
 * Orchestrates the full watcher → debouncer → committer → (push) → SSE pipeline.
 * When remote is enabled, also runs a periodic pull loop.
 *
 * Lifecycle: `start()` → (events) → `stop()`
 */
export class Engine {
  private readonly watcher: FileWatcher;
  private readonly debouncer: Debouncer;
  private readonly committer: Committer;
  private readonly classifier: SourceClassifier;
  readonly hub: SseHub;
  /** M8: Conflict session manager — tracks the single active merge conflict. */
  readonly conflictSessionManager: ConflictSessionManager;

  private running = false;
  private lastCommit: EngineStatus['lastCommit'];
  private pendingPaths: string[] = [];

  // Remote sync state
  private remoteConfig: RemoteConfig | null = null;
  private credentialProvider: GitCredentialProvider | null = null;
  private readonly mutex = new Mutex();
  private pullScheduler: RetryScheduler | null = null;
  private pushScheduler: RetryScheduler | null = null;
  private readonly offlineState: OfflineState;
  private conflictPending = false;
  private lastPullAt: number | undefined;
  private lastPushAt: number | undefined;

  // Test-injectable faults
  private _pullFault: PullFault | undefined;
  private _pushFault: PushFault | undefined;

  // Webhook single-flight coalescing state
  private _webhookPullInFlight = false;
  private _webhookPullQueued = false;

  constructor(
    private readonly config: EngineConfig,
    hub?: SseHub,
    /** Optional pre-built credential provider (for tests; skips factory construction). */
    credentialProvider?: GitCredentialProvider,
  ) {
    this.credentialProvider = credentialProvider ?? null;
    this.hub = hub ?? new SseHub();
    this.conflictSessionManager = new ConflictSessionManager();
    this.classifier = new SourceClassifier();
    this.committer = new Committer(config);
    this.offlineState = new OfflineState({ consecutiveFailuresForOffline: 2 });
    this.debouncer = new Debouncer(config.debounceMs, (batch) => {
      void this._onBatch(batch);
    });
    this.watcher = new FileWatcher(config);

    this.watcher.on('change', (raw: RawFsEvent) => {
      this.pendingPaths.push(path.relative(config.repoRoot, raw.path));
      this.debouncer.push(raw);
    });

    this.watcher.on('error', (err: Error) => {
      this.hub.broadcast({
        type: 'offline',
        reason: `Watcher error: ${err.message}`,
      });
    });

    this.watcher.on('restart', () => {
      // Watcher restarted after a failure — pending paths are still in debouncer
    });

    // Wire offline state machine → SSE broadcasts
    this.offlineState.onTransition((t) => {
      if (t.type === 'went-offline') {
        this.hub.broadcast({ type: 'offline', reason: t.reason });
      } else if (t.type === 'recovered') {
        this.hub.broadcast({ type: 'synced' });
      }
    });
  }

  async start(): Promise<void> {
    this.running = true;

    // UC-2: commit any unstaged changes that accumulated while engine was offline
    try {
      const catchUp = await this.committer.commitUnstaged(randomUUID());
      if (catchUp && !catchUp.noop) {
        this._recordCommit(catchUp);
        this.hub.broadcast({
          type: 'change',
          path: catchUp.paths[0] ?? '',
          paths: catchUp.paths,
          commitSha: catchUp.sha,
          source: catchUp.source,
        });
        if (!this._remoteEnabled()) {
          this.hub.broadcast({ type: 'synced' });
        }
      }
    } catch {
      // No initial commits — this is fine for a fresh repo
    }

    // Initialise remote sync if enabled and token is available
    if (this._remoteEnabled()) {
      await this._initRemote();
    }

    await this.watcher.start();
  }

  async stop(): Promise<void> {
    this.running = false;
    // Stop schedulers before flushing debounce
    this.pullScheduler?.cancel();
    this.pushScheduler?.cancel();
    // Dispose credential provider
    this.credentialProvider?.dispose?.();
    this.credentialProvider = null;
    // Flush pending debounce batch before shutting down
    this.debouncer.flush();
    // Wait briefly to let the async commit complete
    await new Promise<void>((r) => setTimeout(r, 200));
    await this.watcher.stop();
    this.hub.closeAll();
  }

  getStatus(): EngineStatus {
    const base: EngineStatus = {
      running: this.running,
      watchedDir: path.join(this.config.repoRoot, this.config.contentDir),
      lastCommit: this.lastCommit,
      pendingPaths: [...this.pendingPaths],
    };
    if (this.remoteConfig) {
      base.remote = {
        branch: this.remoteConfig.branch,
        redactedUrl: this.remoteConfig.redactedUrl,
        online: this.offlineState.isOnline,
        conflictPending: this.conflictPending,
        lastPullAt: this.lastPullAt,
        lastPushAt: this.lastPushAt,
      };
    }
    return base;
  }

  /**
   * Expose the source classifier so the sidecar (or tests) can mark self-writes.
   */
  get sourceClassifier(): SourceClassifier {
    return this.classifier;
  }

  /**
   * For testing: access the underlying watcher to inject errors.
   */
  get _watcher(): FileWatcher {
    return this.watcher;
  }

  /**
   * For testing: manually trigger a pull tick without waiting for the timer.
   */
  async triggerPull(): Promise<void> {
    if (this.pullScheduler) {
      await this.pullScheduler.manualTick();
    }
  }

  /**
   * For testing: manually trigger a push tick.
   */
  async triggerPush(): Promise<void> {
    if (this.pushScheduler) {
      await this.pushScheduler.manualTick();
    }
  }

  /**
   * Fire-and-forget webhook pull trigger with single-flight coalescing.
   *
   * While one pull is in flight, at most one additional pull is queued.
   * Subsequent calls during in-flight + queued state are dropped silently
   * (the queued pull will re-fetch the latest remote state when it runs).
   * Errors from _pullTask are swallowed — the offline-state machine handles them.
   * Returns synchronously; does not return a Promise.
   */
  triggerPullNow(reason: WebhookTriggerReason): void {
    if (this._webhookPullInFlight) {
      // Coalescing: at most one queued pull while one is in flight
      this._webhookPullQueued = true;
      return;
    }
    this._webhookPullInFlight = true;
    void this._runWebhookPull(reason);
  }

  private async _runWebhookPull(_reason: WebhookTriggerReason): Promise<void> {
    do {
      this._webhookPullQueued = false;
      try {
        await this._pullTask();
      } catch {
        // offline-state machine already handles pull failures
      }
    } while (this._webhookPullQueued);
    this._webhookPullInFlight = false;
  }

  /**
   * For testing: clear conflict-pending state (normally done by M8 resolution).
   */
  clearConflictState(): void {
    this.conflictPending = false;
    this.pullScheduler?.setConflictPending(false);
    this.pushScheduler?.setConflictPending(false);
    // M8: Also clear the session and abort any in-progress merge
    this.conflictSessionManager.clear();
    void this._abortMergeIfActive();
  }

  /** M8: Expose the current conflict state for GET /sync/conflict/state. */
  getConflictState(): ConflictState | null {
    return this.conflictSessionManager.toConflictState();
  }

  /** M8: Expose remote config for conflict routes. */
  getRemoteConfig(): RemoteConfig | null {
    return this.remoteConfig;
  }

  private async _abortMergeIfActive(): Promise<void> {
    const mergeHeadPath = path.join(this.config.repoRoot, '.git', 'MERGE_HEAD');
    if (!existsSync(mergeHeadPath)) return;
    try {
      const git = simpleGit({ baseDir: this.config.repoRoot });
      await git.raw(['merge', '--abort']);
    } catch {
      // Ignore — merge may have already been aborted
    }
  }

  /**
   * For testing: inject a pull fault to simulate network failures.
   */
  setPullFault(fault: PullFault | undefined): void {
    this._pullFault = fault;
  }

  /**
   * For testing: inject a push fault to simulate network failures.
   */
  setPushFault(fault: PushFault | undefined): void {
    this._pushFault = fault;
  }

  private _remoteEnabled(): boolean {
    return this.config.remote?.enabled ?? false;
  }

  private async _initRemote(): Promise<void> {
    // Build credential provider when App credentials are configured and not already injected
    if (!this.credentialProvider && this.config.githubApp) {
      try {
        this.credentialProvider = createGitCredentialProvider({
          githubApp: this.config.githubApp,
        });
      } catch (err) {
        const msg = err instanceof MintFailureError
          ? err.message
          : `[sync-engine] GitHub App credential setup failed: ${String(err)}`;
        throw new Error(msg);
      }
    }

    try {
      this.remoteConfig = await createRemoteConfig(
        this.config.repoRoot,
        this.credentialProvider,
        this.config.targetBranch,
      );
    } catch {
      // If remote config fails (e.g. SSH remote), disable remote sync silently
      return;
    }

    const rc = this.config.remote!;
    const retryConfig = rc.retry;

    // Pull scheduler
    this.pullScheduler = new RetryScheduler(
      rc.pullIntervalMs,
      retryConfig,
      () => this._pullTask(),
      'pull',
    );
    this.pullScheduler.start();

    // Push scheduler (for retry of failed pushes; immediate push is via _pushAfterCommit)
    this.pushScheduler = new RetryScheduler(
      rc.pushTimeoutMs,
      retryConfig,
      () => this._pushTask(),
      'push',
    );
    // Push scheduler starts paused; only activated when a push fails
  }

  private async _pullTask(): Promise<import('./retry-scheduler.js').TaskOutcome> {
    if (!this.remoteConfig || this.conflictPending) return 'conflict';
    if (!this.running) return 'skip';
    return pullTask(this._makeRemoteCtx());
  }

  private async _pushTask(): Promise<import('./retry-scheduler.js').TaskOutcome> {
    if (!this.remoteConfig || this.conflictPending) return 'conflict';
    if (!this.running) return 'skip';
    return pushTask(this._makeRemoteCtx());
  }

  private _handlePushResult(result: PushResult): import('./retry-scheduler.js').TaskOutcome {
    return handlePushResult(this._makeRemoteCtx(), result);
  }

  private async _handleConflict(localSha: string, remoteSha: string): Promise<void> {
    if (!this.remoteConfig) return;
    return handleConflict(this._makeRemoteCtx(), localSha, remoteSha);
  }

  private async _onBatch(batch: Batch): Promise<void> {
    // Do not commit while a merge conflict is pending — the working tree may
    // contain conflict markers that should never be committed.
    if (this.conflictPending) return;

    // Clear pending paths that are now being processed
    const batchPathsSet = new Set(
      batch.paths.map((p) => path.relative(this.config.repoRoot, p)),
    );
    this.pendingPaths = this.pendingPaths.filter((p) => !batchPathsSet.has(p));

    const source = this.classifier.classify(batch.paths);

    let result: CommitResult;
    try {
      result = await this.mutex.run(() => this.committer.commit(batch, source));
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.hub.broadcast({ type: 'offline', reason: `Commit failed: ${reason}` });
      return;
    }

    if (result.noop) return;

    this._recordCommit(result);

    // Broadcast `change` event — one per batch
    this.hub.broadcast({
      type: 'change',
      path: result.paths[0] ?? '',
      paths: result.paths,
      commitSha: result.sha,
      source: result.source,
    });

    if (this._remoteEnabled() && this.remoteConfig) {
      // Push after commit — synced event comes from push result
      void this._pushAfterCommit();
    } else {
      // Local-only mode (M6 behavior): synced after commit
      this.hub.broadcast({ type: 'synced' });
    }
  }

  private async _pushAfterCommit(): Promise<void> {
    if (!this.remoteConfig || this.conflictPending) return;
    return pushAfterCommitWorker(this._makeRemoteCtx());
  }

  private _makeRemoteCtx(): RemoteContext {
    return {
      repoRoot: this.config.repoRoot,
      contentDir: this.config.contentDir,
      pushTimeoutMs: this.config.remote?.pushTimeoutMs,
      hub: this.hub,
      offlineState: this.offlineState,
      conflictSessionManager: this.conflictSessionManager,
      mutex: this.mutex,
      remoteConfig: this.remoteConfig!,
      pullFault: this._pullFault,
      pushFault: this._pushFault,
      hasExplicitTargetBranch: !!this.config.targetBranch,
      isRunning: () => this.running,
      isConflictPending: () => this.conflictPending,
      setConflictPending: (v) => {
        this.conflictPending = v;
      },
      getPullScheduler: () => this.pullScheduler,
      getPushScheduler: () => this.pushScheduler,
      recordPullAt: (ts) => {
        this.lastPullAt = ts;
      },
      recordPushAt: (ts) => {
        this.lastPushAt = ts;
      },
    };
  }

  private _recordCommit(result: CommitResult & { noop: false }): void {
    this.lastCommit = {
      sha: result.sha,
      message: result.message,
      paths: result.paths,
      timestamp: Date.now(),
    };
  }
}
