import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Breadcrumb } from './Breadcrumb.js';
import { SyncStatusDot } from './SyncStatusDot.js';
import { ThemeToggle } from './ThemeToggle.js';
import { isAuthEnabled, logout, userManager } from '../lib/auth.js';
import type { User } from 'oidc-client-ts';

/**
 * Persistent hairline top bar (~36px).
 * Left:   product mark (links to boards home)
 * Center: breadcrumb path
 * Right:  sync status dot (links to settings) + theme toggle
 * Bottom: 1px solid var(--border) hairline separator
 */
export function TopBar(): React.ReactElement {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    if (!isAuthEnabled || !userManager) return;
    userManager.getUser().then((u) => { setSignedIn(Boolean(u && !u.expired)); }).catch(() => undefined);
    const onLoaded = (u: User): void => { setSignedIn(Boolean(u && !u.expired)); };
    const onUnloaded = (): void => { setSignedIn(false); };
    userManager.events.addUserLoaded(onLoaded);
    userManager.events.addUserUnloaded(onUnloaded);
    return () => {
      userManager!.events.removeUserLoaded(onLoaded);
      userManager!.events.removeUserUnloaded(onUnloaded);
    };
  }, []);

  return (
    <header
      className="flex items-center justify-between px-4 flex-shrink-0"
      style={{
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg)',
        height: '36px',
        minHeight: '36px',
      }}
      data-testid="app-header"
    >
      {/* Left: product mark */}
      <Link
        to="/"
        style={{
          fontFamily: 'var(--font-mono)',
          fontWeight: 400,
          fontSize: '13px',
          color: 'var(--ink)',
          textDecoration: 'none',
          flexShrink: 0,
        }}
        aria-label="awesome-markdown — go to boards"
        data-testid="home-link"
      >
        awesome-markdown
      </Link>

      {/* Center: breadcrumb */}
      <Breadcrumb />

      {/* Right: sync dot (→ settings) + theme toggle */}
      <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
        <Link
          to="/settings"
          aria-label="Open settings"
          title="Provider settings"
          style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}
          data-testid="settings-btn"
        >
          <SyncStatusDot />
        </Link>
        <ThemeToggle />
        {isAuthEnabled && signedIn && (
          <button
            onClick={() => { void logout(); }}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              padding: '2px 8px',
              border: '1px solid var(--border)',
              borderRadius: '3px',
              background: 'transparent',
              color: 'var(--ink-muted)',
              cursor: 'pointer',
            }}
            data-testid="sign-out-btn"
            title="Sign out"
          >
            sign out
          </button>
        )}
      </div>
    </header>
  );
}
