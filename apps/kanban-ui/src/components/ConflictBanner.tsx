import React, { useState, useCallback } from 'react';
import type { ResolveDecision } from '@awesome-markdown/contracts';
import { useConflict } from '../sync/conflict-store.js';
import { ConflictPanel } from './ConflictPanel.js';

/**
 * Persistent banner shown when an active merge conflict exists.
 *
 * - Displays the number of affected paths.
 * - Shows a "Resolve" button that opens the ConflictPanel.
 * - Persists until the conflict is cleared via a `synced` SSE event.
 *
 * The banner renders nothing when there is no active conflict.
 */
export function ConflictBanner(): React.ReactElement | null {
  const { activeConflict, error, dismissError } = useConflict();
  const [panelOpen, setPanelOpen] = useState(false);

  if (!activeConflict && !error) return null;

  return (
    <>
      {activeConflict && (
        <div
          className="flex items-center justify-between gap-3 px-4 py-2 bg-amber-50 border-b border-amber-200 flex-shrink-0"
          role="alert"
          aria-live="polite"
          data-testid="conflict-banner"
          data-conflict-merge-id={activeConflict.mergeId}
        >
          <div className="flex items-center gap-2">
            <span className="text-amber-600 text-lg" aria-hidden="true">⚠️</span>
            <span className="text-sm font-medium text-amber-800">
              Merge conflict:{' '}
              <strong>{activeConflict.pendingPaths.length}</strong>{' '}
              unresolved path{activeConflict.pendingPaths.length !== 1 ? 's' : ''}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className="text-sm px-3 py-1 rounded border border-amber-400 bg-white text-amber-700 hover:bg-amber-50 transition-colors font-medium"
            data-testid="conflict-resolve-btn"
          >
            Resolve
          </button>
        </div>
      )}

      {error && (
        <div
          className="flex items-center justify-between gap-3 px-4 py-2 bg-red-50 border-b border-red-200 flex-shrink-0"
          role="alert"
          data-testid="conflict-error-banner"
        >
          <span className="text-sm text-red-700">{error}</span>
          <button
            type="button"
            onClick={dismissError}
            className="text-xs px-2 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50"
            data-testid="conflict-error-dismiss"
          >
            Dismiss
          </button>
        </div>
      )}

      {panelOpen && (
        <ConflictPanel onClose={() => setPanelOpen(false)} />
      )}
    </>
  );
}
