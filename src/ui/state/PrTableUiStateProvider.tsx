import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  PrTableOpenSectionsContext,
  PrTableUiStateContext,
  type PrTableOpenSectionsValue,
  type PrTableUiStateValue,
  type PaneTab,
  type RenderedSection,
  type SelectedPr,
} from './PrTableUiStateContext';
import { getPrNumbersInOpenSections } from '../helpers/pr-export.helpers.ts';

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
      sameStrings(section.prNumbers, other.prNumbers)
    );
  });

/**
 * Owns the PR table's UI state (see PrTableUiStateContext.tsx), wrapping
 * <AppShell /> so both the table (PrTableApp) and Settings › Export, which are
 * siblings, read the same state. Provides both contexts; a report
 * of rendered sections only changes PrTableOpenSectionsContext.
 */
export function PrTableUiStateProvider({ children }: { children?: ReactNode }) {
  const [sectionOpenOverrides, setSectionOpenOverrides] = useState<Record<string, boolean>>({});
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [selectedPr, setSelectedPrState] = useState<SelectedPr | null>(null);
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
  const previousPrNumbersRef = useRef<string[]>([]);
  const { openSectionCount, prNumbersInOpenSections } = useMemo(() => {
    const sections = renderedSections.map((section) => ({
      open: isSectionOpen(section.key, section.defaultOpen),
      prNumbers: section.prNumbers,
    }));
    const prNumbers = getPrNumbersInOpenSections(sections);
    const stablePrNumbers = sameStrings(previousPrNumbersRef.current, prNumbers) ? previousPrNumbersRef.current : prNumbers;
    previousPrNumbersRef.current = stablePrNumbers;
    return {
      openSectionCount: sections.filter((section) => section.open).length,
      prNumbersInOpenSections: stablePrNumbers,
    };
  }, [renderedSections, isSectionOpen]);
  const openSectionsValue = useMemo<PrTableOpenSectionsValue>(
    () => ({ openSectionCount, prNumbersInOpenSections, hiddenPrCount }),
    [openSectionCount, prNumbersInOpenSections, hiddenPrCount],
  );

  return (
    <PrTableUiStateContext.Provider value={tableValue}>
      <PrTableOpenSectionsContext.Provider value={openSectionsValue}>{children}</PrTableOpenSectionsContext.Provider>
    </PrTableUiStateContext.Provider>
  );
}
