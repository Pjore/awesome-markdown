import React, { useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useState } from 'react';
import type { Board, Column, Swimlane, Item } from '@awesome-markdown/contracts';
import { ColumnHeader } from './ColumnHeader.js';
import { SwimlaneRow } from './SwimlaneRow.js';
import { onDragEnd } from './dnd/onDragEnd.js';
import { useBoardMutations } from '../state/useBoardMutations.js';

interface BoardProps {
  board: Board;
  boardId: string;
  columns: Column[];
  swimlanes: Swimlane[];
  items: Item[];
}

/**
 * Main board component: renders the column×swimlane grid and wires up DnD.
 */
export function Board({
  board,
  boardId,
  columns,
  swimlanes,
  items,
}: BoardProps): React.ReactElement {
  const mutations = useBoardMutations(boardId);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveItemId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveItemId(null);
      const request = onDragEnd(event, items);
      if (request.type === 'noop') return;

      if (request.type === 'move') {
        void mutations.moveItem(request.itemId, {
          columnId: request.targetColumnId,
          swimlaneId: request.targetSwimlaneId,
        }, request.targetIndex);
      } else if (request.type === 'reorder') {
        void mutations.reorderItem(request.itemId, request.targetIndex);
      }
    },
    [items, mutations],
  );

  const handleDragCancel = useCallback(() => {
    setActiveItemId(null);
  }, []);

  const activeItem = activeItemId !== null
    ? items.find((i) => i.id === activeItemId) ?? null
    : null;

  return (
    <div
      className="flex flex-col h-full"
      data-testid="board"
      data-board-id={boardId}
    >
      {/* Board title */}
      <div className="px-4 py-3 border-b border-gray-200 bg-white">
        <h1 className="text-lg font-bold text-gray-800" data-testid="board-title">
          {board.title}
        </h1>
        {board.description && (
          <p className="text-sm text-gray-500 mt-0.5">{board.description}</p>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          {/* Column header row */}
          <div className="flex sticky top-0 z-10 bg-white border-b border-gray-200">
            {/* Spacer aligned with swimlane label width */}
            <div className="w-28 flex-shrink-0" />
            {columns.map((col) => (
              <ColumnHeader key={col.id} column={col} />
            ))}
          </div>

          {/* Swimlane rows */}
          <div className="flex flex-col" data-testid="swimlane-rows">
            {swimlanes.map((sl) => (
              <SwimlaneRow
                key={sl.id}
                swimlane={sl}
                columns={columns}
                items={items}
                mutations={mutations}
              />
            ))}
          </div>

          {/* Drag overlay — shows a ghost card while dragging */}
          <DragOverlay>
            {activeItem !== null && (
              <div className="bg-white border border-blue-300 rounded shadow-lg p-2 text-sm font-medium text-gray-800 rotate-2 opacity-90">
                {activeItem.title}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}
