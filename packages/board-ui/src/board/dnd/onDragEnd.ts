import type { DragEndEvent } from '@dnd-kit/core';
import type { Cell } from '@awesome-markdown/contracts';
import type { ItemDragData } from './dragTypes.js';
import { decodeCellId } from './dragTypes.js';

// ---------------------------------------------------------------------------
// Drop action discriminated union
// ---------------------------------------------------------------------------

export type DropAction =
  | { type: 'noop' }
  | {
      type: 'drop';
      itemSlug: string;
      srcColumnSlug: string;
      srcSwimlaneSlug: string;
      dstColumnSlug: string;
      dstSwimlaneSlug: string;
      /**
       * Slug of the item to insert before, or null to insert at end of cell.
       * When src === dst this is a same-cell reorder.
       */
      insertBeforeSlug: string | null;
    };

/**
 * Pure function: translates a @dnd-kit DragEndEvent into a drop action.
 * Uses `cells` to locate which cell an item belongs to.
 * No React, no provider calls — fully testable in isolation.
 */
export function onDragEnd(event: DragEndEvent, cells: Cell[]): DropAction {
  const { active, over } = event;

  if (!over) return { type: 'noop' };
  if (active.id === over.id) return { type: 'noop' };

  const activeData = active.data.current as ItemDragData | undefined;
  if (!activeData || activeData.type !== 'item') return { type: 'noop' };

  const { columnSlug: srcColumnSlug, swimlaneSlug: srcSwimlaneSlug, itemSlug } = activeData;
  const overId = String(over.id);

  let dstColumnSlug: string;
  let dstSwimlaneSlug: string;
  let insertBeforeSlug: string | null;

  const cellDecoded = decodeCellId(overId);
  if (cellDecoded) {
    // Dropped directly on a cell container (empty cell or cell border)
    dstColumnSlug = cellDecoded.columnSlug;
    dstSwimlaneSlug = cellDecoded.swimlaneSlug;
    insertBeforeSlug = null;
  } else {
    // Dropped on another item — find which cell that item belongs to
    const dstCell = cells.find((c) => c.items.some((i) => i.slug === overId));
    if (!dstCell) return { type: 'noop' };
    dstColumnSlug = dstCell.columnSlug;
    dstSwimlaneSlug = dstCell.swimlaneSlug;
    insertBeforeSlug = overId;
  }

  return {
    type: 'drop',
    itemSlug,
    srcColumnSlug,
    srcSwimlaneSlug,
    dstColumnSlug,
    dstSwimlaneSlug,
    insertBeforeSlug,
  };
}
