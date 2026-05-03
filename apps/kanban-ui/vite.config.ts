import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      // Proxy sync-engine through the same origin so SSE works when the UI is
      // accessed via a remote proxy (e.g. Coder subdomain) where localhost:7402
      // is unreachable from the browser. The path /sync-engine/* is stripped
      // before forwarding to the sync-engine at 127.0.0.1:7402.
      '/sync-engine': {
        target: 'http://127.0.0.1:7402',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/sync-engine/, ''),
      },
    },
  },
});
