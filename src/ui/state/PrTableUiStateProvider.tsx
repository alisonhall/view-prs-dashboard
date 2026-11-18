import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  PrTableOpenSectionsContext,
  PrTableUiStateContext,
  type PrTableOpenSectionsValue,
  type PrTableUiStateValue,
  type PaneTab,
  type RenderedSection,
  type SelectedPr,
} from './PrTableUiStateContext';
import { getPrKeysInOpenSections } from '../helpers/pr-export.helpers.ts';

export const PANE_VISIBLE_STORAGE_KEY = 'view-prs:detail-pane-visible';

// Storage can be missing or throw (private windows, blocked site data):
// the pane is then shown, and the choice lasts until the page reloads.
const readPaneVisible = (): boolean => {
  try {
    return window.localStorage.getItem(PANE_VISIBLE_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
};

const writePaneVisible = (visible: boolean) => {
  try {
    window.localStorage.setItem(PANE_VISIBLE_STORAGE_KEY, String(visible));
  } catch {
    // Not saved; the choice still applies until the page reloads.
  }
};

// What the detail pane shows - a PR here, or a tracked branch
// (PrTableApp) - kept for the tab (sessionStorage), so a reload opens it
// again; a new tab starts with none. Unreadable or missing: none.
export const SELECTED_PR_STORAGE_KEY = 'view-prs:selected-pr';
export const SELECTED_BRANCH_STORAGE_KEY = 'view-prs:selected-branch';

export const readSessionValue = (key: string): string => {
  try {
    return window.sessionStorage.getItem(key) || '';
  } catch {
    return '';
  }
};

export const writeSessionValue = (key: string, value: string) => {
  try {
    if (value) window.sessionStorage.setItem(key, value);
    else window.sessionStorage.removeItem(key);
  } catch {
    // Not kept; it's still shown until the page reloads.
  }
};

const readSelectedPr = (): SelectedPr | null => {
  try {
    const value = JSON.parse(readSessionValue(SELECTED_PR_STORAGE_KEY) || 'null') as Partial<SelectedPr> | null;
    return value && typeof value.repo === 'string' && typeof value.prNumber === 'string' && value.repo && value.prNumber
      ? { repo: value.repo, prNumber: value.prNumber }
      : null;
  } catch {
    return null;
  }
};

const sameStrings = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index]);

const sameSections = (a: RenderedSection[], b: RenderedSection[]): boolean =>
  a.length === b.length &&
  a.every((section, index) => {
    const other = b[index];
    return (
      other !== undefined &&
      section.key === other.key &&
      section.defaultOpen === other.defaultOpen &&
      sameStrings(section.prKeys, other.prKeys)
    );
  });

/**
 * Owns the PR table's UI state (see PrTableUiStateContext.tsx), wrapping
 * <AppShell /> so both the table (PrTableApp) and Tools › Export, which are
 * siblings, read the same state. Provides both contexts; a report
 * of rendered sections only changes PrTableOpenSectionsContext.
 */
export function PrTableUiStateProvider({ children }: { children?: ReactNode }) {
  const [sectionOpenOverrides, setSectionOpenOverrides] = useState<Record<string, boolean>>({});
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [selectedPr, setSelectedPrState] = useState<SelectedPr | null>(readSelectedPr);
  useEffect(() => {
    writeSessionValue(SELECTED_PR_STORAGE_KEY, selectedPr ? JSON.stringify({ repo: selectedPr.repo, prNumber: selectedPr.prNumber }) : '');
  }, [selectedPr]);
  const [isPaneVisible, setPaneVisibleState] = useState(readPaneVisible);
  const [paneTab, setPaneTab] = useState<PaneTab>('overview');
  const [renderedSections, setRenderedSections] = useState<RenderedSection[]>([]);
  const [hiddenPrCount, setHiddenPrCount] = useState(0);

  const isSectionOpen = useCallback(
    (key: string, defaultOpen: boolean) => sectionOpenOverrides[key] ?? defaultOpen,
    [sectionOpenOverrides],
  );
  const setSectionOpen = useCallback((key: string, open: boolean) => {
    setSectionOpenOverrides((previous) => (previous[key] === open ? previous : { ...previous, [key]: open }));
  }, []);
  const setRowExpanded = useCallback((key: string, expanded: boolean) => {
    setExpandedRows((previous) => (Boolean(previous[key]) === expanded ? previous : { ...previous, [key]: expanded }));
  }, []);
  const toggleRowExpanded = useCallback((key: string) => {
    setExpandedRows((previous) => ({ ...previous, [key]: !previous[key] }));
  }, []);
  // Selecting the PR already selected keeps the same object.
  const setSelectedPr = useCallback((pr: SelectedPr | null) => {
    setSelectedPrState((previous) =>
      previous === pr || (previous && pr && previous.repo === pr.repo && previous.prNumber === pr.prNumber) ? previous : pr,
    );
  }, []);
  const setPaneVisible = useCallback((visible: boolean) => {
    setPaneVisibleState(visible);
    writePaneVisible(visible);
  }, []);
  // The table reports on every sections rebuild; an unchanged report keeps
  // the same state.
  const reportRenderedSections = useCallback((sections: RenderedSection[], hiddenCount = 0) => {
    setRenderedSections((previous) => (sameSections(previous, sections) ? previous : sections));
    setHiddenPrCount(hiddenCount);
  }, []);

  const tableValue = useMemo<PrTableUiStateValue>(
    () => ({
      sectionOpenOverrides,
      isSectionOpen,
      setSectionOpen,
      expandedRows,
      setRowExpanded,
      toggleRowExpanded,
      selectedPr,
      setSelectedPr,
      isPaneVisible,
      setPaneVisible,
      paneTab,
      setPaneTab,
      reportRenderedSections,
    }),
    [
      sectionOpenOverrides,
      isSectionOpen,
      setSectionOpen,
      expandedRows,
      setRowExpanded,
      toggleRowExpanded,
      selectedPr,
      setSelectedPr,
      isPaneVisible,
      setPaneVisible,
      paneTab,
      reportRenderedSections,
    ],
  );

  // Reuse the previous array while its contents are the same, and the
  // value while neither field changes, so Export only re-renders when the
  // open sections or their PRs actually change.
  const previousPrKeysRef = useRef<string[]>([]);
  const { openSectionCount, prKeysInOpenSections } = useMemo(() => {
    const sections = renderedSections.map((section) => ({
      open: isSectionOpen(section.key, section.defaultOpen),
      prKeys: section.prKeys,
    }));
    const prKeys = getPrKeysInOpenSections(sections);
    const stablePrKeys = sameStrings(previousPrKeysRef.current, prKeys) ? previousPrKeysRef.current : prKeys;
    previousPrKeysRef.current = stablePrKeys;
    return {
      openSectionCount: sections.filter((section) => section.open).length,
      prKeysInOpenSections: stablePrKeys,
    };
  }, [renderedSections, isSectionOpen]);
  const openSectionsValue = useMemo<PrTableOpenSectionsValue>(
    () => ({ openSectionCount, prKeysInOpenSections, hiddenPrCount }),
    [openSectionCount, prKeysInOpenSections, hiddenPrCount],
  );

  return (
    <PrTableUiStateContext.Provider value={tableValue}>
      <PrTableOpenSectionsContext.Provider value={openSectionsValue}>{children}</PrTableOpenSectionsContext.Provider>
    </PrTableUiStateContext.Provider>
  );
}
