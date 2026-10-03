import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    testTimeout: 15000,
  },
  resolve: {
    // Exact-match aliases so `@awesome-markdown/core/markdown` doesn't get
    // swallowed by the `@awesome-markdown/core` prefix.
    alias: [
      {
        find: /^@awesome-markdown\/contracts$/,
        replacement: resolve(__dirname, '../../packages/contracts/src/index.ts'),
      },
      {
        find: /^@awesome-markdown\/filter-engine$/,
        replacement: resolve(__dirname, '../../packages/filter-engine/src/index.ts'),
      },
      {
        find: /^@awesome-markdown\/core$/,
        replacement: resolve(__dirname, '../../packages/core/src/index.ts'),
      },
      {
        find: /^@awesome-markdown\/core\/markdown$/,
        replacement: resolve(__dirname, '../../packages/core/src/markdown.ts'),
      },
    ],
  },
});
