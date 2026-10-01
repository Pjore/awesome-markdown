import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from '../src/server.js';
import { tmpContentRoot } from './fixtures/temp-content.js';
import type { TempContentRoot } from './fixtures/temp-content.js';
import type { Axis, Board, BoardRender } from '@awesome-markdown/contracts';

describe('board layout editing', () => {
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

  it('POST /axes persists order and writeOnDrop', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/axes',
      payload: {
        slug: 'doing',
        title: 'Doing',
        filter: { property: 'column', equals: 'doing' },
        order: { by: 'boards.$board.order', direction: 'asc' },
        writeOnDrop: { readonly: true },
      },
    });
    expect(res.statusCode).toBe(201);
    const axis = res.json<Axis>();
    expect(axis.order).toEqual({ by: 'boards.$board.order', direction: 'asc' });
    expect(axis.writeOnDrop).toEqual({ readonly: true });
  });

  it('PATCH /axes/:slug removes keys set to null', async () => {
    await server.inject({
      method: 'POST',
      url: '/axes',
      payload: {
        slug: 'doing',
        title: 'Doing',
        filter: { property: 'column', equals: 'doing' },
        writeOnDrop: { readonly: true },
      },
    });
    const res = await server.inject({
      method: 'PATCH',
      url: '/axes/doing',
      payload: { filter: null, writeOnDrop: null },
    });
    expect(res.statusCode).toBe(200);
    const axis = res.json<Axis>();
    expect(axis).not.toHaveProperty('filter');
    expect(axis).not.toHaveProperty('writeOnDrop');
    expect(axis.title).toBe('Doing');
  });

  it('PATCH /boards/:slug removes the board filter when null', async () => {
    await server.inject({
      method: 'POST',
      url: '/boards',
      payload: { slug: 'brd', title: 'Board', filter: { property: 'project', equals: 'x' } },
    });
    const res = await server.inject({
      method: 'PATCH',
      url: '/boards/brd',
      payload: { filter: null },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<Board>()).not.toHaveProperty('filter');
  });

  it('GET /boards/:slug/render synthesizes the implicit swimlane when none are declared', async () => {
    await server.inject({ method: 'POST', url: '/axes', payload: { slug: 'todo', title: 'Todo' } });
    await server.inject({
      method: 'POST',
      url: '/boards',
      payload: { slug: 'brd', title: 'Board', columns: ['todo'] },
    });

    const res = await server.inject({ method: 'GET', url: '/boards/brd/render' });
    expect(res.statusCode).toBe(200);
    const render = res.json<BoardRender>();
    expect(render.axes.swimlanes).toEqual([
      { entityType: 'axis', slug: 'all', title: 'All', synthetic: true },
    ]);
    expect(render.cells).toHaveLength(1);
    expect(render.cells[0]).toMatchObject({
      columnSlug: 'todo',
      swimlaneSlug: 'all',
      readOnly: false,
    });
  });
});
