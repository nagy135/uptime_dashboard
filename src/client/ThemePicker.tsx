import { useEffect, useId, useRef, useState } from 'react';
import { Check, Monitor, Moon, Sun } from 'lucide-react';

type Theme = 'system' | 'light' | 'dark';
const storageKey = 'fleet-theme';
const parseTheme = (value: string | null | undefined): Theme =>
  value === 'light' || value === 'dark' ? value : 'system';
const themes = [
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
] as const;

export function ThemePicker() {
  const [theme, setTheme] = useState(() => parseTheme(document.documentElement.dataset.theme));
  const [open, setOpen] = useState(false);
  const picker = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    picker.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    const dismissOutside = (event: Event) => {
      if (event.target instanceof Node && !picker.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('focusin', dismissOutside);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('focusin', dismissOutside);
    };
  }, [open]);

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

  const { Icon, label } = themes.find((option) => option.value === theme)!;
  return (
    <div
      className="theme-picker"
      ref={picker}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="theme-toggle"
        aria-label={`Color theme: ${label}`}
        title={`Color theme: ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <Icon size={18} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={menuId}
          className="theme-menu"
          role="menu"
          aria-label="Color theme"
          onKeyDown={(event) => {
            const items = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'),
            );
            const index = items.findIndex((item) => item === document.activeElement);
            const next =
              event.key === 'ArrowDown'
                ? (index + 1) % items.length
                : event.key === 'ArrowUp'
                  ? (index - 1 + items.length) % items.length
                  : event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? items.length - 1
                      : null;
            if (next !== null) {
              event.preventDefault();
              items[next]?.focus();
            }
          }}
        >
          {themes.map(({ value, label: optionLabel, Icon: OptionIcon }) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={theme === value}
              tabIndex={-1}
              onClick={() => {
                setTheme(value);
                setOpen(false);
                trigger.current?.focus();
                try {
                  localStorage.setItem(storageKey, value);
                } catch {
                  // The selected theme still works when browser storage is unavailable.
                }
              }}
            >
              <OptionIcon size={16} aria-hidden="true" />
              <span>{optionLabel}</span>
              {theme === value && <Check size={14} className="theme-check" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
