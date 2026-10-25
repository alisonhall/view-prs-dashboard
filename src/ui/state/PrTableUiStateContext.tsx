import { createContext, useContext } from 'react';

/**
 * The PR table's own UI state, owned by PrTableUiStateProvider (which
 * wraps <AppRoot/> from mountAppRoot()): which sections are open, which
 * rows are expanded, and the selected PR (the detail pane, phase 4 of
 * UI_REDESIGN_PLAN.md). It lives above the table so the Export tab can
 * read it (and so "Jump to PR" can open a row's details): Export exports
 * the rows of the open sections, and used to work
 * that out by reading `<details open>` and class names from the DOM.
 *
 * Two contexts, so the table doesn't re-render for what only Export uses:
 * - PrTableUiStateContext: the state and its setters, read by the table.
 *   The table reports the sections it rendered (reportRenderedSections).
 * - PrTableOpenSectionsContext: derived from those reports, read by Export
 *   (usePrTableOpenSections). A report only changes this one, so it
 *   doesn't send the table round again.
 *
 * Default values (unwrapped) are a safe no-op/empty state, matching every
 * other Context in this app.
 */

// A section as rendered: its key, whether it's open by default, and the
// PR numbers of its rows in display order.
export interface RenderedSection {
  key: string;
  defaultOpen: boolean;
  prNumbers: string[];
}

export interface SelectedPr {
  repo: string;
  prNumber: string;
}

export interface PrTableUiStateValue {
  // Open-state the user chose, by section key; a section not in here uses
  // its default.
  sectionOpenOverrides: Record<string, boolean>;
  isSectionOpen: (key: string, defaultOpen: boolean) => boolean;
  setSectionOpen: (key: string, open: boolean) => void;
  // By composite key (buildExpandedInsightsKey). An expanded row shows its
  // summary; a row whose details are open also shows the full insights
  // under it (until phase 4 moves them to the detail pane).
  expandedRows: Record<string, boolean>;
  setRowExpanded: (key: string, expanded: boolean) => void;
  toggleRowExpanded: (key: string) => void;
  detailRows: Record<string, boolean>;
  setRowDetailsOpen: (key: string, open: boolean) => void;
  toggleRowDetails: (key: string) => void;
  selectedPr: SelectedPr | null;
  setSelectedPr: (pr: SelectedPr | null) => void;
  reportRenderedSections: (sections: RenderedSection[]) => void;
}

// From the reported sections: how many are open, and the PR numbers in
// the open ones (display order, each once).
export interface PrTableOpenSectionsValue {
  openSectionCount: number;
  prNumbersInOpenSections: string[];
}

export const defaultPrTableUiState: PrTableUiStateValue = {
  sectionOpenOverrides: {},
  isSectionOpen: (_key, defaultOpen) => defaultOpen,
  setSectionOpen: () => {},
  expandedRows: {},
  setRowExpanded: () => {},
  toggleRowExpanded: () => {},
  detailRows: {},
  setRowDetailsOpen: () => {},
  toggleRowDetails: () => {},
  selectedPr: null,
  setSelectedPr: () => {},
  reportRenderedSections: () => {},
};

export const defaultPrTableOpenSections: PrTableOpenSectionsValue = {
  openSectionCount: 0,
  prNumbersInOpenSections: [],
};

export const PrTableUiStateContext = createContext<PrTableUiStateValue>(defaultPrTableUiState);
export const PrTableOpenSectionsContext = createContext<PrTableOpenSectionsValue>(defaultPrTableOpenSections);

export function usePrTableUiState(): PrTableUiStateValue {
  return useContext(PrTableUiStateContext);
}

export function usePrTableOpenSections(): PrTableOpenSectionsValue {
  return useContext(PrTableOpenSectionsContext);
}
