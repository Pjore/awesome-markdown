import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  DottedPathSchema,
  FilterRuleSchema,
  MutationSchema,
  WriteOnDropSchema,
  ItemSchema,
  BoardSchema,
  AxisSchema,
  BoardRenderSchema,
  HomelessSchema,
  CreateItemRequestSchema,
  PatchItemRequestSchema,
} from '../src/index.js';
import type { FilterRule } from '../src/index.js';

// ---------------------------------------------------------------------------
// DottedPathSchema
// ---------------------------------------------------------------------------
describe('DottedPathSchema', () => {
  it('accepts a simple property name', () => {
    expect(DottedPathSchema.safeParse('priority').success).toBe(true);
  });
  it('accepts a multi-segment path', () => {
    expect(DottedPathSchema.safeParse('boards.$board.order').success).toBe(true);
  });
  it('accepts a path with backslash-escaped dot in segment (escaping rule)', () => {
    // Slug "a.b" represented in a path as "a\.b" (backslash + dot)
    expect(DottedPathSchema.safeParse('a\\.b.c').success).toBe(true);
  });
  it('rejects an empty string', () => {
    expect(DottedPathSchema.safeParse('').success).toBe(false);
  });
  it('rejects a path with empty leading segment (starts with .)', () => {
    expect(DottedPathSchema.safeParse('.priority').success).toBe(false);
  });
  it('rejects a path with a trailing separator (ends with .)', () => {
    expect(DottedPathSchema.safeParse('boards.').success).toBe(false);
  });
  it('rejects a path with an empty middle segment (consecutive dots)', () => {
    expect(DottedPathSchema.safeParse('a..b').success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// FilterRuleSchema — leaf operators
// ---------------------------------------------------------------------------
describe('FilterRuleSchema leaf operators', () => {
  it('accepts equals leaf', () => {
    expect(FilterRuleSchema.safeParse({ property: 'status', equals: 'open' }).success).toBe(true);
  });
  it('accepts equals with numeric value', () => {
    expect(FilterRuleSchema.safeParse({ property: 'score', equals: 42 }).success).toBe(true);
  });
  it('accepts in leaf with one item', () => {
    expect(FilterRuleSchema.safeParse({ property: 'status', in: ['open'] }).success).toBe(true);
  });
  it('accepts in leaf with multiple items', () => {
    expect(FilterRuleSchema.safeParse({ property: 'status', in: ['open', 'in-progress'] }).success).toBe(true);
  });
  it('accepts has leaf', () => {
    expect(FilterRuleSchema.safeParse({ property: 'tags', has: 'urgent' }).success).toBe(true);
  });
  it('accepts lacks leaf', () => {
    expect(FilterRuleSchema.safeParse({ property: 'tags', lacks: 'blocked' }).success).toBe(true);
  });
  it('accepts exists: true leaf', () => {
    expect(FilterRuleSchema.safeParse({ property: 'assignee', exists: true }).success).toBe(true);
  });
  it('accepts exists: false leaf', () => {
    expect(FilterRuleSchema.safeParse({ property: 'assignee', exists: false }).success).toBe(true);
  });
  it('accepts gt leaf', () => {
    expect(FilterRuleSchema.safeParse({ property: 'score', gt: 10 }).success).toBe(true);
  });
  it('accepts gte leaf', () => {
    expect(FilterRuleSchema.safeParse({ property: 'score', gte: 10 }).success).toBe(true);
  });
  it('accepts lt leaf', () => {
    expect(FilterRuleSchema.safeParse({ property: 'dueDate', lt: '2026-12-01' }).success).toBe(true);
  });
  it('accepts lte leaf', () => {
    expect(FilterRuleSchema.safeParse({ property: 'dueDate', lte: '2026-12-01' }).success).toBe(true);
  });
  it('accepts matches leaf', () => {
    expect(FilterRuleSchema.safeParse({ property: 'title', matches: 'dark' }).success).toBe(true);
  });
  it('rejects in: [] (empty array)', () => {
    expect(FilterRuleSchema.safeParse({ property: 'status', in: [] }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// FilterRuleSchema — boolean composition
// ---------------------------------------------------------------------------
describe('FilterRuleSchema boolean composition', () => {
  it('accepts all node with two children', () => {
    expect(
      FilterRuleSchema.safeParse({
        all: [
          { property: 'status', equals: 'open' },
          { property: 'tags', has: 'urgent' },
        ],
      }).success,
    ).toBe(true);
  });
  it('accepts any node', () => {
    expect(
      FilterRuleSchema.safeParse({
        any: [
          { property: 'status', equals: 'open' },
          { property: 'status', equals: 'done' },
        ],
      }).success,
    ).toBe(true);
  });
  it('accepts not node', () => {
    expect(
      FilterRuleSchema.safeParse({ not: { property: 'status', equals: 'closed' } }).success,
    ).toBe(true);
  });
  it('accepts deeply nested composition', () => {
    expect(
      FilterRuleSchema.safeParse({
        all: [
          { property: 'status', in: ['open', 'in-progress'] },
          {
            any: [
              { property: 'tags', has: 'urgent' },
              { not: { property: 'assignee', exists: false } },
            ],
          },
        ],
      }).success,
    ).toBe(true);
  });
  it('rejects empty all array', () => {
    expect(FilterRuleSchema.safeParse({ all: [] }).success).toBe(false);
  });
  it('rejects empty any array', () => {
    expect(FilterRuleSchema.safeParse({ any: [] }).success).toBe(false);
  });

  // Type-level test: FilterRule must be a proper recursive type (no any)
  it('FilterRule type is properly recursive (type-level)', () => {
    const nestedRule: FilterRule = {
      all: [
        { property: 'status', equals: 'open' },
        { any: [{ not: { property: 'tags', has: 'blocked' } }] },
      ],
    };
    expectTypeOf(nestedRule).toMatchTypeOf<FilterRule>();
  });
});

// ---------------------------------------------------------------------------
// MutationSchema
// ---------------------------------------------------------------------------
describe('MutationSchema', () => {
  it('accepts set mutation', () => {
    expect(MutationSchema.safeParse({ op: 'set', path: 'status', value: 'done' }).success).toBe(true);
  });
  it('accepts set mutation with null value (clear property)', () => {
    expect(MutationSchema.safeParse({ op: 'set', path: 'assignee', value: null }).success).toBe(true);
  });
  it('accepts append mutation', () => {
    expect(MutationSchema.safeParse({ op: 'append', path: 'tags', value: 'urgent' }).success).toBe(true);
  });
  it('accepts remove mutation', () => {
    expect(MutationSchema.safeParse({ op: 'remove', path: 'tags', value: 'draft' }).success).toBe(true);
  });
  it('accepts delete mutation', () => {
    expect(MutationSchema.safeParse({ op: 'delete', path: 'assignee' }).success).toBe(true);
  });
  it('rejects mutation with unknown op', () => {
    expect(MutationSchema.safeParse({ op: 'upsert', path: 'status', value: 'x' }).success).toBe(false);
  });
  it('rejects set mutation missing value', () => {
    expect(MutationSchema.safeParse({ op: 'set', path: 'status' }).success).toBe(false);
  });
  it('rejects mutation with malformed dotted path', () => {
    expect(MutationSchema.safeParse({ op: 'set', path: '.bad-path', value: 'x' }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// WriteOnDropSchema
// ---------------------------------------------------------------------------
describe('WriteOnDropSchema', () => {
  it('accepts a non-empty mutation list', () => {
    expect(
      WriteOnDropSchema.safeParse([{ op: 'set', path: 'status', value: 'done' }]).success,
    ).toBe(true);
  });
  it('accepts { readonly: true }', () => {
    expect(WriteOnDropSchema.safeParse({ readonly: true }).success).toBe(true);
  });
  it('rejects an empty mutation list', () => {
    expect(WriteOnDropSchema.safeParse([]).success).toBe(false);
  });
  it('rejects mixed form: object with readonly AND mutation fields', () => {
    // An object with additional fields beyond {readonly:true} is not a valid
    // mutation array (not an array) and has extra keys for the readonly form.
    expect(
      WriteOnDropSchema.safeParse({ readonly: true, op: 'set', path: 'x', value: 'y' }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ItemSchema
// ---------------------------------------------------------------------------
describe('ItemSchema', () => {
  it('accepts a minimal item', () => {
    expect(
      ItemSchema.safeParse({
        entityType: 'item',
        slug: 'my-item',
        title: 'My Item',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      }).success,
    ).toBe(true);
  });

  it('accepts a multi-board item with per-board property bags', () => {
    expect(
      ItemSchema.safeParse({
        entityType: 'item',
        slug: 'add-dark-mode-toggle',
        title: 'Add dark mode toggle',
        status: 'in-progress',
        priority: 'high',
        tags: ['ui', 'settings'],
        dueDate: '2026-06-01',
        assignee: 'alice',
        order: 'a0M',
        boards: [
          { board: 'dev-tasks', order: 'a0G', note: 'blocked-on-design' },
          { board: 'release-12', order: 'a1' },
        ],
        createdAt: '2026-04-20T10:00:00Z',
        updatedAt: '2026-05-02T07:49:15Z',
      }).success,
    ).toBe(true);
  });

  it('passes through arbitrary user-defined properties', () => {
    const result = ItemSchema.safeParse({
      entityType: 'item',
      slug: 'custom-item',
      title: 'Custom',
      customProp: 'some-value',
      anotherProp: 123,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // Extra properties are preserved at runtime
      const raw = result.data as Record<string, unknown>;
      expect(raw['customProp']).toBe('some-value');
    }
  });

  it('rejects item missing entityType', () => {
    expect(
      ItemSchema.safeParse({
        slug: 'my-item',
        title: 'My Item',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      }).success,
    ).toBe(false);
  });

  it('rejects item with wrong entityType', () => {
    expect(
      ItemSchema.safeParse({
        entityType: 'board',
        slug: 'my-item',
        title: 'My Item',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// BoardSchema
// ---------------------------------------------------------------------------
describe('BoardSchema', () => {
  it('accepts a board without filter', () => {
    expect(
      BoardSchema.safeParse({
        entityType: 'board',
        slug: 'dev-tasks',
        title: 'Dev Tasks',
        columns: ['todo', 'in-progress', 'done'],
        swimlanes: ['priority-high', 'priority-low'],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      }).success,
    ).toBe(true);
  });

  it('accepts a board with a filter', () => {
    expect(
      BoardSchema.safeParse({
        entityType: 'board',
        slug: 'dev-tasks',
        title: 'Dev Tasks',
        filter: {
          all: [{ property: 'status', in: ['open', 'in-progress', 'done'] }],
        },
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      }).success,
    ).toBe(true);
  });

  it('rejects board missing entityType', () => {
    expect(
      BoardSchema.safeParse({
        slug: 'dev-tasks',
        title: 'Dev Tasks',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      }).success,
    ).toBe(false);
  });

  it('rejects board with unknown entityType', () => {
    expect(
      BoardSchema.safeParse({
        entityType: 'widget',
        slug: 'dev-tasks',
        title: 'Dev Tasks',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AxisSchema
// ---------------------------------------------------------------------------
describe('AxisSchema', () => {
  it('accepts axis with equals filter', () => {
    expect(
      AxisSchema.safeParse({
        entityType: 'axis',
        slug: 'in-progress',
        title: 'In Progress',
        filter: { property: 'status', equals: 'in-progress' },
      }).success,
    ).toBe(true);
  });

  it('accepts axis with each leaf operator type', () => {
    const leafCases = [
      { property: 'status', in: ['open', 'done'] },
      { property: 'tags', has: 'urgent' },
      { property: 'tags', lacks: 'blocked' },
      { property: 'assignee', exists: true },
      { property: 'score', gt: 5 },
      { property: 'score', gte: 5 },
      { property: 'dueDate', lt: '2026-12-01' },
      { property: 'dueDate', lte: '2026-12-01' },
      { property: 'title', matches: 'bug' },
    ];
    for (const filter of leafCases) {
      expect(
        AxisSchema.safeParse({ entityType: 'axis', slug: 'test', title: 'Test', filter }).success,
        `leaf: ${JSON.stringify(filter)}`,
      ).toBe(true);
    }
  });

  it('accepts axis with boolean composition filter', () => {
    expect(
      AxisSchema.safeParse({
        entityType: 'axis',
        slug: 'active',
        title: 'Active',
        filter: {
          all: [
            { property: 'status', in: ['open', 'in-progress'] },
            { not: { property: 'tags', has: 'blocked' } },
          ],
        },
      }).success,
    ).toBe(true);
  });

  it('accepts axis with writeOnDrop mutations', () => {
    expect(
      AxisSchema.safeParse({
        entityType: 'axis',
        slug: 'priority-high',
        title: 'Priority: High',
        filter: { property: 'priority', equals: 'high' },
        writeOnDrop: [
          { op: 'set', path: 'priority', value: 'high' },
          { op: 'append', path: 'tags', value: 'urgent' },
        ],
      }).success,
    ).toBe(true);
  });

  it('accepts axis with writeOnDrop: { readonly: true }', () => {
    expect(
      AxisSchema.safeParse({
        entityType: 'axis',
        slug: 'overdue',
        title: 'Overdue',
        filter: { property: 'dueDate', lt: '2026-01-01' },
        writeOnDrop: { readonly: true },
      }).success,
    ).toBe(true);
  });

  it('accepts axis with order rule', () => {
    expect(
      AxisSchema.safeParse({
        entityType: 'axis',
        slug: 'in-progress',
        title: 'In Progress',
        filter: { property: 'status', equals: 'in-progress' },
        order: { by: 'boards.$board.order', direction: 'asc' },
      }).success,
    ).toBe(true);
  });

  it('accepts synthetic axis (slug-fallback, no filter/order/writeOnDrop)', () => {
    expect(
      AxisSchema.safeParse({
        entityType: 'axis',
        slug: 'unknown-column',
        title: 'unknown-column',
        synthetic: true,
      }).success,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// BoardRenderSchema (synthetic-axis render envelope)
// ---------------------------------------------------------------------------
describe('BoardRenderSchema', () => {
  const minimalItem = {
    entityType: 'item' as const,
    slug: 'item-a',
    title: 'Item A',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
  const realAxis = {
    entityType: 'axis' as const,
    slug: 'todo',
    title: 'Todo',
    filter: { property: 'status', equals: 'todo' },
  };
  const syntheticAxis = {
    entityType: 'axis' as const,
    slug: 'missing-lane',
    title: 'missing-lane',
    synthetic: true as const,
  };

  it('accepts a render envelope with a synthetic axis', () => {
    expect(
      BoardRenderSchema.safeParse({
        board: {
          entityType: 'board',
          slug: 'dev-tasks',
          title: 'Dev Tasks',
          columns: ['todo'],
          swimlanes: ['missing-lane'],
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
        axes: {
          columns: [realAxis],
          swimlanes: [syntheticAxis],
        },
        cells: [
          {
            columnSlug: 'todo',
            swimlaneSlug: 'missing-lane',
            readOnly: false,
            items: [minimalItem],
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('accepts a render envelope with a read-only cell', () => {
    expect(
      BoardRenderSchema.safeParse({
        board: {
          entityType: 'board',
          slug: 'dev-tasks',
          title: 'Dev Tasks',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
        axes: { columns: [realAxis], swimlanes: [syntheticAxis] },
        cells: [
          {
            columnSlug: 'todo',
            swimlaneSlug: 'missing-lane',
            readOnly: true,
            items: [],
          },
        ],
      }).success,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// HomelessSchema
// ---------------------------------------------------------------------------
describe('HomelessSchema', () => {
  it('accepts a homeless response', () => {
    expect(
      HomelessSchema.safeParse({
        board: {
          entityType: 'board',
          slug: 'dev-tasks',
          title: 'Dev Tasks',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
        items: [
          {
            entityType: 'item',
            slug: 'stale-item',
            title: 'Stale Item',
            boards: [{ board: 'dev-tasks', order: 'a0' }],
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ],
      }).success,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CreateItemRequestSchema / PatchItemRequestSchema
// ---------------------------------------------------------------------------
describe('CreateItemRequestSchema', () => {
  it('accepts a create request', () => {
    expect(
      CreateItemRequestSchema.safeParse({
        slug: 'new-item',
        title: 'New Item',
        mutations: [{ op: 'set', path: 'status', value: 'todo' }],
      }).success,
    ).toBe(true);
  });

  it('accepts a create request with empty mutations list', () => {
    // An item created in a cell with no invertible filter has no mutations
    expect(
      CreateItemRequestSchema.safeParse({
        slug: 'new-item',
        title: 'New Item',
        mutations: [],
      }).success,
    ).toBe(true);
  });
});

describe('PatchItemRequestSchema', () => {
  it('accepts a patch request with one mutation', () => {
    expect(
      PatchItemRequestSchema.safeParse({
        mutations: [{ op: 'set', path: 'status', value: 'done' }],
      }).success,
    ).toBe(true);
  });

  it('rejects a patch request with empty mutations list', () => {
    expect(PatchItemRequestSchema.safeParse({ mutations: [] }).success).toBe(false);
  });
});
