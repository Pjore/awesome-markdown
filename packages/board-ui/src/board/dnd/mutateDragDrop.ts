import type { Board, Axis, Cell, FilterRule, Mutation, Item } from '@awesome-markdown/contracts';
import {
  cellFilter,
  cellMutations,
  keyBetween,
  resolvePath,
  substitutePath,
} from '@awesome-markdown/filter-engine';

// ---------------------------------------------------------------------------
// Filter composition
// ---------------------------------------------------------------------------

/**
 * Build the combined cell filter (board ∧ column ∧ swimlane).
 * Returns undefined when all three are absent (match-all).
 */
export function buildCellFilter(board: Board, col: Axis, sl: Axis): FilterRule | undefined {
  return cellFilter(board, col, sl);
}

// ---------------------------------------------------------------------------
// Optimistic cell reordering helper
// ---------------------------------------------------------------------------

/**
 * Apply a drag-drop move to a local copy of the cells array.
 * Handles both cross-cell moves and same-cell reorders.
 */
export function applyOptimisticMove(
  cells: Cell[],
  item: Item,
  srcColumnSlug: string,
  srcSwimlaneSlug: string,
  dstColumnSlug: string,
  dstSwimlaneSlug: string,
  insertBeforeSlug: string | null
): Cell[] {
  return cells.map((cell) => {
    const isDst = cell.columnSlug === dstColumnSlug && cell.swimlaneSlug === dstSwimlaneSlug;
    const isSrc = cell.columnSlug === srcColumnSlug && cell.swimlaneSlug === srcSwimlaneSlug;

    if (!isDst && !isSrc) return cell;

    // Remove item from its current position (handles both src and dst sides)
    const withoutItem = cell.items.filter((i) => i.slug !== item.slug);

    if (isDst) {
      if (insertBeforeSlug === null) {
        return { ...cell, items: [...withoutItem, item] };
      }
      const idx = withoutItem.findIndex((i) => i.slug === insertBeforeSlug);
      const insertAt = idx >= 0 ? idx : withoutItem.length;
      return {
        ...cell,
        items: [...withoutItem.slice(0, insertAt), item, ...withoutItem.slice(insertAt)],
      };
    }

    // isSrc only (cross-cell move source cleanup)
    return { ...cell, items: withoutItem };
  });
}

// ---------------------------------------------------------------------------
// Main mutation computation
// ---------------------------------------------------------------------------

export interface DropMutations {
  mutations: Mutation[];
  type: 'move' | 'reorder';
}

/**
 * Compute the mutation list for a drag-drop action.
 *
 * Returns null when the destination cell is read-only or when
 * deriveMutations returns `{ readonly: true }` as a belt-and-suspenders check.
 *
 * One drop = one PATCH. Cross-cell placement uses the bound destination
 * rules. Reordering writes only the selected configured ascending string
 * sort target; no implicit membership or per-board order field is invented.
 */
export function computeDropMutations(params: {
  itemSlug: string;
  srcCell: Cell;
  dstCell: Cell;
  colAxis: Axis;
  slAxis: Axis;
  board: Board;
  insertBeforeSlug: string | null;
}): DropMutations | null {
  const { itemSlug, srcCell, dstCell, colAxis, slAxis, board, insertBeforeSlug } = params;

  if (dstCell.readOnly) return null;

  const result = cellMutations(board, colAxis, slAxis);

  if (!Array.isArray(result)) return null; // ReadOnly from deriveMutations

  // Determine insert position in the destination cell (excluding the moved item)
  const dstItemsWithoutMoved = dstCell.items.filter((i) => i.slug !== itemSlug);
  const rawIdx =
    insertBeforeSlug === null
      ? -1
      : dstItemsWithoutMoved.findIndex((i) => i.slug === insertBeforeSlug);
  const insertAt = rawIdx >= 0 ? rawIdx : dstItemsWithoutMoved.length;

  const prevItem = dstItemsWithoutMoved[insertAt - 1] ?? null;
  const nextItem = dstItemsWithoutMoved[insertAt] ?? null;

  const isReorder =
    srcCell.columnSlug === dstCell.columnSlug && srcCell.swimlaneSlug === dstCell.swimlaneSlug;
  const order = colAxis.order ?? slAxis.order;
  const ctx = { board: board.slug, axis: colAxis.order ? colAxis.slug : slAxis.slug };
  const prevOrder = prevItem && order ? resolvePath(order.by, prevItem, ctx) : undefined;
  const nextOrder = nextItem && order ? resolvePath(order.by, nextItem, ctx) : undefined;
  const moving = srcCell.items.find((item) => item.slug === itemSlug);
  const currentOrder = moving && order ? resolvePath(order.by, moving, ctx) : undefined;
  const fractional = (value: unknown): value is string =>
    typeof value === 'string' && /^[0-9A-Za-z]+$/.test(value);
  const compatible =
    order?.direction === 'asc' &&
    (currentOrder === undefined || fractional(currentOrder)) &&
    (!prevItem || fractional(prevOrder)) &&
    (!nextItem || fractional(nextOrder));
  let orderWrites: Mutation[] = [];
  if (compatible && order) {
    try {
      const key = keyBetween(prevOrder as string | undefined, nextOrder as string | undefined);
      if (
        (typeof prevOrder !== 'string' || prevOrder < key) &&
        (typeof nextOrder !== 'string' || key < nextOrder)
      ) {
        orderWrites = [{ op: 'set', path: substitutePath(order.by, ctx), value: key }];
      }
    } catch {
      /* Invalid fractional neighbors disable manual ordering, not cross-cell placement. */
    }
  }
  if (isReorder && orderWrites.length === 0) return null;
  const mutations = isReorder ? orderWrites : [...result, ...orderWrites];
  return mutations.length ? { mutations, type: isReorder ? 'reorder' : 'move' } : null;
}
