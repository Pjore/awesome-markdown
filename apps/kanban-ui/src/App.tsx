import React, { useState } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import {
  BoardListPage,
  BoardPage,
  BreadcrumbContext,
  ConflictBanner,
  ConflictProvider,
  ItemEditorPage,
} from '@awesome-markdown/board-ui';
import type { BreadcrumbSegment } from '@awesome-markdown/board-ui';
import { TopBar } from './app-shell/TopBar.js';
import { useActiveProvider } from './providers/active-provider.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { ReactRouterAdapterProvider } from './router/react-router-adapter.js';
import { getSyncEngineUrl } from './sync/sync-engine-url.js';

/**
 * Top-level application shell.
 * Renders the app chrome (header with connection indicator + theme toggle)
 * and routes to the board-ui pages:
 *   /              → BoardListPage (lists all boards)
 *   /boards/:slug  → BoardPage (single board by slug)
 *   /items/:slug   → ItemEditorPage
 *   /settings      → SettingsPage (kanban-ui only: provider selection)
 */
export function App(): React.ReactElement {
  const { isSwitching } = useActiveProvider();
  const [breadcrumbSegments, setBreadcrumbSegments] = useState<BreadcrumbSegment[]>([]);

  const content = isSwitching ? (
    <div
      className="flex items-center justify-center h-full"
      data-testid="switching-provider"
    >
      <span style={{ color: 'var(--ink-muted)', fontSize: '1.125rem' }}>Switching provider…</span>
    </div>
  ) : (
    <Routes>
      <Route path="/" element={<BoardListPage />} />
      <Route path="/boards/:slug" element={<BoardPage />} />
      <Route path="/items/:slug" element={<ItemEditorPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route
        path="*"
        element={
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              fontFamily: 'var(--font-mono)',
              color: 'var(--ink-muted)',
              gap: '12px',
            }}
            data-testid="not-found"
          >
            <span style={{ fontSize: '13px' }}>page not found</span>
            <Link
              to="/"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
                color: 'var(--ink-muted)',
                textDecoration: 'underline',
              }}
              data-testid="go-home"
            >
              ← boards
            </Link>
          </div>
        }
      />
    </Routes>
  );

  return (
    <ReactRouterAdapterProvider>
      <BreadcrumbContext.Provider
        value={{ segments: breadcrumbSegments, setSegments: setBreadcrumbSegments }}
      >
        <ConflictProvider syncEngineUrl={getSyncEngineUrl()}>
          <TopBar />
          <ConflictBanner />
          <div className="flex-1 overflow-hidden">
            {content}
          </div>
        </ConflictProvider>
      </BreadcrumbContext.Provider>
    </ReactRouterAdapterProvider>
  );
}

