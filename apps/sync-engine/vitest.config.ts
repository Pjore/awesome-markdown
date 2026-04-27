import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    // Longer timeout to accommodate debounce windows + git operations
    testTimeout: 20000,
    hookTimeout: 30000,
    // Run test files in parallel (each uses isolated temp repo + ephemeral port)
    // but tests within each file run sequentially (filesystem fixture safety)
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,
      },
    },
  },
  resolve: {
    alias: {
      '@awesome-markdown/contracts': resolve(
        __dirname,
        '../../packages/contracts/src/index.ts'
      ),
    },
  },
});
