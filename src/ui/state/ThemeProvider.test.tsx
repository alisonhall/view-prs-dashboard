/** @jest-environment jsdom */

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppearanceSection } from '../components/settings/AppearanceSection';
import { THEME_STORAGE_KEY } from '../helpers/theme.helpers';
import { ThemeProvider, useTheme } from './ThemeProvider';

// A stand-in for /view-prs/user-defaults: GET returns `saved`, PUT replaces it.
let saved: Record<string, unknown>;
let resolveGet: (() => void) | null;
const fetchMock = jest.fn(async (_input: string, init?: RequestInit) => {
  if (init?.method === 'PUT') {
    saved = JSON.parse(String(init.body));
    return { ok: true, json: async () => ({}) };
  }
  const overrides = { ...saved };
  if (resolveGet === null) return { ok: true, json: async () => ({ overrides }) };
  await new Promise<void>((resolve) => {
    resolveGet = resolve;
  });
  return { ok: true, json: async () => ({ overrides }) };
});

// matchMedia for (prefers-color-scheme: dark), which a test can flip.
let prefersDark = false;
const listeners = new Set<() => void>();
const setPrefersDark = (value: boolean) => {
  prefersDark = value;
  listeners.forEach((listener) => listener());
};

function ShowTheme() {
  const { theme } = useTheme();
  return <output aria-label="Resolved theme">{theme}</output>;
}

const renderApp = () =>
  render(
    <ThemeProvider>
      <AppearanceSection />
      <ShowTheme />
    </ThemeProvider>,
  );

const htmlTheme = () => document.documentElement.dataset.theme;

describe('ThemeProvider and Settings › Appearance', () => {
  beforeEach(() => {
    saved = { repo: 'owner/repo' };
    resolveGet = null;
    prefersDark = false;
    listeners.clear();
    window.localStorage.clear();
    (global as unknown as { fetch: unknown }).fetch = fetchMock;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        get matches() {
          return prefersDark;
        },
        addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
        removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
      }),
    });
  });

  afterEach(() => {
    fetchMock.mockClear();
    delete document.documentElement.dataset.theme;
  });

  test('starts on Light with nothing saved', async () => {
    renderApp();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked();
    expect(htmlTheme()).toBe('light');
  });

  test('choosing Dark applies it and saves it in user-defaults.json, keeping the other settings, and in the browser', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('radio', { name: 'Dark' }));

    expect(htmlTheme()).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    await waitFor(() => expect(saved).toEqual({ repo: 'owner/repo', theme: 'dark' }));
  });

  test('the setting saved in user-defaults.json wins over the browser copy', async () => {
    saved = { theme: 'dark' };
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    renderApp();

    await waitFor(() => expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked());
    expect(htmlTheme()).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  test('starts from the browser copy until the saved setting arrives', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    resolveGet = () => {};
    renderApp();
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
    expect(htmlTheme()).toBe('dark');
  });

  test('a choice made before the saved setting arrives is kept', async () => {
    const user = userEvent.setup();
    saved = { theme: 'dark' };
    resolveGet = () => {};
    renderApp();
    await user.click(screen.getByRole('radio', { name: 'System (follows your computer)' }));
    await act(async () => resolveGet?.());

    expect(screen.getByRole('radio', { name: 'System (follows your computer)' })).toBeChecked();
    await waitFor(() => expect(saved.theme).toBe('system'));
  });

  test("System follows the computer's setting as it changes", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('radio', { name: 'System (follows your computer)' }));
    expect(htmlTheme()).toBe('light');

    act(() => setPrefersDark(true));
    expect(htmlTheme()).toBe('dark');
    expect(screen.getByRole('status', { name: 'Resolved theme' })).toHaveTextContent('dark');

    act(() => setPrefersDark(false));
    expect(htmlTheme()).toBe('light');
  });

  test('the choices are a group named Theme', () => {
    renderApp();
    expect(screen.getByRole('group', { name: 'Theme' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });
});
