import React, { useCallback, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { BoardRender, Cell as CellType, Homeless } from '@awesome-markdown/contracts';
import { ColumnHeader } from './ColumnHeader.js';
import { SwimlaneRow } from './SwimlaneRow.js';
import { HomelessPanel } from './HomelessPanel.js';
import { onDragEnd } from './dnd/onDragEnd.js';
import { computeDropMutations, applyOptimisticMove } from './dnd/mutateDragDrop.js';
import { layoutAwareCollision, planHomelessDrop } from './dnd/boardDnd.js';
import { useProvider } from '../provider/ProviderContext.js';
import { useBoardLayout } from './layout/useBoardLayout.js';
import { axisDragId } from './layout/axis-defaults.js';
import type { AxisDim, AxisDragData } from './layout/axis-defaults.js';
import { AddAxisButton, PencilIcon } from './layout/InlineControls.js';
import { AxisDrawer } from './layout/AxisDrawer.js';
import { BoardDrawer } from './layout/BoardDrawer.js';

interface BoardProps {
  render: BoardRender;
  homeless: Homeless | null;
  onRefetch: () => void;
}

type Editing = { kind: 'axis'; dim: AxisDim; slug: string } | { kind: 'board' } | null;

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
 *
 * Layout editing: "+" adds a column/swimlane, headers drag to reorder, the
 * pencil opens the axis (or board) settings drawer.
 */
export function Board({ render, homeless, onRefetch }: BoardProps): React.ReactElement {
  const provider = useProvider();
  const [activeItemSlug, setActiveItemSlug] = useState<string | null>(null);
  const [optimisticCells, setOptimisticCells] = useState<CellType[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const layout = useBoardLayout(render, onRefetch, setError);
  const closeDrawer = useCallback(() => setEditing(null), []);

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

      // --- Axis header reorder branch ---
      const activeData = event.active.data.current as { type?: string } | undefined;
      if (activeData?.type === 'axis') {
        const { dim, slug } = activeData as AxisDragData;
        const over = event.over?.data.current as AxisDragData | undefined;
        if (over?.type === 'axis' && over.dim === dim) void layout.moveAxis(dim, slug, over.slug);
        return;
      }

      // --- Homeless item drop branch ---
      if (activeData?.type === 'homeless-item') {
        if (!homeless) return;
        const plan = planHomelessDrop(event, cells, render, homeless);
        if (!plan) return;
        setOptimisticCells(plan.newCells);

        void (async () => {
          try {
            await provider.patchItem(plan.itemSlug, { mutations: plan.mutations });
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
    [cells, render, provider, homeless, layout],
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

  const isEditing = (dim: AxisDim, slug: string): boolean =>
    editing?.kind === 'axis' && editing.dim === dim && editing.slug === slug;
  const toggleAxis = (dim: AxisDim, slug: string): void =>
    setEditing(isEditing(dim, slug) ? null : { kind: 'axis', dim, slug });
  const editingAxis =
    editing?.kind === 'axis' ? layout[editing.dim].find((a) => a.slug === editing.slug) : undefined;

  return (
    <div
      className="flex flex-col h-full"
      data-testid="board"
      data-board-slug={render.board.slug}
    >
      {/* Board title */}
      <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
        <div className="flex items-center gap-2">
          <h1
            style={{ fontFamily: 'var(--font-mono)', fontSize: '1.125rem', fontWeight: 500, color: 'var(--ink)', margin: 0 }}
            data-testid="board-title"
          >
            {render.board.title}
          </h1>
          <button
            type="button"
            className="icon-btn"
            aria-pressed={editing?.kind === 'board'}
            aria-label="Board settings"
            title="Board settings"
            data-testid="edit-board"
            onClick={() => setEditing(editing?.kind === 'board' ? null : { kind: 'board' })}
          >
            <PencilIcon />
          </button>
        </div>
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
        collisionDetection={layoutAwareCollision}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="flex-1 overflow-auto">
          {/* Column header row */}
          <div className="flex sticky top-0 z-10" style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
            {/* Spacer aligned with swimlane label width */}
            <div className="w-28 flex-shrink-0" />
            <SortableContext
              items={layout.columns.map((c) => axisDragId('columns', c.slug))}
              strategy={horizontalListSortingStrategy}
            >
              {layout.columns.map((col) => {
                const count = cells
                  .filter((c) => c.columnSlug === col.slug)
                  .reduce((sum, c) => sum + c.items.length, 0);
                return (
                  <ColumnHeader
                    key={col.slug}
                    column={col}
                    itemCount={count}
                    editable={!layout.implicit.columns}
                    selected={isEditing('columns', col.slug)}
                    onEdit={() => toggleAxis('columns', col.slug)}
                    onRename={(title) => void layout.saveAxis(col.slug, { title })}
                  />
                );
              })}
            </SortableContext>
            <AddAxisButton
              label="column"
              style={{ width: '36px', minWidth: '36px', margin: '4px 8px', alignSelf: 'stretch' }}
              onAdd={(title) => void layout.addAxis('columns', title)}
            />
          </div>

          {/* Swimlane rows */}
          <div className="flex flex-col" data-testid="swimlane-rows">
            <SortableContext
              items={layout.swimlanes.map((s) => axisDragId('swimlanes', s.slug))}
              strategy={verticalListSortingStrategy}
            >
              {layout.swimlanes.map((sl) => (
                <SwimlaneRow
                  key={sl.slug}
                  swimlane={sl}
                  columns={layout.columns}
                  cells={cells}
                  board={render.board}
                  editable={!layout.implicit.swimlanes}
                  selected={isEditing('swimlanes', sl.slug)}
                  onEdit={() => toggleAxis('swimlanes', sl.slug)}
                  onRename={(title) => void layout.saveAxis(sl.slug, { title })}
                  onError={setError}
                  onCreated={onRefetch}
                />
              ))}
            </SortableContext>
            <AddAxisButton
              label="swimlane"
              style={{ width: '112px', height: '32px', margin: '8px 0' }}
              onAdd={(title) => void layout.addAxis('swimlanes', title)}
            />
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

      {editing?.kind === 'axis' && editingAxis && (
        <AxisDrawer
          key={`${editing.dim}:${editing.slug}`}
          axis={editingAxis}
          dim={editing.dim}
          boardSlug={render.board.slug}
          usage={layout.usage(editing.slug)}
          onSave={(patch) => layout.saveAxis(editing.slug, patch)}
          onRemove={() => layout.removeAxis(editing.dim, editing.slug)}
          onClose={closeDrawer}
        />
      )}
      {editing?.kind === 'board' && (
        <BoardDrawer board={render.board} onSave={layout.saveBoard} onClose={closeDrawer} />
      )}
    </div>
  );
}
