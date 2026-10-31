import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPrUiOptionPersistenceHelpers } from '../helpers/pr-ui-option-persistence.helpers.ts';
import {
  normalizePrSectionPreferences,
  PR_SECTIONS_OVERRIDE_KEY,
  readStoredPrSectionPreferences,
  storePrSectionPreferences,
  withPrSectionPreference,
  type PrSectionPreferences,
} from '../helpers/pr-section-preferences.helpers.ts';

const { readUiSessionOverridesOrNull, updateUiSessionOverride } = createPrUiOptionPersistenceHelpers({
  fetch: (input, init) => fetch(input, init),
});

export interface PrSectionPreferencesValue {
  preferences: PrSectionPreferences;
  // False until the choices are known (the browser copy, or the saved
  // setting once read): the PR table waits, rather than draw sections that
  // are about to be hidden.
  isReady: boolean;
  setSectionHidden: (key: string, hidden: boolean) => void;
  setSectionStartsOpen: (key: string, open: boolean) => void;
  resetSections: () => void;
}

const PrSectionPreferencesContext = createContext<PrSectionPreferencesValue>({
  preferences: {},
  isReady: true,
  setSectionHidden: () => {},
  setSectionStartsOpen: () => {},
  resetSections: () => {},
});

export const usePrSectionPreferences = () => useContext(PrSectionPreferencesContext);

/**
 * Settings › Appearance's section choices (which sections show, and which
 * start open). They start from the browser copy, then take the setting
 * saved in user-defaults.json once it's read; each change saves both. The
 * PR table reads them too.
 */
export function PrSectionPreferencesProvider({ children }: { children: ReactNode }) {
  const [stored] = useState(readStoredPrSectionPreferences);
  const [preferences, setPreferences] = useState<PrSectionPreferences>(() => stored ?? {});
  const [isReady, setIsReady] = useState(stored !== null);

  // The saved choices, unless one was made here before they arrived. If
  // they can't be read, the browser copy stays (and is kept), else the
  // defaults.
  const hasChosenRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    readUiSessionOverridesOrNull().then((overrides) => {
      if (cancelled || hasChosenRef.current) return;
      if (!overrides) {
        setIsReady(true);
        return;
      }
      const saved = normalizePrSectionPreferences(overrides[PR_SECTIONS_OVERRIDE_KEY]);
      setPreferences(saved);
      storePrSectionPreferences(saved);
      setIsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Each change builds on the latest choices: a ref, set as soon as a
  // change is made, so two quick changes don't both start from one render.
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;
  const save = useCallback((next: PrSectionPreferences) => {
    hasChosenRef.current = true;
    preferencesRef.current = next;
    setPreferences(next);
    setIsReady(true);
    storePrSectionPreferences(next);
    updateUiSessionOverride(PR_SECTIONS_OVERRIDE_KEY, Object.keys(next).length > 0 ? next : undefined);
  }, []);
  const setSectionHidden = useCallback(
    (key: string, hidden: boolean) => save(withPrSectionPreference(preferencesRef.current, key, { hidden })),
    [save],
  );
  const setSectionStartsOpen = useCallback(
    (key: string, open: boolean) => save(withPrSectionPreference(preferencesRef.current, key, { open })),
    [save],
  );
  const resetSections = useCallback(() => save({}), [save]);

  const value = useMemo(
    () => ({ preferences, isReady, setSectionHidden, setSectionStartsOpen, resetSections }),
    [preferences, isReady, setSectionHidden, setSectionStartsOpen, resetSections],
  );
  return <PrSectionPreferencesContext.Provider value={value}>{children}</PrSectionPreferencesContext.Provider>;
}
