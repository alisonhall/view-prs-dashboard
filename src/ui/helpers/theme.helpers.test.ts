/** @jest-environment jsdom */

import fs from 'fs';
import path from 'path';
import {
  applyTheme,
  isThemePreference,
  readStoredThemePreference,
  resolveTheme,
  storeThemePreference,
  THEME_PREFERENCES,
  THEME_STORAGE_KEY,
} from './theme.helpers';

describe('theme helpers', () => {
  afterEach(() => {
    window.localStorage.clear();
    jest.restoreAllMocks();
    delete document.documentElement.dataset.theme;
  });

  test('resolveTheme: Dark is dark, Light is light, System follows the computer', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  test('isThemePreference accepts only the three choices', () => {
    THEME_PREFERENCES.forEach((value) => expect(isThemePreference(value)).toBe(true));
    expect(isThemePreference('Dark')).toBe(false);
    expect(isThemePreference(null)).toBe(false);
  });

  test('applyTheme sets data-theme on <html>', () => {
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  test('the browser copy round-trips, and an unknown value reads as none', () => {
    expect(readStoredThemePreference()).toBeNull();
    storeThemePreference('system');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
    expect(readStoredThemePreference()).toBe('system');
    window.localStorage.setItem(THEME_STORAGE_KEY, 'sepia');
    expect(readStoredThemePreference()).toBeNull();
  });

  test('blocked storage reads as no copy and writes nothing, without throwing', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readStoredThemePreference()).toBeNull();
    expect(() => storeThemePreference('dark')).not.toThrow();
  });

  describe("index.html's first-paint script", () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';
    const runScript = (stored: string | null, prefersDark: boolean) => {
      window.localStorage.clear();
      if (stored !== null) window.localStorage.setItem(THEME_STORAGE_KEY, stored);
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: (query: string) => ({ matches: query === '(prefers-color-scheme: dark)' && prefersDark }),
      });
      new Function(script)();
      return document.documentElement.dataset.theme;
    };

    test('is there', () => {
      expect(script).toContain(THEME_STORAGE_KEY);
    });

    test.each([
      ['light', false],
      ['light', true],
      ['dark', false],
      ['system', false],
      ['system', true],
    ] as const)('agrees with resolveTheme for %s (prefers dark: %s)', (stored, prefersDark) => {
      expect(runScript(stored, prefersDark)).toBe(resolveTheme(stored, prefersDark));
    });

    test('with no copy, the page is light', () => {
      expect(runScript(null, true)).toBe('light');
    });
  });
});
