import React, { useState, useCallback } from 'react';
import type { ResolveDecision } from '@awesome-markdown/contracts';
import { useConflict } from '../sync/conflict-store.js';

interface ConflictPanelProps {
  onClose: () => void;
}

type LocalDecisions = Record<string, ResolveDecision | 'external'>;

function statusLabel(decision: ResolveDecision | null | undefined): string {
  if (decision === 'ours') return '✓ Use mine';
  if (decision === 'theirs') return '✓ Use remote';
  if (decision === 'external') return '⏳ External — choose ours/theirs to finalize';
  return '⬜ Unresolved';
}

/**
 * Modal panel for resolving merge conflicts.
 *
 * Lists each conflicting path with three action buttons:
 *  - "Use mine"         → 'ours'
 *  - "Use remote"       → 'theirs'
 *  - "Open externally"  → calls sync-engine open endpoint
 *
 * The Submit button is enabled only when every path has a final (ours/theirs)
 * decision — external decisions must be followed by ours/theirs to unlock.
 */
export function ConflictPanel({ onClose }: ConflictPanelProps): React.ReactElement | null {
  const { activeConflict, submitting, resolve, openExternal } = useConflict();
  const [localDecisions, setLocalDecisions] = useState<LocalDecisions>(() => {
    const init: LocalDecisions = {};
    for (const entry of activeConflict?.paths ?? []) {
      if (entry.decision) init[entry.path] = entry.decision;
    }
    return init;
  });
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (!activeConflict) return null;

  const setDecision = useCallback(
    (filePath: string, decision: ResolveDecision) => {
      setLocalDecisions((prev) => ({ ...prev, [filePath]: decision }));
    },
    [],
  );

  const handleOpenExternal = useCallback(
    async (filePath: string) => {
      await openExternal(filePath);
      setLocalDecisions((prev) => ({ ...prev, [filePath]: 'external' }));
    },
    [openExternal],
  );

  // Submit is enabled when every path has ours or theirs (not external, not unresolved)
  const canSubmit = activeConflict.paths.every(
    (entry) => {
      const d = localDecisions[entry.path];
      return d === 'ours' || d === 'theirs';
    },
  ) && !submitting;

  const handleSubmit = useCallback(async () => {
    setSubmitError(null);
    try {
      const finalDecisions: Record<string, ResolveDecision> = {};
      for (const [p, d] of Object.entries(localDecisions)) {
        if (d === 'ours' || d === 'theirs') finalDecisions[p] = d;
      }
      await resolve(finalDecisions);
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submit failed');
    }
  }, [localDecisions, resolve, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Resolve merge conflicts"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      data-testid="conflict-panel"
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">
            Resolve Merge Conflicts
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close conflict panel"
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            data-testid="conflict-panel-close"
          >
            ✕
          </button>
        </div>

        {/* Path list */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {activeConflict.paths.map((entry) => {
            const local = localDecisions[entry.path];
            return (
              <div
                key={entry.path}
                className="border border-gray-200 rounded-lg p-4 space-y-3"
                data-testid={`conflict-path-${entry.path.replace(/\//g, '-')}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <code className="text-sm font-mono text-gray-700 break-all flex-1">
                    {entry.path}
                  </code>
                  <span
                    className="text-xs text-gray-400 flex-shrink-0"
                    data-testid={`conflict-status-${entry.path}`}
                  >
                    {statusLabel(local ?? entry.decision)}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setDecision(entry.path, 'ours')}
                    disabled={submitting}
                    className={`text-xs px-3 py-1.5 rounded border font-medium transition-colors ${
                      local === 'ours'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                    data-testid={`conflict-ours-${entry.path}`}
                  >
                    Use mine ({entry.oursLabel})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDecision(entry.path, 'theirs')}
                    disabled={submitting}
                    className={`text-xs px-3 py-1.5 rounded border font-medium transition-colors ${
                      local === 'theirs'
                        ? 'bg-green-600 text-white border-green-600'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                    data-testid={`conflict-theirs-${entry.path}`}
                  >
                    Use remote ({entry.theirsLabel})
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleOpenExternal(entry.path)}
                    disabled={submitting}
                    className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 font-medium transition-colors"
                    data-testid={`conflict-external-${entry.path}`}
                  >
                    Open externally
                  </button>
                </div>

                {local === 'external' && (
                  <p
                    className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-1"
                    data-testid={`conflict-external-pending-${entry.path}`}
                  >
                    File opened in external editor. Choose &ldquo;Use mine&rdquo; or
                    &ldquo;Use remote&rdquo; once you have finished editing.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 space-y-2">
          {submitError && (
            <p className="text-sm text-red-600" data-testid="conflict-submit-error">
              {submitError}
            </p>
          )}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
              data-testid="conflict-panel-cancel"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!canSubmit}
              className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              data-testid="conflict-submit-btn"
            >
              {submitting ? 'Resolving…' : 'Resolve conflicts'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
