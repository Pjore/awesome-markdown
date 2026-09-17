import { z } from 'zod';
import { FilterRuleSchema } from './filter-rule.js';
import { SlugSchema } from './item.js';

/**
 * Declares that a single item property should be surfaced on the card
 * and/or detail view, and how it should be visualized.
 */
export const PropertyDisplaySchema = z.object({
  /** Property name to read off the item (or its per-board entry). */
  property: z.string().min(1),
  /** Rendering style; defaults to plain text. */
  visualStyle: z.enum(['text', 'badge', 'tag', 'avatar']).optional().default('text'),
  /** Optional display label; falls back to `property` when omitted. */
  label: z.string().optional(),
});

export type PropertyDisplay = z.infer<typeof PropertyDisplaySchema>;

/**
 * An `entityType: board` markdown file.
 *
 * Boards declare what to show and how to lay it out. They do not store
 * items — membership is derived at render time by evaluating filter rules
 * against the item pool.
 *
 * `columns` and `swimlanes` are ordered arrays of axis slugs that define
 * the board's 2D layout. Axis files are looked up separately.
 */
export const BoardSchema = z.object({
  entityType: z.literal('board'),
  slug: SlugSchema,
  title: z.string().min(1),
  description: z.string().optional(),
  /**
   * Optional candidate-set filter. When present, only items matching
   * this rule are eligible to appear on this board. Evaluated before
   * column and swimlane filters.
   */
  filter: FilterRuleSchema.optional(),
  /** Ordered list of axis slugs defining the column dimension. */
  columns: z.array(SlugSchema).optional(),
  /** Ordered list of axis slugs defining the swimlane dimension. */
  swimlanes: z.array(SlugSchema).optional(),
  /** Properties to surface on each card, in display order. */
  cardLayout: z.array(PropertyDisplaySchema).optional(),
  /** Properties to surface on the item detail view, in display order. */
  detailLayout: z.array(PropertyDisplaySchema).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Board = z.infer<typeof BoardSchema>;
