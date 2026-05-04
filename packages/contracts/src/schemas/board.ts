import { z } from 'zod';
import { FilterRuleSchema } from './filter-rule.js';
import { SlugSchema } from './item.js';

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
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Board = z.infer<typeof BoardSchema>;
