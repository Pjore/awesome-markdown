import type {
  FilterRule,
  FilterLeaf,
  Mutation,
  WriteOnDrop,
} from '@awesome-markdown/contracts';
import { analyzeInvertibility } from './invertibility.js';
import { substitutePath, type Ctx } from './path-resolver.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Returned by deriveMutations when the cell is read-only. */
export type ReadOnly = { readonly: true };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function deriveLeafMutation(leaf: FilterLeaf, ctx: Ctx): Mutation | null {
  const path = substitutePath(leaf.property, ctx);

  if ('equals' in leaf) {
    return { op: 'set', path, value: leaf.equals };
  }

  if ('in' in leaf) {
    const first = leaf.in[0];
    if (leaf.in.length === 1 && first !== undefined) {
      return { op: 'set', path, value: first };
    }
    return null; // multi-value in: non-invertible
  }

  if ('has' in leaf) {
    return { op: 'append', path, value: leaf.has };
  }

  if ('lacks' in leaf) {
    return { op: 'remove', path, value: leaf.lacks };
  }

  if ('exists' in leaf && !leaf.exists) {
    return { op: 'delete', path };
  }

  return null; // exists:true and comparators are non-invertible
}

function deriveFromRule(filter: FilterRule, ctx: Ctx): Mutation[] {
  // Leaf
  if ('property' in filter) {
    const m = deriveLeafMutation(filter as FilterLeaf, ctx);
    return m ? [m] : [];
  }

  // all: union of child mutations
  if ('all' in filter) {
    return filter.all.flatMap(child => deriveFromRule(child, ctx));
  }

  // not: only not:{exists:true} is invertible → delete
  if ('not' in filter) {
    const child = filter.not;
    if (
      'property' in child &&
      'exists' in child &&
      (child as FilterLeaf & { exists: boolean }).exists === true
    ) {
      const path = substitutePath((child as FilterLeaf).property, ctx);
      return [{ op: 'delete', path }];
    }
    return [];
  }

  return [];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Derive the mutation list for placing an item into a cell.
 *
 * **Strict α policy:** returns `{ readonly: true }` whenever
 * `analyzeInvertibility` says the combined filter is non-invertible.
 * There are no partial inverses.
 *
 * **Override semantics** (applied before invertibility check):
 * - `override = Mutation[]`           → use the explicit list verbatim.
 * - `override = { readonly: true }`   → always read-only regardless of filter.
 *
 * @param filter    Combined cell filter (board ∧ column ∧ swimlane), or
 *                  `undefined` for match-all (returns `[]`).
 * @param ctx       Evaluation context; `ctx.board` drives `$board` substitution.
 * @param override  Optional `writeOnDrop` value from the axis definition.
 *
 * NOTE: The "lazy boards-entry creation" rule (UC-3 §4.1 step 5) is a
 * consumer responsibility. When returned mutations contain paths matching
 * `boards.<slug>.*`, the calling code must check whether the item already
 * has a `boards[]` entry for that slug and create one if absent. The
 * MutationSchema has no "create-entry" operation; the provider handles
 * the upsert when applying `set boards.<slug>.<field> = value`.
 */
export function deriveMutations(
  filter: FilterRule | undefined,
  ctx: Ctx,
  override?: WriteOnDrop,
): Mutation[] | ReadOnly {
  // Apply override first
  if (override !== undefined) {
    if (!Array.isArray(override)) {
      // { readonly: true } form
      return { readonly: true };
    }
    // Explicit mutation list replaces derivation
    return override as Mutation[];
  }

  // Match-all (no filter): nothing to set
  if (filter === undefined) return [];

  // Strict α: non-invertible filter → read-only
  const { invertible } = analyzeInvertibility(filter);
  if (!invertible) return { readonly: true };

  return deriveFromRule(filter, ctx);
}
