import { describe, it, expect } from 'vitest';
import { deriveMutations } from '../src/mutations.js';
import type { FilterRule, Mutation, WriteOnDrop } from '@awesome-markdown/contracts';
import { WriteOnDropSchema } from '@awesome-markdown/contracts';
import type { Ctx } from '../src/path-resolver.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ctx: Ctx = { board: 'dev-tasks' };

function assertMutations(
  filter: FilterRule | undefined,
  expected: Mutation[],
  c: Ctx = ctx,
): void {
  const result = deriveMutations(filter, c);
  expect(result).toEqual(expected);
}

function assertReadOnly(filter: FilterRule | undefined, override?: WriteOnDrop): void {
  const result = deriveMutations(filter, ctx, override);
  expect(result).toEqual({ readonly: true });
}

// ---------------------------------------------------------------------------
// undefined filter (match-all)
// ---------------------------------------------------------------------------

describe('deriveMutations — undefined filter', () => {
  it('returns empty array for undefined filter', () => {
    assertMutations(undefined, []);
  });
});

// ---------------------------------------------------------------------------
// Invertible leaf operators
// ---------------------------------------------------------------------------

describe('deriveMutations — invertible leaf operators', () => {
  it('equals → set mutation', () => {
    assertMutations(
      { property: 'status', equals: 'open' },
      [{ op: 'set', path: 'status', value: 'open' }],
    );
  });

  it('equals with number value → set mutation', () => {
    assertMutations(
      { property: 'priority', equals: 3 },
      [{ op: 'set', path: 'priority', value: 3 }],
    );
  });

  it('equals with boolean value → set mutation', () => {
    assertMutations(
      { property: 'active', equals: true },
      [{ op: 'set', path: 'active', value: true }],
    );
  });

  it('in (single value) → set mutation', () => {
    assertMutations(
      { property: 'status', in: ['open'] },
      [{ op: 'set', path: 'status', value: 'open' }],
    );
  });

  it('has → append mutation', () => {
    assertMutations(
      { property: 'tags', has: 'ui' },
      [{ op: 'append', path: 'tags', value: 'ui' }],
    );
  });

  it('lacks → remove mutation', () => {
    assertMutations(
      { property: 'tags', lacks: 'deprecated' },
      [{ op: 'remove', path: 'tags', value: 'deprecated' }],
    );
  });

  it('exists:false → delete mutation', () => {
    assertMutations(
      { property: 'assignee', exists: false },
      [{ op: 'delete', path: 'assignee' }],
    );
  });

  it('not:{exists:true} → delete mutation (same inverse as exists:false)', () => {
    assertMutations(
      { not: { property: 'assignee', exists: true } },
      [{ op: 'delete', path: 'assignee' }],
    );
  });
});

// ---------------------------------------------------------------------------
// Non-invertible leaf operators → readonly
// ---------------------------------------------------------------------------

describe('deriveMutations — non-invertible → readonly', () => {
  it('in (multiple values) → readonly', () => {
    assertReadOnly({ property: 'status', in: ['open', 'in-progress'] });
  });

  it('exists:true → readonly', () => {
    assertReadOnly({ property: 'assignee', exists: true });
  });

  it('gt → readonly', () => {
    assertReadOnly({ property: 'score', gt: 5 });
  });

  it('gte → readonly', () => {
    assertReadOnly({ property: 'score', gte: 5 });
  });

  it('lt → readonly', () => {
    assertReadOnly({ property: 'score', lt: 5 });
  });

  it('lte → readonly', () => {
    assertReadOnly({ property: 'score', lte: 5 });
  });

  it('matches → readonly', () => {
    assertReadOnly({ property: 'title', matches: '^Add' });
  });

  it('any → readonly (never invertible)', () => {
    assertReadOnly({ any: [{ property: 'status', equals: 'open' }] });
  });

  it('not (non-exists-true) → readonly', () => {
    assertReadOnly({ not: { property: 'status', equals: 'done' } });
  });
});

// ---------------------------------------------------------------------------
// all: union of child mutations
// ---------------------------------------------------------------------------

