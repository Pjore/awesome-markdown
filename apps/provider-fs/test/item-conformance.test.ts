import { describe, it, expect } from 'vitest';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from '../src/server.js';
import { tmpContentRoot } from './fixtures/temp-content.js';
import { itemProviderConformance } from '../../../scripts/tests/item-provider-conformance.js';
import { createHttpProvider } from '../../../packages/provider-http/src/provider.js';

class QuietEventSource {
  addEventListener(): void {}
  close(): void {}
}

itemProviderConformance(async () => {
  const tmp = await tmpContentRoot();
  const server = await createServer({ port: 0, host: '127.0.0.1', contentRoot: tmp.contentRoot });
  const url = await server.listen({ port: 0, host: '127.0.0.1' });
  const provider = createHttpProvider({
    baseUrl: url,
    EventSourceCtor: QuietEventSource as unknown as typeof EventSource,
  });
  return {
    provider,
    cleanup: async () => {
      provider.stop();
      await server.close();
      await tmp.cleanup();
    },
  };
});

describe('filesystem source concurrency and integrity', () => {
  it('checks current bytes despite a stale index, blocks external deletes and preserves invalid source', async () => {
    const tmp = await tmpContentRoot();
    const server = await createServer({ port: 0, host: '127.0.0.1', contentRoot: tmp.contentRoot });
    try {
      const created = await server.inject({
        method: 'POST',
        url: '/items',
        payload: { slug: 'external', title: 'Initial', mutations: [] },
      });
      expect(created.statusCode).toBe(201);
      const before = created.json();
      const file = path.join(tmp.contentRoot, 'external.md');
      const original = await readFile(file, 'utf8');
      const external = original.replace('"Initial"', '"External edit"');
      await writeFile(file, external);
      const patch = () =>
        server.inject({
          method: 'PATCH',
          url: '/items/external',
          payload: {
            revision: before.revision,
            mutations: [{ op: 'set', path: ['title'], value: 'Draft' }],
          },
        });
      expect((await patch()).statusCode).toBe(409);
      expect(await readFile(file, 'utf8')).toBe(external);
      expect(
        (await server.inject({ method: 'GET', url: '/items/external' })).json().item.title
      ).toBe('External edit');
      const invalid = external.replace('title: "External edit"', 'value: 9007199254740993');
      await writeFile(file, invalid);
      expect((await patch()).statusCode).toBe(422);
      expect(await readFile(file, 'utf8')).toBe(invalid);
      await unlink(file);
      expect((await patch()).statusCode).toBe(404);
      expect((await server.inject({ method: 'GET', url: '/items/external' })).statusCode).toBe(404);
    } finally {
      await server.close();
      await tmp.cleanup();
    }
  });
  it('allows JSON transport overhead while retaining the document byte limit', async () => {
    const tmp = await tmpContentRoot();
    const server = await createServer({ port: 0, host: '127.0.0.1', contentRoot: tmp.contentRoot });
    try {
      // Escaped control characters have substantially more JSON bytes than document bytes.
      const body = '\t'.repeat(200000);
      const response = await server.inject({
        method: 'POST',
        url: '/items',
        payload: { slug: 'large', title: 'Large', mutations: [], body },
      });
      expect(response.statusCode).toBe(201);
      expect(response.json().item.body).toBe(body);
    } finally {
      await server.close();
      await tmp.cleanup();
    }
  });
});
