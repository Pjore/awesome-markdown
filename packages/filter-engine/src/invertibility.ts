import type { FilterRule, FilterLeaf } from '@awesome-markdown/contracts';

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

/**
 * Result of an invertibility analysis.
 *
 * `invertible: true` means `deriveMutations` can produce a deterministic
 * mutation list that places an item into the cell this filter describes.
 *
 * `reasons` is populated (non-empty) only when `invertible` is `false`;
 * each entry is a human-readable explanation suitable for a UI tooltip.
 */
export interface InvertibilityResult {
  invertible: boolean;
  reasons: string[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function ok(): InvertibilityResult {
  return { invertible: true, reasons: [] };
}

function fail(reason: string): InvertibilityResult {
  return { invertible: false, reasons: [reason] };
}

function merge(results: InvertibilityResult[]): InvertibilityResult {
  if (results.every(r => r.invertible)) return ok();
  return {
    invertible: false,
    reasons: results.flatMap(r => r.reasons),
  };
}

// ---------------------------------------------------------------------------
// Leaf analysis
// ---------------------------------------------------------------------------

function analyzeLeaf(leaf: FilterLeaf): InvertibilityResult {
  if ('equals' in leaf) return ok();

  if ('in' in leaf) {
    return leaf.in.length === 1
      ? ok()
      : fail(
          `'in' on '${leaf.property}' has ${leaf.in.length} values — read-only (use a single value for invertibility)`,
        );
  }

  if ('has' in leaf) return ok();
  if ('lacks' in leaf) return ok();

  if ('exists' in leaf) {
    return leaf.exists
      ? fail(`'exists: true' on '${leaf.property}' is not invertible`)
      : ok();
  }

  if ('gt' in leaf) return fail(`'gt' on '${leaf.property}' is not invertible`);
  if ('gte' in leaf) return fail(`'gte' on '${leaf.property}' is not invertible`);
  if ('lt' in leaf) return fail(`'lt' on '${leaf.property}' is not invertible`);
  if ('lte' in leaf) return fail(`'lte' on '${leaf.property}' is not invertible`);
  if ('matches' in leaf) return fail(`'matches' on '${leaf.property}' is not invertible`);

  return fail('unknown leaf operator');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyse whether a filter rule is invertible.
 *
 * **Policy α (strict):** any non-invertible sub-tree poisons the entire
 * result. There are no partial inverses.
 *
 * Returns `{ invertible: true, reasons: [] }` when `filter` is `undefined`
 * (match-all: no constraints → nothing to derive → cell is writable).
 */
export function analyzeInvertibility(
  filter: FilterRule | undefined,
): InvertibilityResult {
  if (filter === undefined) return ok();

  // Leaf
  if ('property' in filter) {
    return analyzeLeaf(filter as FilterLeaf);
  }

  // all: invertible iff every child is invertible
  if ('all' in filter) {
    return merge(filter.all.map(analyzeInvertibility));
  }

  // any: never invertible
  if ('any' in filter) {
    return fail("'any' composition is never invertible");
  }

  // not: only { property, exists: true } is invertible
  if ('not' in filter) {
    const child = filter.not;
    if (
      'property' in child &&
      'exists' in child &&
      (child as FilterLeaf & { exists: boolean }).exists === true
    ) {
      return ok();
    }
    return fail("'not' is only invertible when wrapping 'exists: true'");
  }

  return fail('unknown filter node type');
}
