import React, { useState, useRef } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Cell as CellData, Axis, Board } from '@awesome-markdown/contracts';
import { deriveMutations, analyzeInvertibility } from '@awesome-markdown/filter-engine';
import { ItemCard } from './ItemCard.js';
import { encodeCellId } from './dnd/dragTypes.js';
import { buildCellFilter } from './dnd/mutateDragDrop.js';
import { useProvider } from '../provider/ProviderContext.js';

interface CellProps {
  cell: CellData;
  columnAxis: Axis;
  swimlaneAxis: Axis;
  board: Board;
  onError: (msg: string) => void;
  /** Called after a successful item creation so the board can refetch. */
  onCreated: () => void;
}

/** Slugify a title string to a valid slug. */
function slugify(title: string): string {
  const s = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return s.length > 0 ? s : 'item';
}

/**
 * A droppable column×swimlane cell containing sortable ItemCards.
 *
 * Read-only cells (cell.readOnly) suppress the drag-over highlight,
 * show a tooltip explaining why, and hide the "+ Add" affordance.
 *
 * "+ Add" derives mutations from the cell's combined filter via
 * filter-engine and sends POST /items (createItem).
 */
export function Cell({
  cell,
  columnAxis,
  swimlaneAxis,
  board,
  onError,
  onCreated,
}: CellProps): React.ReactElement {
  const provider = useProvider();
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const cellId = encodeCellId(columnAxis.slug, swimlaneAxis.slug);
  const { setNodeRef, isOver } = useDroppable({
    id: cellId,
    disabled: cell.readOnly,
  });

  const itemIds = cell.items.map((i) => i.slug);

  // Compute read-only tooltip from invertibility reasons
  const readOnlyTooltip = React.useMemo((): string => {
    if (!cell.readOnly) return '';
    const filter = buildCellFilter(board, columnAxis, swimlaneAxis);
    const override = columnAxis.writeOnDrop ?? swimlaneAxis.writeOnDrop;
    if (override !== undefined && !Array.isArray(override)) {
      return 'This cell is marked read-only.';
    }
    const { reasons } = analyzeInvertibility(filter);
    return reasons.length > 0 ? reasons.join('; ') : 'This cell is read-only.';
  }, [cell.readOnly, board, columnAxis, swimlaneAxis]);

  const handleAddClick = (): void => {
    setCreating(true);
    setNewTitle('');
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleCreate = async (): Promise<void> => {
    const title = newTitle.trim();
    if (!title) {
      setCreating(false);
      return;
    }

    const filter = buildCellFilter(board, columnAxis, swimlaneAxis);
    const writeOnDrop = columnAxis.writeOnDrop ?? swimlaneAxis.writeOnDrop;
    const result = deriveMutations(filter, { board: board.slug }, writeOnDrop);

    if (!Array.isArray(result)) {
      onError('Cannot create item: cell is read-only.');
      setCreating(false);
      return;
    }

    setSaving(true);
    try {
      await provider.createItem({ slug: slugify(title), title, mutations: result });
      setCreating(false);
      setNewTitle('');
      onCreated();
    } catch (err) {
      onError(
        `Failed to create item: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      void handleCreate();
    } else if (e.key === 'Escape') {
      setCreating(false);
      setNewTitle('');
    }
  };

  const dropHighlight = isOver && !cell.readOnly;

  return (
    <div
      ref={setNodeRef}
      className="min-w-[240px] w-[240px] flex-shrink-0 min-h-[120px] p-2 flex flex-col gap-1"
      style={{
        border: dropHighlight
          ? '1.5px solid var(--accent)'
          : cell.readOnly
            ? '1px dashed var(--ink-muted)'
            : '1px solid var(--border)',
        background: 'transparent',
        cursor: cell.readOnly ? 'not-allowed' : 'default',
        borderRadius: 0,
      }}
      data-testid={`cell-${columnAxis.slug}-${swimlaneAxis.slug}`}
      data-column-slug={columnAxis.slug}
      data-swimlane-slug={swimlaneAxis.slug}
      data-readonly={cell.readOnly ? 'true' : undefined}
      title={cell.readOnly ? readOnlyTooltip : undefined}
    >
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        {cell.items.map((item) => (
          <ItemCard
            key={item.slug}
            item={item}
            columnSlug={columnAxis.slug}
            swimlaneSlug={swimlaneAxis.slug}
            boardSlug={board.slug}
          />
        ))}
      </SortableContext>

      {!cell.readOnly && (
        <>
          {!creating && (
            <button
              type="button"
              onClick={handleAddClick}
              style={{
                marginTop: '4px',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: 'var(--ink-muted)',
                background: 'none',
                border: 'none',
                padding: '4px 8px',
                cursor: 'pointer',
                textAlign: 'left',
              }}
              data-testid={`add-item-${columnAxis.slug}-${swimlaneAxis.slug}`}
            >
              + add item
            </button>
          )}

          {creating && (
            <div className="mt-1 flex flex-col gap-1">
              <input
                ref={inputRef}
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Item title…"
                disabled={saving}
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '12px',
                  border: '1px solid var(--border)',
                  borderRadius: 0,
                  padding: '4px 8px',
                  width: '100%',
                  background: 'var(--bg)',
                  color: 'var(--ink)',
                  outline: 'none',
                }}
                onFocus={(e) => { e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'; }}
                onBlur={(e) => { e.currentTarget.style.boxShadow = 'none'; }}
                data-testid={`new-item-input-${columnAxis.slug}-${swimlaneAxis.slug}`}
              />
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => void handleCreate()}
                  disabled={saving || !newTitle.trim()}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    background: 'var(--accent)',
                    color: 'var(--ink)',
                    border: 'none',
                    borderRadius: 0,
                    padding: '2px 8px',
                    cursor: saving || !newTitle.trim() ? 'not-allowed' : 'pointer',
                    opacity: saving || !newTitle.trim() ? 0.5 : 1,
                  }}
                  data-testid={`confirm-add-${columnAxis.slug}-${swimlaneAxis.slug}`}
                >
                  {saving ? '…' : 'add'}
                </button>
                <button
                  type="button"
                  onClick={() => { setCreating(false); setNewTitle(''); }}
                  disabled={saving}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    color: 'var(--ink-muted)',
                    background: 'none',
                    border: 'none',
                    borderRadius: 0,
                    padding: '2px 8px',
                    cursor: saving ? 'not-allowed' : 'pointer',
                  }}
                  data-testid={`cancel-add-${columnAxis.slug}-${swimlaneAxis.slug}`}
                >
                  cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
