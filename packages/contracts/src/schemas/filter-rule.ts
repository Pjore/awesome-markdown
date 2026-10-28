import { z } from 'zod';
import { DottedPathSchema, MutationPathSchema } from '../paths.js';
export { DottedPathSchema } from '../paths.js';
export type DottedPath = z.infer<typeof DottedPathSchema>;

const ScalarSchema = z.union([z.string(), z.number().finite(), z.boolean()]);
const ComparableSchema = z.union([z.string(), z.number().finite()]);
const property = MutationPathSchema;
export const FilterLeafSchema = z.union([
  z.object({ property, equals: ScalarSchema }),
  z.object({ property, in: z.array(ComparableSchema).min(1) }),
  z.object({ property, has: ComparableSchema }),
  z.object({ property, lacks: ComparableSchema }),
  z.object({ property, exists: z.boolean() }),
  z.object({ property, gt: ComparableSchema }),
  z.object({ property, gte: ComparableSchema }),
  z.object({ property, lt: ComparableSchema }),
  z.object({ property, lte: ComparableSchema }),
  z.object({ property, matches: z.string() }),
]);
export type FilterLeaf = z.infer<typeof FilterLeafSchema>;
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
  ])
);
