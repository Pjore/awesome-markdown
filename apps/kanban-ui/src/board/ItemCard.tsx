import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Item } from '@awesome-markdown/contracts';
import type { ItemDragData } from './dnd/dragTypes.js';
import { useOptionalConflict } from '../sync/conflict-store.js';
import { deriveSummary } from '../lib/derive-summary.js';

interface ItemCardProps {
  item: Item;
  columnSlug: string;
  swimlaneSlug: string;
  boardSlug: string;
}

/**
 * A draggable item card with three-layer layout:
 * 1. Title (Inter Tight 14px/500)
 * 2. Summary (first prose line from body, 12.5px/400, muted)
 * 3. Tags row (mono uppercase, dot-separated, muted)
 *
 * Clicking the card navigates to /items/:slug (full-page editor).
 * When conflicted: drag disabled, dashed ink-muted border, 🔒 indicator.
 */
export function ItemCard({
  item,
  columnSlug,
  swimlaneSlug,
  boardSlug,
}: ItemCardProps): React.ReactElement {
  const navigate = useNavigate();
  const conflict = useOptionalConflict();
  const isConflicted = conflict?.isItemAffected(item.slug) ?? false;

  const dragData: ItemDragData = {
    type: 'item',
    itemSlug: item.slug,
    columnSlug,
    swimlaneSlug,
  };

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.slug,
    data: dragData,
    disabled: isConflicted,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    padding: '10px 12px',
    border: isConflicted
      ? '1px dashed var(--ink-muted)'
      : '1px solid var(--border)',
    borderRadius: 0,
    boxShadow: 'none',
    background: 'transparent',
    cursor: isConflicted ? 'not-allowed' : isDragging ? 'grabbing' : 'grab',
    userSelect: 'none',
  };

  const itemAsMap = item as Record<string, unknown>;
  const tags = Array.isArray(itemAsMap['tags']) ? (itemAsMap['tags'] as string[]) : [];
  const summary = item.body !== undefined && item.body.trim() !== ''
    ? deriveSummary(item.body)
    : '';

  const handleClick = (e: React.MouseEvent): void => {
    // Don't navigate if the user is dragging
    if (isDragging) return;
    e.stopPropagation();
    navigate(`/items/${item.slug}`, { state: { boardSlug, from: `/boards/${boardSlug}` } });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={isConflicted ? undefined : handleClick}
      data-testid={`item-card-${item.slug}`}
      data-item-slug={item.slug}
      data-conflict={isConflicted ? 'true' : undefined}
      {...attributes}
      {...(isConflicted ? {} : listeners)}
    >
      {/* Layer 1: Title */}
      <div className="flex items-start justify-between gap-1">
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '14px',
            fontWeight: 500,
            color: 'var(--ink)',
            lineHeight: 1.3,
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          data-testid={`item-title-${item.slug}`}
        >
          {item.title}
        </span>
        {isConflicted && (
          <span
            style={{ flexShrink: 0, fontSize: '12px' }}
            title="This item is locked while a merge conflict is being resolved"
            aria-label="Conflict lock"
            data-testid={`conflict-lock-${item.slug}`}
          >
            🔒
          </span>
        )}
      </div>

      {/* Layer 2: Summary */}
      {summary !== '' && (
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '12.5px',
            fontWeight: 400,
            color: 'var(--ink-muted)',
            lineHeight: 1.4,
            marginTop: '4px',
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {summary}
        </p>
      )}

      {/* Layer 3: Tags */}
      {tags.length > 0 && (
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10.5px',
            fontWeight: 400,
            color: 'var(--ink-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginTop: '6px',
          }}
        >
          {tags.join(' · ')}
        </p>
      )}
    </div>
  );
}

