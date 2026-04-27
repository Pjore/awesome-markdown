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
  let boardId: string;

  beforeEach(async () => {
    tmp = await tmpContentRoot();
    server = await createServer({ port: 0, host: '127.0.0.1', contentRoot: tmp.contentRoot });
    await server.listen({ port: 0, host: '127.0.0.1' });

    const addr = server.addresses()[0];
    if (!addr) throw new Error('Server has no bound address');
    port = addr.port;

    // Create a board for item operations
    const boardRes = await server.inject({
      method: 'POST',
      url: '/boards',
      headers: { 'content-type': 'application/json' },
      payload: { slug: 'sse-board', title: 'SSE Board' },
    });
    boardId = boardRes.json<{ id: string }>().id;
  });

  afterEach(async () => {
    await server.close();
    await tmp.cleanup();
  });

  it('emits a change event when a board is created', async () => {
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
      .catch(() => undefined); // AbortError is expected on cleanup

    // Wait for the SSE connection to be established
    await new Promise((r) => setTimeout(r, 100));

    // Create a new board — should emit change event
    await server.inject({
      method: 'POST',
      url: '/boards',
      headers: { 'content-type': 'application/json' },
      payload: { slug: 'trigger-board', title: 'Trigger Board' },
    });

    // Allow time for event to propagate
    await new Promise((r) => setTimeout(r, 150));

    ac.abort();
    await sseTask;

    const allText = collectedChunks.join('');
    expect(allText).toContain('event: change');
    expect(allText).toContain('"type":"change"');
  });

  it('emits a change event when an item is created', async () => {
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

    // Create an item
    const itemRes = await server.inject({
      method: 'POST',
      url: `/boards/${boardId}/items`,
      headers: { 'content-type': 'application/json' },
      payload: {
        boardId,
        columnId: 'col-1',
        swimlaneId: 'lane-1',
        title: 'SSE Item',
        body: 'test body',
        status: 'todo',
        priority: 'low',
        tags: [],
        customFields: {},
      },
    });
    const { id: itemId } = itemRes.json<{ id: string }>();

    await new Promise((r) => setTimeout(r, 150));

    ac.abort();
    await sseTask;

    const allText = collectedChunks.join('');
    expect(allText).toContain('event: change');
    // The entityId should be the item's id
    expect(allText).toContain(itemId);
  });

  it('emits change events for update and delete operations', async () => {
    // Create an item first
    const itemRes = await server.inject({
      method: 'POST',
      url: `/boards/${boardId}/items`,
      headers: { 'content-type': 'application/json' },
      payload: {
        boardId,
        columnId: 'col-1',
        swimlaneId: 'lane-1',
        title: 'Update/Delete SSE',
        body: '',
        status: 'todo',
        priority: 'medium',
        tags: [],
        customFields: {},
      },
    });
    const { id: itemId } = itemRes.json<{ id: string }>();

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

    // Update item
    await server.inject({
      method: 'PUT',
      url: `/boards/${boardId}/items/${itemId}`,
      headers: { 'content-type': 'application/json' },
      payload: { title: 'Updated' },
    });

    // Delete item
    await server.inject({
      method: 'DELETE',
      url: `/boards/${boardId}/items/${itemId}`,
    });

    await new Promise((r) => setTimeout(r, 150));

    ac.abort();
    await sseTask;

    const allText = collectedChunks.join('');
    // Should have received at least 2 change events (update + delete)
    const eventCount = (allText.match(/event: change/g) ?? []).length;
    expect(eventCount).toBeGreaterThanOrEqual(2);
  });
});
