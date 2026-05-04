// ---------------------------------------------------------------------------
// Drag payload attached to each draggable ItemCard via useSortable data
// ---------------------------------------------------------------------------

export interface ItemDragData {
  type: 'item';
  itemSlug: string;
  columnSlug: string;
  swimlaneSlug: string;
}

/**
 * Cell drop-target IDs are encoded as `${columnSlug}::${swimlaneSlug}`.
 * This format must not appear in item slugs.
 */
export const CELL_ID_SEPARATOR = '::';

export function encodeCellId(columnSlug: string, swimlaneSlug: string): string {
  return `${columnSlug}${CELL_ID_SEPARATOR}${swimlaneSlug}`;
}

export function decodeCellId(
  cellId: string,
): { columnSlug: string; swimlaneSlug: string } | null {
  const idx = cellId.indexOf(CELL_ID_SEPARATOR);
  if (idx === -1) return null;
  const columnSlug = cellId.slice(0, idx);
  const swimlaneSlug = cellId.slice(idx + CELL_ID_SEPARATOR.length);
  if (!columnSlug || !swimlaneSlug) return null;
  return { columnSlug, swimlaneSlug };
}
