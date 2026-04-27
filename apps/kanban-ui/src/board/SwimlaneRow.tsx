import React from 'react';
import type { Column, Swimlane, Item } from '@awesome-markdown/contracts';
import { Cell } from './Cell.js';
import type { BoardMutations } from '../state/useBoardMutations.js';

interface SwimlaneRowProps {
  swimlane: Swimlane;
  columns: Column[];
  items: Item[];
  mutations: BoardMutations;
}

/**
 * A horizontal row representing one swimlane.
 * Renders a label cell followed by one Cell per column.
 */
export function SwimlaneRow({
  swimlane,
  columns,
  items,
  mutations,
}: SwimlaneRowProps): React.ReactElement {
  return (
    <div
      className="flex"
      data-testid={`swimlane-row-${swimlane.id}`}
      data-swimlane-id={swimlane.id}
    >
      {/* Swimlane label */}
      <div
        className="w-28 flex-shrink-0 bg-gray-50 border border-gray-200 flex items-center px-2 py-2"
        data-testid={`swimlane-label-${swimlane.id}`}
        style={{ borderLeftColor: swimlane.color ?? undefined }}
      >
        <span
          className="text-xs font-semibold text-gray-500 uppercase tracking-wide truncate writing-mode-vertical"
        >
          {swimlane.title}
        </span>
      </div>

      {/* Cells — one per column */}
      {columns.map((column) => {
        const cellItems = items.filter(
          (item) => item.columnId === column.id && item.swimlaneId === swimlane.id,
        );
        return (
          <Cell
            key={`${column.id}-${swimlane.id}`}
            column={column}
            swimlane={swimlane}
            items={cellItems}
            mutations={mutations}
          />
        );
      })}
    </div>
  );
}
