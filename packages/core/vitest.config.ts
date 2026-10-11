import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
  },
  resolve: {
    alias: {
      '@awesome-markdown/contracts': resolve(__dirname, '../contracts/src/index.ts'),
      '@awesome-markdown/filter-engine': resolve(__dirname, '../filter-engine/src/index.ts'),
    },
  },
});
