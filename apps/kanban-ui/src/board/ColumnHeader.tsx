import React from 'react';
import type { Axis } from '@awesome-markdown/contracts';
import { SortableAxis } from './layout/SortableAxis.js';
import { filterSummary } from './layout/filter-draft.js';

interface ColumnHeaderProps {
  column: Axis;
  itemCount: number;
  editable: boolean;
  selected: boolean;
  onEdit: () => void;
  onRename: (title: string) => void;
}

function orderLabel(column: Axis): string {
  if (!column.order) return 'recently updated';
  if (column.order.by === 'boards.$board.order') return 'manual';
  return `by ${column.order.by} ${column.order.direction === 'desc' ? '↓' : '↑'}`;
}

/**
 * Renders the header cell for a single column axis.
 * Format: "TODO · 3" — uppercase mono, hairline rule below. Editable columns
 * are drag handles (reorder), rename on double-click and open settings via the pencil.
 */
export function ColumnHeader({
  column,
  itemCount,
  editable,
  selected,
  onEdit,
  onRename,
}: ColumnHeaderProps): React.ReactElement {
  return (
    <SortableAxis
      dim="columns"
      axis={column}
      editable={editable}
      selected={selected}
      label={`${column.title} · ${itemCount}`}
      subtitle={editable ? `${filterSummary(column.filter)} · ${orderLabel(column)}` : undefined}
      onEdit={onEdit}
      onRename={onRename}
    >
      {({ setNodeRef, style, handleProps, handleClassName, title }) => (
        <div
          ref={setNodeRef}
          {...handleProps}
          className={`min-w-[240px] w-[240px] flex-shrink-0 px-3 py-2 ${handleClassName}`}
          style={{
            ...style,
            borderBottom: selected ? '3px solid var(--accent)' : '1px solid var(--border)',
            background: 'var(--bg)',
          }}
          data-testid={`column-header-${column.slug}`}
          data-column-slug={column.slug}
          data-synthetic={column.synthetic ? 'true' : undefined}
        >
          <span
            className="block"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--ink-muted)',
            }}
          >
            {title}
          </span>
        </div>
      )}
    </SortableAxis>
  );
}
