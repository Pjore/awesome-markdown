import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { handleCallback } from '../lib/auth.js';

/**
 * Handles the Zitadel PKCE redirect callback.
 * Reads the authorization code from the URL, exchanges it for tokens via
 * oidc-client-ts, then redirects to '/'.
 */
export function AuthCallbackPage(): React.ReactElement {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    handleCallback()
      .then(() => { navigate('/', { replace: true }); })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error !== null) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          fontFamily: 'var(--font-mono)',
          color: 'var(--ink-muted)',
          gap: '12px',
        }}
      >
        <span style={{ fontSize: '13px' }}>auth callback failed: {error}</span>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily: 'var(--font-mono)',
        color: 'var(--ink-muted)',
        fontSize: '13px',
      }}
    >
      signing in…
    </div>
  );
}
