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
        className="w-28 flex-shrink-0 bg-gray-50 border border-gray-200 flex items-center px-2 py-2"
        data-testid={`swimlane-label-${swimlane.slug}`}
        data-synthetic={swimlane.synthetic ? 'true' : undefined}
      >
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide truncate">
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
