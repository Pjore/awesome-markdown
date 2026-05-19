import React, { useEffect, useState } from 'react';
import { userManager, isAuthEnabled, login } from '../lib/auth.js';
import type { User } from 'oidc-client-ts';

interface AuthGateProps {
  children: React.ReactNode;
}

/**
 * When auth is enabled (VITE_ZITADEL_ISSUER + VITE_CLIENT_ID are set):
 *   - Checks for a signed-in user.
 *   - Shows a "Sign in" screen if not authenticated.
 *   - Renders children when authenticated.
 *
 * When auth is disabled, renders children immediately.
 */
export function AuthGate({ children }: AuthGateProps): React.ReactElement {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    if (!isAuthEnabled || !userManager) {
      setUser(null); // treat as "no auth needed"
      return;
    }

    userManager.getUser()
      .then(setUser)
      .catch(() => { setUser(null); });

    // Update when user signs in / out / token refreshes
    const onUserLoaded = (u: User): void => { setUser(u); };
    const onUserUnloaded = (): void => { setUser(null); };

    userManager.events.addUserLoaded(onUserLoaded);
    userManager.events.addUserUnloaded(onUserUnloaded);

    return () => {
      userManager!.events.removeUserLoaded(onUserLoaded);
      userManager!.events.removeUserUnloaded(onUserUnloaded);
    };
  }, []);

  // Still checking
  if (user === undefined) {
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
        loading…
      </div>
    );
  }

  // Not signed in (and auth is required)
  if (isAuthEnabled && (user === null || user.expired)) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          gap: '20px',
          background: 'var(--bg)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontWeight: 400,
            fontSize: '18px',
            color: 'var(--ink)',
            letterSpacing: '-0.01em',
          }}
        >
          awesome-markdown
        </span>
        <button
          onClick={() => { void login(); }}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '13px',
            padding: '6px 16px',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            background: 'var(--bg)',
            color: 'var(--ink)',
            cursor: 'pointer',
          }}
          data-testid="sign-in-btn"
        >
          sign in
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
