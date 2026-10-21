import { useEffect, useState } from 'react';
import { ChevronDown, Monitor, Moon, Sun } from 'lucide-react';

type Theme = 'system' | 'light' | 'dark';
const storageKey = 'fleet-theme';
const parseTheme = (value: string | null | undefined): Theme =>
  value === 'light' || value === 'dark' ? value : 'system';

export function ThemePicker() {
  const [theme, setTheme] = useState(() => parseTheme(document.documentElement.dataset.theme));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const system = window.matchMedia('(prefers-color-scheme: dark)');
    const updateBrowserColor = () => {
      const dark = theme === 'dark' || (theme === 'system' && system.matches);
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', dark ? '#151c18' : '#f6f7f4');
    };
    updateBrowserColor();
    system.addEventListener('change', updateBrowserColor);
    return () => system.removeEventListener('change', updateBrowserColor);
  }, [theme]);

  useEffect(() => {
    const syncTheme = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) setTheme(parseTheme(event.newValue));
    };
    window.addEventListener('storage', syncTheme);
    return () => window.removeEventListener('storage', syncTheme);
  }, []);

  const Icon = theme === 'system' ? Monitor : theme === 'dark' ? Moon : Sun;
  return (
    <label className="theme-picker">
      <Icon size={15} aria-hidden="true" />
      <select
        aria-label="Color theme"
        value={theme}
        onChange={(event) => {
          const next = parseTheme(event.target.value);
          setTheme(next);
          try {
            localStorage.setItem(storageKey, next);
          } catch {
            // The selected theme still works when browser storage is unavailable.
          }
        }}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
      <ChevronDown size={12} aria-hidden="true" />
    </label>
  );
}
