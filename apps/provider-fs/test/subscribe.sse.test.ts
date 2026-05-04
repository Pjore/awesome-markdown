import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from '../src/server.js';
import { tmpContentRoot } from './fixtures/temp-content.js';
import type { TempContentRoot } from './fixtures/temp-content.js';

/**
 * SSE tests require a real listening server because fastify.inject buffers
 * the full response — it cannot stream an open-ended SSE connection.
 * We listen on port 0 (ephemeral) and use the global fetch API.
 */
describe('SSE /subscribe — local-write events', () => {
  let tmp: TempContentRoot;
  let server: Awaited<ReturnType<typeof createServer>>;
  let port: number;

  beforeEach(async () => {
    tmp = await tmpContentRoot();
    server = await createServer({ port: 0, host: '127.0.0.1', contentRoot: tmp.contentRoot });
    await server.listen({ port: 0, host: '127.0.0.1' });

    const addr = server.addresses()[0];
    if (!addr) throw new Error('Server has no bound address');
    port = addr.port;
  });

  afterEach(async () => {
    await server.close();
    await tmp.cleanup();
  });

  it('emits a change event when an item is created via POST /items', async () => {
    const ac = new AbortController();
    const collectedChunks: string[] = [];

    const sseTask = fetch(`http://127.0.0.1:${port}/subscribe`, {
      signal: ac.signal,
    })
      .then(async (res) => {
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          collectedChunks.push(decoder.decode(value));
        }
      })
      .catch(() => undefined);

    await new Promise((r) => setTimeout(r, 100));

    await server.inject({
      method: 'POST',
      url: '/items',
      headers: { 'content-type': 'application/json' },
      payload: { slug: 'sse-item', title: 'SSE Item', mutations: [] },
    });

    await new Promise((r) => setTimeout(r, 150));
    ac.abort();
    await sseTask;

    const allText = collectedChunks.join('');
    expect(allText).toContain('event: change');
    expect(allText).toContain('"type":"change"');
  });

  it('emits a change event when an item is patched via PATCH /items/:slug', async () => {
    // Create item first
    await server.inject({
      method: 'POST',
      url: '/items',
      headers: { 'content-type': 'application/json' },
      payload: { slug: 'sse-patch', title: 'SSE Patch', mutations: [] },
    });

    const ac = new AbortController();
    const collectedChunks: string[] = [];

    const sseTask = fetch(`http://127.0.0.1:${port}/subscribe`, {
      signal: ac.signal,
    })
      .then(async (res) => {
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          collectedChunks.push(decoder.decode(value));
        }
      })
      .catch(() => undefined);

    await new Promise((r) => setTimeout(r, 100));

    await server.inject({
      method: 'PATCH',
      url: '/items/sse-patch',
      headers: { 'content-type': 'application/json' },
      payload: { mutations: [{ op: 'set', path: 'status', value: 'done' }] },
    });

    await new Promise((r) => setTimeout(r, 150));
    ac.abort();
    await sseTask;

    const allText = collectedChunks.join('');
    expect(allText).toContain('event: change');
    expect(allText).toContain('"type":"change"');
  });

  it('emits a change event when an item is deleted via DELETE /items/:slug', async () => {
    await server.inject({
      method: 'POST',
      url: '/items',
      headers: { 'content-type': 'application/json' },
      payload: { slug: 'sse-del', title: 'SSE Delete', mutations: [] },
    });

    const ac = new AbortController();
    const collectedChunks: string[] = [];

    const sseTask = fetch(`http://127.0.0.1:${port}/subscribe`, {
      signal: ac.signal,
    })
      .then(async (res) => {
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          collectedChunks.push(decoder.decode(value));
        }
      })
      .catch(() => undefined);

    await new Promise((r) => setTimeout(r, 100));

    await server.inject({ method: 'DELETE', url: '/items/sse-del' });

    await new Promise((r) => setTimeout(r, 150));
    ac.abort();
    await sseTask;

    const allText = collectedChunks.join('');
    expect(allText).toContain('event: change');
    expect(allText).toContain('"type":"change"');
  });
});



