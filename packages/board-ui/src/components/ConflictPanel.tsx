import React, { useState, useCallback } from 'react';
import type { ResolveDecision } from '@awesome-markdown/contracts';
import { useConflict } from '../sync/conflict-store.js';
import { ConflictDiff } from './ConflictDiff.js';

interface ConflictPanelProps {
  onClose: () => void;
}

/**
 * Modal panel for resolving merge conflicts.
 *
 * Lists each conflicting path with a side-by-side diff and two action buttons:
 *  - "Use mine"    → 'ours'
 *  - "Use remote"  → 'theirs'
 *
 * The Submit button is enabled only when every path has a decision.
 */
export function ConflictPanel({ onClose }: ConflictPanelProps): React.ReactElement | null {
  const { activeConflict, submitting, resolve } = useConflict();
  const [decisions, setDecisions] = useState<Record<string, ResolveDecision>>(() => {
    const init: Record<string, ResolveDecision> = {};
    for (const entry of activeConflict?.paths ?? []) {
      if (entry.decision === 'ours' || entry.decision === 'theirs') {
        init[entry.path] = entry.decision;
      }
    }
    return init;
  });
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (!activeConflict) return null;

  const setDecision = useCallback(
    (filePath: string, decision: ResolveDecision) => {
      setDecisions((prev) => ({ ...prev, [filePath]: decision }));
    },
    [],
  );

  const canSubmit =
    activeConflict.paths.every(
      (entry) => decisions[entry.path] === 'ours' || decisions[entry.path] === 'theirs',
    ) && !submitting;

  const handleSubmit = useCallback(async () => {
    setSubmitError(null);
    try {
      await resolve(decisions);
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submit failed');
    }
  }, [decisions, resolve, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Resolve merge conflicts"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      data-testid="conflict-panel"
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-6xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
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

        {/* Path cards list — scrollable region */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {activeConflict.paths.map((entry) => {
            const decision = decisions[entry.path];
            return (
              <div
                key={entry.path}
                className="border border-gray-200 rounded-lg overflow-hidden"
                data-testid={`conflict-path-${entry.path.replace(/\//g, '-')}`}
              >
                {/* Path header */}
                <div className="flex items-center justify-between gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200">
                  <code className="text-sm font-mono text-gray-700 break-all">
                    {entry.path}
                  </code>
                  <span className="text-xs text-gray-400 flex-shrink-0" data-testid={`conflict-status-${entry.path}`}>
                    {decision === 'ours' ? '✓ Use mine'
                    : decision === 'theirs' ? '✓ Use remote'
                    : '⬜ Unresolved'}
                  </span>
                </div>

                {/* Side-by-side diff */}
                <div className="p-3">
                  <ConflictDiff
                    path={entry.path}
                    oursLabel={entry.oursLabel}
                    theirsLabel={entry.theirsLabel}
                    oursContent={entry.oursContent}
                    theirsContent={entry.theirsContent}
                    oursTruncated={entry.oursTruncated}
                    theirsTruncated={entry.theirsTruncated}
                  />
                </div>

                {/* Decision buttons */}
                <div className="flex gap-2 px-4 pb-4">
                  <button
                    type="button"
                    onClick={() => setDecision(entry.path, 'ours')}
                    disabled={submitting}
                    className={`text-xs px-3 py-1.5 rounded border font-medium transition-colors ${
                      decision === 'ours'
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
                      decision === 'theirs'
                        ? 'bg-green-600 text-white border-green-600'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                    data-testid={`conflict-theirs-${entry.path}`}
                  >
                    Use remote ({entry.theirsLabel})
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex-shrink-0 space-y-2">
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
