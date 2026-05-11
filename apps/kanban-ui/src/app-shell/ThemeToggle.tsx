import React from 'react';
import { useTheme } from '../state/theme-store.js';

/**
 * Theme toggle button — delegates to useTheme() from theme-store.
 * ☀ = currently light (click to switch to dark)
 * ☾ = currently dark (click to switch to light)
 */
export function ThemeToggle(): React.ReactElement {
  const { theme, toggle } = useTheme();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
      title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
      data-testid="theme-toggle"
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--ink-muted)',
        fontSize: '14px',
        padding: '2px 4px',
        lineHeight: 1,
      }}
    >
      {theme === 'light' ? '☀' : '☾'}
    </button>
  );
}
