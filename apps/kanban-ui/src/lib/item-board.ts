import type { Item } from '@awesome-markdown/contracts';

export function getBoardEntry(item: Item, boardSlug: string): Record<string, unknown> | undefined {
  return item.boards?.find((entry) => entry.board === boardSlug) as Record<string, unknown> | undefined;
}

export function getBoardScopedString(item: Item, boardSlug: string, property: string): string {
  const value = getBoardEntry(item, boardSlug)?.[property];
  return typeof value === 'string' ? value : '';
}

export function buildItemEditorHref(itemSlug: string, boardSlug?: string): string {
  if (!boardSlug) return `/items/${itemSlug}`;
  const search = new URLSearchParams({ board: boardSlug });
  return `/items/${itemSlug}?${search.toString()}`;
}
