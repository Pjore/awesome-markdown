import React from 'react';
import type { Axis } from '@awesome-markdown/contracts';

interface ColumnHeaderProps {
  column: Axis;
  itemCount: number;
}

/**
 * Renders the header cell for a single column axis.
 * Format: "TODO · 3" — uppercase mono, hairline rule below.
 */
export function ColumnHeader({ column, itemCount }: ColumnHeaderProps): React.ReactElement {
  return (
    <div
      className="min-w-[240px] w-[240px] flex-shrink-0 px-3 py-2"
      style={{ borderBottom: '1px solid var(--border)' }}
      data-testid={`column-header-${column.slug}`}
      data-column-slug={column.slug}
      data-synthetic={column.synthetic ? 'true' : undefined}
    >
      <span
        className="block truncate"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--ink-muted)',
        }}
      >
        {column.title} · {itemCount}
      </span>
    </div>
  );
}

