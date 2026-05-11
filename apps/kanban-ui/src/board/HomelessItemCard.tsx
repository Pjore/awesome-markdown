import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { Item } from '@awesome-markdown/contracts';
import type { HomelessItemDragData } from './dnd/dragTypes.js';

interface HomelessItemCardProps {
  item: Item;
}

/**
 * A draggable card for homeless items. Uses `useDraggable` (not `useSortable`)
 * because the homeless panel is a drag source only — no in-panel reordering.
 *
 * Carries `HomelessItemDragData` so Board.handleDragEnd can distinguish it
 * from a regular cell-to-cell item drag.
 */
export function HomelessItemCard({ item }: HomelessItemCardProps): React.ReactElement {
  const dragData: HomelessItemDragData = {
    type: 'homeless-item',
    itemSlug: item.slug,
  };

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.slug,
    data: dragData,
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    fontFamily: 'var(--font-sans)',
    fontSize: '13px',
    color: 'var(--ink)',
    border: '1px solid var(--border)',
    padding: '2px 10px',
    background: 'var(--bg)',
    cursor: isDragging ? 'grabbing' : 'grab',
    opacity: isDragging ? 0.4 : 1,
    userSelect: 'none',
    touchAction: 'none',
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      data-testid={`homeless-item-${item.slug}`}
      data-item-slug={item.slug}
      {...attributes}
      {...listeners}
    >
      {item.title}
    </li>
  );
}
