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
import { deriveMutations } from '@awesome-markdown/filter-engine';
import { ColumnHeader } from './ColumnHeader.js';
import { SwimlaneRow } from './SwimlaneRow.js';
import { HomelessPanel } from './HomelessPanel.js';
import { onDragEnd } from './dnd/onDragEnd.js';
import { computeDropMutations, applyOptimisticMove, buildCellFilter } from './dnd/mutateDragDrop.js';
import { decodeCellId } from './dnd/dragTypes.js';
import type { HomelessItemDragData } from './dnd/dragTypes.js';
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

      // --- Homeless item drop branch ---
      const activeData = event.active.data.current as { type?: string } | undefined;
      if (activeData?.type === 'homeless-item') {
        if (!event.over || !homeless) return;
        const homelessData = activeData as HomelessItemDragData;
        const { itemSlug } = homelessData;
        const overId = String(event.over.id);

        let dstColumnSlug: string;
        let dstSwimlaneSlug: string;
        let insertBeforeSlug: string | null;

        const cellDecoded = decodeCellId(overId);
        if (cellDecoded) {
          dstColumnSlug = cellDecoded.columnSlug;
          dstSwimlaneSlug = cellDecoded.swimlaneSlug;
          insertBeforeSlug = null;
        } else {
          const dstCell = cells.find((c) => c.items.some((i) => i.slug === overId));
          if (!dstCell) return;
          dstColumnSlug = dstCell.columnSlug;
          dstSwimlaneSlug = dstCell.swimlaneSlug;
          insertBeforeSlug = overId;
        }

        const dstCell = cells.find(
          (c) => c.columnSlug === dstColumnSlug && c.swimlaneSlug === dstSwimlaneSlug,
        );
        if (!dstCell) return;
        if (dstCell.readOnly) return;

        const colAxis = render.axes.columns.find((a) => a.slug === dstColumnSlug);
        const slAxis = render.axes.swimlanes.find((a) => a.slug === dstSwimlaneSlug);
        if (!colAxis || !slAxis) return;

        const filter = buildCellFilter(render.board, colAxis, slAxis);
        const writeOnDrop = colAxis.writeOnDrop ?? slAxis.writeOnDrop;
        const mutations = deriveMutations(filter, { board: render.board.slug }, writeOnDrop);
        if (!Array.isArray(mutations)) return; // read-only guard

        const movingItem = homeless.items.find((i) => i.slug === itemSlug);
        if (!movingItem) return;

        // Insert item into destination cell (no source-cell removal needed)
        const newCells = cells.map((cell) => {
          if (cell.columnSlug !== dstColumnSlug || cell.swimlaneSlug !== dstSwimlaneSlug) {
            return cell;
          }
          const withoutItem = cell.items.filter((i) => i.slug !== itemSlug);
          if (insertBeforeSlug === null) {
            return { ...cell, items: [...withoutItem, movingItem] };
          }
          const idx = withoutItem.findIndex((i) => i.slug === insertBeforeSlug);
          const insertAt = idx >= 0 ? idx : withoutItem.length;
          return {
            ...cell,
            items: [
              ...withoutItem.slice(0, insertAt),
              movingItem,
              ...withoutItem.slice(insertAt),
            ],
          };
        });
        setOptimisticCells(newCells);

        void (async () => {
          try {
            await provider.patchItem(itemSlug, { mutations });
            setOptimisticCells(null);
          } catch (err) {
            setOptimisticCells(null);
            setError(
              `Failed to move item: ${err instanceof Error ? err.message : 'Unknown error'}`,
            );
          }
        })();
        return;
      }

      // --- Regular cell-to-cell drop branch ---
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
    [cells, render, provider, homeless],
  );

  const activeItem =
    activeItemSlug !== null
      ? (cells.flatMap((c) => c.items).find((i) => i.slug === activeItemSlug) ??
          homeless?.items.find((i) => i.slug === activeItemSlug) ??
          null)
      : null;

  const visibleHomelessItems = homeless
    ? homeless.items.filter(
        (i) =>
          !optimisticCells ||
          !optimisticCells.some((c) => c.items.some((it) => it.slug === i.slug)),
      )
    : [];

  return (
    <div
      className="flex flex-col h-full"
      data-testid="board"
      data-board-slug={render.board.slug}
    >
      {/* Board title */}
      <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
        <h1
          style={{ fontFamily: 'var(--font-mono)', fontSize: '1.125rem', fontWeight: 500, color: 'var(--ink)' }}
          data-testid="board-title"
        >
          {render.board.title}
        </h1>
        {render.board.description !== undefined && (
          <p style={{ fontSize: '0.875rem', color: 'var(--ink-muted)', marginTop: '2px' }}>{render.board.description}</p>
        )}
      </div>

      {/* Error toast */}
      {error !== null && (
        <div
          className="flex items-center justify-between px-4 py-2 flex-shrink-0"
          style={{
            borderBottom: '1px solid var(--border)',
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: 'var(--ink)',
            background: 'var(--bg)',
          }}
          data-testid="board-error-toast"
          role="alert"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            style={{
              marginLeft: '1rem',
              color: 'var(--ink-muted)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
            }}
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="flex-1 overflow-auto">
          {/* Column header row */}
          <div className="flex sticky top-0 z-10" style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
            {/* Spacer aligned with swimlane label width */}
            <div className="w-28 flex-shrink-0" />
            {render.axes.columns.map((col) => {
              const count = cells
                .filter((c) => c.columnSlug === col.slug)
                .reduce((sum, c) => sum + c.items.length, 0);
              return <ColumnHeader key={col.slug} column={col} itemCount={count} />;
            })}
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
        </div>

        {/* Homeless panel — inside DndContext so homeless items are valid drag sources */}
        {homeless !== null && visibleHomelessItems.length > 0 && (
          <HomelessPanel homeless={homeless} items={visibleHomelessItems} />
        )}

        {/* Drag overlay — ghost card following cursor while dragging */}
        <DragOverlay>
          {activeItem !== null && (
            <div
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                padding: '10px 12px',
                fontSize: '14px',
                fontWeight: 500,
                color: 'var(--ink)',
                fontFamily: 'var(--font-sans)',
                opacity: 0.9,
                boxShadow: 'none',
              }}
            >
              {activeItem.title}
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
