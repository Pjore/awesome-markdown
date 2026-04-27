import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from '../src/server.js';
import { tmpContentRoot } from './fixtures/temp-content.js';
import type { TempContentRoot } from './fixtures/temp-content.js';

describe('items routes', () => {
  let tmp: TempContentRoot;
  let server: Awaited<ReturnType<typeof createServer>>;
  let boardId: string;

  const itemPayload = (boardId: string) => ({
    boardId,
    columnId: 'col-1',
    swimlaneId: 'lane-1',
    title: 'Test Item',
    body: '# Hello\n\nWorld',
    status: 'todo',
    priority: 'medium' as const,
    tags: ['test'],
    customFields: {},
  });

  beforeEach(async () => {
    tmp = await tmpContentRoot();
    server = await createServer({ port: 0, host: '127.0.0.1', contentRoot: tmp.contentRoot });
    await server.ready();

    // Create a board for item operations
    const boardRes = await server.inject({
      method: 'POST',
      url: '/boards',
      headers: { 'content-type': 'application/json' },
      payload: { slug: 'test-board', title: 'Test Board' },
    });
    boardId = boardRes.json<{ id: string }>().id;
  });

  afterEach(async () => {
    await server.close();
    await tmp.cleanup();
  });

  it('creates an item and returns 201', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/boards/${boardId}/items`,
      headers: { 'content-type': 'application/json' },
      payload: itemPayload(boardId),
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{ id: string; title: string; boardId: string }>();
    expect(body.title).toBe('Test Item');
    expect(body.boardId).toBe(boardId);
    expect(body.id).toBeTruthy();
  });

  it('lists items for a board', async () => {
    await server.inject({
      method: 'POST',
      url: `/boards/${boardId}/items`,
      headers: { 'content-type': 'application/json' },
      payload: itemPayload(boardId),
    });
    await server.inject({
      method: 'POST',
      url: `/boards/${boardId}/items`,
      headers: { 'content-type': 'application/json' },
      payload: { ...itemPayload(boardId), title: 'Second Item' },
    });

    const res = await server.inject({
      method: 'GET',
      url: `/boards/${boardId}/items`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ items: unknown[] }>().items).toHaveLength(2);
  });

  it('gets an item by id', async () => {
    const created = await server.inject({
      method: 'POST',
      url: `/boards/${boardId}/items`,
      headers: { 'content-type': 'application/json' },
      payload: itemPayload(boardId),
    });
    const { id } = created.json<{ id: string }>();

    const res = await server.inject({
      method: 'GET',
      url: `/boards/${boardId}/items/${id}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ id: string }>().id).toBe(id);
  });

  it('updates an item', async () => {
    const created = await server.inject({
      method: 'POST',
      url: `/boards/${boardId}/items`,
      headers: { 'content-type': 'application/json' },
      payload: itemPayload(boardId),
    });
    const { id } = created.json<{ id: string }>();

    const res = await server.inject({
      method: 'PUT',
      url: `/boards/${boardId}/items/${id}`,
      headers: { 'content-type': 'application/json' },
      payload: { title: 'Updated Item' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ title: string }>().title).toBe('Updated Item');
  });

  it('deletes an item', async () => {
    const created = await server.inject({
      method: 'POST',
      url: `/boards/${boardId}/items`,
      headers: { 'content-type': 'application/json' },
      payload: itemPayload(boardId),
    });
    const { id } = created.json<{ id: string }>();

    const del = await server.inject({
      method: 'DELETE',
      url: `/boards/${boardId}/items/${id}`,
    });
    expect(del.statusCode).toBe(200);
    expect(del.json<{ ok: boolean }>().ok).toBe(true);

    const get = await server.inject({
      method: 'GET',
      url: `/boards/${boardId}/items/${id}`,
    });
    expect(get.statusCode).toBe(404);
  });

  it('returns 404 for unknown item', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/boards/${boardId}/items/nonexistent`,
    });
    expect(res.statusCode).toBe(404);
  });
});
