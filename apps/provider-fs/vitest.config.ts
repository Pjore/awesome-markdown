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
    alias: {
      '@awesome-markdown/contracts': resolve(
        __dirname,
        '../../packages/contracts/src/index.ts'
      ),
      '@awesome-markdown/filter-engine': resolve(
        __dirname,
        '../../packages/filter-engine/src/index.ts'
      ),
    },
  },
});
