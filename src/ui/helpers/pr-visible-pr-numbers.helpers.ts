import type { PrDataPayload, PrEntry } from "../types/pr-data.ts";
import type { RowFilterCriteria, RowFilterCriteriaInput } from "./pr-row-filtering.helpers.ts";
import { parsePrFilterInput, prFilterPicksPrs } from "./pr-filter-input.helpers.ts";
import type { AttentionConfig } from "./pr-needs-attention.helpers.ts";
import { buildPrEntryKey } from "./pr-entry-keys.helpers.ts";
import { parseSearchTerms } from "./pr-row-search.helpers.ts";

// Which PRs the table shows for the current filters, computed reactively
// (useVisiblePrNumbers wires it to Context). Composes the injected
// narrowing and row-filter helpers (narrowRows/buildRowFilterCriteria/
// applyRowUiFilters) rather than reimplementing them.
export interface RowFilterSelections {
  includeLabels?: string[];
  excludeLabels?: string[];
  authorLogins?: string[];
  assignedLogins?: string[];
  approverLogins?: string[];
}

interface NarrowRowsInput {
  rows: PrEntry[];
  picksPrs: boolean;
  alwaysShowInReview: boolean;
  onlyNeedsAttention: boolean;
  onlyOpenConversationsWithMe: boolean;
  onlyWaitingOnMe: boolean;
  onlyThreadsToCheck: boolean;
  attentionConfig: AttentionConfig | undefined;
}

export interface PrVisiblePrNumbersDeps {
  narrowRows?: (input: NarrowRowsInput) => PrEntry[];
  buildRowFilterCriteria?: (input: RowFilterCriteriaInput) => RowFilterCriteria;
  applyRowUiFilters?: (rows: PrEntry[], criteria: RowFilterCriteria) => PrEntry[];
}

export interface VisiblePrNumbersInput {
  payload?: PrDataPayload | null;
  // The filter bar's "Only PRs that need attention", and Conversations'
  // "Open conversations with me", "Waiting on me" and "Resolved for you
  // to check".
  onlyNeedsAttention?: boolean;
  onlyOpenConversationsWithMe?: boolean;
  onlyWaitingOnMe?: boolean;
  onlyThreadsToCheck?: boolean;
  filterPrNumbersRaw?: string;
  attentionConfig?: AttentionConfig;
  rowFilterSelections?: RowFilterSelections;
  alwaysShowInReview?: boolean;
  customComments?: string;
  otherNotes?: string;
  prDifficulty?: string;
  stories?: string;
  analysisOfPr?: string;
  // The search box, as typed.
  search?: string;
}

export interface VisiblePrNumbersResult {
  // Each shown row's repo-and-number key ("owner/repo#123"): a bare
  // number would also match another repo's PR with it.
  visiblePrKeys: string[];
  // Every stored row, before any filter (the filter bar's "of M").
  totalCount: number;
  // The search box's words, as applied.
  searchTerms: string[];
}

const createPrVisiblePrNumbersHelpers = ({
  narrowRows,
  buildRowFilterCriteria,
  applyRowUiFilters,
}: PrVisiblePrNumbersDeps = {}) => {
  const narrowRowsSafe =
    typeof narrowRows === "function" ? narrowRows : ({ rows }: NarrowRowsInput) => (Array.isArray(rows) ? rows : []);
  // Without the real builder, the input object stands in for the criteria
  // (as before conversion); only tests rely on this.
  const buildRowFilterCriteriaSafe =
    typeof buildRowFilterCriteria === "function"
      ? buildRowFilterCriteria
      : (input: RowFilterCriteriaInput) => input as RowFilterCriteria;
  const applyRowUiFiltersSafe =
    typeof applyRowUiFilters === "function" ? applyRowUiFilters : (rows: PrEntry[]) => rows;

  const computeVisiblePrNumbers = ({
    payload,
    onlyNeedsAttention = false,
    onlyOpenConversationsWithMe = false,
    onlyWaitingOnMe = false,
    onlyThreadsToCheck = false,
    filterPrNumbersRaw,
    attentionConfig,
    rowFilterSelections = {},
    alwaysShowInReview,
    customComments,
    otherNotes,
    prDifficulty,
    stories,
    analysisOfPr,
    search,
  }: VisiblePrNumbersInput = {}): VisiblePrNumbersResult => {
    const allEntries = Object.values(payload?.byPrNumber || {});

    const prFilter = parsePrFilterInput(filterPrNumbersRaw);
    const searchTerms = parseSearchTerms(search);

    // PRs picked by number (or repo and number), and those marked In review
    // with "Always show PRs in review", show whatever the "only" checkboxes
    // say.
    const narrowedRows = narrowRowsSafe({
      rows: allEntries,
      picksPrs: prFilterPicksPrs(prFilter),
      alwaysShowInReview: Boolean(alwaysShowInReview),
      onlyNeedsAttention: Boolean(onlyNeedsAttention),
      onlyOpenConversationsWithMe: Boolean(onlyOpenConversationsWithMe),
      onlyWaitingOnMe: Boolean(onlyWaitingOnMe),
      onlyThreadsToCheck: Boolean(onlyThreadsToCheck),
      attentionConfig,
    });

    const criteria = buildRowFilterCriteriaSafe({
      prNumbers: prFilter.prNumbers,
      prKeys: prFilter.prKeys,
      repos: prFilter.repos,
      includeLabels: rowFilterSelections.includeLabels,
      excludeLabels: rowFilterSelections.excludeLabels,
      authorLogins: rowFilterSelections.authorLogins,
      assignedLogins: rowFilterSelections.assignedLogins,
      approverLogins: rowFilterSelections.approverLogins,
      alwaysShowInReview,
      customComments,
      otherNotes,
      prDifficulty,
      stories,
      analysisOfPr,
      searchTerms,
    });

    const filteredRows = applyRowUiFiltersSafe(narrowedRows, criteria);

    const visiblePrKeys = filteredRows
      .map((entry) => {
        const prNumber = String(entry?.data?.number ?? entry?.prNumber ?? "").trim();
        return prNumber ? buildPrEntryKey(entry?.repo, prNumber) : "";
      })
      .filter(Boolean);

    return { visiblePrKeys, totalCount: allEntries.length, searchTerms };
  };

  return {
    computeVisiblePrNumbers,
  };
};

export { createPrVisiblePrNumbersHelpers };
