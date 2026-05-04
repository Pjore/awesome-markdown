import { describe, it, expect } from 'vitest';
import { analyzeInvertibility } from '../src/invertibility.js';
import type { FilterRule } from '@awesome-markdown/contracts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertInvertible(filter: FilterRule | undefined): void {
  const result = analyzeInvertibility(filter);
  expect(result.invertible).toBe(true);
  expect(result.reasons).toHaveLength(0);
}

function assertNotInvertible(filter: FilterRule | undefined): void {
  const result = analyzeInvertibility(filter);
  expect(result.invertible).toBe(false);
  expect(result.reasons.length).toBeGreaterThan(0);
}

// ---------------------------------------------------------------------------
// undefined (match-all)
// ---------------------------------------------------------------------------

describe('analyzeInvertibility — undefined', () => {
  it('undefined filter is invertible (match-all)', () => {
    assertInvertible(undefined);
  });
});

// ---------------------------------------------------------------------------
// Leaf operators — invertible
// ---------------------------------------------------------------------------

describe('analyzeInvertibility — invertible leaf operators', () => {
  it('equals: invertible', () => {
    assertInvertible({ property: 'status', equals: 'open' });
  });

  it('in (single value): invertible', () => {
    assertInvertible({ property: 'status', in: ['open'] });
  });

  it('has: invertible', () => {
    assertInvertible({ property: 'tags', has: 'ui' });
  });

  it('lacks: invertible', () => {
    assertInvertible({ property: 'tags', lacks: 'deprecated' });
  });

  it('exists:false: invertible', () => {
    assertInvertible({ property: 'assignee', exists: false });
  });
});

// ---------------------------------------------------------------------------
// Leaf operators — non-invertible
// ---------------------------------------------------------------------------

describe('analyzeInvertibility — non-invertible leaf operators', () => {
  it('in (multiple values): NOT invertible', () => {
    assertNotInvertible({ property: 'status', in: ['open', 'in-progress'] });
  });

  it('in (three values): NOT invertible', () => {
    assertNotInvertible({ property: 'status', in: ['open', 'in-progress', 'review'] });
  });

  it('exists:true: NOT invertible', () => {
    assertNotInvertible({ property: 'assignee', exists: true });
  });

  it('gt: NOT invertible', () => {
    assertNotInvertible({ property: 'score', gt: 5 });
  });

  it('gte: NOT invertible', () => {
    assertNotInvertible({ property: 'score', gte: 5 });
  });

  it('lt: NOT invertible', () => {
    assertNotInvertible({ property: 'score', lt: 5 });
  });

  it('lte: NOT invertible', () => {
    assertNotInvertible({ property: 'score', lte: 5 });
  });

  it('matches: NOT invertible', () => {
    assertNotInvertible({ property: 'title', matches: '^Add' });
  });
});

// ---------------------------------------------------------------------------
// Boolean composition: all
// ---------------------------------------------------------------------------

describe('analyzeInvertibility — all', () => {
  it('all with single invertible child: invertible', () => {
    assertInvertible({ all: [{ property: 'status', equals: 'open' }] });
  });

  it('all with multiple invertible children: invertible', () => {
    assertInvertible({
      all: [
        { property: 'status', equals: 'open' },
        { property: 'tags', has: 'ui' },
        { property: 'assignee', exists: false },
      ],
    });
  });

  it('all with one non-invertible child: NOT invertible (policy α)', () => {
    const result = analyzeInvertibility({
      all: [
        { property: 'status', equals: 'open' },
        { property: 'status', in: ['open', 'done'] }, // non-invertible
        { property: 'tags', has: 'ui' },
      ],
    });
    expect(result.invertible).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('one non-invertible child poisons the entire tree', () => {
    const result = analyzeInvertibility({
      all: [
        { property: 'status', equals: 'open' }, // invertible
        { property: 'score', gt: 5 },           // non-invertible
      ],
    });
    expect(result.invertible).toBe(false);
  });

  it('all-invertible children produce empty reasons', () => {
    const result = analyzeInvertibility({
      all: [
        { property: 'status', equals: 'done' },
        { property: 'tags', lacks: 'wip' },
      ],
    });
    expect(result.invertible).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Boolean composition: any
// ---------------------------------------------------------------------------

describe('analyzeInvertibility — any', () => {
  it('any is never invertible', () => {
    assertNotInvertible({
      any: [{ property: 'status', equals: 'open' }],
    });
    assertNotInvertible({
      any: [
        { property: 'status', equals: 'open' },
        { property: 'status', equals: 'done' },
      ],
    });
  });

  it('any of invertible children is still NOT invertible', () => {
    assertNotInvertible({
      any: [
        { property: 'tags', has: 'ui' },
        { property: 'tags', has: 'ux' },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// Boolean composition: not
// ---------------------------------------------------------------------------

describe('analyzeInvertibility — not', () => {
  it('not:{property, exists:true} is invertible', () => {
    assertInvertible({ not: { property: 'assignee', exists: true } });
  });

  it('not:{equals} is NOT invertible', () => {
    assertNotInvertible({ not: { property: 'status', equals: 'done' } });
  });

  it('not:{exists:false} is NOT invertible', () => {
    assertNotInvertible({ not: { property: 'assignee', exists: false } });
  });

  it('not:{has} is NOT invertible', () => {
    assertNotInvertible({ not: { property: 'tags', has: 'ui' } });
  });

  it('not:{in} is NOT invertible', () => {
    assertNotInvertible({ not: { property: 'status', in: ['open'] } });
  });

  it('not wrapping another not is NOT invertible', () => {
    assertNotInvertible({
      not: { not: { property: 'status', equals: 'done' } },
    });
  });
});

// ---------------------------------------------------------------------------
// Nested composition (mixed)
// ---------------------------------------------------------------------------

describe('analyzeInvertibility — nested', () => {
  it('all containing all: invertible when both are invertible', () => {
    assertInvertible({
      all: [
        { all: [{ property: 'status', equals: 'open' }] },
        { all: [{ property: 'tags', has: 'ui' }] },
      ],
    });
  });

  it('all containing not:{exists:true}: invertible', () => {
    assertInvertible({
      all: [
        { property: 'status', equals: 'open' },
        { not: { property: 'assignee', exists: true } },
      ],
    });
  });

  it('all containing any: NOT invertible', () => {
    assertNotInvertible({
      all: [
        { property: 'status', equals: 'open' },
        { any: [{ property: 'tags', has: 'ui' }] },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// reasons array
// ---------------------------------------------------------------------------

describe('analyzeInvertibility — reasons', () => {
  it('non-invertible results have at least one reason string', () => {
    const result = analyzeInvertibility({ property: 'score', gt: 5 });
    expect(result.reasons).toHaveLength(1);
    expect(typeof result.reasons[0]).toBe('string');
  });

  it('all with multiple non-invertible children accumulates reasons', () => {
    const result = analyzeInvertibility({
      all: [
        { property: 'score', gt: 5 },
        { property: 'status', in: ['open', 'done'] },
      ],
    });
    expect(result.reasons.length).toBeGreaterThanOrEqual(2);
  });
});
