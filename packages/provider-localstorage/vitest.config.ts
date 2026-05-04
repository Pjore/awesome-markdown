import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
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
