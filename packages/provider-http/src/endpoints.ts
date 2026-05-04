/**
 * HTTP endpoint URL builders for the M3+ provider-fs sidecar.
 *
 * Flat slug-based routes — no nested board ownership in item paths.
 */
export const endpoints = {
  health: (base: string): string => `${base}/health`,
  subscribe: (base: string): string => `${base}/subscribe`,

  // Boards
  boards: (base: string): string => `${base}/boards`,
  boardRender: (base: string, slug: string): string => `${base}/boards/${slug}/render`,
  boardHomeless: (base: string, slug: string): string => `${base}/boards/${slug}/homeless`,

  // Axes
  axes: (base: string): string => `${base}/axes`,

  // Items
  items: (base: string): string => `${base}/items`,
  item: (base: string, slug: string): string => `${base}/items/${slug}`,
} as const;
