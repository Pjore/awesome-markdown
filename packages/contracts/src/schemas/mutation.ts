import { z } from 'zod';
import { DottedPathSchema } from './filter-rule.js';

// ---------------------------------------------------------------------------
// Property value types
// ---------------------------------------------------------------------------

/**
 * Scalar or null value that can appear as a property value in item
 * frontmatter or as a mutation target value.
 */
export const PropertyValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export type PropertyValue = z.infer<typeof PropertyValueSchema>;

// ---------------------------------------------------------------------------
// Mutation variants — discriminated by 'op'
// ---------------------------------------------------------------------------

/**
 * Set a scalar property to a value (or clear it by setting null).
 * Invertible from: `equals` and single-item `in` leaf operators.
 */
export const SetMutationSchema = z.object({
  op: z.literal('set'),
  path: DottedPathSchema,
  value: PropertyValueSchema,
});
export type SetMutation = z.infer<typeof SetMutationSchema>;

/**
 * Append a value to an array property (idempotent semantics).
 * Invertible from: `has` leaf operator.
 */
export const AppendMutationSchema = z.object({
  op: z.literal('append'),
  path: DottedPathSchema,
  value: z.union([z.string(), z.number()]),
});
export type AppendMutation = z.infer<typeof AppendMutationSchema>;

/**
 * Remove a value from an array property (idempotent semantics).
 * Invertible from: `lacks` leaf operator.
 */
export const RemoveMutationSchema = z.object({
  op: z.literal('remove'),
  path: DottedPathSchema,
  value: z.union([z.string(), z.number()]),
});
export type RemoveMutation = z.infer<typeof RemoveMutationSchema>;

/**
 * Delete a property entirely (remove the frontmatter key).
 * Invertible from: `exists: false` leaf operator.
 */
export const DeleteMutationSchema = z.object({
  op: z.literal('delete'),
  path: DottedPathSchema,
});
export type DeleteMutation = z.infer<typeof DeleteMutationSchema>;

/** Discriminated union of all mutation variants (discriminant: `op`). */
export const MutationSchema = z.discriminatedUnion('op', [
  SetMutationSchema,
  AppendMutationSchema,
  RemoveMutationSchema,
  DeleteMutationSchema,
]);
export type Mutation = z.infer<typeof MutationSchema>;

// ---------------------------------------------------------------------------
// writeOnDrop — mutation list OR { readonly: true } — mutually exclusive
// ---------------------------------------------------------------------------

/**
 * Override for a cell's default drag-and-drop write behaviour.
 *
 * Two mutually exclusive forms:
 * - Non-empty `Mutation[]`: explicit mutation list applied on drop.
 * - `{ readonly: true }`: marks the cell as always read-only,
 *   even if the combined filter would otherwise be invertible.
 *
 * An array and an object `{ readonly: true }` are structurally
 * disjoint, so Zod's `z.union` enforces mutual exclusivity at
 * parse time.
 */
export const WriteOnDropSchema = z.union([
  z.array(MutationSchema).min(1),
  z.object({ readonly: z.literal(true) }).strict(),
]);
export type WriteOnDrop = z.infer<typeof WriteOnDropSchema>;
