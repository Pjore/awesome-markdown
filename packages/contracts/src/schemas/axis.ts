import { z } from 'zod';
import { FilterRuleSchema, DottedPathSchema } from './filter-rule.js';
import { SlugSchema } from './item.js';
import { WriteOnDropSchema } from './mutation.js';

// ---------------------------------------------------------------------------
// Axis order rule
// ---------------------------------------------------------------------------

/**
 * Sort rule for items within this axis bucket.
 *
 * `by` is a dotted path (with optional `$board` substitution) to the
 * property used for sorting. `direction` is `asc` or `desc`.
 *
 * Lexicographic order semantics (fractional-index strings) belong to M2.
 */
export const AxisOrderSchema = z.object({
  by: DottedPathSchema,
  direction: z.enum(['asc', 'desc']),
});

export type AxisOrder = z.infer<typeof AxisOrderSchema>;

// ---------------------------------------------------------------------------
// Axis entity
// ---------------------------------------------------------------------------

/**
 * An `entityType: axis` markdown file.
 *
 * An axis represents a single bucket (column or swimlane) in a board's
 * 2D layout. The same axis slug may be referenced under `columns` on one
 * board and under `swimlanes` on another.
 *
 * When no axis file exists for a referenced slug the provider synthesizes
 * a fallback axis (`title = slug`, `synthetic: true`) — the schema
 * accommodates this via the optional `synthetic` flag.
 */
export const AxisSchema = z.object({
  entityType: z.literal('axis'),
  slug: SlugSchema,
  title: z.string().min(1),
  description: z.string().optional(),
  /**
   * Membership filter. When absent, all candidate items from the board's
   * filter (or the full item pool) land in this bucket.
   */
  filter: FilterRuleSchema.optional(),
  /**
   * Sort rule for items within this bucket.
   * When absent, items fall back to `updatedAt desc`.
   */
  order: AxisOrderSchema.optional(),
  /**
   * Explicit drag-and-drop write override. When absent, the write
   * behaviour is derived from the invertibility of the combined cell filter.
   */
  writeOnDrop: WriteOnDropSchema.optional(),
  /**
   * Present and `true` on slug-fallback (synthetic) axes returned by the
   * render endpoint when no axis definition file exists for a referenced slug.
   * Not present in file-backed axis entities.
   */
  synthetic: z.literal(true).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type Axis = z.infer<typeof AxisSchema>;
