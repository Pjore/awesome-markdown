import { describe, it, expect } from 'vitest';
import type { Item, Board, Axis } from '@awesome-markdown/contracts';
import {
  resolvePath,
  cellMutations,
  bindFilter,
  joinPath,
  parsePath,
} from '@awesome-markdown/filter-engine';
import { applyMutations, renderBoard, computeHomeless } from '../src/index.js';
import { serializeEntity, parseEntityResult } from '../src/markdown.js';

const item: Item = {
  entityType: 'item',
  slug: 'x',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};
const board: Board = {
  entityType: 'board',
  slug: 'b',
  title: 'Board',
  filter: { property: 'boards.$board.board', equals: 'b' },
  columns: ['column'],
  swimlanes: ['lane'],
  createdAt: '',
  updatedAt: '',
};
const column: Axis = {
  entityType: 'axis',
  slug: 'column',
  title: 'Column',
  filter: { property: 'boards.$board.axes.$axis.status', equals: 'doing' },
  order: { by: 'boards.$board.axes.$axis.order', direction: 'asc' },
};
const lane: Axis = {
  entityType: 'axis',
  slug: 'lane',
  title: 'Lane',
  filter: { property: 'boards.$board.axes.$axis.status', equals: 'high' },
};

describe('contextual items', () => {
  it('binds both axis dimensions before combining and writes one complete result', () => {
    const mutations = cellMutations(board, column, lane);
    expect(Array.isArray(mutations)).toBe(true);
    if (!Array.isArray(mutations)) throw new Error('read only');
    const saved = applyMutations(item, mutations);
    expect(saved.boards).toEqual([
      {
        board: 'b',
        axes: [
          { axis: 'column', status: 'doing' },
          { axis: 'lane', status: 'high' },
        ],
      },
    ]);
    const render = renderBoard({
      board,
      lookupAxis: (s) => (s === 'column' ? column : lane),
      items: [saved],
    });
    expect(render.cells[0]!.items).toEqual([saved]);
    expect(
      computeHomeless({
        board,
        lookupAxis: (s) => (s === 'column' ? column : lane),
        items: [saved, item],
      }).items
    ).toEqual([]);
  });
  it('selectors work on any named list and ignore primitives/missing identities', () => {
    const data = {
      ...item,
      groups: [
        1,
        null,
        {},
        { axis: 'same', board: 'different', value: null },
        { board: 'same', value: 3 },
      ],
    };
    expect(resolvePath('groups.$board.value', data, { board: 'same' })).toBe(3);
    expect(resolvePath('groups.$axis.value', data, { board: 'same', axis: 'same' })).toBeNull();
    expect(
      resolvePath('groups.$axis.value', data, { board: 'same', axis: 'missing' })
    ).toBeUndefined();
    expect(() => bindFilter({ property: 'groups.$axis.value', equals: 1 }, { board: 'b' })).toThrow(
      /Unbound/
    );
  });
  it('duplicate matches are visible errors and failed batches never modify input', () => {
    const data = { ...item, groups: [{ board: 'b' }, { board: 'b' }] };
    expect(() => resolvePath('groups.$board.x', data, { board: 'b' })).toThrow(/Ambiguous/);
    expect(() =>
      applyMutations(data, [
        { op: 'set', path: ['ok'], value: true },
        { op: 'set', path: ['groups', { selector: 'board', value: 'b' }, 'x'], value: 1 },
      ])
    ).toThrow(/Ambiguous/);
    expect(data).not.toHaveProperty('ok');
  });
  it('does not create entries on reads, deletes, or ordinary structural edits', () => {
    expect(resolvePath('groups.$board.x', item, { board: 'b' })).toBeUndefined();
    const after = applyMutations(item, [
      { op: 'delete', path: ['groups', { selector: 'board', value: 'b' }, 'x'] },
    ]);
    expect(after).not.toHaveProperty('groups');
    const direct = applyMutations(item, [
      { op: 'set', path: ['groups'], value: [{ board: 'b' }, { board: 'b' }] },
    ]);
    expect(direct.groups).toEqual([{ board: 'b' }, { board: 'b' }]);
  });
  it('supports literal keys, structural indices, and nested metadata names', () => {
    const literal = 'dots.and\\slashes';
    expect(parsePath(joinPath([literal, 'createdAt']))).toEqual([literal, 'createdAt']);
    const data = applyMutations(item, [
      { op: 'set', path: [literal], value: [{ createdAt: '' }, 1] },
      { op: 'set', path: [literal, 0, 'createdAt'], value: 'editable' },
      { op: 'delete', path: [literal, 1] },
    ]);
    expect(data[literal]).toEqual([{ createdAt: 'editable' }]);
    expect(resolvePath([literal, 0, 'createdAt'], data, { board: 'b' })).toBe('editable');
  });
  it('keeps literal variable-looking keys distinct from contextual configuration paths', () => {
    const data = applyMutations(item, [
      { op: 'set', path: ['$board'], value: { $axis: 'literal' } },
    ]);
    expect(resolvePath(['$board', '$axis'], data, { board: 'not-a-key' })).toBe('literal');
    expect(() => applyMutations(item, [{ op: 'set', path: 'groups.$axis.x', value: 1 }])).toThrow(
      /unbound/
    );
  });
  it.each(['slug', 'entityType', 'createdAt', 'updatedAt'])(
    'protects root %s and rejects incompatible navigation',
    (key) => {
      expect(() => applyMutations(item, [{ op: 'set', path: [key], value: 'changed' }])).toThrow(
        /read-only/
      );
      expect(() =>
        applyMutations({ ...item, groups: null }, [
          { op: 'set', path: ['groups', { selector: 'board', value: 'b' }, 'x'], value: 1 },
        ])
      ).toThrow();
      expect(() =>
        applyMutations({ ...item, a: 1 }, [{ op: 'set', path: 'a.b', value: 2 }])
      ).toThrow();
    }
  );
  it('prefers column sort, then lane sort, then updatedAt', () => {
    const b = { ...board, filter: undefined };
    const col = { ...column, filter: undefined, order: undefined };
    const sl = { ...lane, filter: undefined, order: { by: 'rank', direction: 'asc' as const } };
    const items = [
      { ...item, slug: 'z', rank: 'a1' },
      { ...item, slug: 'a', rank: 'a0' },
    ];
    expect(
      renderBoard({
        board: b,
        lookupAxis: (s) => (s === 'column' ? col : sl),
        items,
      }).cells[0]!.items.map((i) => i.slug)
    ).toEqual(['a', 'z']);
  });
  it('roundtrips exact body, timestamp text, null and literals and rejects body collisions', () => {
    const data = {
      ...item,
      body: '\n hello \n\n',
      nested: { createdAt: '2026-01-01', 'a.b': [null, '', {}, []] },
    };
    const parsed = parseEntityResult(serializeEntity(data));
    expect(parsed.ok && parsed.entity.data).toEqual(data);
    expect(
      parseEntityResult(
        '---\nentityType: item\nslug: x\ncreatedAt: x\nupdatedAt: x\nbody: frontmatter\n---\ndocument'
      ).ok
    ).toBe(false);
    expect(
      parseEntityResult(
        '---\nentityType: item\nslug: x\ncreatedAt: x\nupdatedAt: x\nvalue: 9007199254740993\n---\n'
      ).ok
    ).toBe(false);
  });
});
