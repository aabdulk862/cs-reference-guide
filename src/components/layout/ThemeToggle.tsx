import { useCallback, useEffect, useState } from 'react';
import { get, set } from '@/utils/storage';

type Theme = 'light' | 'dark';

/**
 * Returns the system's preferred color scheme.
 */
function getSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/**
 * Applies the given theme to the document root element.
 */
function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
}

/**
 * ThemeToggle component.
 * Renders a button that toggles between light and dark themes.
 * Persists preference to localStorage via the storage utility (csguide:theme).
 * Defaults to system preference via prefers-color-scheme, then respects stored preference.
 *
 * Requirements: 1.9, 2.9
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = get<Theme | null>('theme', null);
    return stored ?? getSystemTheme();
  });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Listen for system theme changes when no stored preference exists
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
    const handler = (e: MediaQueryListEvent) => {
      const stored = get<Theme | null>('theme', null);
      if (!stored) {
        const newTheme = e.matches ? 'light' : 'dark';
        setTheme(newTheme);
      }
    };
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const toggleTheme = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    set('theme', next);
  }, [theme]);

  return (
    <button
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      type="button"
    >
      {theme === 'dark' ? (
        <svg
          className="theme-toggle__icon"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {/* Sun icon - shown in dark mode to indicate clicking switches to light */}
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        <svg
          className="theme-toggle__icon"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {/* Moon icon - shown in light mode to indicate clicking switches to dark */}
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
