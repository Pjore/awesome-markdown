import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from '../src/server.js';
import { tmpContentRoot } from './fixtures/temp-content.js';
import type { TempContentRoot } from './fixtures/temp-content.js';

describe('boards routes', () => {
  let tmp: TempContentRoot;
  let server: Awaited<ReturnType<typeof createServer>>;

  beforeEach(async () => {
    tmp = await tmpContentRoot();
    server = await createServer({ port: 0, host: '127.0.0.1', contentRoot: tmp.contentRoot });
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
    await tmp.cleanup();
  });

  it('creates a board and returns 201', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/boards',
      headers: { 'content-type': 'application/json' },
      payload: { slug: 'my-board', title: 'My Board', description: 'A test board' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{ id: string; slug: string; title: string }>();
    expect(body.slug).toBe('my-board');
    expect(body.title).toBe('My Board');
    expect(body.id).toBeTruthy();
  });

  it('lists boards', async () => {
    await server.inject({
      method: 'POST',
      url: '/boards',
      headers: { 'content-type': 'application/json' },
      payload: { slug: 'board-a', title: 'Board A' },
    });
    await server.inject({
      method: 'POST',
      url: '/boards',
      headers: { 'content-type': 'application/json' },
      payload: { slug: 'board-b', title: 'Board B' },
    });

    const res = await server.inject({ method: 'GET', url: '/boards' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ boards: unknown[] }>();
    expect(body.boards).toHaveLength(2);
  });

  it('gets a board by id', async () => {
    const created = await server.inject({
      method: 'POST',
      url: '/boards',
      headers: { 'content-type': 'application/json' },
      payload: { slug: 'get-test', title: 'Get Test' },
    });
    const { id } = created.json<{ id: string }>();

    const res = await server.inject({ method: 'GET', url: `/boards/${id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ id: string }>().id).toBe(id);
  });

  it('updates a board', async () => {
    const created = await server.inject({
      method: 'POST',
      url: '/boards',
      headers: { 'content-type': 'application/json' },
      payload: { slug: 'upd-test', title: 'Original' },
    });
    const { id } = created.json<{ id: string }>();

    const res = await server.inject({
      method: 'PUT',
      url: `/boards/${id}`,
      headers: { 'content-type': 'application/json' },
      payload: { title: 'Updated' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ title: string }>().title).toBe('Updated');
  });

  it('deletes a board', async () => {
    const created = await server.inject({
      method: 'POST',
      url: '/boards',
      headers: { 'content-type': 'application/json' },
      payload: { slug: 'del-test', title: 'Delete Me' },
    });
    const { id } = created.json<{ id: string }>();

    const del = await server.inject({ method: 'DELETE', url: `/boards/${id}` });
    expect(del.statusCode).toBe(200);
    expect(del.json<{ ok: boolean }>().ok).toBe(true);

    const get = await server.inject({ method: 'GET', url: `/boards/${id}` });
    expect(get.statusCode).toBe(404);
  });

  it('returns 404 for unknown board', async () => {
    const res = await server.inject({ method: 'GET', url: '/boards/nonexistent' });
    expect(res.statusCode).toBe(404);
  });
});
