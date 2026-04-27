import React, { useState } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { ConnectionIndicator } from './app-shell/ConnectionIndicator.js';
import { SettingsPanel } from './settings/SettingsPanel.js';
import { useActiveProvider } from './providers/active-provider.js';
import { BoardListPage } from './pages/BoardListPage.js';
import { BoardPage } from './pages/BoardPage.js';
import { ConflictProvider } from './sync/conflict-store.js';
import { ConflictBanner } from './components/ConflictBanner.js';

/**
 * Top-level application component.
 * Renders the app chrome (header with connection indicator + settings button)
 * and the routed content area:
 *   /              → BoardListPage (lists all boards)
 *   /boards/:slug  → BoardPage (single board by slug)
 */
export function App(): React.ReactElement {
  const { isSwitching } = useActiveProvider();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const content = isSwitching ? (
    <div
      className="flex items-center justify-center h-full"
      data-testid="switching-provider"
    >
      <span className="text-gray-400 text-lg">Switching provider…</span>
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
            <h2 className="text-xl font-bold text-gray-700 mb-4">Page not found</h2>
            <Link
              to="/"
              className="text-blue-600 hover:underline"
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
    <ConflictProvider>
      <header
        className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 flex-shrink-0 gap-3"
        data-testid="app-header"
      >
        <Link
          to="/"
          className="text-sm font-semibold text-gray-700 truncate hover:text-blue-600 transition-colors"
          data-testid="home-link"
        >
          awesome-markdown
        </Link>
        <div className="flex items-center gap-2">
          <ConnectionIndicator />
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Open provider settings"
            title="Provider settings"
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
            data-testid="settings-btn"
          >
            ⚙
          </button>
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
  );
}
