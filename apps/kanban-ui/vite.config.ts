import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// KANBAN_UI_PORT / SYNC_ENGINE_PROXY_TARGET let a second instance of this app
// (e.g. pointed at a different content root) run alongside the default one.
const port = Number(process.env['KANBAN_UI_PORT'] ?? 5173);
const syncEngineTarget = process.env['SYNC_ENGINE_PROXY_TARGET'] ?? 'http://127.0.0.1:7402';

export default defineConfig({
  plugins: [react()],
  server: {
    port,
    host: '0.0.0.0',
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
    },
  },
});
