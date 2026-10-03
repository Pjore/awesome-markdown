/**
 * @awesome-markdown/board-ui — the awesome-markdown board surface as a
 * router-agnostic React library.
 *
 * Host apps provide three things:
 *   1. `RouterAdapterProvider` — maps board-relative paths onto the host router.
 *   2. `ProviderContextProvider` — the `PersistenceProvider` to read/write through.
 *   3. `import '@awesome-markdown/board-ui/styles.css'` — tokens, fonts, utilities.
 * Optionally: `BreadcrumbContext.Provider` (shell breadcrumb) and
 * `ConflictProvider` + `ConflictBanner` (sync-engine conflict resolution).
 */

// Routing seam
export { RouterAdapterProvider, RouterLink, useRouterAdapter } from './router/RouterAdapter.js';
export type { RouterAdapter, RouterLinkProps } from './router/RouterAdapter.js';

// Breadcrumb channel (optional; no-op default)
export { BreadcrumbContext, useBreadcrumb } from './breadcrumb.js';
export type { BreadcrumbContextValue, BreadcrumbSegment } from './breadcrumb.js';

// Persistence provider binding
export { ProviderContextProvider, useProvider } from './provider/ProviderContext.js';

// Pages (render under the host's `/`, `/boards/:slug`, `/items/:slug` routes)
export { BoardListPage } from './pages/BoardListPage.js';
export { BoardPage } from './pages/BoardPage.js';
export { ItemEditorPage } from './pages/ItemEditorPage.js';

// Board building blocks
export { Board } from './board/Board.js';
export { HomelessPanel } from './board/HomelessPanel.js';

// State hooks
export { useBoardRender } from './state/useBoardRender.js';
export type { BoardRenderState, BoardRenderStatus } from './state/useBoardRender.js';
export { useProviderSubscribe } from './state/useProviderSubscribe.js';
export { useTheme } from './state/theme-store.js';

// Sync-engine conflict handling
export { ConflictProvider, useConflict, useOptionalConflict } from './sync/conflict-store.js';
export type { ConflictStoreState } from './sync/conflict-store.js';
export { ConflictBanner } from './components/ConflictBanner.js';

// Shell widgets reusable by host top bars
export { SyncStatusDot } from './shell/SyncStatusDot.js';
export { ThemeToggle } from './shell/ThemeToggle.js';

// Helpers
export { buildItemEditorHref } from './lib/item-board.js';
