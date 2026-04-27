import React from 'react';
import type { Column } from '@awesome-markdown/contracts';

interface ColumnHeaderProps {
  column: Column;
}

/**
 * Renders the header cell for a single column.
 */
export function ColumnHeader({ column }: ColumnHeaderProps): React.ReactElement {
  return (
    <div
      className="min-w-[240px] w-[240px] flex-shrink-0 bg-gray-100 border border-gray-200 rounded-t px-3 py-2 font-semibold text-gray-700 text-sm"
      data-testid={`column-header-${column.id}`}
      data-column-id={column.id}
    >
      <span className="truncate block">{column.title}</span>
      {column.wipLimit !== undefined && (
        <span className="text-xs text-gray-400 font-normal ml-1">
          WIP {column.wipLimit}
        </span>
      )}
    </div>
  );
}
