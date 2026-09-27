import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from '../src/server.js';
import { tmpContentRoot, writeAxisFixture, makeAxis } from './fixtures/temp-content.js';
import type { TempContentRoot } from './fixtures/temp-content.js';
import type { Axis, Board } from '@awesome-markdown/contracts';

describe('POST /axes and POST /boards', () => {
  let tmp: TempContentRoot;
  let server: Awaited<ReturnType<typeof createServer>>;

  beforeEach(async () => {
    tmp = await tmpContentRoot();
  });

  afterEach(async () => {
    await server.close();
    await tmp.cleanup();
  });

  it('POST /axes creates a new axis and persists it to disk', async () => {
    server = await createServer({ port: 0, host: '127.0.0.1', contentRoot: tmp.contentRoot });
    await server.ready();

    const res = await server.inject({
      method: 'POST',
      url: '/axes',
      payload: {
        slug: 'in-progress',
        title: 'In Progress',
        filter: { property: 'status', equals: 'in-progress' },
      },
    });

    expect(res.statusCode).toBe(201);
    const axis = res.json<Axis>();
    expect(axis.slug).toBe('in-progress');
    expect(axis.title).toBe('In Progress');
    expect(axis.filter).toEqual({ property: 'status', equals: 'in-progress' });

    // Visible via GET /axes (persisted in the in-memory store + on disk)
    const listRes = await server.inject({ method: 'GET', url: '/axes' });
    expect(listRes.json<Axis[]>()).toHaveLength(1);
  });

  it('POST /axes rejects a duplicate slug', async () => {
    await writeAxisFixture(tmp.contentRoot, makeAxis({ slug: 'dup', title: 'Dup' }));
    server = await createServer({ port: 0, host: '127.0.0.1', contentRoot: tmp.contentRoot });
    await server.ready();

    const res = await server.inject({
      method: 'POST',
      url: '/axes',
      payload: { slug: 'dup', title: 'Dup 2' },
    });

    expect(res.statusCode).toBe(409);
  });

  it('POST /boards creates a board referencing axis slugs', async () => {
    server = await createServer({ port: 0, host: '127.0.0.1', contentRoot: tmp.contentRoot });
    await server.ready();

    await server.inject({
      method: 'POST',
      url: '/axes',
      payload: { slug: 'todo', title: 'Todo', filter: { property: 'status', equals: 'todo' } },
    });
    await server.inject({
      method: 'POST',
      url: '/axes',
      payload: { slug: 'team-a', title: 'Team A', filter: { property: 'team', equals: 'a' } },
    });

    const res = await server.inject({
      method: 'POST',
      url: '/boards',
      payload: {
        slug: 'my-board',
        title: 'My Board',
        description: 'A test board',
        columns: ['todo'],
        swimlanes: ['team-a'],
      },
    });

    expect(res.statusCode).toBe(201);
    const board = res.json<Board>();
    expect(board.slug).toBe('my-board');
    expect(board.columns).toEqual(['todo']);
    expect(board.swimlanes).toEqual(['team-a']);

    const listRes = await server.inject({ method: 'GET', url: '/boards' });
    expect(listRes.json<Board[]>()).toHaveLength(1);
  });

  it('POST /boards rejects a duplicate slug', async () => {
    server = await createServer({ port: 0, host: '127.0.0.1', contentRoot: tmp.contentRoot });
    await server.ready();

    await server.inject({
      method: 'POST',
      url: '/boards',
      payload: { slug: 'b1', title: 'B1' },
    });
    const res = await server.inject({
      method: 'POST',
      url: '/boards',
      payload: { slug: 'b1', title: 'B1 Again' },
    });

    expect(res.statusCode).toBe(409);
  });

  it('POST /boards rejects duplicate axis slugs within columns', async () => {
    server = await createServer({ port: 0, host: '127.0.0.1', contentRoot: tmp.contentRoot });
    await server.ready();

    const res = await server.inject({
      method: 'POST',
      url: '/boards',
      payload: { slug: 'b2', title: 'B2', columns: ['todo', 'todo'] },
    });

    expect(res.statusCode).toBe(422);
  });
});

