import { useEffect, useState, useSyncExternalStore } from 'react';
import { session } from './session';

export function useSession() {
  return useSyncExternalStore(session.subscribe, session.get, session.get);
}

export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export type Theme = 'light' | 'dark' | 'system';

export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem('lumen-theme');
      return saved === 'light' || saved === 'dark' ? saved : 'system';
    } catch {
      return 'system';
    }
  });

  const setTheme = (next: Theme) => {
    setThemeState(next);
    try {
      if (next === 'system') localStorage.removeItem('lumen-theme');
      else localStorage.setItem('lumen-theme', next);
    } catch {
      /* storage unavailable: theme still applies for this visit */
    }
    if (next === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
  };

  return [theme, setTheme];
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · Lumen` : 'Lumen';
  }, [title]);
}
