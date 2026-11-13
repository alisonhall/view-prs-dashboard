import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPrUiOptionPersistenceHelpers } from '../helpers/pr-ui-option-persistence.helpers.ts';
import {
  isDefaultPrSectionOrder,
  isPrSectionTitleTaken,
  movePrSection,
  normalizePrSectionOrder,
  normalizePrSectionPreferences,
  prSectionCatalog,
  PR_SECTION_CATALOG,
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
  type PrSectionCatalog,
  type PrSectionPreferences,
} from '../helpers/pr-section-preferences.helpers.ts';
import {
  CUSTOM_SECTIONS_MAX,
  CUSTOM_SECTIONS_OVERRIDE_KEY,
  customSectionKey,
  newCustomSectionId,
  normalizeCustomSectionName,
  normalizeCustomSections,
  readStoredCustomSections,
  storeCustomSections,
  type CustomSection,
  type CustomSectionTone,
} from '../helpers/pr-custom-sections.helpers.ts';
import type { IconName } from '../components/ui/Icon';
import type { SectionSort } from '../helpers/pr-section-sort.helpers.ts';
import { sendJson } from '../helpers/pr-http.helpers.ts';

const { readUiSessionOverridesOrNull, updateUiSessionOverride } = createPrUiOptionPersistenceHelpers({
  fetch: (input, init) => fetch(input, init),
});

export type CustomSectionChange = Partial<Pick<CustomSection, 'name' | 'icon' | 'tone'>>;

export interface PrSectionPreferencesValue {
  preferences: PrSectionPreferences;
  // False until the choices are known (the browser copy, or the saved
  // setting once read): the PR table waits, rather than draw sections that
  // are about to be hidden.
  isReady: boolean;
  setSectionHidden: (key: string, hidden: boolean) => void;
  setSectionStartsOpen: (key: string, open: boolean) => void;
  setSectionSort: (key: string, sort: SectionSort) => void;
  // A built-in smart group's icon and colour (its built-in ones put it back).
  setSectionLook: (key: string, look: { icon?: IconName; tone?: CustomSectionTone }) => void;
  // The sections' order (every key, smart groups first), and moving one a
  // place up (-1) or down (1) among its kind.
  sectionOrder: string[];
  moveSection: (key: string, offset: -1 | 1) => void;
  // Show, open-on-load, looks and order back to the defaults (not the sorts).
  resetSections: () => void;
  // "Group rows by repo".
  groupByRepo: boolean;
  setGroupByRepo: (groupByRepo: boolean) => void;
  // The custom sections (pr-custom-sections.helpers.ts), and every section
  // with them. Adding one gives it back (null at CUSTOM_SECTIONS_MAX, or
  // without a name or with one a section already has - a rename to one is
  // ignored too); removing one also takes its PRs out of it.
  customSections: CustomSection[];
  catalog: PrSectionCatalog;
  addCustomSection: (section: Omit<CustomSection, 'id'>) => CustomSection | null;
  updateCustomSection: (id: string, change: CustomSectionChange) => void;
  removeCustomSection: (id: string) => void;
}

export const PrSectionPreferencesContext = createContext<PrSectionPreferencesValue>({
  preferences: {},
  isReady: true,
  setSectionHidden: () => {},
  setSectionStartsOpen: () => {},
  setSectionSort: () => {},
  setSectionLook: () => {},
  sectionOrder: normalizePrSectionOrder(null),
  moveSection: () => {},
  resetSections: () => {},
  groupByRepo: false,
  setGroupByRepo: () => {},
  customSections: [],
  catalog: PR_SECTION_CATALOG,
  addCustomSection: () => null,
  updateCustomSection: () => {},
  removeCustomSection: () => {},
});

export const usePrSectionPreferences = () => useContext(PrSectionPreferencesContext);

// Takes a removed section's PRs out of it. Its rows are ignored once it's
// gone anyway, so a failure only leaves them in the file.
const clearCustomSectionPrs = (sectionId: string) => sendJson('DELETE', '/view-prs/custom-section-prs', { sectionId }).catch(() => {});

/**
 * Settings › Appearance's section choices (which sections show, which
 * start open, and their order), the custom sections, and whether rows are
 * grouped by repo. They start from the browser copy, then take the
 * setting saved in user-defaults.json once it's read; each change saves
 * both. The PR table reads them too.
 */
