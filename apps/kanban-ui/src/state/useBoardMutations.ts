import { useCallback } from 'react';
import type {
  Item,
  CreateItemInput,
  UpdateItemInput,
} from '@awesome-markdown/contracts';
import { useProvider } from '../provider/ProviderContext.js';

/** Returns the sort order stored in customFields._order, defaulting to 0. */
function getItemOrder(item: Item): number {
  const order = item.customFields['_order'];
  return typeof order === 'number' ? order : 0;
}

/** Returns items in a given cell sorted by their _order custom field. */
function getCellItemsSorted(
  items: Item[],
  columnId: string,
  swimlaneId: string,
): Item[] {
  return items
    .filter((i) => i.columnId === columnId && i.swimlaneId === swimlaneId)
    .sort((a, b) => getItemOrder(a) - getItemOrder(b));
}

export interface TargetCell {
  columnId: string;
  swimlaneId: string;
}

export interface BoardMutations {
  createItem: (cell: TargetCell, input: Omit<CreateItemInput, 'boardId' | 'columnId' | 'swimlaneId'>) => Promise<Item>;
  updateItem: (id: string, patch: UpdateItemInput) => Promise<Item>;
  deleteItem: (id: string) => Promise<void>;
  moveItem: (itemId: string, targetCell: TargetCell, targetIndex: number) => Promise<void>;
  reorderItem: (itemId: string, targetIndex: number) => Promise<void>;
}

/**
 * Returns CRUD + move/reorder operations bound to the active provider.
 * Components must not call the provider directly; use these functions instead.
 */
export function useBoardMutations(boardId: string): BoardMutations {
  const provider = useProvider();

  const createItem = useCallback(
    async (
      cell: TargetCell,
      input: Omit<CreateItemInput, 'boardId' | 'columnId' | 'swimlaneId'>,
    ): Promise<Item> => {
      const existingItems = await provider.listItems(boardId);
      const cellItems = getCellItemsSorted(existingItems, cell.columnId, cell.swimlaneId);
      const nextOrder = cellItems.length * 1000;

      const data: CreateItemInput = {
        ...input,
        boardId,
        columnId: cell.columnId,
        swimlaneId: cell.swimlaneId,
        customFields: { ...input.customFields, _order: nextOrder },
      };
      return provider.createItem(data);
    },
    [provider, boardId],
  );

  const updateItem = useCallback(
    async (id: string, patch: UpdateItemInput): Promise<Item> => {
      return provider.updateItem(id, patch);
    },
    [provider],
  );

  const deleteItem = useCallback(
    async (id: string): Promise<void> => {
      return provider.deleteItem(id);
    },
    [provider],
  );

  const moveItem = useCallback(
    async (itemId: string, targetCell: TargetCell, targetIndex: number): Promise<void> => {
      const allItems = await provider.listItems(boardId);
      const item = allItems.find((i) => i.id === itemId);
      if (!item) throw new Error(`Item not found: ${itemId}`);

      // Build new ordered list for the target cell (excluding moved item)
      const targetItems = getCellItemsSorted(allItems, targetCell.columnId, targetCell.swimlaneId).filter(
        (i) => i.id !== itemId,
      );

      const insertAt = Math.min(Math.max(0, targetIndex), targetItems.length);
      targetItems.splice(insertAt, 0, item);

      // Update all items in the target cell with new order values
      await Promise.all(
        targetItems.map((it, idx) =>
          provider.updateItem(it.id, {
            columnId: targetCell.columnId,
            swimlaneId: targetCell.swimlaneId,
            customFields: { ...it.customFields, _order: idx * 1000 },
          }),
        ),
      );
    },
    [provider, boardId],
  );

  const reorderItem = useCallback(
    async (itemId: string, targetIndex: number): Promise<void> => {
      const item = await provider.getItem(itemId);
      if (!item) throw new Error(`Item not found: ${itemId}`);

      const allItems = await provider.listItems(boardId);
      const cellItems = getCellItemsSorted(allItems, item.columnId, item.swimlaneId);

      const withoutItem = cellItems.filter((i) => i.id !== itemId);
      const insertAt = Math.min(Math.max(0, targetIndex), withoutItem.length);
      withoutItem.splice(insertAt, 0, item);

      await Promise.all(
        withoutItem.map((it, idx) =>
          provider.updateItem(it.id, {
            customFields: { ...it.customFields, _order: idx * 1000 },
          }),
        ),
      );
    },
    [provider, boardId],
  );

  return { createItem, updateItem, deleteItem, moveItem, reorderItem };
}
