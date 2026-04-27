import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from '../src/server.js';
import { tmpContentRoot } from './fixtures/temp-content.js';
import type { TempContentRoot } from './fixtures/temp-content.js';

describe('columns routes', () => {
  let tmp: TempContentRoot;
  let server: Awaited<ReturnType<typeof createServer>>;
  let boardId: string;

  const colPayload = (boardId: string, order = 0) => ({
    boardId,
    title: 'To Do',
    order,
  });

  beforeEach(async () => {
    tmp = await tmpContentRoot();
    server = await createServer({ port: 0, host: '127.0.0.1', contentRoot: tmp.contentRoot });
    await server.ready();

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

  it('creates a column and returns 201', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/boards/${boardId}/columns`,
      headers: { 'content-type': 'application/json' },
      payload: colPayload(boardId),
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{ id: string; title: string }>();
    expect(body.title).toBe('To Do');
    expect(body.id).toBeTruthy();
  });

  it('lists columns', async () => {
    await server.inject({
      method: 'POST',
      url: `/boards/${boardId}/columns`,
      headers: { 'content-type': 'application/json' },
      payload: colPayload(boardId, 0),
    });
    await server.inject({
      method: 'POST',
      url: `/boards/${boardId}/columns`,
      headers: { 'content-type': 'application/json' },
      payload: { boardId, title: 'In Progress', order: 1 },
    });

    const res = await server.inject({
      method: 'GET',
      url: `/boards/${boardId}/columns`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ columns: unknown[] }>().columns).toHaveLength(2);
  });

  it('gets a column by id', async () => {
    const created = await server.inject({
      method: 'POST',
      url: `/boards/${boardId}/columns`,
      headers: { 'content-type': 'application/json' },
      payload: colPayload(boardId),
    });
    const { id } = created.json<{ id: string }>();

    const res = await server.inject({
      method: 'GET',
      url: `/boards/${boardId}/columns/${id}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ id: string }>().id).toBe(id);
  });

  it('updates a column', async () => {
    const created = await server.inject({
      method: 'POST',
      url: `/boards/${boardId}/columns`,
      headers: { 'content-type': 'application/json' },
      payload: colPayload(boardId),
    });
    const { id } = created.json<{ id: string }>();

    const res = await server.inject({
      method: 'PUT',
      url: `/boards/${boardId}/columns/${id}`,
      headers: { 'content-type': 'application/json' },
      payload: { title: 'Done' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ title: string }>().title).toBe('Done');
  });

  it('deletes a column', async () => {
    const created = await server.inject({
      method: 'POST',
      url: `/boards/${boardId}/columns`,
      headers: { 'content-type': 'application/json' },
      payload: colPayload(boardId),
    });
    const { id } = created.json<{ id: string }>();

    const del = await server.inject({
      method: 'DELETE',
      url: `/boards/${boardId}/columns/${id}`,
    });
    expect(del.statusCode).toBe(200);

    const get = await server.inject({
      method: 'GET',
      url: `/boards/${boardId}/columns/${id}`,
    });
    expect(get.statusCode).toBe(404);
  });
});
