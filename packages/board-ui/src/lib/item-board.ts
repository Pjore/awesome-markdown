export function buildItemEditorHref(itemSlug: string, boardSlug?: string): string {
  if (!boardSlug) return `/items/${itemSlug}`;
  const search = new URLSearchParams({ board: boardSlug });
  return `/items/${itemSlug}?${search.toString()}`;
}
