// ---------------------------------------------------------------------------
// Drag payload attached to each draggable ItemCard via useSortable data
// ---------------------------------------------------------------------------

export interface ItemDragData {
  type: 'item';
  itemId: string;
  columnId: string;
  swimlaneId: string;
}

/**
 * Cell drop-target IDs are encoded as `${columnId}::${swimlaneId}`.
 * This format must not appear in item IDs.
 */
export const CELL_ID_SEPARATOR = '::';

export function encodeCellId(columnId: string, swimlaneId: string): string {
  return `${columnId}${CELL_ID_SEPARATOR}${swimlaneId}`;
}

export function decodeCellId(
  cellId: string,
): { columnId: string; swimlaneId: string } | null {
  const idx = cellId.indexOf(CELL_ID_SEPARATOR);
  if (idx === -1) return null;
  const columnId = cellId.slice(0, idx);
  const swimlaneId = cellId.slice(idx + CELL_ID_SEPARATOR.length);
  if (!columnId || !swimlaneId) return null;
  return { columnId, swimlaneId };
}
