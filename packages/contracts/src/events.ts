import { z } from 'zod';

/**
 * Sync-engine event union — discriminated by `type`.
 *
 * - `change`   A file/entity changed on disk or via provider.
 * - `conflict` A git merge conflict was detected with diff hunks for resolution.
 * - `synced`   All local commits have been pushed to the remote.
 * - `offline`  The sync-engine cannot reach the remote (network or auth failure).
 */
export const SyncEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('change'),
    /** Primary file path (relative to repo root) that changed. */
    path: z.string(),
    /** Entity ID extracted from the file's frontmatter (provider-emitted). */
    entityId: z.string().optional(),
    /**
     * All file paths in this change batch (sync-engine-emitted; additive M6).
     * May contain multiple paths when a debounced batch commits multiple files.
     */
    paths: z.array(z.string()).optional(),
    /** Git commit SHA of the resulting commit (sync-engine-emitted; additive M6). */
    commitSha: z.string().optional(),
    /**
     * Source classification of the write (sync-engine-emitted; additive M6).
     * - `self`     all paths were recently authored by this engine / sidecar
     * - `external` no paths were recently self-authored
     * - `mixed`    some paths were self-authored, others were external
     */
    source: z.enum(['self', 'external', 'mixed']).optional(),
  }),
  z.object({
    type: z.literal('conflict'),
    /** File paths involved in the conflict. */
    paths: z.array(z.string()),
    /** Raw unified-diff hunks for each conflicted file. */
    diffHunks: z.array(z.string()),
    /**
     * Unique ID of the conflict session (M8 additive).
     * Absent when emitted by M7 engines without session tracking.
     */
    mergeId: z.string().optional(),
  }),
  z.object({
    type: z.literal('synced'),
  }),
  z.object({
    type: z.literal('offline'),
    /** Human-readable reason for the offline event (additive M6). */
    reason: z.string().optional(),
  }),
]);

export type SyncEvent = z.infer<typeof SyncEventSchema>;
