/**
 * Golden parity: provider-fs `/render` and `/homeless` over the repo's
 * `content/` directory must match the golden files owned by
 * `@awesome-markdown/core` (packages/core/test/golden). The golden files were
 * first generated from provider-fs *before* the render logic moved into core,
 * so this test pins "no behaviour change" for the extraction.
 *
 * When `content/` changes, regenerate with
 * `pnpm --filter @awesome-markdown/core test -u`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../src/server.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoContent = path.resolve(here, '../../../content');
const goldenDir = path.resolve(here, '../../../packages/core/test/golden');

async function boardSlugs(): Promise<string[]> {
  const server = await createServer({ port: 0, host: '127.0.0.1', contentRoot: repoContent });
  try {
    const res = await server.inject({ method: 'GET', url: '/boards' });
    return res.json<{ slug: string }[]>().map(b => b.slug).sort();
  } finally {
    await server.close();
  }
}

const slugs = await boardSlugs();

describe('provider-fs golden render over repo content/', () => {
  let server: Awaited<ReturnType<typeof createServer>>;

  beforeAll(async () => {
    server = await createServer({ port: 0, host: '127.0.0.1', contentRoot: repoContent });
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it('has golden files for every board in content/', async () => {
    expect(slugs.length).toBeGreaterThan(0);
    const files = (await readdir(goldenDir)).filter(f => f.endsWith('.render.json'));
    expect(files.map(f => f.replace(/\.render\.json$/, '')).sort()).toEqual(slugs);
  });

  for (const slug of slugs) {
    it(`GET /boards/${slug}/render matches golden`, async () => {
      const res = await server.inject({ method: 'GET', url: `/boards/${slug}/render` });
      expect(res.statusCode).toBe(200);
      const golden = JSON.parse(await readFile(path.join(goldenDir, `${slug}.render.json`), 'utf-8')) as unknown;
      expect(res.json()).toEqual(golden);
    });

    it(`GET /boards/${slug}/homeless matches golden`, async () => {
      const res = await server.inject({ method: 'GET', url: `/boards/${slug}/homeless` });
      expect(res.statusCode).toBe(200);
      const golden = JSON.parse(await readFile(path.join(goldenDir, `${slug}.homeless.json`), 'utf-8')) as unknown;
      expect(res.json()).toEqual(golden);
    });
  }
});
