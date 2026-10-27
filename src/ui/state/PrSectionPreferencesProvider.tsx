import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPrUiOptionPersistenceHelpers } from '../helpers/pr-ui-option-persistence.helpers.ts';
import {
  normalizePrSectionPreferences,
  PR_SECTIONS_OVERRIDE_KEY,
  withPrSectionPreference,
  type PrSectionPreferences,
} from '../helpers/pr-section-preferences.helpers.ts';

const { readUiSessionOverrides, updateUiSessionOverride } = createPrUiOptionPersistenceHelpers({
  fetch: (input, init) => fetch(input, init),
});

export interface PrSectionPreferencesValue {
  preferences: PrSectionPreferences;
  setSectionHidden: (key: string, hidden: boolean) => void;
  setSectionStartsOpen: (key: string, open: boolean) => void;
  resetSections: () => void;
}

const PrSectionPreferencesContext = createContext<PrSectionPreferencesValue>({
  preferences: {},
  setSectionHidden: () => {},
  setSectionStartsOpen: () => {},
  resetSections: () => {},
});

export const usePrSectionPreferences = () => useContext(PrSectionPreferencesContext);

/**
 * Settings › Appearance's section choices (which sections show, and which
 * start open), read from user-defaults.json on mount and saved there on
 * each change. The PR table reads them too.
 */
export function PrSectionPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<PrSectionPreferences>({});

  // The saved choices, unless one was made here before they arrived.
  const hasChosenRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    readUiSessionOverrides().then((overrides) => {
      if (cancelled || hasChosenRef.current) return;
      setPreferences(normalizePrSectionPreferences(overrides[PR_SECTIONS_OVERRIDE_KEY]));
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
    () => ({ preferences, setSectionHidden, setSectionStartsOpen, resetSections }),
    [preferences, setSectionHidden, setSectionStartsOpen, resetSections],
  );
  return <PrSectionPreferencesContext.Provider value={value}>{children}</PrSectionPreferencesContext.Provider>;
}
