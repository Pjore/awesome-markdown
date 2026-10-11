import type {
  ConflictState,
  ResolveDecision,
  ResolveResponse,
} from '@awesome-markdown/contracts';

/**
 * Fetch the current conflict state from the sync-engine.
 *
 * @param base Base URL of the sync-engine HTTP server (resolved by the host app).
 */
export async function fetchConflictState(base: string): Promise<ConflictState | null> {
  const resp = await fetch(`${base}/sync/conflict/state`, {
    signal: AbortSignal.timeout(5_000),
  });
  if (!resp.ok) return null;
  const body = (await resp.json()) as { conflict: ConflictState | null };
  return body.conflict ?? null;
}

/**
 * Submit resolution decisions to the sync-engine.
 *
 * @param base      Base URL of the sync-engine HTTP server.
 * @param mergeId   The active mergeId.
 * @param decisions Map of repo-relative path → decision.
 */
export async function submitDecisions(
  base: string,
  mergeId: string,
  decisions: Record<string, ResolveDecision>,
): Promise<ResolveResponse> {
  const resp = await fetch(`${base}/sync/conflict/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mergeId, decisions }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) {
    const err = (await resp.json().catch(() => ({ message: resp.statusText }))) as {
      message?: string;
      error?: string;
    };
    throw new Error(err.message ?? err.error ?? `HTTP ${resp.status}`);
  }
  return resp.json() as Promise<ResolveResponse>;
}
