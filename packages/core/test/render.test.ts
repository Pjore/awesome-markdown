import { describe, it, expect } from 'vitest';
import type { Axis, Board, Item } from '@awesome-markdown/contracts';
import {
  compareScalars,
  computeHomeless,
  isCellReadOnly,
  renderBoard,
  sortItems,
  syntheticAxis,
} from '../src/index.js';

const T0 = '2024-01-01T00:00:00.000Z';
const T1 = '2024-01-02T00:00:00.000Z';
const T2 = '2024-01-03T00:00:00.000Z';

function item(slug: string, extra: Partial<Item> & Record<string, unknown> = {}): Item {
  return { entityType: 'item', slug, title: slug, createdAt: T0, updatedAt: T0, ...extra };
}

function axis(slug: string, extra: Partial<Axis> = {}): Axis {
  return { entityType: 'axis', slug, title: slug, ...extra };
}

function board(extra: Partial<Board> = {}): Board {
  return { entityType: 'board', slug: 'b', title: 'B', createdAt: T0, updatedAt: T0, ...extra };
}

const todo = axis('todo', { filter: { property: 'status', equals: 'todo' } });
const done = axis('done', {
  filter: { any: [{ property: 'status', equals: 'done' }, { property: 'status', equals: 'closed' }] },
});
const axes = new Map([todo, done].map(a => [a.slug, a]));
const lookupAxis = (s: string) => axes.get(s);

describe('helpers', () => {
  it('syntheticAxis marks the axis synthetic and uses the slug as title', () => {
    expect(syntheticAxis('x')).toEqual({ entityType: 'axis', slug: 'x', title: 'x', synthetic: true });
  });

  it('compareScalars compares strings and numbers, treats mixed types as equal', () => {
    expect(compareScalars('a', 'b')).toBeLessThan(0);
    expect(compareScalars(3, 1)).toBeGreaterThan(0);
    expect(compareScalars('1', 1)).toBe(0);
    expect(compareScalars(undefined, null)).toBe(0);
  });

  it('sortItems orders by axis order and falls back to updatedAt desc', () => {
    const a = item('a', { boards: [{ board: 'b', order: 'b' }], updatedAt: T0 });
    const b = item('b', { boards: [{ board: 'b', order: 'a' }], updatedAt: T1 });
    const c = item('c', { updatedAt: T2 });
    const d = item('d', { updatedAt: T0 });
    const ctx = { board: 'b' };
    const order = { by: 'boards.$board.order', direction: 'asc' as const };
    expect(sortItems([a, b], order, ctx).map(i => i.slug)).toEqual(['b', 'a']);
    expect(sortItems([a, b], { ...order, direction: 'desc' }, ctx).map(i => i.slug)).toEqual(['a', 'b']);
    // missing order values on either side → updatedAt desc
    expect(sortItems([d, a, c], order, ctx).map(i => i.slug)).toEqual(['c', 'd', 'a']);
    expect(sortItems([d, c], undefined, ctx).map(i => i.slug)).toEqual(['c', 'd']);
  });

  it('sortItems does not mutate its input', () => {
    const input = [item('a', { updatedAt: T0 }), item('b', { updatedAt: T1 })];
    sortItems(input, undefined, { board: 'b' });
    expect(input.map(i => i.slug)).toEqual(['a', 'b']);
  });

  it('isCellReadOnly: no filters → writable', () => {
    expect(isCellReadOnly(undefined, axis('c'), axis('l'))).toBe(false);
  });

  it('isCellReadOnly: invertible combined filter → writable', () => {
    expect(isCellReadOnly({ property: 'project', equals: 'p' }, todo, axis('l'))).toBe(false);
  });

  it('isCellReadOnly: non-invertible filter → read-only', () => {
    expect(isCellReadOnly(undefined, done, axis('l'))).toBe(true);
  });

  it('isCellReadOnly: explicit readonly on either axis → read-only', () => {
    expect(isCellReadOnly(undefined, axis('c', { writeOnDrop: { readonly: true } }), axis('l'))).toBe(true);
    expect(isCellReadOnly(undefined, axis('c'), axis('l', { writeOnDrop: { readonly: true } }))).toBe(true);
  });

  it('isCellReadOnly: explicit writeOnDrop mutations bypass the axis filter', () => {
    const overridden = { ...done, writeOnDrop: [{ op: 'set' as const, path: 'status', value: 'done' }] };
    expect(isCellReadOnly(undefined, overridden, axis('l'))).toBe(false);
  });
});

