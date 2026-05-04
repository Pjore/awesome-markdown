import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from '../src/server.js';
import {
  tmpContentRoot,
  writeItemFixture,
  writeBoardFixture,
  writeAxisFixture,
  makeItem,
  makeBoard,
  makeAxis,
} from './fixtures/temp-content.js';
import type { TempContentRoot } from './fixtures/temp-content.js';
import type { BoardRender, Homeless } from '@awesome-markdown/contracts';

const NOW = '2024-01-01T00:00:00.000Z';

describe('boards routes — render and homeless', () => {
  let tmp: TempContentRoot;
  let server: Awaited<ReturnType<typeof createServer>>;

  beforeEach(async () => {
    tmp = await tmpContentRoot();
  });

  afterEach(async () => {
    await server.close();
    await tmp.cleanup();
  });

  it('GET /boards returns list of boards', async () => {
    await writeBoardFixture(tmp.contentRoot, makeBoard({ slug: 'b1', title: 'Board 1' }));
    await writeBoardFixture(tmp.contentRoot, makeBoard({ slug: 'b2', title: 'Board 2' }));
    server = await createServer({ port: 0, host: '127.0.0.1', contentRoot: tmp.contentRoot });
    await server.ready();

    const res = await server.inject({ method: 'GET', url: '/boards' });
    expect(res.statusCode).toBe(200);
    const boards = res.json<unknown[]>();
    expect(boards).toHaveLength(2);
  });

  it('GET /boards/:slug/render — bucketization (item in multiple cells)', async () => {
    // Axes: col-todo (status=todo), col-high (priority=high), sw-all (no filter)
    await writeAxisFixture(tmp.contentRoot, makeAxis({
      slug: 'col-todo', title: 'Todo',
      filter: { property: 'status', equals: 'todo' },
    }));
    await writeAxisFixture(tmp.contentRoot, makeAxis({
      slug: 'col-high', title: 'High',
      filter: { property: 'priority', equals: 'high' },
    }));
    await writeAxisFixture(tmp.contentRoot, makeAxis({ slug: 'sw-all', title: 'All' }));

    await writeBoardFixture(tmp.contentRoot, makeBoard({
      slug: 'brd', title: 'Board',
      columns: ['col-todo', 'col-high'],
      swimlanes: ['sw-all'],
    }));

    // item-a: todo + high → appears in both col-todo AND col-high cells
    await writeItemFixture(tmp.contentRoot, {
      ...makeItem({ slug: 'item-a', title: 'A' }),
      status: 'todo',
      priority: 'high',
    } as Parameters<typeof makeItem>[0] & Record<string, unknown>);
    // item-b: todo only
    await writeItemFixture(tmp.contentRoot, {
      ...makeItem({ slug: 'item-b', title: 'B' }),
      status: 'todo',
      priority: 'low',
    } as Parameters<typeof makeItem>[0] & Record<string, unknown>);

    server = await createServer({ port: 0, host: '127.0.0.1', contentRoot: tmp.contentRoot });
    await server.ready();

    const res = await server.inject({ method: 'GET', url: '/boards/brd/render' });
    expect(res.statusCode).toBe(200);
    const body = res.json<BoardRender>();

    expect(body.board.slug).toBe('brd');
    expect(body.axes.columns).toHaveLength(2);
    expect(body.axes.swimlanes).toHaveLength(1);
    expect(body.cells).toHaveLength(2); // 2 columns × 1 swimlane

    const todoCell = body.cells.find(c => c.columnSlug === 'col-todo');
    const highCell = body.cells.find(c => c.columnSlug === 'col-high');
    expect(todoCell?.items.map(i => i.slug)).toContain('item-a');
    expect(todoCell?.items.map(i => i.slug)).toContain('item-b');
    expect(highCell?.items.map(i => i.slug)).toContain('item-a');
    expect(highCell?.items.map(i => i.slug)).not.toContain('item-b');
  });

  it('GET /boards/:slug/render — board filter narrows candidate set', async () => {
    await writeAxisFixture(tmp.contentRoot, makeAxis({ slug: 'col-a', title: 'Col A' }));
    await writeAxisFixture(tmp.contentRoot, makeAxis({ slug: 'sw-all', title: 'All' }));
    await writeBoardFixture(tmp.contentRoot, makeBoard({
      slug: 'brd-filtered', title: 'Filtered Board',
      filter: { property: 'tags', has: 'included' },
      columns: ['col-a'],
      swimlanes: ['sw-all'],
    }));

    await writeItemFixture(tmp.contentRoot, {
      ...makeItem({ slug: 'in-item', title: 'Included' }),
      tags: ['included'],
    } as Parameters<typeof makeItem>[0] & Record<string, unknown>);
    await writeItemFixture(tmp.contentRoot, makeItem({ slug: 'out-item', title: 'Excluded' }));

    server = await createServer({ port: 0, host: '127.0.0.1', contentRoot: tmp.contentRoot });
    await server.ready();

    const res = await server.inject({ method: 'GET', url: '/boards/brd-filtered/render' });
    expect(res.statusCode).toBe(200);
    const body = res.json<BoardRender>();
    const cell = body.cells[0];
    expect(cell?.items.map(i => i.slug)).toContain('in-item');
    expect(cell?.items.map(i => i.slug)).not.toContain('out-item');
  });

  it('GET /boards/:slug/render — synthetic axis slug-fallback', async () => {
    // No axis file for 'missing-col' — should be synthesized
    await writeAxisFixture(tmp.contentRoot, makeAxis({ slug: 'sw-all', title: 'All' }));
    await writeBoardFixture(tmp.contentRoot, makeBoard({
      slug: 'syn-board', title: 'Synthetic',
      columns: ['missing-col'],
      swimlanes: ['sw-all'],
    }));

    server = await createServer({ port: 0, host: '127.0.0.1', contentRoot: tmp.contentRoot });
    await server.ready();

    const res = await server.inject({ method: 'GET', url: '/boards/syn-board/render' });
    expect(res.statusCode).toBe(200);
    const body = res.json<BoardRender>();
    const synCol = body.axes.columns.find(a => a.slug === 'missing-col');
    expect(synCol).toBeDefined();
    expect(synCol?.synthetic).toBe(true);
    expect(synCol?.title).toBe('missing-col');
  });

  it('GET /boards/:slug/render — column sort with updatedAt desc tiebreak', async () => {
    await writeAxisFixture(tmp.contentRoot, makeAxis({
      slug: 'col-ord', title: 'Ordered',
      order: { by: 'order', direction: 'asc' },
    }));
    await writeAxisFixture(tmp.contentRoot, makeAxis({ slug: 'sw-all', title: 'All' }));
    await writeBoardFixture(tmp.contentRoot, makeBoard({
      slug: 'sort-board', title: 'Sort',
      columns: ['col-ord'],
      swimlanes: ['sw-all'],
    }));

    await writeItemFixture(tmp.contentRoot, {
      ...makeItem({ slug: 'ord-a', title: 'A' }),
      order: 'b',
      updatedAt: '2024-01-02T00:00:00.000Z',
    } as Parameters<typeof makeItem>[0] & Record<string, unknown>);
    await writeItemFixture(tmp.contentRoot, {
      ...makeItem({ slug: 'ord-b', title: 'B' }),
      order: 'a',
      updatedAt: '2024-01-01T00:00:00.000Z',
    } as Parameters<typeof makeItem>[0] & Record<string, unknown>);

    server = await createServer({ port: 0, host: '127.0.0.1', contentRoot: tmp.contentRoot });
    await server.ready();

    const res = await server.inject({ method: 'GET', url: '/boards/sort-board/render' });
    expect(res.statusCode).toBe(200);
    const body = res.json<BoardRender>();
    const slugs = body.cells[0]?.items.map(i => i.slug) ?? [];
    expect(slugs[0]).toBe('ord-b'); // order 'a' sorts first (asc)
    expect(slugs[1]).toBe('ord-a');
  });

  it('GET /boards/:slug/homeless — detects homeless items', async () => {
    await writeAxisFixture(tmp.contentRoot, makeAxis({
      slug: 'col-done', title: 'Done',
      filter: { property: 'status', equals: 'done' },
    }));
    await writeBoardFixture(tmp.contentRoot, makeBoard({
      slug: 'home-board', title: 'Homeless',
      columns: ['col-done'],
    }));

    // Homeless: boards[] entry for 'home-board' but status != done
    await writeItemFixture(tmp.contentRoot, {
      ...makeItem({ slug: 'homeless-item', title: 'Homeless' }),
      boards: [{ board: 'home-board' }],
      status: 'todo',
    } as Parameters<typeof makeItem>[0] & Record<string, unknown>);
    // Homed: boards[] entry and status=done → matches col-done
    await writeItemFixture(tmp.contentRoot, {
      ...makeItem({ slug: 'homed-item', title: 'Homed' }),
      boards: [{ board: 'home-board' }],
      status: 'done',
    } as Parameters<typeof makeItem>[0] & Record<string, unknown>);
    // No entry: no boards[] for home-board → not homeless
    await writeItemFixture(tmp.contentRoot, makeItem({ slug: 'unrelated', title: 'Unrelated' }));

    server = await createServer({ port: 0, host: '127.0.0.1', contentRoot: tmp.contentRoot });
    await server.ready();

    const res = await server.inject({ method: 'GET', url: '/boards/home-board/homeless' });
    expect(res.statusCode).toBe(200);
    const body = res.json<Homeless>();
    const slugs = body.items.map(i => i.slug);
    expect(slugs).toContain('homeless-item');
    expect(slugs).not.toContain('homed-item');
    expect(slugs).not.toContain('unrelated');
  });

  it('GET /boards/:slug/render returns 404 for unknown board', async () => {
    server = await createServer({ port: 0, host: '127.0.0.1', contentRoot: tmp.contentRoot });
    await server.ready();

    const res = await server.inject({ method: 'GET', url: '/boards/no-such/render' });
    expect(res.statusCode).toBe(404);
  });
});



