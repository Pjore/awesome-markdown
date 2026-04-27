import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Item } from '@awesome-markdown/contracts';
import type { ItemDragData } from './dnd/dragTypes.js';
import { useOptionalConflict } from '../sync/conflict-store.js';

interface ItemCardProps {
  item: Item;
  columnId: string;
  swimlaneId: string;
  onEdit: () => void;
}

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
};

/**
 * A draggable item card. Click to open the editor.
 *
 * When the item is part of an active merge conflict, drag and edit are disabled
 * and a lock indicator is shown.
 */
export function ItemCard({
  item,
  columnId,
  swimlaneId,
  onEdit,
}: ItemCardProps): React.ReactElement {
  // Gracefully degrade if not inside ConflictProvider (e.g. unit tests)
  const conflict = useOptionalConflict();
  const isConflicted = conflict?.isItemAffected(item.id) ?? false;

  const dragData: ItemDragData = {
    type: 'item',
    itemId: item.id,
    columnId,
    swimlaneId,
  };

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    data: dragData,
    disabled: isConflicted,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const priorityClass = PRIORITY_COLORS[item.priority] ?? 'bg-gray-100 text-gray-600';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white border rounded shadow-sm p-2 select-none group ${
        isConflicted
          ? 'border-amber-300 cursor-not-allowed opacity-70'
          : 'border-gray-200 cursor-grab active:cursor-grabbing'
      }`}
      data-testid={`item-card-${item.id}`}
      data-item-id={item.id}
      data-conflict={isConflicted ? 'true' : undefined}
      {...attributes}
      {...(isConflicted ? {} : listeners)}
    >
      <div className="flex items-start justify-between gap-1">
        <span
          className="text-sm font-medium text-gray-800 flex-1 min-w-0 truncate"
          data-testid={`item-title-${item.id}`}
        >
          {item.title}
        </span>
        {isConflicted ? (
          <span
            className="text-amber-500 flex-shrink-0 text-xs"
            title="This item is locked while a merge conflict is being resolved"
            aria-label="Conflict lock"
            data-testid={`conflict-lock-${item.id}`}
          >
            🔒
          </span>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="text-gray-300 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 text-xs px-1"
            data-testid={`edit-item-${item.id}`}
            aria-label={`Edit ${item.title}`}
          >
            ✏
          </button>
        )}
      </div>

      {item.body.trim() && (
        <p className="text-xs text-gray-400 mt-1 line-clamp-2">{item.body}</p>
      )}

      <div className="flex flex-wrap gap-1 mt-1 items-center">
        <span className={`text-xs rounded-full px-1.5 py-0.5 font-medium ${priorityClass}`}>
          {item.priority}
        </span>
        {item.tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="text-xs bg-gray-100 text-gray-500 rounded-full px-1.5 py-0.5"
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

