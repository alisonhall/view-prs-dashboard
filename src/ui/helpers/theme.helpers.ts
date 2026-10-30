// Settings › Appearance: the theme preference (Light, Dark or System),
// how it resolves to the page's theme, and its browser copy. The saved
// preference lives in user-defaults.json under THEME_OVERRIDE_KEY
// (ThemeProvider); the browser copy lets index.html's inline script set
// the theme before the first paint, so a dark page doesn't flash light.
// That script repeats THEME_STORAGE_KEY and resolveTheme's rule
// (theme.helpers.test.ts checks they match).
export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_PREFERENCES: ReadonlyArray<ThemePreference> = ['light', 'dark', 'system'];
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'light';
export const THEME_OVERRIDE_KEY = 'theme';
export const THEME_STORAGE_KEY = 'view-prs:theme';
export const PREFERS_DARK_QUERY = '(prefers-color-scheme: dark)';

export const isThemePreference = (value: unknown): value is ThemePreference =>
  THEME_PREFERENCES.includes(value as ThemePreference);

export const resolveTheme = (preference: ThemePreference, prefersDark: boolean): ResolvedTheme =>
  preference === 'dark' || (preference === 'system' && prefersDark) ? 'dark' : 'light';

// tokens.css redefines the colours under :root[data-theme="dark"].
export const applyTheme = (theme: ResolvedTheme, root: HTMLElement = document.documentElement) => {
  root.dataset.theme = theme;
};

// Storage can throw (blocked site data) or be missing; then there's no copy.
export const readStoredThemePreference = (): ThemePreference | null => {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(value) ? value : null;
  } catch (_error) {
    return null;
  }
};

export const storeThemePreference = (preference: ThemePreference) => {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch (_error) {
    // Only the first paint uses the copy; user-defaults.json keeps the setting.
  }
};