describe('PATCH/DELETE /axes/:slug and /boards/:slug', () => {
  let tmp: TempContentRoot;
  let server: Awaited<ReturnType<typeof createServer>>;

  beforeEach(async () => {
    tmp = await tmpContentRoot();
  });

  afterEach(async () => {
    await server.close();
    await tmp.cleanup();
  });

  it('PATCH /axes/:slug updates only the given fields and persists to disk', async () => {
    server = await createServer({ port: 0, host: '127.0.0.1', contentRoot: tmp.contentRoot });
    await server.ready();

    await server.inject({
      method: 'POST',
      url: '/axes',
      payload: { slug: 'ax', title: 'Original', filter: { property: 'status', equals: 'todo' } },
    });

    const res = await server.inject({
      method: 'PATCH',
      url: '/axes/ax',
      payload: { title: 'Renamed' },
    });

    expect(res.statusCode).toBe(200);
    const axis = res.json<Axis>();
    expect(axis.title).toBe('Renamed');
    // Untouched field survives the partial update
    expect(axis.filter).toEqual({ property: 'status', equals: 'todo' });

    // Persisted — a fresh scan of disk reflects the change
    const listRes = await server.inject({ method: 'GET', url: '/axes' });
    const listed = listRes.json<Axis[]>().find(a => a.slug === 'ax');
    expect(listed?.title).toBe('Renamed');
  });

  it('PATCH /axes/:slug 404s for an unknown slug', async () => {
    server = await createServer({ port: 0, host: '127.0.0.1', contentRoot: tmp.contentRoot });
    await server.ready();

    const res = await server.inject({
      method: 'PATCH',
      url: '/axes/no-such',
      payload: { title: 'X' },
    });

    expect(res.statusCode).toBe(404);
  });

  it('DELETE /axes/:slug removes the axis file and index entry', async () => {
    server = await createServer({ port: 0, host: '127.0.0.1', contentRoot: tmp.contentRoot });
    await server.ready();

    await server.inject({ method: 'POST', url: '/axes', payload: { slug: 'gone', title: 'Gone' } });

    const res = await server.inject({ method: 'DELETE', url: '/axes/gone' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });

    const listRes = await server.inject({ method: 'GET', url: '/axes' });
    expect(listRes.json<Axis[]>()).toHaveLength(0);
  });

  it('PATCH /boards/:slug replaces swimlanes and persists to disk', async () => {
    server = await createServer({ port: 0, host: '127.0.0.1', contentRoot: tmp.contentRoot });
    await server.ready();

    await server.inject({ method: 'POST', url: '/axes', payload: { slug: 'lane-a', title: 'A' } });
    await server.inject({ method: 'POST', url: '/axes', payload: { slug: 'lane-b', title: 'B' } });
    await server.inject({
      method: 'POST',
      url: '/boards',
      payload: { slug: 'brd', title: 'Board', swimlanes: ['lane-a'] },
    });

    const res = await server.inject({
      method: 'PATCH',
      url: '/boards/brd',
      payload: { swimlanes: ['lane-a', 'lane-b'] },
    });

    expect(res.statusCode).toBe(200);
    const board = res.json<Board>();
    expect(board.swimlanes).toEqual(['lane-a', 'lane-b']);
    // Title untouched by the partial update
    expect(board.title).toBe('Board');

    const listRes = await server.inject({ method: 'GET', url: '/boards' });
    const listed = listRes.json<Board[]>().find(b => b.slug === 'brd');
    expect(listed?.swimlanes).toEqual(['lane-a', 'lane-b']);
  });

  it('PATCH /boards/:slug rejects duplicate axis slugs within swimlanes', async () => {
    server = await createServer({ port: 0, host: '127.0.0.1', contentRoot: tmp.contentRoot });
    await server.ready();

    await server.inject({ method: 'POST', url: '/boards', payload: { slug: 'brd2', title: 'Board 2' } });

    const res = await server.inject({
      method: 'PATCH',
      url: '/boards/brd2',
      payload: { swimlanes: ['lane-a', 'lane-a'] },
    });

    expect(res.statusCode).toBe(422);
  });

  it('PATCH /boards/:slug 404s for an unknown slug', async () => {
    server = await createServer({ port: 0, host: '127.0.0.1', contentRoot: tmp.contentRoot });
    await server.ready();

    const res = await server.inject({
      method: 'PATCH',
      url: '/boards/no-such',
      payload: { title: 'X' },
    });

    expect(res.statusCode).toBe(404);
  });

  it('DELETE /boards/:slug removes the board file and index entry', async () => {
    server = await createServer({ port: 0, host: '127.0.0.1', contentRoot: tmp.contentRoot });
    await server.ready();

    await server.inject({ method: 'POST', url: '/boards', payload: { slug: 'gone-brd', title: 'Gone' } });

    const res = await server.inject({ method: 'DELETE', url: '/boards/gone-brd' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });

    const listRes = await server.inject({ method: 'GET', url: '/boards' });
    expect(listRes.json<Board[]>()).toHaveLength(0);
  });
});
