import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { urlValidationMessage } from '../settings/url-validation.js';
import type { ProviderSettings } from '../settings/provider-settings.js';
import { useActiveProvider } from '../providers/active-provider.js';
import { useBreadcrumb } from '../App.js';

/**
 * Full-page settings — route /settings.
 * Provider selection: localStorage or HTTP/SSE sidecar.
 * Save rebinds the active provider and returns to the boards list.
 */
export function SettingsPage(): React.ReactElement {
  const { activeSettings, rebind, isSwitching } = useActiveProvider();
  const navigate = useNavigate();
  const { setSegments } = useBreadcrumb();

  const [kind, setKind] = useState<ProviderSettings['kind']>(activeSettings.kind);
  const [baseUrl, setBaseUrl] = useState(
    activeSettings.kind === 'http'
      ? activeSettings.baseUrl
      : (import.meta.env['VITE_PROVIDER_FS_URL'] ?? 'http://localhost:7701'),
  );
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [saving, setSaving] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  const urlError = kind === 'http' ? urlValidationMessage(baseUrl) : null;
  const canSave = !saving && !isSwitching && urlError === null;

  useEffect(() => {
    setSegments([{ label: 'boards', to: '/' }, { label: 'settings' }]);
    return () => setSegments([]);
  }, [setSegments]);

  const handleTestConnection = useCallback(async () => {
    if (kind !== 'http' || urlValidationMessage(baseUrl) !== null) return;
    setTestStatus('testing');
    setTestError(null);
    try {
      const resp = await fetch(`${baseUrl.replace(/\/$/, '')}/health`, {
        signal: AbortSignal.timeout(5000),
      });
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
      navigate('/');
    } finally {
      setSaving(false);
    }
  }, [kind, baseUrl, rebind, navigate]);

  return (
    <div className="p-8 max-w-2xl mx-auto" data-testid="settings-page">
      <h2
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '13px',
          fontWeight: 500,
          color: 'var(--ink)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: '32px',
        }}
      >
        Provider Settings
      </h2>

      <div className="space-y-6">
        {/* Provider selection */}
        <fieldset className="space-y-3" style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: 'var(--ink-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: '8px',
            }}
          >
            Active provider
          </legend>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="provider-kind"
              value="localStorage"
              checked={kind === 'localStorage'}
              onChange={() => setKind('localStorage')}
              data-testid="provider-radio-localStorage"
            />
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--ink)' }}>
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
              data-testid="provider-radio-http"
            />
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--ink)' }}>
              <strong>Local FS sidecar</strong> — HTTP/SSE
            </span>
          </label>
        </fieldset>

        {/* HTTP URL input */}
        {kind === 'http' && (
          <div className="space-y-2">
            <label
              htmlFor="sidecar-url"
              style={{
                display: 'block',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: 'var(--ink-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
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
              placeholder={import.meta.env['VITE_PROVIDER_FS_URL'] ?? 'http://localhost:7701'}
              className="w-full px-3 py-2"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--ink)',
                outline: 'none',
              }}
              aria-describedby={urlError !== null ? 'url-error' : undefined}
              data-testid="sidecar-url-input"
            />
            {urlError !== null && (
              <p
                id="url-error"
                role="alert"
                style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--ink)', margin: 0 }}
                data-testid="url-error"
              >
                {urlError}
              </p>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void handleTestConnection()}
                disabled={urlError !== null || testStatus === 'testing'}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  padding: '3px 10px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--ink)',
                  cursor: urlError !== null || testStatus === 'testing' ? 'not-allowed' : 'pointer',
                  opacity: urlError !== null || testStatus === 'testing' ? 0.5 : 1,
                }}
                data-testid="test-connection-btn"
              >
                {testStatus === 'testing' ? 'Testing…' : 'Test connection'}
              </button>
              {testStatus === 'ok' && (
                <span
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--ink)' }}
                  data-testid="test-status-ok"
                >
                  ✓ Connected
                </span>
              )}
              {testStatus === 'fail' && (
                <span
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--ink-muted)' }}
                  data-testid="test-status-fail"
                >
                  ✗ {testError ?? 'Failed'}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Current active provider info */}
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--ink-muted)',
            margin: 0,
          }}
        >
          Current:{' '}
          <strong>
            {activeSettings.kind === 'http'
              ? `HTTP/SSE — ${activeSettings.baseUrl}`
              : 'localStorage'}
          </strong>
        </p>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              padding: '5px 14px',
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              color: 'var(--ink)',
              cursor: 'pointer',
            }}
            data-testid="settings-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!canSave}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              padding: '5px 14px',
              border: '1px solid var(--border)',
              background: canSave ? 'var(--accent)' : 'var(--bg)',
              color: canSave ? 'var(--on-accent)' : 'var(--ink)',
              cursor: canSave ? 'pointer' : 'not-allowed',
              opacity: canSave ? 1 : 0.5,
            }}
            data-testid="settings-save"
          >
            {saving || isSwitching ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
