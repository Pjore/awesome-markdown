/**
 * Conflict resolution contracts — M8.
 *
 * Shared between sync-engine (server) and kanban-ui (client).
 */

/** The three resolution choices a user can make for a conflicting path. */
export type ResolveDecision = 'ours' | 'theirs' | 'external';

/**
 * A single path involved in an active merge conflict, as exposed over HTTP.
 * `decision` is null while awaiting user input.
 *
 * Content fields carry the full ours/theirs text (UTF-8), capped at 16 KB.
 * When a side exceeds the cap, the corresponding `*Truncated` flag is `true`
 * and the content string is the first 16 KB bytes of the file.
 */
export interface ConflictPathEntry {
  path: string;
  oursLabel: string;
  theirsLabel: string;
  decision: ResolveDecision | null;
  oursContent: string;
  theirsContent: string;
  oursTruncated: boolean;
  theirsTruncated: boolean;
}

/**
 * Public state of the active conflict session.
 * Returned by GET /sync/conflict/state and used by the UI.
 */
export interface ConflictState {
  mergeId: string;
  startedAt: string; // ISO 8601
  paths: ConflictPathEntry[];
  /** Paths that do not yet have a staged ours/theirs resolution. */
  pendingPaths: string[];
}

/** POST /sync/conflict/resolve request body. */
export interface ResolveRequest {
  mergeId: string;
  /** Map of repo-relative path → decision. Must cover all pending paths. */
  decisions: Record<string, ResolveDecision>;
}

/** POST /sync/conflict/resolve response body. */
export interface ResolveResponse {
  status: 'applied' | 'completed' | 'pending';
  remainingPaths: string[];
}

/** POST /sync/conflict/open request body. */
export interface OpenExternalRequest {
  path: string;
}

/** POST /sync/conflict/open response body. */
export interface OpenExternalResponse {
  status: 'launched';
  path: string;
}

/**
 * POST /sync/conflict/inject request body.
 * Test-only endpoint — only mounted when SYNC_ENGINE_TEST_HOOKS=1.
 */
export interface InjectConflictRequest {
  /** Repo-relative paths to put in conflict. */
  paths: string[];
  /** Content for each path on the local (ours) side. */
  oursContent: Record<string, string>;
  /** Content for each path on the remote (theirs) side. */
  theirsContent: Record<string, string>;
}
