import { describe, it, expect } from 'vitest';
import { evaluate } from '../src/evaluate.js';
import type { FilterRule, Item } from '@awesome-markdown/contracts';
import type { Ctx } from '../src/path-resolver.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function item(extra: Record<string, unknown> = {}): Item {
  return {
    entityType: 'item',
    slug: 'i',
    title: 'Item',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...extra,
  } as Item;
}

const ctx: Ctx = { board: 'b' };

// ---------------------------------------------------------------------------
// undefined filter (match-all / synthetic axis — UC-7)
// ---------------------------------------------------------------------------

describe('evaluate — undefined filter', () => {
  it('returns true for any item', () => {
    expect(evaluate(undefined, item(), ctx)).toBe(true);
    expect(evaluate(undefined, item({ status: 'done' }), ctx)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Leaf: equals
// ---------------------------------------------------------------------------

describe('evaluate — equals', () => {
  const f = (v: string | number | boolean): FilterRule => ({
    property: 'status',
    equals: v,
  });

  it('matches equal string value', () => {
    expect(evaluate(f('open'), item({ status: 'open' }), ctx)).toBe(true);
  });

  it('does not match different string value', () => {
    expect(evaluate(f('open'), item({ status: 'done' }), ctx)).toBe(false);
  });

  it('matches equal number value', () => {
    expect(evaluate({ property: 'priority', equals: 3 }, item({ priority: 3 }), ctx)).toBe(true);
  });

  it('does not match absent property', () => {
    expect(evaluate(f('open'), item(), ctx)).toBe(false);
  });

  it('matches boolean true', () => {
    expect(evaluate({ property: 'active', equals: true }, item({ active: true }), ctx)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Leaf: in
// ---------------------------------------------------------------------------

describe('evaluate — in', () => {
  it('matches when value is in single-item list', () => {
    const f: FilterRule = { property: 'status', in: ['open'] };
    expect(evaluate(f, item({ status: 'open' }), ctx)).toBe(true);
  });

  it('does not match when value is not in single-item list', () => {
    const f: FilterRule = { property: 'status', in: ['open'] };
    expect(evaluate(f, item({ status: 'done' }), ctx)).toBe(false);
  });

  it('matches when value is in multi-item list', () => {
    const f: FilterRule = { property: 'status', in: ['open', 'in-progress'] };
    expect(evaluate(f, item({ status: 'in-progress' }), ctx)).toBe(true);
  });

  it('does not match when value not in multi-item list', () => {
    const f: FilterRule = { property: 'status', in: ['open', 'in-progress'] };
    expect(evaluate(f, item({ status: 'done' }), ctx)).toBe(false);
  });

  it('does not match absent property', () => {
    const f: FilterRule = { property: 'status', in: ['open'] };
    expect(evaluate(f, item(), ctx)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Leaf: has
// ---------------------------------------------------------------------------

describe('evaluate — has', () => {
  it('matches when array contains value', () => {
    const f: FilterRule = { property: 'tags', has: 'ui' };
    expect(evaluate(f, item({ tags: ['ui', 'bug'] }), ctx)).toBe(true);
  });

  it('does not match when array does not contain value', () => {
    const f: FilterRule = { property: 'tags', has: 'ui' };
    expect(evaluate(f, item({ tags: ['bug'] }), ctx)).toBe(false);
  });

  it('does not match absent array property', () => {
    const f: FilterRule = { property: 'tags', has: 'ui' };
    expect(evaluate(f, item(), ctx)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Leaf: lacks
// ---------------------------------------------------------------------------

describe('evaluate — lacks', () => {
  it('matches when array does not contain value', () => {
    const f: FilterRule = { property: 'tags', lacks: 'deprecated' };
    expect(evaluate(f, item({ tags: ['ui'] }), ctx)).toBe(true);
  });

  it('does not match when array contains value', () => {
    const f: FilterRule = { property: 'tags', lacks: 'deprecated' };
    expect(evaluate(f, item({ tags: ['deprecated', 'ui'] }), ctx)).toBe(false);
  });

  it('matches when array property is absent (absence satisfies lacks)', () => {
    const f: FilterRule = { property: 'tags', lacks: 'deprecated' };
    expect(evaluate(f, item(), ctx)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Leaf: exists
// ---------------------------------------------------------------------------

describe('evaluate — exists', () => {
  it('exists:true matches when property is present', () => {
    const f: FilterRule = { property: 'assignee', exists: true };
    expect(evaluate(f, item({ assignee: 'alice' }), ctx)).toBe(true);
  });

  it('exists:true does not match when property is absent', () => {
    const f: FilterRule = { property: 'assignee', exists: true };
    expect(evaluate(f, item(), ctx)).toBe(false);
  });

  it('exists:false matches when property is absent', () => {
    const f: FilterRule = { property: 'assignee', exists: false };
    expect(evaluate(f, item(), ctx)).toBe(true);
  });

  it('exists:false does not match when property is present', () => {
    const f: FilterRule = { property: 'assignee', exists: false };
    expect(evaluate(f, item({ assignee: 'alice' }), ctx)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Leaf: gt / gte / lt / lte
// ---------------------------------------------------------------------------

describe('evaluate — comparators', () => {
  it('gt matches when value > threshold', () => {
    expect(evaluate({ property: 'score', gt: 5 }, item({ score: 6 }), ctx)).toBe(true);
    expect(evaluate({ property: 'score', gt: 5 }, item({ score: 5 }), ctx)).toBe(false);
    expect(evaluate({ property: 'score', gt: 5 }, item({ score: 4 }), ctx)).toBe(false);
  });

  it('gte matches when value >= threshold', () => {
    expect(evaluate({ property: 'score', gte: 5 }, item({ score: 5 }), ctx)).toBe(true);
    expect(evaluate({ property: 'score', gte: 5 }, item({ score: 4 }), ctx)).toBe(false);
  });

  it('lt matches when value < threshold', () => {
    expect(evaluate({ property: 'score', lt: 5 }, item({ score: 4 }), ctx)).toBe(true);
    expect(evaluate({ property: 'score', lt: 5 }, item({ score: 5 }), ctx)).toBe(false);
  });

  it('lte matches when value <= threshold', () => {
    expect(evaluate({ property: 'score', lte: 5 }, item({ score: 5 }), ctx)).toBe(true);
    expect(evaluate({ property: 'score', lte: 5 }, item({ score: 6 }), ctx)).toBe(false);
  });

  it('comparators do not match absent property', () => {
    expect(evaluate({ property: 'score', gt: 0 }, item(), ctx)).toBe(false);
  });

  it('string comparison with gt', () => {
    expect(evaluate({ property: 'dueDate', gt: '2026-01-01' }, item({ dueDate: '2026-06-01' }), ctx)).toBe(true);
    expect(evaluate({ property: 'dueDate', gt: '2026-06-01' }, item({ dueDate: '2026-01-01' }), ctx)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Leaf: matches (regex)
// ---------------------------------------------------------------------------

describe('evaluate — matches', () => {
  it('matches when regex matches the string value', () => {
    expect(evaluate({ property: 'title', matches: '^Add' }, item({ title: 'Add dark mode' }), ctx)).toBe(true);
  });

  it('does not match when regex does not match', () => {
    expect(evaluate({ property: 'title', matches: '^Fix' }, item({ title: 'Add dark mode' }), ctx)).toBe(false);
  });

  it('does not match non-string property', () => {
    expect(evaluate({ property: 'count', matches: '\\d+' }, item({ count: 42 }), ctx)).toBe(false);
  });

  it('does not match absent property', () => {
    expect(evaluate({ property: 'description', matches: '.*' }, item(), ctx)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Boolean composition: all
// ---------------------------------------------------------------------------

describe('evaluate — all', () => {
  it('single invertible child: passes when child matches', () => {
    const f: FilterRule = { all: [{ property: 'status', equals: 'open' }] };
    expect(evaluate(f, item({ status: 'open' }), ctx)).toBe(true);
    expect(evaluate(f, item({ status: 'done' }), ctx)).toBe(false);
  });

  it('multi-child: true only when all children match', () => {
    const f: FilterRule = {
      all: [
        { property: 'status', equals: 'open' },
        { property: 'priority', equals: 'high' },
      ],
    };
    expect(evaluate(f, item({ status: 'open', priority: 'high' }), ctx)).toBe(true);
    expect(evaluate(f, item({ status: 'open', priority: 'low' }), ctx)).toBe(false);
    expect(evaluate(f, item({ status: 'done', priority: 'high' }), ctx)).toBe(false);
    expect(evaluate(f, item(), ctx)).toBe(false);
  });

  it('mixed truth values: false when any child fails', () => {
    const f: FilterRule = {
      all: [
        { property: 'status', equals: 'open' },
        { property: 'tags', has: 'ui' },
        { property: 'assignee', exists: false },
      ],
    };
    expect(evaluate(f, item({ status: 'open', tags: ['ui'] }), ctx)).toBe(true);
    expect(evaluate(f, item({ status: 'open', tags: ['ui'], assignee: 'alice' }), ctx)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Boolean composition: any
// ---------------------------------------------------------------------------

describe('evaluate — any', () => {
  it('matches when at least one child matches', () => {
    const f: FilterRule = {
      any: [
        { property: 'status', equals: 'open' },
        { property: 'status', equals: 'in-progress' },
      ],
    };
    expect(evaluate(f, item({ status: 'open' }), ctx)).toBe(true);
    expect(evaluate(f, item({ status: 'in-progress' }), ctx)).toBe(true);
    expect(evaluate(f, item({ status: 'done' }), ctx)).toBe(false);
  });

  it('does not match when no child matches', () => {
    const f: FilterRule = {
      any: [
        { property: 'status', equals: 'open' },
        { property: 'priority', equals: 'high' },
      ],
    };
    expect(evaluate(f, item({ status: 'done', priority: 'low' }), ctx)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Boolean composition: not
// ---------------------------------------------------------------------------

describe('evaluate — not', () => {
  it('inverts a matching leaf', () => {
    const f: FilterRule = { not: { property: 'status', equals: 'done' } };
    expect(evaluate(f, item({ status: 'done' }), ctx)).toBe(false);
    expect(evaluate(f, item({ status: 'open' }), ctx)).toBe(true);
  });

  it('not exists:true: true when property absent', () => {
    const f: FilterRule = { not: { property: 'assignee', exists: true } };
    expect(evaluate(f, item(), ctx)).toBe(true);
    expect(evaluate(f, item({ assignee: 'alice' }), ctx)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Nesting: at least two levels deep
// ---------------------------------------------------------------------------

describe('evaluate — nested composition', () => {
  it('all containing any', () => {
    const f: FilterRule = {
      all: [
        { property: 'status', in: ['open', 'in-progress'] },
        { any: [{ property: 'tags', has: 'ui' }, { property: 'tags', has: 'ux' }] },
      ],
    };
    expect(evaluate(f, item({ status: 'open', tags: ['ui'] }), ctx)).toBe(true);
    expect(evaluate(f, item({ status: 'open', tags: ['backend'] }), ctx)).toBe(false);
    expect(evaluate(f, item({ status: 'done', tags: ['ui'] }), ctx)).toBe(false);
  });

  it('not wrapping all', () => {
    const f: FilterRule = {
      not: {
        all: [
          { property: 'status', equals: 'done' },
          { property: 'priority', equals: 'low' },
        ],
      },
    };
    expect(evaluate(f, item({ status: 'done', priority: 'low' }), ctx)).toBe(false);
    expect(evaluate(f, item({ status: 'done', priority: 'high' }), ctx)).toBe(true);
    expect(evaluate(f, item({ status: 'open', priority: 'low' }), ctx)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// $board substitution in evaluate
// ---------------------------------------------------------------------------

describe('evaluate — $board substitution', () => {
  it('evaluates boards.$board.order against the correct boards entry', () => {
    const f: FilterRule = { property: 'boards.$board.order', exists: true };
    const i = item({
      boards: [{ board: 'b', order: 'a0G' }],
    });
    expect(evaluate(f, i, { board: 'b' })).toBe(true);
    expect(evaluate(f, i, { board: 'other' })).toBe(false);
  });
});
