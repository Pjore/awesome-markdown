import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load ALL vars from .env (not just VITE_*-prefixed ones) so server-only knobs like
  // PROVIDER_FS_PROXY_TARGET can live in the same .env file instead of requiring shell
  // exports — Vite's own default env loading only merges VITE_* into import.meta.env for
  // client code and never touches process.env for this config file.
  const env = { ...process.env, ...loadEnv(mode, process.cwd(), '') };

  // KANBAN_UI_PORT / SYNC_ENGINE_PROXY_TARGET let a second instance of this app
  // (e.g. pointed at a different content root) run alongside the default one.
  const port = Number(env['KANBAN_UI_PORT'] ?? 5173);
  const syncEngineTarget = env['SYNC_ENGINE_PROXY_TARGET'] ?? 'http://127.0.0.1:7402';
  const providerFsTarget = env['PROVIDER_FS_PROXY_TARGET'] ?? 'http://127.0.0.1:7701';

  return {
    plugins: [react()],
    server: {
      port,
      host: '0.0.0.0',
      // Coder fronts this dev server through a per-workspace subdomain
      // ("<port>--<branch>--<workspace>--<user>.coder.pjore.com"), which Vite's
      // default host check rejects. The leading dot allows any subdomain.
      allowedHosts: ['.coder.pjore.com'],
      proxy: {
        // Proxy sync-engine through the same origin so SSE works when the UI is
        // accessed via a remote proxy (e.g. Coder subdomain) where localhost:7402
        // is unreachable from the browser. The path /sync-engine/* is stripped
        // before forwarding to the sync-engine target.
        '/sync-engine': {
          target: syncEngineTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/sync-engine/, ''),
        },
        // Proxy the provider-fs sidecar through the same origin for the same
        // reason: a remote browser (e.g. via Coder subdomain) can't reach
        // localhost:7701 directly. Point the Settings "Sidecar Base URL" at
        // `<this origin>/provider-fs` instead of http://localhost:7701.
        '/provider-fs': {
          target: providerFsTarget,
          changeOrigin: true,
          ws: true,
          rewrite: (path) => path.replace(/^\/provider-fs/, ''),
        },
      },
    },
  };
});
