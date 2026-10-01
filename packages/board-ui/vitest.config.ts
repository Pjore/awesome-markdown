import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

const pkg = (name: string): string => resolve(__dirname, `../../packages/${name}/src/index.ts`);

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
  },
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@awesome-markdown/contracts': pkg('contracts'),
      '@awesome-markdown/filter-engine': pkg('filter-engine'),
      '@awesome-markdown/provider-http': pkg('provider-http'),
      '@awesome-markdown/provider-localstorage': pkg('provider-localstorage'),
    },
  },
});
