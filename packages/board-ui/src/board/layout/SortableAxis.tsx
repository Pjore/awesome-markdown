import React, { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Axis } from '@awesome-markdown/contracts';
import { axisDragId } from './axis-defaults.js';
import type { AxisDim, AxisDragData } from './axis-defaults.js';
import { InlineTextInput, PencilIcon } from './InlineControls.js';

interface SortableAxisProps {
  dim: AxisDim;
  axis: Axis;
  /** Implicit axes (board declares none) are not sortable or editable. */
  editable: boolean;
  selected: boolean;
  label: string;
  subtitle?: string;
  onEdit: () => void;
  onRename: (title: string) => void;
  children: (parts: {
    setNodeRef: (el: HTMLElement | null) => void;
    style: React.CSSProperties;
    handleProps: React.HTMLAttributes<HTMLElement>;
    handleClassName: string;
    title: React.ReactNode;
  }) => React.ReactElement;
}

/**
 * Wires one column header / swimlane row into the axis sortable context and
 * renders its title with double-click rename and the pencil (configure) button.
 */
export function SortableAxis({
  dim,
  axis,
  editable,
  selected,
  label,
  subtitle,
  onEdit,
  onRename,
  children,
}: SortableAxisProps): React.ReactElement {
  const [renaming, setRenaming] = useState(false);
  const data: AxisDragData = { type: 'axis', dim, slug: axis.slug };
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: axisDragId(dim, axis.slug),
    data,
    disabled: !editable || renaming,
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    position: 'relative',
    zIndex: isDragging ? 20 : undefined,
  };
  const noun = dim === 'columns' ? 'column' : 'swimlane';

  const title = (
    <span style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
      {renaming ? (
        <InlineTextInput
          initial={axis.title}
          ariaLabel={`Rename ${noun}`}
          testId={`rename-${noun}-${axis.slug}`}
          onCommit={(t) => {
            setRenaming(false);
            onRename(t);
          }}
          onCancel={() => setRenaming(false)}
        />
      ) : (
        <span
          className="truncate"
          style={{ flex: 1, minWidth: 0 }}
          onDoubleClick={editable ? () => setRenaming(true) : undefined}
          title={editable ? 'Double-click to rename' : undefined}
        >
          {label}
        </span>
      )}
      {editable && (
        <button
          type="button"
          className="icon-btn"
          aria-pressed={selected}
          aria-label={`Configure ${noun} ${axis.title}`}
          title={`Configure ${noun}`}
          data-testid={`edit-${noun}-${axis.slug}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onEdit}
        >
          <PencilIcon />
        </button>
      )}
    </span>
  );

  return children({
    setNodeRef,
    style,
    handleProps: editable ? { ...attributes, ...listeners } : {},
    handleClassName: editable ? 'axis-drag' : '',
    title: (
      <>
        {title}
        {subtitle !== undefined && <span className="axis-sub truncate">{subtitle}</span>}
      </>
    ),
  });
}
