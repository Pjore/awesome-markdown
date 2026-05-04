import { describe, it, expect, beforeEach } from 'vitest';
import { LocalStorageProvider } from '../src/index.js';
import type { Item, Board, Axis } from '@awesome-markdown/contracts';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const NOW = '2024-01-01T00:00:00.000Z';

function makeItem(slug: string, extra: Record<string, unknown> = {}): Item {
  return { entityType: 'item', slug, title: slug, createdAt: NOW, updatedAt: NOW, ...extra } as Item;
}

function makeBoard(slug: string, extra: Partial<Board> = {}): Board {
  return { entityType: 'board', slug, title: slug, createdAt: NOW, updatedAt: NOW, ...extra };
}

function makeAxis(slug: string, extra: Partial<Axis> = {}): Axis {
  return { entityType: 'axis', slug, title: slug, createdAt: NOW, updatedAt: NOW, ...extra };
}

function seed(entities: Array<Item | Board | Axis>): void {
  const obj: Record<string, unknown> = {};
  for (const e of entities) obj[`${e.entityType}:${e.slug}`] = e;
  localStorage.setItem('awesome-markdown:v2', JSON.stringify(obj));
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let provider: LocalStorageProvider;

beforeEach(() => {
  localStorage.clear();
  provider = new LocalStorageProvider();
});

// ---------------------------------------------------------------------------
// Item CRUD
// ---------------------------------------------------------------------------

describe('createItem', () => {
  it('creates item with correct fields', async () => {
    const item = await provider.createItem({ slug: 'task-1', title: 'Task 1', mutations: [] });
    expect(item.entityType).toBe('item');
    expect(item.slug).toBe('task-1');
    expect(item.title).toBe('Task 1');
    expect(item.createdAt).toBeDefined();
    expect(item.updatedAt).toBeDefined();
  });

  it('reads back created item', async () => {
    const item = await provider.createItem({ slug: 'task-1', title: 'Task 1', mutations: [] });
    expect(await provider.getItem('task-1')).toEqual(item);
  });

  it('handles slug collision with numeric suffix', async () => {
    await provider.createItem({ slug: 'task', title: 'First', mutations: [] });
    const second = await provider.createItem({ slug: 'task', title: 'Second', mutations: [] });
    expect(second.slug).toBe('task-2');
    const third = await provider.createItem({ slug: 'task', title: 'Third', mutations: [] });
    expect(third.slug).toBe('task-3');
  });

  it('applies initial mutations', async () => {
    const item = await provider.createItem({
      slug: 'task-1', title: 'Task 1',
      mutations: [{ op: 'set', path: 'status', value: 'open' }],
    });
    expect((item as Record<string, unknown>)['status']).toBe('open');
  });

  it('stores body field', async () => {
    const item = await provider.createItem({
      slug: 'task-1', title: 'Task', mutations: [], body: 'hello',
    });
    expect(item.body).toBe('hello');
  });
});

describe('patchItem', () => {
  it('applies set mutation', async () => {
    await provider.createItem({ slug: 'task-1', title: 'Task', mutations: [] });
    const patched = await provider.patchItem('task-1', {
      mutations: [{ op: 'set', path: 'status', value: 'done' }],
    });
    expect((patched as Record<string, unknown>)['status']).toBe('done');
  });

  it('applies append mutation to array', async () => {
    seed([makeItem('t', { tags: ['a'] })]);
    const patched = await provider.patchItem('t', {
      mutations: [{ op: 'append', path: 'tags', value: 'b' }],
    });
    expect((patched as Record<string, unknown>)['tags']).toEqual(['a', 'b']);
  });

  it('applies remove mutation from array', async () => {
    seed([makeItem('t', { tags: ['a', 'b'] })]);
    const patched = await provider.patchItem('t', {
      mutations: [{ op: 'remove', path: 'tags', value: 'a' }],
    });
    expect((patched as Record<string, unknown>)['tags']).toEqual(['b']);
  });

  it('bumps updatedAt', async () => {
    seed([makeItem('t')]);
    const patched = await provider.patchItem('t', {
      mutations: [{ op: 'set', path: 'status', value: 'done' }],
    });
    expect(patched.updatedAt).not.toBe(NOW);
  });

  it('throws on unknown slug', async () => {
    await expect(
      provider.patchItem('no-such', { mutations: [{ op: 'set', path: 'x', value: 1 }] }),
    ).rejects.toThrow('Item not found');
  });
});

describe('deleteItem', () => {
  it('removes item from store', async () => {
    await provider.createItem({ slug: 'task-1', title: 'Task', mutations: [] });
    await provider.deleteItem('task-1');
    expect(await provider.getItem('task-1')).toBeNull();
  });

  it('is idempotent on missing item', async () => {
    await expect(provider.deleteItem('no-such')).resolves.toBeUndefined();
  });
});

describe('getItem', () => {
  it('returns null for missing slug', async () => {
    expect(await provider.getItem('no-such')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Board / Axis read
// ---------------------------------------------------------------------------

describe('listBoards / getBoard', () => {
  it('lists seeded boards', async () => {
    seed([makeBoard('my-board')]);
    const boards = await provider.listBoards();
    expect(boards).toHaveLength(1);
    expect(boards[0]!.slug).toBe('my-board');
  });

  it('returns board by slug', async () => {
    const board = makeBoard('my-board');
    seed([board]);
    expect(await provider.getBoard('my-board')).toEqual(board);
  });

  it('returns null for missing board', async () => {
    expect(await provider.getBoard('missing')).toBeNull();
  });
});

describe('listAxes / getAxis', () => {
  it('lists seeded axes', async () => {
    seed([makeAxis('todo'), makeAxis('done')]);
    const axes = await provider.listAxes();
    expect(axes).toHaveLength(2);
  });

  it('returns axis by slug', async () => {
    const axis = makeAxis('todo');
    seed([axis]);
    expect(await provider.getAxis('todo')).toEqual(axis);
  });

  it('returns null for missing axis', async () => {
    expect(await provider.getAxis('missing')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getBoardRender
// ---------------------------------------------------------------------------

describe('getBoardRender', () => {
  it('throws when board not found', async () => {
    await expect(provider.getBoardRender('missing')).rejects.toThrow('Board not found');
  });

  it('returns synthetic axes when no axis files exist', async () => {
    seed([
      makeBoard('demo', { columns: ['todo'], swimlanes: ['default'] }),
      makeItem('task-1'),
    ]);
    const render = await provider.getBoardRender('demo');
    expect(render.board.slug).toBe('demo');
    expect(render.axes.columns[0]!.synthetic).toBe(true);
    expect(render.axes.columns[0]!.title).toBe('todo');
    expect(render.axes.swimlanes[0]!.synthetic).toBe(true);
    // No filters: all items land in each cell
    expect(render.cells[0]!.items).toHaveLength(1);
  });

  it('uses real axis when present', async () => {
    seed([
      makeBoard('demo', { columns: ['todo'] }),
      makeAxis('todo', { title: 'To Do' }),
      makeItem('task-1'),
    ]);
    const render = await provider.getBoardRender('demo');
    expect(render.axes.columns[0]!.synthetic).toBeUndefined();
    expect(render.axes.columns[0]!.title).toBe('To Do');
  });

  it('bucketizes items by column filter', async () => {
    seed([
      makeBoard('demo', { columns: ['open-col', 'done-col'], swimlanes: ['all'] }),
      makeAxis('open-col', { filter: { property: 'status', equals: 'open' } }),
      makeAxis('done-col', { filter: { property: 'status', equals: 'done' } }),
      makeItem('open-1', { status: 'open' }),
      makeItem('done-1', { status: 'done' }),
    ]);
    const render = await provider.getBoardRender('demo');
    const openCell = render.cells.find((c) => c.columnSlug === 'open-col')!;
    const doneCell = render.cells.find((c) => c.columnSlug === 'done-col')!;
    expect(openCell.items.map((i) => i.slug)).toEqual(['open-1']);
    expect(doneCell.items.map((i) => i.slug)).toEqual(['done-1']);
  });

  it('sorts items by updatedAt desc as tiebreak', async () => {
    seed([
      makeBoard('demo', { columns: ['col'], swimlanes: ['all'] }),
      makeItem('older', { updatedAt: '2024-01-01T00:00:00.000Z' }),
      makeItem('newer', { updatedAt: '2024-06-01T00:00:00.000Z' }),
    ]);
    const render = await provider.getBoardRender('demo');
    const cell = render.cells[0]!;
    expect(cell.items[0]!.slug).toBe('newer');
    expect(cell.items[1]!.slug).toBe('older');
  });

  it('returns empty cells array when board has no columns or swimlanes', async () => {
    seed([makeBoard('demo'), makeItem('task-1')]);
    const render = await provider.getBoardRender('demo');
    expect(render.cells).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Parity fixture — render semantics match provider-fs expectations
// ---------------------------------------------------------------------------

describe('getBoardRender parity fixture', () => {
  it('computes correct cell composition for demo fixture', async () => {
    const board = makeBoard('proj', { columns: ['todo', 'in-progress'], swimlanes: ['team-a'] });
    const todoAxis = makeAxis('todo', { filter: { property: 'status', equals: 'todo' } });
    const inProgAxis = makeAxis('in-progress', { filter: { property: 'status', equals: 'in-progress' } });
    const teamAAxis = makeAxis('team-a', { filter: { property: 'team', equals: 'a' } });

    const item1 = makeItem('t1', { status: 'todo', team: 'a' });
    const item2 = makeItem('t2', { status: 'in-progress', team: 'a' });
    const item3 = makeItem('t3', { status: 'todo', team: 'b' }); // wrong team, no swimlane match

    seed([board, todoAxis, inProgAxis, teamAAxis, item1, item2, item3]);
    const render = await provider.getBoardRender('proj');

    expect(render.cells).toHaveLength(2); // 2 cols × 1 lane
    const todoCell = render.cells.find((c) => c.columnSlug === 'todo')!;
    const inProgCell = render.cells.find((c) => c.columnSlug === 'in-progress')!;
    expect(todoCell.items.map((i) => i.slug)).toEqual(['t1']);
    expect(inProgCell.items.map((i) => i.slug)).toEqual(['t2']);
  });
});

// ---------------------------------------------------------------------------
// getHomeless
// ---------------------------------------------------------------------------

describe('getHomeless', () => {
  it('throws when board not found', async () => {
    await expect(provider.getHomeless('missing')).rejects.toThrow('Board not found');
  });

  it('returns items with board entry that match no column', async () => {
    const board = makeBoard('demo', { columns: ['todo'] });
    const col = makeAxis('todo', { filter: { property: 'status', equals: 'open' } });
    const homeless = makeItem('task-lost', { status: 'done', boards: [{ board: 'demo' }] });
    const placed = makeItem('task-placed', { status: 'open', boards: [{ board: 'demo' }] });
    seed([board, col, homeless, placed]);

    const result = await provider.getHomeless('demo');
    expect(result.board.slug).toBe('demo');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.slug).toBe('task-lost');
  });

  it('ignores items without a board entry for this board', async () => {
    const board = makeBoard('demo', { columns: ['col'] });
    const col = makeAxis('col', { filter: { property: 'status', equals: 'open' } });
    // Item not in boards[] for this board — should be ignored even with matching filter
    const unrelated = makeItem('unrelated', { status: 'done' });
    seed([board, col, unrelated]);

    const result = await provider.getHomeless('demo');
    expect(result.items).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

describe('subscribe', () => {
  it('emits change event on createItem', async () => {
    const events: Array<{ entitySlug: string; entityType: string }> = [];
    provider.subscribe((e) => {
      if (e.type === 'change') events.push({ entitySlug: e.entitySlug, entityType: e.entityType });
    });
    await provider.createItem({ slug: 'task-1', title: 'Task', mutations: [] });
    expect(events).toHaveLength(1);
    expect(events[0]!.entitySlug).toBe('task-1');
    expect(events[0]!.entityType).toBe('item');
  });

  it('emits change event on patchItem', async () => {
    seed([makeItem('t1')]);
    const events: string[] = [];
    provider.subscribe((e) => { if (e.type === 'change') events.push(e.entitySlug); });
    await provider.patchItem('t1', { mutations: [{ op: 'set', path: 'x', value: 1 }] });
    expect(events).toEqual(['t1']);
  });

  it('emits change event on deleteItem', async () => {
    seed([makeItem('t1')]);
    const events: string[] = [];
    provider.subscribe((e) => { if (e.type === 'change') events.push(e.entitySlug); });
    await provider.deleteItem('t1');
    expect(events).toEqual(['t1']);
  });

  it('unsubscribe stops receiving events', async () => {
    const events: number[] = [];
    const unsub = provider.subscribe(() => events.push(1));
    await provider.createItem({ slug: 'task-1', title: 'Task', mutations: [] });
    unsub();
    await provider.createItem({ slug: 'task-2', title: 'Task 2', mutations: [] });
    expect(events).toHaveLength(1);
  });
});

