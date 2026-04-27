/**
 * Internal types for the sync-engine.
 * These types are never exposed over the wire — SSE payloads use contract types.
 */

/** A single raw filesystem event from chokidar. */
export type RawFsEvent = {
  event: 'add' | 'change' | 'unlink';
  /** Absolute path of the affected file. */
  path: string;
  timestamp: number;
};

/**
 * A flushed batch of filesystem events, deduplicated per path.
 * Produced by the debouncer after the quiet window elapses.
 */
export type Batch = {
  batchId: string;
  /** Relative paths (relative to repoRoot) of all changed files. */
  paths: string[];
  /** The last raw event per path (for diagnostic logging). */
  events: Map<string, RawFsEvent>;
  startTime: number;
  flushTime: number;
};

/** Result of a git commit attempt for a Batch. */
export type CommitResult =
  | { noop: true }
  | {
      noop: false;
      sha: string;
      paths: string[];
      source: 'self' | 'external' | 'mixed';
      message: string;
    };

/** Classification of a remote network/auth failure. */
export type NetworkFailureReason =
  | 'dns'
  | 'refused'
  | 'timeout'
  | 'tls'
  | 'auth'
  | 'http-5xx'
  | 'unknown';

/** Result of a single pull attempt. */
export type PullResult =
  | { kind: 'up-to-date' }
  | { kind: 'fast-forwarded'; paths: string[]; fromSha: string; toSha: string }
  | { kind: 'cannot-fast-forward'; localSha: string; remoteSha: string }
  | { kind: 'network-failure'; reason: NetworkFailureReason };

/** Result of a single push attempt. */
export type PushResult =
  | { kind: 'pushed'; sha: string }
  | { kind: 'up-to-date' }
  | { kind: 'rejected-non-ff' }
  | { kind: 'network-failure'; reason: NetworkFailureReason };

/** Exponential-backoff retry configuration. */
export type RemoteRetryConfig = {
  /** Initial backoff in ms. Default: 1000. */
  initialMs: number;
  /** Maximum backoff cap in ms. Default: 60000. */
  maxMs: number;
  /** Backoff multiplier per failure. Default: 2. */
  factor: number;
  /** Jitter fraction applied to each backoff value (0–1). Default: 0.2. */
  jitter: number;
};

/** Remote sync configuration. */
export type RemoteEngineConfig = {
  /** Enable remote pull/push. Default: true. */
  enabled: boolean;
  /** Pull interval in ms. Default: 30000. */
  pullIntervalMs: number;
  /** Push timeout in ms. Default: 15000. */
  pushTimeoutMs: number;
  retry: RemoteRetryConfig;
};

/** Validated runtime configuration for the sync-engine. */
export type EngineConfig = {
  /** Absolute path to the git repository root. */
  repoRoot: string;
  /** Path to the watched content directory, relative to repoRoot. */
  contentDir: string;
  commitAuthorName: string;
  commitAuthorEmail: string;
  /** Quiet window in milliseconds before a batch is flushed. */
  debounceMs: number;
  port: number;
  host: string;
  /**
   * Remote sync settings. If absent or `enabled: false`, remote sync is
   * disabled and the engine operates in local-only mode (M6 behavior).
   */
  remote?: RemoteEngineConfig;
  /**
   * Git branch to sync against. Auto-detected from `git branch --show-current`
   * when not explicitly set via SYNC_ENGINE_TARGET_BRANCH.
   */
  targetBranch?: string;
  /**
   * GitHub Fine-Grained PAT. Sourced exclusively from process.env.GITHUB_TOKEN.
   * Never serialised to disk or emitted over SSE.
   */
  githubToken?: string;
};

/** Runtime status reported by GET /status. */
export type EngineStatus = {
  running: boolean;
  watchedDir: string;
  lastCommit?: {
    sha: string;
    message: string;
    paths: string[];
    timestamp: number;
  };
  pendingPaths: string[];
  /** Present when remote sync is enabled. */
  remote?: {
    branch: string;
    redactedUrl: string;
    online: boolean;
    conflictPending: boolean;
    lastPullAt?: number;
    lastPushAt?: number;
    nextPullAt?: number;
    nextPushRetryAt?: number;
  };
};
