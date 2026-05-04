import React from 'react';
import type { Axis, Cell as CellData, Board } from '@awesome-markdown/contracts';
import { Cell } from './Cell.js';

interface SwimlaneRowProps {
  swimlane: Axis;
  columns: Axis[];
  cells: CellData[];
  board: Board;
  onError: (msg: string) => void;
  onCreated: () => void;
}

/**
 * A horizontal row representing one swimlane axis.
 * Renders a label cell followed by one Cell per column.
 */
export function SwimlaneRow({
  swimlane,
  columns,
  cells,
  board,
  onError,
  onCreated,
}: SwimlaneRowProps): React.ReactElement {
  return (
    <div
      className="flex"
      data-testid={`swimlane-row-${swimlane.slug}`}
      data-swimlane-slug={swimlane.slug}
    >
      {/* Swimlane label */}
      <div
        className="w-28 flex-shrink-0 flex items-center px-2 py-2"
        style={{ borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}
        data-testid={`swimlane-label-${swimlane.slug}`}
        data-synthetic={swimlane.synthetic ? 'true' : undefined}
      >
        <span
          className="truncate"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10.5px',
            fontWeight: 500,
            color: 'var(--ink-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          {swimlane.title}
        </span>
      </div>

      {/* Cells — one per column */}
      {columns.map((column) => {
        const cell = cells.find(
          (c) => c.columnSlug === column.slug && c.swimlaneSlug === swimlane.slug,
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
  );
}
