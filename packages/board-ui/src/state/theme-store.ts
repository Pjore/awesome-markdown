import { useState, useEffect, useCallback } from 'react';

type Theme = 'light' | 'dark';

/** Read the persisted theme from localStorage, or null if unavailable. */
function readStorage(): Theme | null {
  try {
    const stored = localStorage.getItem('theme');
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // localStorage unavailable (e.g. private browsing, security policy)
  }
  return null;
}

/** Write theme to localStorage; silently ignores storage errors. */
function writeStorage(theme: Theme): void {
  try {
    localStorage.setItem('theme', theme);
  } catch {
    // unavailable — in-memory only
  }
}

/** Detect OS colour-scheme preference. */
function detectOsTheme(): Theme {
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

/** Apply theme to the document root element. */
function applyTheme(theme: Theme): void {
  document.documentElement.dataset['theme'] = theme;
}

/**
 * React hook for theme management.
 *
 * - Reads initial value from localStorage, falls back to `prefers-color-scheme`.
 * - On change: writes `document.documentElement.dataset.theme` and localStorage.
 * - localStorage unavailable → in-memory only, no error surfaced.
 *
 * UC-6: Theme toggles light↔dark, persists to localStorage, hydrates from OS pref.
 */
export function useTheme(): { theme: Theme; toggle(): void; set(t: Theme): void } {
  const [theme, setThemeState] = useState<Theme>(() => readStorage() ?? detectOsTheme());

  // Sync to DOM on mount and whenever theme changes
  useEffect(() => {
    applyTheme(theme);
    writeStorage(theme);
  }, [theme]);

  const toggle = useCallback((): void => {
    setThemeState((t) => (t === 'light' ? 'dark' : 'light'));
  }, []);

  const set = useCallback((t: Theme): void => {
    setThemeState(t);
  }, []);

  return { theme, toggle, set };
}
