import type { FilterRule, FilterLeaf, Item } from '@awesome-markdown/contracts';
import { resolvePath, type Ctx } from './path-resolver.js';

// ---------------------------------------------------------------------------
// Scalar helpers
// ---------------------------------------------------------------------------

/** Coerce a resolved property value to a comparable scalar, or null. */
function toComparable(v: unknown): string | number | null {
  if (typeof v === 'string' || typeof v === 'number') return v;
  return null;
}

// ---------------------------------------------------------------------------
// Leaf evaluation
// ---------------------------------------------------------------------------

function evaluateLeaf(leaf: FilterLeaf, item: Item, ctx: Ctx): boolean {
  const raw = resolvePath(leaf.property, item, ctx);

  if ('equals' in leaf) {
    return raw === leaf.equals;
  }

  if ('in' in leaf) {
    const c = toComparable(raw);
    if (c === null) return false;
    return (leaf.in as (string | number)[]).includes(c);
  }

  if ('has' in leaf) {
    if (!Array.isArray(raw)) return false;
    return (raw as unknown[]).includes(leaf.has);
  }

  if ('lacks' in leaf) {
    if (!Array.isArray(raw)) return true; // absent array → value is absent → lacks satisfied
    return !(raw as unknown[]).includes(leaf.lacks);
  }

  if ('exists' in leaf) {
    const present = raw !== undefined;
    return leaf.exists ? present : !present;
  }

  if ('gt' in leaf) {
    const c = toComparable(raw);
    return c !== null && c > leaf.gt;
  }

  if ('gte' in leaf) {
    const c = toComparable(raw);
    return c !== null && c >= leaf.gte;
  }

  if ('lt' in leaf) {
    const c = toComparable(raw);
    return c !== null && c < leaf.lt;
  }

  if ('lte' in leaf) {
    const c = toComparable(raw);
    return c !== null && c <= leaf.lte;
  }

  if ('matches' in leaf) {
    if (typeof raw !== 'string') return false;
    return new RegExp(leaf.matches).test(raw);
  }

  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate a filter rule against an item.
 *
 * Returns `true` when the item satisfies the filter, or when `filter` is
 * `undefined` (match-all / synthetic-axis semantics per UC-7).
 *
 * @param filter  Filter rule to evaluate. `undefined` = match all.
 * @param item    Item to test.
 * @param ctx     Evaluation context; `ctx.board` drives `$board` substitution.
 */
export function evaluate(
  filter: FilterRule | undefined,
  item: Item,
  ctx: Ctx,
): boolean {
  if (filter === undefined) return true;

  // Leaf operators all carry a `property` field
  if ('property' in filter) {
    return evaluateLeaf(filter as FilterLeaf, item, ctx);
  }

  // Boolean composition
  if ('all' in filter) {
    return filter.all.every(child => evaluate(child, item, ctx));
  }

  if ('any' in filter) {
    return filter.any.some(child => evaluate(child, item, ctx));
  }

  if ('not' in filter) {
    return !evaluate(filter.not, item, ctx);
  }

  return false;
}
