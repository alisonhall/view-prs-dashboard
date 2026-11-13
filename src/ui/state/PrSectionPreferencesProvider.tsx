import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPrUiOptionPersistenceHelpers } from '../helpers/pr-ui-option-persistence.helpers.ts';
import {
  isDefaultPrSectionOrder,
  movePrSection,
  normalizePrSectionOrder,
  normalizePrSectionPreferences,
  PR_SECTION_ORDER_OVERRIDE_KEY,
  PR_ROWS_GROUP_BY_REPO_OVERRIDE_KEY,
  PR_SECTIONS_OVERRIDE_KEY,
  readStoredGroupRowsByRepo,
  readStoredPrSectionOrder,
  readStoredPrSectionPreferences,
  storeGroupRowsByRepo,
  storePrSectionOrder,
  storePrSectionPreferences,
  withPrSectionPreference,
  type PrSectionPreferences,
} from '../helpers/pr-section-preferences.helpers.ts';
import type { SectionSort } from '../helpers/pr-section-sort.helpers.ts';

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
  setSectionSort: (key: string, sort: SectionSort) => void;
  // The sections' order (every key, smart groups first), and moving one a
  // place up (-1) or down (1) among its kind.
  sectionOrder: string[];
  moveSection: (key: string, offset: -1 | 1) => void;
  // Show, open-on-load and order back to the defaults (not the sorts).
  resetSections: () => void;
  // "Group rows by repo".
  groupByRepo: boolean;
  setGroupByRepo: (groupByRepo: boolean) => void;
}

export const PrSectionPreferencesContext = createContext<PrSectionPreferencesValue>({
  preferences: {},
  isReady: true,
  setSectionHidden: () => {},
  setSectionStartsOpen: () => {},
  setSectionSort: () => {},
  sectionOrder: normalizePrSectionOrder(null),
  moveSection: () => {},
  resetSections: () => {},
  groupByRepo: false,
  setGroupByRepo: () => {},
});

export const usePrSectionPreferences = () => useContext(PrSectionPreferencesContext);

/**
 * Settings › Appearance's section choices (which sections show, which
 * start open, and their order), and whether rows are grouped by repo. They start from the browser copy, then take the setting
 * saved in user-defaults.json once it's read; each change saves both. The
 * PR table reads them too.
 */
export function PrSectionPreferencesProvider({ children }: { children: ReactNode }) {
  const [stored] = useState(readStoredPrSectionPreferences);
  const [preferences, setPreferences] = useState<PrSectionPreferences>(() => stored ?? {});
  const [isReady, setIsReady] = useState(stored !== null);
  const [groupByRepo, setGroupByRepoState] = useState(() => readStoredGroupRowsByRepo() ?? false);
  const hasChosenGroupingRef = useRef(false);
  const [sectionOrder, setSectionOrderState] = useState(() => readStoredPrSectionOrder() ?? normalizePrSectionOrder(null));
  const hasChosenOrderRef = useRef(false);

  // The saved choices, unless one was made here before they arrived. If
  // they can't be read, the browser copy stays (and is kept), else the
  // defaults.
  const hasChosenRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    readUiSessionOverridesOrNull().then((overrides) => {
      if (!cancelled && overrides && !hasChosenGroupingRef.current) {
        const savedGrouping = overrides[PR_ROWS_GROUP_BY_REPO_OVERRIDE_KEY] === true;
        setGroupByRepoState(savedGrouping);
        storeGroupRowsByRepo(savedGrouping);
      }
      if (!cancelled && overrides && !hasChosenOrderRef.current) {
        const savedOrder = normalizePrSectionOrder(overrides[PR_SECTION_ORDER_OVERRIDE_KEY]);
        setSectionOrderState(savedOrder);
        storePrSectionOrder(savedOrder);
      }
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
  const setSectionSort = useCallback(
    (key: string, sort: SectionSort) => save(withPrSectionPreference(preferencesRef.current, key, { sort })),
    [save],
  );
  // Each move builds on the latest order, like the choices above.
  const sectionOrderRef = useRef(sectionOrder);
  sectionOrderRef.current = sectionOrder;
  const saveOrder = useCallback((next: string[]) => {
    hasChosenOrderRef.current = true;
    sectionOrderRef.current = next;
    setSectionOrderState(next);
    storePrSectionOrder(next);
    updateUiSessionOverride(PR_SECTION_ORDER_OVERRIDE_KEY, isDefaultPrSectionOrder(next) ? undefined : next);
  }, []);
  const moveSection = useCallback(
    (key: string, offset: -1 | 1) => {
      const next = movePrSection(sectionOrderRef.current, key, offset);
      if (next.some((sectionKey, index) => sectionKey !== sectionOrderRef.current[index])) saveOrder(next);
    },
    [saveOrder],
  );
  // Which sections show, start open and their order, back to the defaults
  // - not their sorts, chosen in each section (PrSectionSortMenu).
  const resetSections = useCallback(() => {
    save(
      Object.fromEntries(
        Object.entries(preferencesRef.current)
          .filter(([, preference]) => preference.sort)
          .map(([key, preference]) => [key, { sort: preference.sort }]),
      ),
    );
    if (!isDefaultPrSectionOrder(sectionOrderRef.current)) saveOrder(normalizePrSectionOrder(null));
  }, [save, saveOrder]);
  const setGroupByRepo = useCallback((next: boolean) => {
    hasChosenGroupingRef.current = true;
    setGroupByRepoState(next);
    storeGroupRowsByRepo(next);
    updateUiSessionOverride(PR_ROWS_GROUP_BY_REPO_OVERRIDE_KEY, next ? true : undefined);
  }, []);

  const value = useMemo(
    () => ({
      preferences,
      isReady,
      setSectionHidden,
      setSectionStartsOpen,
      setSectionSort,
      sectionOrder,
      moveSection,
      resetSections,
      groupByRepo,
      setGroupByRepo,
    }),
    [preferences, isReady, setSectionHidden, setSectionStartsOpen, setSectionSort, sectionOrder, moveSection, resetSections, groupByRepo, setGroupByRepo],
  );
  return <PrSectionPreferencesContext.Provider value={value}>{children}</PrSectionPreferencesContext.Provider>;
}
