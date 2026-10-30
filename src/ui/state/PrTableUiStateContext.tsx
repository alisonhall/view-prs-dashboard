import { createContext, useContext } from 'react';

/**
 * The PR table's own UI state, owned by PrTableUiStateProvider (which
 * wraps <AppShell /> in react-app.tsx): which sections are open, which
 * rows show their summary, and the detail pane (UI_REDESIGN_PLAN.md,
 * phase 4): the selected PR, whether the pane is shown, and its tab. It
 * lives above the table so Settings › Export can read it: Export exports the
 * rows of the open sections, and used to work that out by reading
 * `<details open>` and class names from the DOM.
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

export type PaneTab = 'overview' | 'activity' | 'conversations' | 'notes' | 'custom';

export interface PrTableUiStateValue {
  // Open-state the user chose, by section key; a section not in here uses
  // its default.
  sectionOpenOverrides: Record<string, boolean>;
  isSectionOpen: (key: string, defaultOpen: boolean) => boolean;
  setSectionOpen: (key: string, open: boolean) => void;
  // By composite key (buildExpandedInsightsKey): rows showing their
  // summary.
  expandedRows: Record<string, boolean>;
  setRowExpanded: (key: string, expanded: boolean) => void;
  toggleRowExpanded: (key: string) => void;
  // The PR the detail pane shows; null shows its empty state.
  selectedPr: SelectedPr | null;
  setSelectedPr: (pr: SelectedPr | null) => void;
  // Whether the detail pane is shown, saved in localStorage (per browser).
  isPaneVisible: boolean;
  setPaneVisible: (visible: boolean) => void;
  // The pane's tab. The last one picked stays for every PR opened after
  // it, in memory only.
  paneTab: PaneTab;
  setPaneTab: (tab: PaneTab) => void;
  // Also how many of the PRs the filters let through are in no rendered
  // section, because Settings › Appearance hid all of theirs.
  reportRenderedSections: (sections: RenderedSection[], hiddenPrCount?: number) => void;
}

// From the reported sections: how many are open, the PR numbers in the
// open ones (display order, each once), and how many PRs are only in
// hidden sections (the filter bar's count mentions them).
export interface PrTableOpenSectionsValue {
  openSectionCount: number;
  prNumbersInOpenSections: string[];
  hiddenPrCount: number;
}

export const defaultPrTableUiState: PrTableUiStateValue = {
  sectionOpenOverrides: {},
  isSectionOpen: (_key, defaultOpen) => defaultOpen,
  setSectionOpen: () => {},
  expandedRows: {},
  setRowExpanded: () => {},
  toggleRowExpanded: () => {},
  selectedPr: null,
  setSelectedPr: () => {},
  isPaneVisible: true,
  setPaneVisible: () => {},
  paneTab: 'overview',
  setPaneTab: () => {},
  reportRenderedSections: () => {},
};

export const defaultPrTableOpenSections: PrTableOpenSectionsValue = {
  openSectionCount: 0,
  prNumbersInOpenSections: [],
  hiddenPrCount: 0,
};

export const PrTableUiStateContext = createContext<PrTableUiStateValue>(defaultPrTableUiState);
export const PrTableOpenSectionsContext = createContext<PrTableOpenSectionsValue>(defaultPrTableOpenSections);

export function usePrTableUiState(): PrTableUiStateValue {
  return useContext(PrTableUiStateContext);
}

export function usePrTableOpenSections(): PrTableOpenSectionsValue {
  return useContext(PrTableOpenSectionsContext);
}
