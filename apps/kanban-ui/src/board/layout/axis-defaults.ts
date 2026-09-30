import type { AxisOrder, Board, FilterRule } from '@awesome-markdown/contracts';

export type AxisDim = 'columns' | 'swimlanes';

/** Manual order — each item's per-board fractional index. */
export const MANUAL_ORDER: AxisOrder = { by: 'boards.$board.order', direction: 'asc' };

/**
 * Filter for a freshly added axis: `column: <slug>` / `row: <slug>`. It starts
 * empty and stays invertible, so dropping a card writes that property.
 */
export function defaultAxisFilter(dim: AxisDim, slug: string): FilterRule {
  return { property: dim === 'columns' ? 'column' : 'row', equals: slug };
}

export function slugify(title: string, fallback = 'untitled'): string {
  const s = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return s.length > 0 ? s : fallback;
}

export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  let candidate = base;
  let suffix = 2;
  while (taken.has(candidate)) candidate = `${base}-${suffix++}`;
  return candidate;
}

/** Axis slugs the board itself declares (empty when the render uses the implicit axis). */
export function declaredSlugs(board: Board, dim: AxisDim): string[] {
  return board[dim] ?? [];
}

// ---------------------------------------------------------------------------
// Sortable ids for axis headers — kept distinct from item slugs and cell ids
// ---------------------------------------------------------------------------

export interface AxisDragData {
  type: 'axis';
  dim: AxisDim;
  slug: string;
}

export function axisDragId(dim: AxisDim, slug: string): string {
  return `axis:${dim}:${slug}`;
}
