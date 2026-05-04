import React from 'react';
import { Breadcrumb } from './Breadcrumb.js';
import { SyncStatusDot } from './SyncStatusDot.js';
import { ThemeToggle } from './ThemeToggle.js';

interface TopBarProps {
  onSettingsToggle: () => void;
}

/**
 * Persistent hairline top bar (~36px).
 * Left:   product mark (button — opens settings)
 * Center: breadcrumb path
 * Right:  sync status dot + theme toggle
 * Bottom: 1px solid var(--border) hairline separator
 */
export function TopBar({ onSettingsToggle }: TopBarProps): React.ReactElement {
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
      <button
        type="button"
        onClick={onSettingsToggle}
        style={{
          fontFamily: 'var(--font-mono)',
          fontWeight: 400,
          fontSize: '13px',
          color: 'var(--ink)',
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          flexShrink: 0,
        }}
        aria-label="awesome-markdown — click to open settings"
        title="Provider settings"
        data-testid="settings-btn"
      >
        awesome-markdown
      </button>

      {/* Center: breadcrumb */}
      <Breadcrumb />

      {/* Right: sync dot + theme toggle */}
      <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
        <SyncStatusDot />
        <ThemeToggle />
      </div>
    </header>
  );
}
