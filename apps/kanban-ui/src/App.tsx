import React, { useState, createContext, useContext } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { TopBar } from './app-shell/TopBar.js';
import { SettingsPanel } from './settings/SettingsPanel.js';
import { useActiveProvider } from './providers/active-provider.js';
import { BoardListPage } from './pages/BoardListPage.js';
import { BoardPage } from './pages/BoardPage.js';
import { ConflictProvider } from './sync/conflict-store.js';
import { ConflictBanner } from './components/ConflictBanner.js';

/**
 * Context for breadcrumb segments. Pages can push their segment via this context.
 * Each segment: { label: string; to?: string }
 */
export interface BreadcrumbSegment {
  label: string;
  to?: string;
}

export const BreadcrumbContext = createContext<{
  segments: BreadcrumbSegment[];
  setSegments: (s: BreadcrumbSegment[]) => void;
}>({
  segments: [],
  setSegments: () => undefined,
});

/**
 * Route-aware breadcrumb hook — used by pages to push their path segment.
 */
export function useBreadcrumb(): { setSegments: (s: BreadcrumbSegment[]) => void } {
  return useContext(BreadcrumbContext);
}

/**
 * Top-level application component.
 * Renders the app chrome (header with connection indicator + theme toggle)
 * and the routed content area:
 *   /              → BoardListPage (lists all boards)
 *   /boards/:slug  → BoardPage (single board by slug)
 */
export function App(): React.ReactElement {
  const { isSwitching } = useActiveProvider();
  const [settingsOpen, setSettingsOpen] = useState(false);
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
    <BreadcrumbContext.Provider
      value={{ segments: breadcrumbSegments, setSegments: setBreadcrumbSegments }}
    >
      <ConflictProvider>
        <TopBar onSettingsToggle={() => setSettingsOpen((o) => !o)} />
        <ConflictBanner />
        <div className="flex-1 overflow-hidden">
          {content}
        </div>
        {settingsOpen && (
          <SettingsPanel onClose={() => setSettingsOpen(false)} />
        )}
      </ConflictProvider>
    </BreadcrumbContext.Provider>
  );
}

