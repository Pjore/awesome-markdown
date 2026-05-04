import React from 'react';
import type { Axis } from '@awesome-markdown/contracts';

interface ColumnHeaderProps {
  column: Axis;
}

/**
 * Renders the header cell for a single column axis.
 * Synthetic axes (no definition file) display the slug as title.
 */
export function ColumnHeader({ column }: ColumnHeaderProps): React.ReactElement {
  return (
    <div
      className="min-w-[240px] w-[240px] flex-shrink-0 bg-gray-100 border border-gray-200 rounded-t px-3 py-2 font-semibold text-gray-700 text-sm"
      data-testid={`column-header-${column.slug}`}
      data-column-slug={column.slug}
      data-synthetic={column.synthetic ? 'true' : undefined}
    >
      <span className="truncate block">{column.title}</span>
    </div>
  );
}
