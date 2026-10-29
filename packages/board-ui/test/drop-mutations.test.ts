import { describe, it, expect } from 'vitest';
import type { Board, Axis, Cell, Item } from '@awesome-markdown/contracts';
import { computeDropMutations } from '../src/board/dnd/mutateDragDrop.js';

const item: Item = { entityType: 'item', slug: 'x', createdAt: '', updatedAt: '', rank: 'bP' };
const board: Board = {
  entityType: 'board',
  slug: 'board',
  title: '',
  createdAt: '',
  updatedAt: '',
};
const col: Axis = {
  entityType: 'axis',
  slug: 'column',
  title: '',
  filter: { property: 'status', equals: 'doing' },
};
const lane: Axis = { entityType: 'axis', slug: 'lane', title: '' };
const cell: Cell = { columnSlug: 'column', swimlaneSlug: 'lane', readOnly: false, items: [item] };
const run = (column = col, swimlane = lane, destination = cell, source = cell) =>
  computeDropMutations({
    itemSlug: 'x',
    srcCell: source,
    dstCell: destination,
    colAxis: column,
    slAxis: swimlane,
    board,
    insertBeforeSlug: null,
  });

describe('configured drop mutations', () => {
  it('does not invent membership or an order target when no manual sort is configured', () => {
    expect(run()).toBeNull();
    const result = run(col, lane, { ...cell, columnSlug: 'other', items: [] });
    expect(result?.mutations).toEqual([{ op: 'set', path: 'status', value: 'doing' }]);
  });
  it('uses the column order target and writes exactly one sort field', () => {
    const result = run(
      { ...col, order: { by: 'rank', direction: 'asc' } },
      { ...lane, order: { by: 'other', direction: 'asc' } }
    );
    expect(result?.type).toBe('reorder');
    expect(result?.mutations).toHaveLength(1);
    expect(result?.mutations.filter((m) => m.path === 'rank')).toHaveLength(1);
    expect(result?.mutations.some((m) => m.path === 'other')).toBe(false);
  });
  it('falls back to lane order and preserves its own axis selector identity', () => {
    const result = run(col, { ...lane, order: { by: 'groups.$axis.order', direction: 'asc' } });
    expect(result?.mutations.at(-1)?.path).toEqual([
      'groups',
      { selector: 'axis', value: 'lane' },
      'order',
    ]);
  });
  it('disables descending and incompatible-neighbor manual reorders but permits placement writes', () => {
    expect(run({ ...col, order: { by: 'rank', direction: 'desc' } })).toBeNull();
    const destination = { ...cell, items: [{ ...item, slug: 'neighbor', rank: 7 }] };
    expect(run({ ...col, order: { by: 'rank', direction: 'asc' } }, lane, destination)).toBeNull();
    const cross = run({ ...col, order: { by: 'rank', direction: 'asc' } }, lane, {
      ...destination,
      columnSlug: 'other',
    });
    expect(cross?.mutations).toEqual([{ op: 'set', path: 'status', value: 'doing' }]);
  });
  it('binds column and lane overrides independently without dropping board constraints', () => {
    const column = {
      ...col,
      writeOnDrop: [{ op: 'set' as const, path: 'groups.$axis.status', value: 'column-write' }],
    };
    const swimlane = {
      ...lane,
      writeOnDrop: [{ op: 'set' as const, path: 'groups.$axis.status', value: 'lane-write' }],
    };
    const result = run(column, swimlane, { ...cell, columnSlug: 'other', items: [] });
    expect(result?.mutations).toEqual([
      {
        op: 'set',
        path: ['groups', { selector: 'axis', value: 'column' }, 'status'],
        value: 'column-write',
      },
      {
        op: 'set',
        path: ['groups', { selector: 'axis', value: 'lane' }, 'status'],
        value: 'lane-write',
      },
    ]);
  });
  it('blocks readonly overrides and invalid contextual lookups', () => {
    expect(
      run({ ...col, writeOnDrop: { readonly: true } }, lane, { ...cell, columnSlug: 'other' })
    ).toBeNull();
    const duplicate = {
      ...item,
      slug: 'neighbor',
      groups: [
        { axis: 'column', order: 'aP' },
        { axis: 'column', order: 'bP' },
      ],
    };
    expect(() =>
      run({ ...col, order: { by: 'groups.$axis.order', direction: 'asc' } }, lane, {
        ...cell,
        items: [duplicate],
      })
    ).toThrow(/Ambiguous/);
  });
});
