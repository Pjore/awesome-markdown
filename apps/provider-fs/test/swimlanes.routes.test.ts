import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from '../src/server.js';
import { tmpContentRoot } from './fixtures/temp-content.js';
import type { TempContentRoot } from './fixtures/temp-content.js';

describe('swimlanes routes', () => {
  let tmp: TempContentRoot;
  let server: Awaited<ReturnType<typeof createServer>>;
  let boardId: string;

  const lanePayload = (boardId: string, order = 0) => ({
    boardId,
    title: 'Default Lane',
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

  it('creates a swimlane and returns 201', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/boards/${boardId}/swimlanes`,
      headers: { 'content-type': 'application/json' },
      payload: lanePayload(boardId),
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{ id: string; title: string }>();
    expect(body.title).toBe('Default Lane');
    expect(body.id).toBeTruthy();
  });

  it('lists swimlanes', async () => {
    await server.inject({
      method: 'POST',
      url: `/boards/${boardId}/swimlanes`,
      headers: { 'content-type': 'application/json' },
      payload: lanePayload(boardId, 0),
    });
    await server.inject({
      method: 'POST',
      url: `/boards/${boardId}/swimlanes`,
      headers: { 'content-type': 'application/json' },
      payload: { boardId, title: 'Sprint 1', order: 1 },
    });

    const res = await server.inject({
      method: 'GET',
      url: `/boards/${boardId}/swimlanes`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ swimlanes: unknown[] }>().swimlanes).toHaveLength(2);
  });

  it('gets a swimlane by id', async () => {
    const created = await server.inject({
      method: 'POST',
      url: `/boards/${boardId}/swimlanes`,
      headers: { 'content-type': 'application/json' },
      payload: lanePayload(boardId),
    });
    const { id } = created.json<{ id: string }>();

    const res = await server.inject({
      method: 'GET',
      url: `/boards/${boardId}/swimlanes/${id}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ id: string }>().id).toBe(id);
  });

  it('updates a swimlane', async () => {
    const created = await server.inject({
      method: 'POST',
      url: `/boards/${boardId}/swimlanes`,
      headers: { 'content-type': 'application/json' },
      payload: lanePayload(boardId),
    });
    const { id } = created.json<{ id: string }>();

    const res = await server.inject({
      method: 'PUT',
      url: `/boards/${boardId}/swimlanes/${id}`,
      headers: { 'content-type': 'application/json' },
      payload: { title: 'Sprint 2' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ title: string }>().title).toBe('Sprint 2');
  });

  it('deletes a swimlane', async () => {
    const created = await server.inject({
      method: 'POST',
      url: `/boards/${boardId}/swimlanes`,
      headers: { 'content-type': 'application/json' },
      payload: lanePayload(boardId),
    });
    const { id } = created.json<{ id: string }>();

    const del = await server.inject({
      method: 'DELETE',
      url: `/boards/${boardId}/swimlanes/${id}`,
    });
    expect(del.statusCode).toBe(200);

    const get = await server.inject({
      method: 'GET',
      url: `/boards/${boardId}/swimlanes/${id}`,
    });
    expect(get.statusCode).toBe(404);
  });
});
