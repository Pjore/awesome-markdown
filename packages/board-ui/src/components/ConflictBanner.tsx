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
          className="flex items-center justify-between gap-3 px-4 py-2 flex-shrink-0"
          style={{
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg)',
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
          }}
          role="alert"
          aria-live="polite"
          data-testid="conflict-banner"
          data-conflict-merge-id={activeConflict.mergeId}
        >
          <div className="flex items-center gap-2">
            <span style={{ color: 'var(--ink-muted)' }} aria-hidden="true">⚠</span>
            <span style={{ color: 'var(--ink)' }}>
              Merge conflict:{' '}
              <strong>{activeConflict.pendingPaths.length}</strong>{' '}
              unresolved path{activeConflict.pendingPaths.length !== 1 ? 's' : ''}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              padding: '2px 8px',
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              color: 'var(--ink)',
              cursor: 'pointer',
            }}
            data-testid="conflict-resolve-btn"
          >
            Resolve
          </button>
        </div>
      )}

      {error && (
        <div
          className="flex items-center justify-between gap-3 px-4 py-2 flex-shrink-0"
          style={{
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg)',
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
          }}
          role="alert"
          data-testid="conflict-error-banner"
        >
          <span style={{ color: 'var(--ink)' }}>{error}</span>
          <button
            type="button"
            onClick={dismissError}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              padding: '2px 6px',
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              color: 'var(--ink-muted)',
              cursor: 'pointer',
            }}
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
