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
