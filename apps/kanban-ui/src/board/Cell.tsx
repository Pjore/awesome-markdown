import React, { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Item, Column, Swimlane } from '@awesome-markdown/contracts';
import { ItemCard } from './ItemCard.js';
import { ItemEditor } from './ItemEditor.js';
import { encodeCellId } from './dnd/dragTypes.js';
import type { BoardMutations } from '../state/useBoardMutations.js';

interface CellProps {
  column: Column;
  swimlane: Swimlane;
  items: Item[];
  mutations: BoardMutations;
}

/**
 * A droppable column×swimlane cell containing sortable ItemCards.
 */
export function Cell({ column, swimlane, items, mutations }: CellProps): React.ReactElement {
  const [creating, setCreating] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);

  const cellId = encodeCellId(column.id, swimlane.id);
  const { setNodeRef, isOver } = useDroppable({ id: cellId });

  const sortedItems = items
    .slice()
    .sort((a, b) => {
      const ao = typeof a.customFields['_order'] === 'number' ? (a.customFields['_order'] as number) : 0;
      const bo = typeof b.customFields['_order'] === 'number' ? (b.customFields['_order'] as number) : 0;
      return ao - bo;
    });

  const itemIds = sortedItems.map((i) => i.id);

  const handleCreate = async (
    input: Omit<Parameters<typeof mutations.createItem>[1], never>,
  ): Promise<void> => {
    await mutations.createItem({ columnId: column.id, swimlaneId: swimlane.id }, input);
    setCreating(false);
  };

  const handleUpdate = async (
    id: string,
    patch: Parameters<typeof mutations.updateItem>[1],
  ): Promise<void> => {
    await mutations.updateItem(id, patch);
    setEditingItem(null);
  };

  const handleDelete = async (id: string): Promise<void> => {
    await mutations.deleteItem(id);
    setEditingItem(null);
  };

  return (
    <div
      ref={setNodeRef}
      className={[
        'min-w-[240px] w-[240px] flex-shrink-0 border border-gray-200 bg-white min-h-[120px] p-2 flex flex-col gap-1 transition-colors',
        isOver ? 'bg-blue-50 border-blue-300' : '',
      ].join(' ')}
      data-testid={`cell-${column.id}-${swimlane.id}`}
      data-column-id={column.id}
      data-swimlane-id={swimlane.id}
    >
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        {sortedItems.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            columnId={column.id}
            swimlaneId={swimlane.id}
            onEdit={() => setEditingItem(item)}
          />
        ))}
      </SortableContext>

      <button
        type="button"
        onClick={() => setCreating(true)}
        className="mt-1 text-xs text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded px-2 py-1 text-left transition-colors"
        data-testid={`add-item-${column.id}-${swimlane.id}`}
      >
        + Add item
      </button>

      {creating && (
        <ItemEditor
          mode="create"
          boardId={''}
          columnId={column.id}
          swimlaneId={swimlane.id}
          onSave={handleCreate}
          onClose={() => setCreating(false)}
        />
      )}

      {editingItem !== null && (
        <ItemEditor
          mode="edit"
          item={editingItem}
          boardId={editingItem.boardId}
          columnId={editingItem.columnId}
          swimlaneId={editingItem.swimlaneId}
          onSave={(patch) => handleUpdate(editingItem.id, patch)}
          onDelete={() => handleDelete(editingItem.id)}
          onClose={() => setEditingItem(null)}
        />
      )}
    </div>
  );
}
