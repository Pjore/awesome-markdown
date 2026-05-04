import { describe, it, expect } from 'vitest';
import { parsePath, joinPath, resolvePath, substitutePath } from '../src/path-resolver.js';
import type { Ctx } from '../src/path-resolver.js';
import type { Item } from '@awesome-markdown/contracts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(extra: Record<string, unknown> = {}): Item {
  return {
    entityType: 'item',
    slug: 'test-item',
    title: 'Test',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...extra,
  } as Item;
}

const ctx: Ctx = { board: 'dev-tasks' };

// ---------------------------------------------------------------------------
// parsePath
// ---------------------------------------------------------------------------

describe('parsePath', () => {
  it('parses a single segment', () => {
    expect(parsePath('status')).toEqual(['status']);
  });

  it('parses a multi-segment path', () => {
    expect(parsePath('boards.dev-tasks.order')).toEqual([
      'boards',
      'dev-tasks',
      'order',
    ]);
  });

  it('handles $board segment', () => {
    expect(parsePath('boards.$board.order')).toEqual(['boards', '$board', 'order']);
  });

  it('unescapes backslash-escaped dots within a segment', () => {
    expect(parsePath('a\\.b.c')).toEqual(['a.b', 'c']);
  });

  it('handles multiple escaped dots in one segment', () => {
    expect(parsePath('x\\.y\\.z')).toEqual(['x.y.z']);
  });

  it('handles trailing backslash-escaped dot as part of last segment', () => {
    expect(parsePath('a.b\\.c')).toEqual(['a', 'b.c']);
  });
});

// ---------------------------------------------------------------------------
// joinPath
// ---------------------------------------------------------------------------

describe('joinPath', () => {
  it('round-trips simple segments', () => {
    expect(joinPath(['status'])).toBe('status');
    expect(joinPath(['boards', 'dev-tasks', 'order'])).toBe('boards.dev-tasks.order');
  });

  it('escapes literal dots in segments', () => {
    expect(joinPath(['a.b', 'c'])).toBe('a\\.b.c');
  });
});

// ---------------------------------------------------------------------------
// resolvePath — simple properties
// ---------------------------------------------------------------------------

describe('resolvePath — simple properties', () => {
  it('resolves a top-level property', () => {
    const item = makeItem({ status: 'open' });
    expect(resolvePath('status', item, ctx)).toBe('open');
  });

  it('returns undefined for absent property', () => {
    const item = makeItem();
    expect(resolvePath('priority', item, ctx)).toBeUndefined();
  });

  it('returns null for null property (distinct from undefined)', () => {
    const item = makeItem({ assignee: null });
    expect(resolvePath('assignee', item, ctx)).toBeNull();
  });

  it('returns false for boolean false property', () => {
    const item = makeItem({ active: false });
    expect(resolvePath('active', item, ctx)).toBe(false);
  });

  it('returns an array property as-is', () => {
    const item = makeItem({ tags: ['ui', 'bug'] });
    expect(resolvePath('tags', item, ctx)).toEqual(['ui', 'bug']);
  });

  it('returns undefined when a missing intermediate stops resolution', () => {
    const item = makeItem();
    expect(resolvePath('nested.deep.value', item, ctx)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// resolvePath — boards[] lookup with $board substitution
// ---------------------------------------------------------------------------

describe('resolvePath — boards[] with $board', () => {
  it('resolves boards.$board.order for matching board entry', () => {
    const item = makeItem({
      boards: [{ board: 'dev-tasks', order: 'a0G' }],
    });
    expect(resolvePath('boards.$board.order', item, ctx)).toBe('a0G');
  });

  it('returns undefined when boards array is absent', () => {
    const item = makeItem();
    expect(resolvePath('boards.$board.order', item, ctx)).toBeUndefined();
  });

  it('returns undefined when no boards entry matches ctx.board', () => {
    const item = makeItem({
      boards: [{ board: 'other-board', order: 'a1' }],
    });
    expect(resolvePath('boards.$board.order', item, ctx)).toBeUndefined();
  });

  it('selects the correct entry when multiple boards entries exist', () => {
    const item = makeItem({
      boards: [
        { board: 'dev-tasks', order: 'a0G' },
        { board: 'release', order: 'b1' },
      ],
    });
    expect(resolvePath('boards.$board.order', item, ctx)).toBe('a0G');
    expect(resolvePath('boards.$board.order', item, { board: 'release' })).toBe('b1');
  });

  it('resolves a passthrough property on a boards entry', () => {
    const item = makeItem({
      boards: [{ board: 'dev-tasks', order: 'a0G', note: 'blocked' }],
    });
    expect(resolvePath('boards.$board.note', item, ctx)).toBe('blocked');
  });
});

// ---------------------------------------------------------------------------
// substitutePath
// ---------------------------------------------------------------------------

describe('substitutePath', () => {
  it('substitutes $board with ctx.board', () => {
    expect(substitutePath('boards.$board.order', ctx)).toBe('boards.dev-tasks.order');
  });

  it('leaves non-$board segments unchanged', () => {
    expect(substitutePath('status', ctx)).toBe('status');
    expect(substitutePath('priority', ctx)).toBe('priority');
  });
});
