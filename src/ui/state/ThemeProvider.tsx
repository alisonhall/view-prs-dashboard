import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPrUiOptionPersistenceHelpers } from '../helpers/pr-ui-option-persistence.helpers.ts';
import {
  applyTheme,
  DEFAULT_THEME_PREFERENCE,
  isThemePreference,
  PREFERS_DARK_QUERY,
  readStoredThemePreference,
  resolveTheme,
  storeThemePreference,
  THEME_OVERRIDE_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from '../helpers/theme.helpers.ts';
import { useMediaQuery } from './useMediaQuery';

const { readUiSessionOverrides, updateUiSessionOverride } = createPrUiOptionPersistenceHelpers({
  fetch: (input, init) => fetch(input, init),
});

export interface ThemeValue {
  preference: ThemePreference;
  theme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeValue>({
  preference: DEFAULT_THEME_PREFERENCE,
  theme: 'light',
  setPreference: () => {},
});

export const useTheme = () => useContext(ThemeContext);

/**
 * Settings › Appearance's theme. It starts from the browser copy (which
 * index.html already applied before the first paint), then takes the
 * setting saved in user-defaults.json, so it survives closing the browser
 * and follows to another browser. System follows the operating system's
 * setting as it changes. Each change sets data-theme on <html> and saves
 * both copies.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(
    () => readStoredThemePreference() ?? DEFAULT_THEME_PREFERENCE,
  );
  const prefersDark = useMediaQuery(PREFERS_DARK_QUERY);
  const theme = resolveTheme(preference, prefersDark);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // The saved setting wins over the browser copy, unless a choice was made
  // here before it arrived.
  const hasChosenRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    readUiSessionOverrides().then((overrides) => {
      const saved = overrides[THEME_OVERRIDE_KEY];
      if (cancelled || hasChosenRef.current || !isThemePreference(saved)) return;
      setPreferenceState(saved);
      storeThemePreference(saved);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    hasChosenRef.current = true;
    setPreferenceState(next);
    storeThemePreference(next);
    updateUiSessionOverride(THEME_OVERRIDE_KEY, next);
  }, []);

  const value = useMemo(() => ({ preference, theme, setPreference }), [preference, theme, setPreference]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
