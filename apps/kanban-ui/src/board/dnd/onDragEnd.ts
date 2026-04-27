import type { DragEndEvent } from '@dnd-kit/core';
import type { Item } from '@awesome-markdown/contracts';
import { type ItemDragData, decodeCellId } from './dragTypes.js';

// ---------------------------------------------------------------------------
// Mutation request discriminated union
// ---------------------------------------------------------------------------

export type DragMutationRequest =
  | {
      type: 'move';
      itemId: string;
      targetColumnId: string;
      targetSwimlaneId: string;
      targetIndex: number;
    }
  | { type: 'reorder'; itemId: string; targetIndex: number }
  | { type: 'noop' };

/** Returns the sort order stored in customFields._order, defaulting to 0. */
function getItemOrder(item: Item): number {
  const order = item.customFields['_order'];
  return typeof order === 'number' ? order : 0;
}

/** Returns items in a given cell sorted by their _order. */
function getCellItems(items: Item[], columnId: string, swimlaneId: string): Item[] {
  return items
    .filter((i) => i.columnId === columnId && i.swimlaneId === swimlaneId)
    .sort((a, b) => getItemOrder(a) - getItemOrder(b));
}

/**
 * Pure function: translates a @dnd-kit DragEndEvent into a provider mutation request.
 * No React, no provider calls — fully testable in isolation.
 */
export function onDragEnd(event: DragEndEvent, allItems: Item[]): DragMutationRequest {
  const { active, over } = event;

  if (!over) return { type: 'noop' };
  if (active.id === over.id) return { type: 'noop' };

  const activeData = active.data.current as ItemDragData | undefined;
  if (!activeData || activeData.type !== 'item') return { type: 'noop' };

  const { columnId: srcColumnId, swimlaneId: srcSwimlaneId, itemId } = activeData;
  const overId = String(over.id);

  let targetColumnId: string;
  let targetSwimlaneId: string;
  let targetIndex: number;

  // Check if the drop target is a cell (encoded cell ID) or another item
  const cellDecoded = decodeCellId(overId);

  if (cellDecoded) {
    // Dropped directly on a cell container (empty cell or cell border)
    targetColumnId = cellDecoded.columnId;
    targetSwimlaneId = cellDecoded.swimlaneId;
    const targetItems = getCellItems(allItems, targetColumnId, targetSwimlaneId).filter(
      (i) => i.id !== itemId,
    );
    targetIndex = targetItems.length;
  } else {
    // Dropped on another item — find which cell that item belongs to
    const overItem = allItems.find((i) => i.id === overId);
    if (!overItem) return { type: 'noop' };

    targetColumnId = overItem.columnId;
    targetSwimlaneId = overItem.swimlaneId;
    const targetItems = getCellItems(allItems, targetColumnId, targetSwimlaneId).filter(
      (i) => i.id !== itemId,
    );
    const overIdx = targetItems.findIndex((i) => i.id === overId);
    targetIndex = overIdx >= 0 ? overIdx : targetItems.length;
  }

  // Decide: same cell → reorder; different cell → move
  if (targetColumnId === srcColumnId && targetSwimlaneId === srcSwimlaneId) {
    return { type: 'reorder', itemId, targetIndex };
  }

  return { type: 'move', itemId, targetColumnId, targetSwimlaneId, targetIndex };
}
