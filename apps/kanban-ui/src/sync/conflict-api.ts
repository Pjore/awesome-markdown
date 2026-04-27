import type {
  ConflictState,
  ResolveDecision,
  ResolveResponse,
  OpenExternalResponse,
} from '@awesome-markdown/contracts';

/**
 * Base URL of the sync-engine HTTP server.
 * Override via window.__SYNC_ENGINE_URL__ for testing or custom deployments.
 */
function getSyncEngineUrl(): string {
  if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>)['__SYNC_ENGINE_URL__']) {
    return String((window as unknown as Record<string, unknown>)['__SYNC_ENGINE_URL__']);
  }
  return 'http://localhost:7402';
}

/** Fetch the current conflict state from the sync-engine. */
export async function fetchConflictState(): Promise<ConflictState | null> {
  const base = getSyncEngineUrl();
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
 * @param mergeId   The active mergeId.
 * @param decisions Map of repo-relative path → decision.
 */
export async function submitDecisions(
  mergeId: string,
  decisions: Record<string, ResolveDecision>,
): Promise<ResolveResponse> {
  const base = getSyncEngineUrl();
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

/**
 * Ask the sync-engine to open a conflicted file in the OS default editor.
 */
export async function requestOpenExternal(filePath: string): Promise<OpenExternalResponse> {
  const base = getSyncEngineUrl();
  const resp = await fetch(`${base}/sync/conflict/open`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: filePath }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!resp.ok) {
    const err = (await resp.json().catch(() => ({ message: resp.statusText }))) as {
      message?: string;
      error?: string;
    };
    throw new Error(err.message ?? err.error ?? `HTTP ${resp.status}`);
  }
  return resp.json() as Promise<OpenExternalResponse>;
}
