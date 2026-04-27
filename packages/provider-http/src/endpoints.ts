/**
 * Constructs sidecar HTTP endpoint URLs.
 *
 * Route shapes are derived from the M4 provider-fs sidecar (apps/provider-fs).
 * All entity routes are nested under /boards/:boardId.
 */
export const endpoints = {
  health: (base: string): string => `${base}/health`,
  subscribe: (base: string): string => `${base}/subscribe`,

  // Board CRUD
  boards: (base: string): string => `${base}/boards`,
  board: (base: string, boardId: string): string =>
    `${base}/boards/${boardId}`,

  // Item CRUD (nested under board)
  items: (base: string, boardId: string): string =>
    `${base}/boards/${boardId}/items`,
  item: (base: string, boardId: string, itemId: string): string =>
    `${base}/boards/${boardId}/items/${itemId}`,

  // Column CRUD (nested under board)
  columns: (base: string, boardId: string): string =>
    `${base}/boards/${boardId}/columns`,
  column: (base: string, boardId: string, columnId: string): string =>
    `${base}/boards/${boardId}/columns/${columnId}`,

  // Swimlane CRUD (nested under board)
  swimlanes: (base: string, boardId: string): string =>
    `${base}/boards/${boardId}/swimlanes`,
  swimlane: (base: string, boardId: string, swimlaneId: string): string =>
    `${base}/boards/${boardId}/swimlanes/${swimlaneId}`,
} as const;
