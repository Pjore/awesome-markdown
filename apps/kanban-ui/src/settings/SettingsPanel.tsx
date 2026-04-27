import React, { useState, useCallback } from 'react';
import { urlValidationMessage } from './url-validation.js';
import type { ProviderSettings } from './provider-settings.js';
import { useActiveProvider } from '../providers/active-provider.js';

interface SettingsPanelProps {
  onClose: () => void;
}

/**
 * Settings panel modal for runtime provider selection.
 *
 * Lets the user choose:
 *   - Local browser storage (localStorage)
 *   - Local FS sidecar (HTTP/SSE) with a base URL input
 *
 * Validates URL format and performs a lightweight health check before saving.
 * Persists selection and triggers provider rebind on save.
 */
export function SettingsPanel({ onClose }: SettingsPanelProps): React.ReactElement {
  const { activeSettings, rebind, isSwitching } = useActiveProvider();

  const [kind, setKind] = useState<ProviderSettings['kind']>(activeSettings.kind);
  const [baseUrl, setBaseUrl] = useState(
    activeSettings.kind === 'http' ? activeSettings.baseUrl : 'http://localhost:3001',
  );
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [saving, setSaving] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  const urlError = kind === 'http' ? urlValidationMessage(baseUrl) : null;
  const canSave = !saving && !isSwitching && urlError === null;

  const handleTestConnection = useCallback(async () => {
    if (kind !== 'http' || urlValidationMessage(baseUrl) !== null) return;
    setTestStatus('testing');
    setTestError(null);
    try {
      const resp = await fetch(`${baseUrl.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(5000) });
      if (resp.ok) {
        setTestStatus('ok');
      } else {
        setTestStatus('fail');
        setTestError(`Sidecar returned HTTP ${resp.status}`);
      }
    } catch (err) {
      setTestStatus('fail');
      setTestError(err instanceof Error ? err.message : 'Connection failed');
    }
  }, [kind, baseUrl]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const settings: ProviderSettings =
        kind === 'http' ? { kind: 'http', baseUrl: baseUrl.trim() } : { kind: 'localStorage' };
      await rebind(settings);
      onClose();
    } finally {
      setSaving(false);
    }
  }, [kind, baseUrl, rebind, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Provider settings"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      data-testid="settings-panel"
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-5 mx-4">
        <h2 className="text-lg font-semibold text-gray-800">Provider Settings</h2>

        {/* Provider selection */}
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-gray-600 mb-2">Active provider</legend>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="provider-kind"
              value="localStorage"
              checked={kind === 'localStorage'}
              onChange={() => setKind('localStorage')}
              className="accent-blue-600"
              data-testid="provider-radio-localStorage"
            />
            <span className="text-sm text-gray-700">
              <strong>Local browser storage</strong> — no server required
            </span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="provider-kind"
              value="http"
              checked={kind === 'http'}
              onChange={() => setKind('http')}
              className="accent-blue-600"
              data-testid="provider-radio-http"
            />
            <span className="text-sm text-gray-700">
              <strong>Local FS sidecar</strong> — HTTP/SSE
            </span>
          </label>
        </fieldset>

        {/* HTTP URL input */}
        {kind === 'http' && (
          <div className="space-y-2">
            <label htmlFor="sidecar-url" className="block text-sm font-medium text-gray-600">
              Sidecar base URL
            </label>
            <input
              id="sidecar-url"
              type="url"
              value={baseUrl}
              onChange={(e) => {
                setBaseUrl(e.target.value);
                setTestStatus('idle');
              }}
              placeholder="http://localhost:3001"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-describedby={urlError !== null ? 'url-error' : undefined}
              data-testid="sidecar-url-input"
            />
            {urlError !== null && (
              <p id="url-error" role="alert" className="text-xs text-red-600" data-testid="url-error">
                {urlError}
              </p>
            )}

            {/* Test connection */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void handleTestConnection()}
                disabled={urlError !== null || testStatus === 'testing'}
                className="text-xs px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                data-testid="test-connection-btn"
              >
                {testStatus === 'testing' ? 'Testing…' : 'Test connection'}
              </button>
              {testStatus === 'ok' && (
                <span className="text-xs text-green-600" data-testid="test-status-ok">✓ Connected</span>
              )}
              {testStatus === 'fail' && (
                <span className="text-xs text-red-600" data-testid="test-status-fail">
                  ✗ {testError ?? 'Failed'}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Current active provider info */}
        <p className="text-xs text-gray-400">
          Current:{' '}
          <strong>
            {activeSettings.kind === 'http'
              ? `HTTP/SSE — ${activeSettings.baseUrl}`
              : 'localStorage'}
          </strong>
        </p>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"
            data-testid="settings-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!canSave}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
            data-testid="settings-save"
          >
            {saving || isSwitching ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
