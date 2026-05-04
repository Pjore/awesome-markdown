import React, { useState, createContext, useContext } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { ConnectionIndicator } from './app-shell/ConnectionIndicator.js';
import { ThemeToggle } from './app-shell/ThemeToggle.js';
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

export function useBreadcrumb(): { setSegments: (s: BreadcrumbSegment[]) => void } {
  return useContext(BreadcrumbContext);
}

/**
 * Breadcrumb rendered in the top bar center.
 * Shows path-style: boards / board-slug
 */
function TopBarBreadcrumb(): React.ReactElement {
  const { segments } = useContext(BreadcrumbContext);
  useLocation();

  // Default: on "/" just show "boards"
  const allSegments: BreadcrumbSegment[] =
    segments.length > 0 ? segments : [{ label: 'boards', to: '/' }];

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1 text-xs"
      style={{ fontFamily: 'var(--font-mono)' }}
      data-testid="breadcrumb"
    >
      {allSegments.map((seg, i) => (
        <React.Fragment key={`${seg.label}-${i}`}>
          {i > 0 && (
            <span style={{ color: 'var(--ink-muted)' }} aria-hidden="true">
              {' / '}
            </span>
          )}
          {seg.to !== undefined ? (
            <Link
              to={seg.to}
              style={{ color: 'var(--ink-muted)', textDecoration: 'none' }}
              className="hover:underline"
            >
              {seg.label}
            </Link>
          ) : (
            <span style={{ color: 'var(--ink)' }}>{seg.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
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
            className="flex flex-col items-center justify-center h-full text-center p-8"
            data-testid="not-found"
          >
            <div className="text-5xl mb-4">🤷</div>
            <h2
              className="text-xl mb-4"
              style={{ fontWeight: 500, color: 'var(--ink)' }}
            >
              Page not found
            </h2>
            <Link
              to="/"
              style={{ color: 'var(--ink-muted)', textDecoration: 'underline' }}
              data-testid="go-home"
            >
              ← Back to boards
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
        <header
          className="flex items-center justify-between px-4 py-2 flex-shrink-0"
          style={{
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg)',
            height: '36px',
            minHeight: '36px',
          }}
          data-testid="app-header"
        >
          {/* Left: product mark */}
          <button
            type="button"
            onClick={() => setSettingsOpen((o) => !o)}
            style={{
              fontFamily: 'var(--font-mono)',
              fontWeight: 400,
              fontSize: '13px',
              color: 'var(--ink)',
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
            }}
            aria-label="awesome-markdown — click to open settings"
            title="Provider settings"
            data-testid="home-link"
          >
            awesome-markdown
          </button>

          {/* Center: breadcrumb */}
          <TopBarBreadcrumb />

          {/* Right: connection indicator + theme toggle */}
          <div className="flex items-center gap-2">
            <ConnectionIndicator />
            <ThemeToggle />
          </div>
        </header>
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

