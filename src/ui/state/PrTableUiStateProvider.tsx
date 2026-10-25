import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  PrTableOpenSectionsContext,
  PrTableUiStateContext,
  type PrTableOpenSectionsValue,
  type PrTableUiStateValue,
  type RenderedSection,
  type SelectedPr,
} from './PrTableUiStateContext';
import { getPrNumbersInOpenSections } from '../helpers/pr-export.helpers.ts';

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
 * <AppRoot/> so both the table (PrTableApp) and the Export tab, which are
 * sibling portals, read the same state. Provides both contexts; a report
 * of rendered sections only changes PrTableOpenSectionsContext.
 */
export function PrTableUiStateProvider({ children }: { children?: ReactNode }) {
  const [sectionOpenOverrides, setSectionOpenOverrides] = useState<Record<string, boolean>>({});
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [detailRows, setDetailRows] = useState<Record<string, boolean>>({});
  const [selectedPr, setSelectedPr] = useState<SelectedPr | null>(null);
  const [renderedSections, setRenderedSections] = useState<RenderedSection[]>([]);

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
  const setRowDetailsOpen = useCallback((key: string, open: boolean) => {
    setDetailRows((previous) => (Boolean(previous[key]) === open ? previous : { ...previous, [key]: open }));
  }, []);
  const toggleRowDetails = useCallback((key: string) => {
    setDetailRows((previous) => ({ ...previous, [key]: !previous[key] }));
  }, []);
  // The table reports on every sections rebuild; an unchanged report keeps
  // the same state.
  const reportRenderedSections = useCallback((sections: RenderedSection[]) => {
    setRenderedSections((previous) => (sameSections(previous, sections) ? previous : sections));
  }, []);

  const tableValue = useMemo<PrTableUiStateValue>(
    () => ({
      sectionOpenOverrides,
      isSectionOpen,
      setSectionOpen,
      expandedRows,
      setRowExpanded,
      toggleRowExpanded,
      detailRows,
      setRowDetailsOpen,
      toggleRowDetails,
      selectedPr,
      setSelectedPr,
      reportRenderedSections,
    }),
    [
      sectionOpenOverrides,
      isSectionOpen,
      setSectionOpen,
      expandedRows,
      setRowExpanded,
      toggleRowExpanded,
      detailRows,
      setRowDetailsOpen,
      toggleRowDetails,
      selectedPr,
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
    () => ({ openSectionCount, prNumbersInOpenSections }),
    [openSectionCount, prNumbersInOpenSections],
  );

  return (
    <PrTableUiStateContext.Provider value={tableValue}>
      <PrTableOpenSectionsContext.Provider value={openSectionsValue}>{children}</PrTableOpenSectionsContext.Provider>
    </PrTableUiStateContext.Provider>
  );
}
