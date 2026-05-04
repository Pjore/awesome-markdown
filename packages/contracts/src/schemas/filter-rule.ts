import { z } from 'zod';

/**
 * Dotted-path string schema.
 *
 * Segments are separated by '.'. A literal '.' within a segment name
 * is escaped as '\.' (backslash + dot). This escaping rule is permanent
 * from this milestone onward and applies to every entity file authored
 * in M6 and every UI mutation in M5.
 *
 * Examples:
 *   Valid:   "priority", "boards.$board.order", "some\\\.key.nested"
 *   Invalid: ".priority" (empty leading segment), "a." (trailing separator)
 */
export const DottedPathSchema = z
  .string()
  .regex(
    /^(?:[^.\\]|\\.)+(?:\.(?:[^.\\]|\\.)+)*$/,
    'Must be a dot-separated path; use \\. to escape a literal dot within a segment',
  );

export type DottedPath = z.infer<typeof DottedPathSchema>;

// ---------------------------------------------------------------------------
// Scalar value types used in leaf operators
// ---------------------------------------------------------------------------

const ScalarSchema = z.union([z.string(), z.number(), z.boolean()]);
const ComparableSchema = z.union([z.string(), z.number()]);

// ---------------------------------------------------------------------------
// Leaf operators
// ---------------------------------------------------------------------------

const LeafEqualsSchema = z.object({
  property: DottedPathSchema,
  equals: ScalarSchema,
});

const LeafInSchema = z.object({
  property: DottedPathSchema,
  in: z.array(ComparableSchema).min(1),
});

const LeafHasSchema = z.object({
  property: DottedPathSchema,
  has: ComparableSchema,
});

const LeafLacksSchema = z.object({
  property: DottedPathSchema,
  lacks: ComparableSchema,
});

const LeafExistsSchema = z.object({
  property: DottedPathSchema,
  exists: z.boolean(),
});

const LeafGtSchema = z.object({
  property: DottedPathSchema,
  gt: ComparableSchema,
});

const LeafGteSchema = z.object({
  property: DottedPathSchema,
  gte: ComparableSchema,
});

const LeafLtSchema = z.object({
  property: DottedPathSchema,
  lt: ComparableSchema,
});

const LeafLteSchema = z.object({
  property: DottedPathSchema,
  lte: ComparableSchema,
});

const LeafMatchesSchema = z.object({
  property: DottedPathSchema,
  matches: z.string(),
});

export const FilterLeafSchema = z.union([
  LeafEqualsSchema,
  LeafInSchema,
  LeafHasSchema,
  LeafLacksSchema,
  LeafExistsSchema,
  LeafGtSchema,
  LeafGteSchema,
  LeafLtSchema,
  LeafLteSchema,
  LeafMatchesSchema,
]);

export type FilterLeaf = z.infer<typeof FilterLeafSchema>;

// ---------------------------------------------------------------------------
// Recursive filter rule
// ---------------------------------------------------------------------------

/**
 * A recursive predicate tree. Each node is either a leaf operator
 * or a boolean composition node (`all` / `any` / `not`).
 *
 * `all` and `any` arrays must be non-empty (rejected at schema time).
 * The `not` form wraps exactly one child rule.
 *
 * This type is declared explicitly to satisfy the recursive reference
 * without falling back to `any` — required by the no-any constraint.
 */
export type FilterRule =
  | FilterLeaf
  | { all: FilterRule[] }
  | { any: FilterRule[] }
  | { not: FilterRule };

export const FilterRuleSchema: z.ZodType<FilterRule> = z.lazy(() =>
  z.union([
    FilterLeafSchema,
    z.object({ all: z.array(FilterRuleSchema).min(1) }),
    z.object({ any: z.array(FilterRuleSchema).min(1) }),
    z.object({ not: FilterRuleSchema }),
  ]),
);
