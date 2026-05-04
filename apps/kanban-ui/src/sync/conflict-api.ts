import type {
  ConflictState,
  ResolveDecision,
  ResolveResponse,
} from '@awesome-markdown/contracts';

/**
 * Base URL of the sync-engine HTTP server.
 *
 * Resolution order:
 * 1. window.__SYNC_ENGINE_URL__ — runtime override (useful for tests / custom deployments)
 * 2. VITE_SYNC_ENGINE_URL env var — set to a proxied URL for remote environments
 *    (e.g. https://7402--agent--workspace--owner.coder.example.com)
 * 3. Vite dev proxy path /sync-engine — same-origin, works through Coder subdomain proxy.
 *    In production builds falls back to http://localhost:7402.
 */
export function getSyncEngineUrl(): string {
  if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>)['__SYNC_ENGINE_URL__']) {
    return String((window as unknown as Record<string, unknown>)['__SYNC_ENGINE_URL__']);
  }
  const envUrl = import.meta.env['VITE_SYNC_ENGINE_URL'] as string | undefined;
  if (envUrl) return envUrl;
  // In Vite dev mode use the proxied path so the SSE connection is same-origin
  // and works through any reverse proxy (e.g. Coder subdomain).
  if (import.meta.env.DEV) return '/sync-engine';
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
