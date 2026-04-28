import { z } from 'zod';

/**
 * Zod schema for the sync-engine EngineConfig.
 * Used by config.ts to validate environment variables and config file values.
 */

const RemoteRetrySchema = z.object({
  initialMs: z.coerce.number().int().min(100).default(1000),
  maxMs: z.coerce.number().int().min(1000).default(60000),
  factor: z.coerce.number().min(1).default(2),
  jitter: z.coerce.number().min(0).max(1).default(0.2),
}).default(() => ({ initialMs: 1000, maxMs: 60000, factor: 2, jitter: 0.2 }));

const RemoteSchema = z
  .object({
    enabled: z.boolean().default(false),
    pullIntervalMs: z.coerce.number().int().min(2000).default(30000),
    pushTimeoutMs: z.coerce.number().int().min(1000).default(15000),
    retry: RemoteRetrySchema,
  })
  .default(() => ({
    enabled: false,
    pullIntervalMs: 30000,
    pushTimeoutMs: 15000,
    retry: { initialMs: 1000, maxMs: 60000, factor: 2, jitter: 0.2 },
  }));

export const EngineConfigSchema = z.object({
  /**
   * Absolute path to the git repository root.
   * Must be a non-empty string; existence is validated at startup.
   */
  repoRoot: z.string().min(1, 'repoRoot must not be empty'),

  /**
   * Path to the watched content directory, relative to repoRoot.
   * Default: "content"
   */
  contentDir: z.string().min(1).default('content'),

  /** Author name embedded in auto-generated git commits. */
  commitAuthorName: z.string().min(1).default('awesome-markdown-sync'),

  /** Author email embedded in auto-generated git commits. */
  commitAuthorEmail: z.string().min(1).default('sync@local'),

  /**
   * Milliseconds of file-system quiescence before a batch is committed.
   * Lower values produce more granular commits; higher values batch more.
   * Default: 750 ms. Min: 50 ms.
   */
  debounceMs: z.coerce.number().int().min(50).default(750),

  /**
   * TCP port the Fastify server listens on.
   * Default: 7402 (distinct from the fs-provider sidecar on 7701).
   */
  port: z.coerce.number().int().min(1).max(65535).default(7402),

  /** Bind address for the Fastify server. Default: 127.0.0.1 */
  host: z.string().min(1).default('127.0.0.1'),

  /**
   * Remote sync settings. By default `enabled: false` so local-only mode
   * is preserved unless explicitly opted in.
   */
  remote: RemoteSchema,

  /**
   * Git branch to sync against (pull from / push to).
   * When omitted, the engine reads the current local branch at startup.
   * Set this explicitly when you want to sync a feature branch rather
   * than the remote default (e.g. SYNC_ENGINE_TARGET_BRANCH=fix/my-feature).
   */
  targetBranch: z.string().min(1).optional(),
});

export type EngineConfigInput = z.input<typeof EngineConfigSchema>;
