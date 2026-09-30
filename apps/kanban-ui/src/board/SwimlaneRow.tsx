import React from 'react';
import type { Axis, Cell as CellData, Board } from '@awesome-markdown/contracts';
import { Cell } from './Cell.js';
import { SortableAxis } from './layout/SortableAxis.js';
import { filterSummary } from './layout/filter-draft.js';

interface SwimlaneRowProps {
  swimlane: Axis;
  columns: Axis[];
  cells: CellData[];
  board: Board;
  /** False for the implicit swimlane of a board that declares none. */
  editable: boolean;
  selected: boolean;
  onEdit: () => void;
  onRename: (title: string) => void;
  onError: (msg: string) => void;
  onCreated: () => void;
}

/**
 * A horizontal row representing one swimlane axis.
 * Renders a label cell followed by one Cell per column. The label is the
 * drag handle for reordering rows.
 */
export function SwimlaneRow({
  swimlane,
  columns,
  cells,
  board,
  editable,
  selected,
  onEdit,
  onRename,
  onError,
  onCreated,
}: SwimlaneRowProps): React.ReactElement {
  return (
    <SortableAxis
      dim="swimlanes"
      axis={swimlane}
      editable={editable}
      selected={selected}
      label={editable ? swimlane.title : ''}
      subtitle={editable ? filterSummary(swimlane.filter) : undefined}
      onEdit={onEdit}
      onRename={onRename}
    >
      {({ setNodeRef, style, handleProps, handleClassName, title }) => (
        <div
          ref={setNodeRef}
          className="flex"
          style={{ ...style, background: 'var(--bg)' }}
          data-testid={`swimlane-row-${swimlane.slug}`}
          data-swimlane-slug={swimlane.slug}
        >
          {/* Swimlane label */}
          <div
            {...handleProps}
            className={`w-28 flex-shrink-0 px-2 py-2 ${handleClassName}`}
            style={{
              borderRight: '1px solid var(--border)',
              borderBottom: '1px solid var(--border)',
              boxShadow: selected ? 'inset 3px 0 0 var(--accent)' : undefined,
            }}
            data-testid={`swimlane-label-${swimlane.slug}`}
            data-synthetic={swimlane.synthetic ? 'true' : undefined}
          >
            <span
              className="block"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10.5px',
                fontWeight: 500,
                color: 'var(--ink-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              {title}
            </span>
          </div>

          {/* Cells — one per column */}
          {columns.map((column) => {
            const cell = cells.find(
              (c) => c.columnSlug === column.slug && c.swimlaneSlug === swimlane.slug
            );
            if (!cell) return null;
            return (
              <Cell
                key={`${column.slug}-${swimlane.slug}`}
                cell={cell}
                columnAxis={column}
                swimlaneAxis={swimlane}
                board={board}
                onError={onError}
                onCreated={onCreated}
              />
            );
          })}
        </div>
      )}
    </SortableAxis>
  );
}
