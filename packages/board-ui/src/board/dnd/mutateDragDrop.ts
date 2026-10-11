import type {
  Board,
  Axis,
  Cell,
  FilterRule,
  Mutation,
  WriteOnDrop,
  Item,
} from '@awesome-markdown/contracts';
import { deriveMutations, keyBetween } from '@awesome-markdown/filter-engine';

// ---------------------------------------------------------------------------
// Filter composition
// ---------------------------------------------------------------------------

/**
 * Build the combined cell filter (board ∧ column ∧ swimlane).
 * Returns undefined when all three are absent (match-all).
 */
export function buildCellFilter(
  board: Board,
  col: Axis,
  sl: Axis,
): FilterRule | undefined {
  const rules: FilterRule[] = (
    [board.filter, col.filter, sl.filter] as Array<FilterRule | undefined>
  ).filter((f): f is FilterRule => f !== undefined);
  if (rules.length === 0) return undefined;
  if (rules.length === 1) return rules[0];
  return { all: rules };
}

// ---------------------------------------------------------------------------
// writeOnDrop resolution
// ---------------------------------------------------------------------------

/**
 * Column writeOnDrop takes precedence over swimlane writeOnDrop.
 */
function getWriteOnDropOverride(col: Axis, sl: Axis): WriteOnDrop | undefined {
  if (col.writeOnDrop !== undefined) return col.writeOnDrop;
  return sl.writeOnDrop;
}

// ---------------------------------------------------------------------------
// Per-board order key helper
// ---------------------------------------------------------------------------

/** Read the per-board `order` string for an item, if present. */
export function getItemBoardOrder(item: Item, boardSlug: string): string | undefined {
  const boards = item.boards;
  if (!Array.isArray(boards)) return undefined;
  const entry = boards.find(
    (e) => (e as Record<string, unknown>)['board'] === boardSlug,
  ) as Record<string, unknown> | undefined;
  const o = entry?.['order'];
  return typeof o === 'string' ? o : undefined;
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
  insertBeforeSlug: string | null,
): Cell[] {
  return cells.map((cell) => {
    const isDst =
      cell.columnSlug === dstColumnSlug && cell.swimlaneSlug === dstSwimlaneSlug;
    const isSrc =
      cell.columnSlug === srcColumnSlug && cell.swimlaneSlug === srcSwimlaneSlug;

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
        items: [
          ...withoutItem.slice(0, insertAt),
          item,
          ...withoutItem.slice(insertAt),
        ],
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
 * One drop = exactly one PATCH. The returned mutation list includes:
 *   1. Cell-placement mutations derived from the destination cell's filter.
 *   2. One `set boards.<boardSlug>.order = <fractional-key>` mutation for ordering.
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
  const { itemSlug, srcCell, dstCell, colAxis, slAxis, board, insertBeforeSlug } =
    params;

  if (dstCell.readOnly) return null;

  const filter = buildCellFilter(board, colAxis, slAxis);
  const override = getWriteOnDropOverride(colAxis, slAxis);
  const result = deriveMutations(filter, { board: board.slug }, override);

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

  const prevOrder = prevItem !== null ? getItemBoardOrder(prevItem, board.slug) : undefined;
  const nextOrder = nextItem !== null ? getItemBoardOrder(nextItem, board.slug) : undefined;

  const newOrderKey = keyBetween(prevOrder, nextOrder);
  const orderMutation: Mutation = {
    op: 'set',
    path: `boards.${board.slug}.order`,
    value: newOrderKey,
  };

  const isReorder =
    srcCell.columnSlug === dstCell.columnSlug &&
    srcCell.swimlaneSlug === dstCell.swimlaneSlug;

  return {
    mutations: [...result, orderMutation],
    type: isReorder ? 'reorder' : 'move',
  };
}
