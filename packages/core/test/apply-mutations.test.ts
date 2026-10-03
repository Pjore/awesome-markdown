import { describe, it, expect } from 'vitest';
import type { Item } from '@awesome-markdown/contracts';
import { applyMutations } from '../src/index.js';

const NOW = '2024-02-02T00:00:00.000Z';

function item(extra: Record<string, unknown> = {}): Item {
  return {
    entityType: 'item',
    slug: 'i',
    title: 'I',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...extra,
  };
}

describe('applyMutations', () => {
  it('sets scalar properties and stamps updatedAt', () => {
    const out = applyMutations(item(), [{ op: 'set', path: 'status', value: 'done' }], NOW);
    expect(out['status']).toBe('done');
    expect(out.updatedAt).toBe(NOW);
  });

  it('does not mutate the input item', () => {
    const input = item({ tags: ['a'] });
    applyMutations(input, [{ op: 'append', path: 'tags', value: 'b' }], NOW);
    expect(input['tags']).toEqual(['a']);
    expect(input.updatedAt).toBe('2024-01-01T00:00:00.000Z');
  });

  it('deletes properties; deleting a missing path is a no-op', () => {
    const out = applyMutations(item({ status: 'x' }), [
      { op: 'delete', path: 'status' },
      { op: 'delete', path: 'nested.missing' },
    ], NOW);
    expect('status' in out).toBe(false);
    expect('nested' in out).toBe(false);
  });

  it('append is idempotent and creates the array when absent', () => {
    const out = applyMutations(item({ tags: ['a'] }), [
      { op: 'append', path: 'tags', value: 'a' },
      { op: 'append', path: 'tags', value: 'b' },
      { op: 'append', path: 'labels', value: 'x' },
    ], NOW);
    expect(out['tags']).toEqual(['a', 'b']);
    expect(out['labels']).toEqual(['x']);
  });

  it('remove filters the value out; missing arrays are untouched', () => {
    const out = applyMutations(item({ tags: ['a', 'b', 'a'] }), [
      { op: 'remove', path: 'tags', value: 'a' },
      { op: 'remove', path: 'labels', value: 'x' },
    ], NOW);
    expect(out['tags']).toEqual(['b']);
    expect('labels' in out).toBe(false);
  });

  it('upserts boards[] entries for boards.<slug>.* paths', () => {
    const out = applyMutations(item({ boards: [{ board: 'a', order: '1' }] }), [
      { op: 'set', path: 'boards.a.order', value: '2' },
      { op: 'set', path: 'boards.b.order', value: '0' },
    ], NOW);
    expect(out.boards).toEqual([{ board: 'a', order: '2' }, { board: 'b', order: '0' }]);
  });

  it('creates boards[] when the item has none', () => {
    const out = applyMutations(item(), [{ op: 'set', path: 'boards.x.order', value: 'a0' }], NOW);
    expect(out.boards).toEqual([{ board: 'x', order: 'a0' }]);
  });

  it('creates nested objects for non-boards paths', () => {
    const out = applyMutations(item(), [{ op: 'set', path: 'meta.owner', value: 'me' }], NOW);
    expect(out['meta']).toEqual({ owner: 'me' });
  });
});
