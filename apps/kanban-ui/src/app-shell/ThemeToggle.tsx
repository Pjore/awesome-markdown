import React, { useState, useEffect } from 'react';

/**
 * Theme toggle button — reads/writes [data-theme] on <html> and persists to localStorage.
 * ☀ = currently light (click to switch to dark)
 * ☾ = currently dark (click to switch to light)
 */
export function ThemeToggle(): React.ReactElement {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const stored = localStorage.getItem('theme');
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggle = (): void => {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'));
  };

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
