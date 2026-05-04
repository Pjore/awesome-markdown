import React, { useCallback, useState } from 'react';
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
import type { BoardRender, Cell as CellType, Homeless } from '@awesome-markdown/contracts';
import { ColumnHeader } from './ColumnHeader.js';
import { SwimlaneRow } from './SwimlaneRow.js';
import { HomelessPanel } from './HomelessPanel.js';
import { onDragEnd } from './dnd/onDragEnd.js';
import { computeDropMutations, applyOptimisticMove } from './dnd/mutateDragDrop.js';
import { useProvider } from '../provider/ProviderContext.js';

interface BoardProps {
  render: BoardRender;
  homeless: Homeless | null;
  onRefetch: () => void;
}

/**
 * Main board component: renders the column×swimlane grid and wires up DnD.
 *
 * Manages optimistic cell state — on drag-drop, applies the move immediately
 * then reverts on PATCH failure with a user-visible error toast.
 *
 * Drop semantics:
 * - Invertibility check + mutation derivation via @awesome-markdown/filter-engine
 * - Read-only cells reject drops before any network call
 * - One drop → exactly one PATCH /items/:slug
 */
export function Board({ render, homeless, onRefetch }: BoardProps): React.ReactElement {
  const provider = useProvider();
  const [activeItemSlug, setActiveItemSlug] = useState<string | null>(null);
  const [optimisticCells, setOptimisticCells] = useState<CellType[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cells = optimisticCells ?? render.cells;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = useCallback((event: DragStartEvent): void => {
    setActiveItemSlug(String(event.active.id));
  }, []);

  const handleDragCancel = useCallback((): void => {
    setActiveItemSlug(null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent): void => {
      setActiveItemSlug(null);
      const action = onDragEnd(event, cells);
      if (action.type === 'noop') return;

      const {
        itemSlug,
        srcColumnSlug,
        srcSwimlaneSlug,
        dstColumnSlug,
        dstSwimlaneSlug,
        insertBeforeSlug,
      } = action;

      const srcCell = cells.find(
        (c) => c.columnSlug === srcColumnSlug && c.swimlaneSlug === srcSwimlaneSlug,
      );
      const dstCell = cells.find(
        (c) => c.columnSlug === dstColumnSlug && c.swimlaneSlug === dstSwimlaneSlug,
      );
      if (!srcCell || !dstCell) return;

      // Reject read-only destination before any UI change
      if (dstCell.readOnly) return;

      const colAxis = render.axes.columns.find((a) => a.slug === dstColumnSlug);
      const slAxis = render.axes.swimlanes.find((a) => a.slug === dstSwimlaneSlug);
      if (!colAxis || !slAxis) return;

      const dropResult = computeDropMutations({
        itemSlug,
        srcCell,
        dstCell,
        colAxis,
        slAxis,
        board: render.board,
        insertBeforeSlug,
      });
      if (!dropResult) return; // readonly guard

      // Optimistic update — apply before the network call
      const movingItem = srcCell.items.find((i) => i.slug === itemSlug);
      if (!movingItem) return;

      const newCells = applyOptimisticMove(
        cells,
        movingItem,
        srcColumnSlug,
        srcSwimlaneSlug,
        dstColumnSlug,
        dstSwimlaneSlug,
        insertBeforeSlug,
      );
      setOptimisticCells(newCells);

      void (async () => {
        try {
          await provider.patchItem(itemSlug, { mutations: dropResult.mutations });
          // Clear optimistic state; SSE will deliver the definitive render
          setOptimisticCells(null);
        } catch (err) {
          setOptimisticCells(null);
          setError(
            `Failed to move item: ${err instanceof Error ? err.message : 'Unknown error'}`,
          );
        }
      })();
    },
    [cells, render, provider],
  );

  const activeItem =
    activeItemSlug !== null
      ? cells.flatMap((c) => c.items).find((i) => i.slug === activeItemSlug) ?? null
      : null;

  return (
    <div
      className="flex flex-col h-full"
      data-testid="board"
      data-board-slug={render.board.slug}
    >
      {/* Board title */}
      <div className="px-4 py-3 border-b border-gray-200 bg-white">
        <h1 className="text-lg font-bold text-gray-800" data-testid="board-title">
          {render.board.title}
        </h1>
        {render.board.description !== undefined && (
          <p className="text-sm text-gray-500 mt-0.5">{render.board.description}</p>
        )}
      </div>

      {/* Error toast */}
      {error !== null && (
        <div
          className="bg-red-50 border-b border-red-200 text-red-700 text-sm px-4 py-2 flex items-center justify-between"
          data-testid="board-error-toast"
          role="alert"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-4 text-red-400 hover:text-red-600"
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}

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
            {render.axes.columns.map((col) => (
              <ColumnHeader key={col.slug} column={col} />
            ))}
          </div>

          {/* Swimlane rows */}
          <div className="flex flex-col" data-testid="swimlane-rows">
            {render.axes.swimlanes.map((sl) => (
              <SwimlaneRow
                key={sl.slug}
                swimlane={sl}
                columns={render.axes.columns}
                cells={cells}
                board={render.board}
                onError={setError}
                onCreated={onRefetch}
              />
            ))}
          </div>

          {/* Drag overlay — ghost card while dragging */}
          <DragOverlay>
            {activeItem !== null && (
              <div className="bg-white border border-blue-300 rounded shadow-lg p-2 text-sm font-medium text-gray-800 rotate-2 opacity-90">
                {activeItem.title}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Homeless panel */}
      {homeless !== null && homeless.items.length > 0 && (
        <HomelessPanel homeless={homeless} />
      )}
    </div>
  );
}