describe('renderBoard', () => {
  it('builds the full column × swimlane product with matching items', () => {
    const items = [
      item('t1', { status: 'todo', priority: 'high' }),
      item('t2', { status: 'todo' }),
      item('d1', { status: 'closed', priority: 'high' }),
    ];
    const high = axis('high', { filter: { property: 'priority', equals: 'high' } });
    const render = renderBoard({
      board: board({ columns: ['todo', 'done'], swimlanes: ['high'] }),
      lookupAxis: s => (s === 'high' ? high : lookupAxis(s)),
      items,
    });
    expect(render.axes.columns.map(a => a.slug)).toEqual(['todo', 'done']);
    expect(render.axes.swimlanes.map(a => a.slug)).toEqual(['high']);
    expect(render.cells.map(c => [c.columnSlug, c.swimlaneSlug, c.readOnly, c.items.map(i => i.slug)])).toEqual([
      ['todo', 'high', false, ['t1']],
      ['done', 'high', true, ['d1']],
    ]);
  });

  it('applies the board filter to the candidate set', () => {
    const render = renderBoard({
      board: board({ filter: { property: 'project', equals: 'p' }, columns: ['todo'] }),
      lookupAxis,
      items: [item('in', { status: 'todo', project: 'p' }), item('out', { status: 'todo', project: 'q' })],
    });
    expect(render.cells[0]!.items.map(i => i.slug)).toEqual(['in']);
  });

  it('substitutes synthetic axes for missing definitions (they match everything)', () => {
    const render = renderBoard({ board: board({ columns: ['missing'] }), lookupAxis, items: [item('a')] });
    expect(render.axes.columns).toEqual([syntheticAxis('missing')]);
    expect(render.cells[0]!.items.map(i => i.slug)).toEqual(['a']);
  });

  it('falls back to the implicit axis when a dimension is empty', () => {
    const render = renderBoard({ board: board(), lookupAxis, items: [item('a')] });
    expect(render.cells).toHaveLength(1);
    expect(render.axes.columns[0]!.synthetic).toBe(true);
    expect(render.axes.swimlanes[0]!.synthetic).toBe(true);
    expect(render.cells[0]!.items.map(i => i.slug)).toEqual(['a']);
  });

  it('returns the board unchanged in the envelope', () => {
    const b = board({ columns: ['todo'] });
    expect(renderBoard({ board: b, lookupAxis, items: [] }).board).toBe(b);
  });
});

describe('computeHomeless', () => {
  const b = board({ columns: ['todo'] });

  it('returns items placed on the board that match no column', () => {
    const items = [
      item('placed-match', { status: 'todo', boards: [{ board: 'b' }] }),
      item('placed-orphan', { status: 'archived', boards: [{ board: 'b' }] }),
      item('other-board', { status: 'archived', boards: [{ board: 'x' }] }),
      item('no-boards', { status: 'archived' }),
    ];
    expect(computeHomeless({ board: b, lookupAxis, items }).items.map(i => i.slug)).toEqual(['placed-orphan']);
  });

  it('excludes items rejected by the board filter', () => {
    const filtered = board({ columns: ['todo'], filter: { property: 'project', equals: 'p' } });
    const items = [item('q', { status: 'archived', project: 'q', boards: [{ board: 'b' }] })];
    expect(computeHomeless({ board: filtered, lookupAxis, items }).items).toEqual([]);
  });

  it('never reports homeless items when a column is filterless', () => {
    const items = [item('a', { status: 'archived', boards: [{ board: 'b' }] })];
    const withSynthetic = board({ columns: ['todo', 'missing'] });
    expect(computeHomeless({ board: withSynthetic, lookupAxis, items }).items).toEqual([]);
  });
});