export function PrSectionPreferencesProvider({ children }: { children: ReactNode }) {
  // The custom sections first: the other choices are read against every
  // section, theirs included.
  const [initial] = useState(() => {
    const customSections = readStoredCustomSections() ?? [];
    const catalog = prSectionCatalog(customSections);
    return { customSections, preferences: readStoredPrSectionPreferences(catalog), order: readStoredPrSectionOrder(catalog) };
  });
  const [customSections, setCustomSectionsState] = useState<CustomSection[]>(initial.customSections);
  const catalog = useMemo(() => prSectionCatalog(customSections), [customSections]);
  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;
  const [savedPreferences, setPreferences] = useState<PrSectionPreferences>(() => initial.preferences ?? {});
  const [isReady, setIsReady] = useState(initial.preferences !== null);
  const [groupByRepo, setGroupByRepoState] = useState(() => readStoredGroupRowsByRepo() ?? false);
  const hasChosenGroupingRef = useRef(false);
  const [savedOrder, setSectionOrderState] = useState<string[]>(() => initial.order ?? []);
  const hasChosenOrderRef = useRef(false);
  const hasChosenCustomRef = useRef(false);
  // Read against the sections there are now: a removed section's choices
  // drop out, and a new one takes its place in the order.
  const preferences = useMemo(() => normalizePrSectionPreferences(savedPreferences, catalog), [savedPreferences, catalog]);
  const sectionOrder = useMemo(() => normalizePrSectionOrder(savedOrder, catalog), [savedOrder, catalog]);

  // The saved choices, unless one was made here before they arrived. If
  // they can't be read, the browser copy stays (and is kept), else the
  // defaults.
  const hasChosenRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    readUiSessionOverridesOrNull().then((overrides) => {
      if (!cancelled && overrides && !hasChosenCustomRef.current) {
        const savedCustom = normalizeCustomSections(overrides[CUSTOM_SECTIONS_OVERRIDE_KEY]);
        catalogRef.current = prSectionCatalog(savedCustom);
        setCustomSectionsState(savedCustom);
        storeCustomSections(savedCustom);
      }
      if (!cancelled && overrides && !hasChosenGroupingRef.current) {
        const savedGrouping = overrides[PR_ROWS_GROUP_BY_REPO_OVERRIDE_KEY] === true;
        setGroupByRepoState(savedGrouping);
        storeGroupRowsByRepo(savedGrouping);
      }
      if (!cancelled && overrides && !hasChosenOrderRef.current) {
        const order = normalizePrSectionOrder(overrides[PR_SECTION_ORDER_OVERRIDE_KEY], catalogRef.current);
        setSectionOrderState(order);
        storePrSectionOrder(order);
      }
      if (cancelled || hasChosenRef.current) return;
      if (!overrides) {
        setIsReady(true);
        return;
      }
      const saved = normalizePrSectionPreferences(overrides[PR_SECTIONS_OVERRIDE_KEY], catalogRef.current);
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
    (key: string, hidden: boolean) => save(withPrSectionPreference(preferencesRef.current, key, { hidden }, catalogRef.current)),
    [save],
  );
  const setSectionStartsOpen = useCallback(
    (key: string, open: boolean) => save(withPrSectionPreference(preferencesRef.current, key, { open }, catalogRef.current)),
    [save],
  );
  const setSectionSort = useCallback(
    (key: string, sort: SectionSort) => save(withPrSectionPreference(preferencesRef.current, key, { sort }, catalogRef.current)),
    [save],
  );
  const setSectionLook = useCallback(
    (key: string, look: { icon?: IconName; tone?: CustomSectionTone }) =>
      save(withPrSectionPreference(preferencesRef.current, key, look, catalogRef.current)),
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
    updateUiSessionOverride(PR_SECTION_ORDER_OVERRIDE_KEY, isDefaultPrSectionOrder(next, catalogRef.current) ? undefined : next);
  }, []);
  const moveSection = useCallback(
    (key: string, offset: -1 | 1) => {
      const next = movePrSection(sectionOrderRef.current, key, offset, catalogRef.current);
      if (next.some((sectionKey, index) => sectionKey !== sectionOrderRef.current[index])) saveOrder(next);
    },
    [saveOrder],
  );
  // Which sections show, start open, their looks and order, back to the
  // defaults - not their sorts, chosen in each section (PrSectionSortMenu).
  const resetSections = useCallback(() => {
    save(
      Object.fromEntries(
        Object.entries(preferencesRef.current)
          .filter(([, preference]) => preference.sort)
          .map(([key, preference]) => [key, { sort: preference.sort }]),
      ),
    );
    if (!isDefaultPrSectionOrder(sectionOrderRef.current, catalogRef.current)) saveOrder(normalizePrSectionOrder(null, catalogRef.current));
  }, [save, saveOrder]);
  const setGroupByRepo = useCallback((next: boolean) => {
    hasChosenGroupingRef.current = true;
    setGroupByRepoState(next);
    storeGroupRowsByRepo(next);
    updateUiSessionOverride(PR_ROWS_GROUP_BY_REPO_OVERRIDE_KEY, next ? true : undefined);
  }, []);

  const customSectionsRef = useRef(customSections);
  customSectionsRef.current = customSections;
  const saveCustomSections = useCallback((next: CustomSection[]) => {
    hasChosenCustomRef.current = true;
    customSectionsRef.current = next;
    catalogRef.current = prSectionCatalog(next);
    setCustomSectionsState(next);
    storeCustomSections(next);
    updateUiSessionOverride(CUSTOM_SECTIONS_OVERRIDE_KEY, next.length > 0 ? next : undefined);
  }, []);
  const addCustomSection = useCallback(
    (section: Omit<CustomSection, 'id'>) => {
      const current = customSectionsRef.current;
      const [added] = normalizeCustomSections([{ ...section, id: newCustomSectionId(current) }]);
      if (!added || current.length >= CUSTOM_SECTIONS_MAX || isPrSectionTitleTaken(added.name, catalogRef.current)) return null;
      saveCustomSections([...current, added]);
      return added;
    },
    [saveCustomSections],
  );
  const updateCustomSection = useCallback(
    (id: string, change: CustomSectionChange) => {
      const current = customSectionsRef.current;
      // An emptied name, or one another section has, keeps the old one.
      const wanted = normalizeCustomSectionName(change.name);
      const name = (section: CustomSection) =>
        wanted && !isPrSectionTitleTaken(wanted, catalogRef.current, customSectionKey(section.id)) ? wanted : section.name;
      const next = normalizeCustomSections(
        current.map((section) => (section.id === id ? { ...section, ...change, name: name(section) } : section)),
      );
      if (JSON.stringify(next) !== JSON.stringify(current)) saveCustomSections(next);
    },
    [saveCustomSections],
  );
  // Its choices and place in the order go with it, and its PRs leave it.
  const removeCustomSection = useCallback(
    (id: string) => {
      const current = customSectionsRef.current;
      if (!current.some((section) => section.id === id)) return;
      saveCustomSections(current.filter((section) => section.id !== id));
      const nextPreferences = normalizePrSectionPreferences(preferencesRef.current, catalogRef.current);
      if (JSON.stringify(nextPreferences) !== JSON.stringify(preferencesRef.current)) save(nextPreferences);
      saveOrder(normalizePrSectionOrder(sectionOrderRef.current, catalogRef.current));
      void clearCustomSectionPrs(id);
    },
    [save, saveOrder, saveCustomSections],
  );

  const value = useMemo(
    () => ({
      preferences,
      isReady,
      setSectionHidden,
      setSectionStartsOpen,
      setSectionSort,
      setSectionLook,
      sectionOrder,
      moveSection,
      resetSections,
      groupByRepo,
      setGroupByRepo,
      customSections,
      catalog,
      addCustomSection,
      updateCustomSection,
      removeCustomSection,
    }),
    [
      preferences,
      isReady,
      setSectionHidden,
      setSectionStartsOpen,
      setSectionSort,
      setSectionLook,
      sectionOrder,
      moveSection,
      resetSections,
      groupByRepo,
      setGroupByRepo,
      customSections,
      catalog,
      addCustomSection,
      updateCustomSection,
      removeCustomSection,
    ],
  );
  return <PrSectionPreferencesContext.Provider value={value}>{children}</PrSectionPreferencesContext.Provider>;
}