describe('deriveMutations — all composition', () => {
  it('all with single invertible child: emits child mutation', () => {
    assertMutations(
      { all: [{ property: 'status', equals: 'open' }] },
      [{ op: 'set', path: 'status', value: 'open' }],
    );
  });

  it('all with multiple invertible children: union of mutations', () => {
    assertMutations(
      {
        all: [
          { property: 'status', equals: 'open' },
          { property: 'tags', has: 'ui' },
          { property: 'assignee', exists: false },
        ],
      },
      [
        { op: 'set', path: 'status', value: 'open' },
        { op: 'append', path: 'tags', value: 'ui' },
        { op: 'delete', path: 'assignee' },
      ],
    );
  });

  it('all with one non-invertible child → readonly (strict α)', () => {
    assertReadOnly({
      all: [
        { property: 'status', equals: 'open' },
        { property: 'score', gt: 5 }, // non-invertible
      ],
    });
  });

  it('nested all: union of all levels', () => {
    assertMutations(
      {
        all: [
          { all: [{ property: 'status', equals: 'done' }] },
          { all: [{ property: 'tags', lacks: 'wip' }] },
        ],
      },
      [
        { op: 'set', path: 'status', value: 'done' },
        { op: 'remove', path: 'tags', value: 'wip' },
      ],
    );
  });
});

// ---------------------------------------------------------------------------
// $board path substitution in mutations
// ---------------------------------------------------------------------------

describe('deriveMutations — $board substitution', () => {
  it('resolves $board in mutation paths', () => {
    assertMutations(
      { property: 'boards.$board.order', equals: 'a0G' },
      [{ op: 'set', path: 'boards.dev-tasks.order', value: 'a0G' }],
    );
  });

  it('resolves $board from ctx for has operator', () => {
    assertMutations(
      { property: 'boards.$board.flag', has: 'pinned' },
      [{ op: 'append', path: 'boards.dev-tasks.flag', value: 'pinned' }],
    );
  });

  it('uses ctx.board value for substitution', () => {
    assertMutations(
      { property: 'boards.$board.status', equals: 'ready' },
      [{ op: 'set', path: 'boards.release.status', value: 'ready' }],
      { board: 'release' },
    );
  });
});

// ---------------------------------------------------------------------------
// writeOnDrop override handling
// ---------------------------------------------------------------------------

describe('deriveMutations — writeOnDrop override', () => {
  it('override Mutation[]: returns the explicit list verbatim', () => {
    const override: WriteOnDrop = [
      { op: 'set', path: 'priority', value: 'high' },
      { op: 'append', path: 'tags', value: 'urgent' },
    ];
    const result = deriveMutations(
      { property: 'score', gt: 5 }, // would otherwise be readonly
      ctx,
      override,
    );
    expect(result).toEqual(override);
  });

  it('override Mutation[] replaces derived mutations even when filter is invertible', () => {
    const override: WriteOnDrop = [{ op: 'set', path: 'status', value: 'done' }];
    const result = deriveMutations(
      { property: 'status', equals: 'open' }, // would derive set status=open
      ctx,
      override,
    );
    expect(result).toEqual(override);
  });

  it('override { readonly: true } forces readonly regardless of filter invertibility', () => {
    const override: WriteOnDrop = { readonly: true };
    // Invertible filter but forced readonly
    const result = deriveMutations(
      { property: 'status', equals: 'open' },
      ctx,
      override,
    );
    expect(result).toEqual({ readonly: true });
  });

  it('override { readonly: true } forces readonly for already-non-invertible filter', () => {
    assertReadOnly({ property: 'score', gt: 5 }, { readonly: true });
  });
});

// ---------------------------------------------------------------------------
// WriteOnDropSchema rejects mixed forms (schema-level validation)
// ---------------------------------------------------------------------------

describe('WriteOnDropSchema — mutual exclusivity', () => {
  it('rejects an object combining readonly and mutations (not valid JSON shape)', () => {
    // The schema is a union of array and object; an object with `readonly`
    // field can never also be an array, so mixing is structurally rejected.
    const result = WriteOnDropSchema.safeParse({ readonly: true, extra: true });
    expect(result.success).toBe(false);
  });

  it('rejects an empty mutation array', () => {
    expect(WriteOnDropSchema.safeParse([]).success).toBe(false);
  });

  it('accepts a valid Mutation array', () => {
    expect(
      WriteOnDropSchema.safeParse([{ op: 'set', path: 'status', value: 'done' }]).success,
    ).toBe(true);
  });

  it('accepts { readonly: true }', () => {
    expect(WriteOnDropSchema.safeParse({ readonly: true }).success).toBe(true);
  });
});
