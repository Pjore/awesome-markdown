import React from 'react';
import { Link } from 'react-router-dom';
import { Breadcrumb } from './Breadcrumb.js';
import { SyncStatusDot } from './SyncStatusDot.js';
import { ThemeToggle } from './ThemeToggle.js';

/**
 * Persistent hairline top bar (~36px).
 * Left:   product mark (links to boards home)
 * Center: breadcrumb path
 * Right:  sync status dot (links to settings) + theme toggle
 * Bottom: 1px solid var(--border) hairline separator
 */
export function TopBar(): React.ReactElement {
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
      </div>
    </header>
  );
}
