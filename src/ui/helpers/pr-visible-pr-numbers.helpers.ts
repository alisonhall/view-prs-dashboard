import type { PrDataPayload, PrEntry } from "../types/pr-data.ts";
import type { RowFilterCriteria, RowFilterCriteriaInput } from "./pr-row-filtering.helpers.ts";
import { parseCsvTokens } from "./form-parsing.helpers.ts";
import type { AttentionConfig } from "./pr-needs-attention.helpers.ts";

// Which PRs the table shows for the current filters, computed reactively
// (useVisiblePrNumbers wires it to Context). Composes the injected scope
// and row-filter helpers (resolveScopedRows/buildRowFilterCriteria/
// applyRowUiFilters) rather than reimplementing them. Returns
// `{ visiblePrNumbers, scopeLabel }`: useAppliedFilterSummary needs the
// scope label too, and it falls out of the same scope-resolution pass.
export interface RowFilterSelections {
  includeLabels?: string[];
  excludeLabels?: string[];
  authorLogins?: string[];
  assignedLogins?: string[];
  approverLogins?: string[];
}

interface ScopedRowsInput {
  rowsForRepo: PrEntry[];
  ignoreScopeForPrNumberFilter: boolean;
  runStamp: string;
  useLastRunScope: boolean;
  selectedScope: string;
  attentionConfig: AttentionConfig | undefined;
}

export interface PrVisiblePrNumbersDeps {
  resolveScopedRows?: (input: ScopedRowsInput) => { rows: PrEntry[]; scopeLabel: string };
  normalizeSelectedScope?: (scopeMode: unknown) => string;
  buildRowFilterCriteria?: (input: RowFilterCriteriaInput) => RowFilterCriteria;
  applyRowUiFilters?: (rows: PrEntry[], criteria: RowFilterCriteria) => PrEntry[];
}

export interface VisiblePrNumbersInput {
  payload?: PrDataPayload | null;
  scopeMode?: string;
  filterPrNumbersRaw?: string;
  attentionConfig?: AttentionConfig;
  rowFilterSelections?: RowFilterSelections;
  alwaysShowInReview?: boolean;
  customComments?: string;
  otherNotes?: string;
  prDifficulty?: string;
  stories?: string;
  analysisOfPr?: string;
}

export interface VisiblePrNumbersResult {
  visiblePrNumbers: string[];
  scopeLabel: string;
  // Every stored row, before scope and filters (the filter bar's "of M").
  totalCount: number;
}

const createPrVisiblePrNumbersHelpers = ({
  resolveScopedRows,
  normalizeSelectedScope,
  buildRowFilterCriteria,
  applyRowUiFilters,
}: PrVisiblePrNumbersDeps = {}) => {
  const resolveScopedRowsSafe =
    typeof resolveScopedRows === "function"
      ? resolveScopedRows
      : ({ rowsForRepo }: ScopedRowsInput) => ({
          rows: Array.isArray(rowsForRepo) ? rowsForRepo : [],
          scopeLabel: "all stored rows",
        });
  const normalizeSelectedScopeSafe =
    typeof normalizeSelectedScope === "function" ? normalizeSelectedScope : () => "all";
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
    scopeMode,
    filterPrNumbersRaw,
    attentionConfig,
    rowFilterSelections = {},
    alwaysShowInReview,
    customComments,
    otherNotes,
    prDifficulty,
    stories,
    analysisOfPr,
  }: VisiblePrNumbersInput = {}): VisiblePrNumbersResult => {
    const allEntries = Object.values(payload?.byPrNumber || {});
    const lastRun = payload?.lastRun || null;
    const runStamp = String(lastRun?.updatedAt || "").trim();

    const filterPrNumbers = parseCsvTokens(filterPrNumbersRaw)
      .map((value) => String(value || "").trim())
      .filter((value) => /^\d+$/.test(value));

    const selectedScope = normalizeSelectedScopeSafe(scopeMode);
    const ignoreScopeForPrNumberFilter = filterPrNumbers.length > 0;
    const useLastRunScope = selectedScope === "last-run";

    const { rows: scopedRows, scopeLabel } = resolveScopedRowsSafe({
      rowsForRepo: allEntries,
      ignoreScopeForPrNumberFilter,
      runStamp,
      useLastRunScope,
      selectedScope,
      attentionConfig,
    });

    const criteria = buildRowFilterCriteriaSafe({
      prNumbers: filterPrNumbers,
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
    });

    const filteredRows = applyRowUiFiltersSafe(scopedRows, criteria);

    const visiblePrNumbers = filteredRows
      .map((entry) => String(entry?.data?.number ?? entry?.prNumber ?? ""))
      .filter(Boolean);

    return { visiblePrNumbers, scopeLabel, totalCount: allEntries.length };
  };

  return {
    computeVisiblePrNumbers,
  };
};

export { createPrVisiblePrNumbersHelpers };
