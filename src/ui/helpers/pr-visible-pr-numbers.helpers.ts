import type { PrDataPayload, PrEntry } from "../types/pr-data.ts";
import type { RowFilterCriteria, RowFilterCriteriaInput } from "./pr-row-filtering.helpers.ts";
import { parsePrFilterInput, prFilterPicksPrs } from "./pr-filter-input.helpers.ts";
import type { AttentionConfig } from "./pr-needs-attention.helpers.ts";
import { buildPrEntryKey } from "./pr-entry-keys.helpers.ts";
import { parseSearchTerms } from "./pr-row-search.helpers.ts";

// Which PRs the table shows for the current filters, computed reactively
// (useVisiblePrNumbers wires it to Context). Composes the injected scope
// and row-filter helpers (resolveScopedRows/buildRowFilterCriteria/
// applyRowUiFilters) rather than reimplementing them. Returns
// `{ visiblePrKeys, scopeLabel }`: the scope label names the scope that
// applied, and falls out of the same scope-resolution pass.
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
  runStampsByRepo: Record<string, string>;
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
  // The search box, as typed.
  search?: string;
}

export interface VisiblePrNumbersResult {
  // Each shown row's repo-and-number key ("owner/repo#123"): a bare
  // number would also match another repo's PR with it.
  visiblePrKeys: string[];
  scopeLabel: string;
  // Every stored row, before scope and filters (the filter bar's "of M").
  totalCount: number;
  // The search box's words, as applied.
  searchTerms: string[];
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
    search,
  }: VisiblePrNumbersInput = {}): VisiblePrNumbersResult => {
    const allEntries = Object.values(payload?.byPrNumber || {});
    // "Last run rows": the rows the last full run saw (lastFullRun - not
    // lastRun, which a refresh of a few PRs moves too).
    const lastFullRun = payload?.lastFullRun || payload?.lastRun || null;
    const runStamp = String(lastFullRun?.updatedAt || "").trim();
    // Each repo's own last full run: several repos' runs take turns, and
    // the global one is only the latest's.
    const runStampsByRepo = Object.fromEntries(
      Object.entries(payload?.lastFullRunByRepo || {})
        .map(([repo, run]) => [repo, String(run?.updatedAt || "").trim()])
        .filter(([, stamp]) => stamp),
    );

    const prFilter = parsePrFilterInput(filterPrNumbersRaw);
    const searchTerms = parseSearchTerms(search);

    const selectedScope = normalizeSelectedScopeSafe(scopeMode);
    // PRs picked by number (or repo and number) show whatever the scope.
    const ignoreScopeForPrNumberFilter = prFilterPicksPrs(prFilter);
    const useLastRunScope = selectedScope === "last-run";

    const { rows: scopedRows, scopeLabel } = resolveScopedRowsSafe({
      rowsForRepo: allEntries,
      ignoreScopeForPrNumberFilter,
      runStamp,
      runStampsByRepo,
      useLastRunScope,
      selectedScope,
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

    const filteredRows = applyRowUiFiltersSafe(scopedRows, criteria);

    const visiblePrKeys = filteredRows
      .map((entry) => {
        const prNumber = String(entry?.data?.number ?? entry?.prNumber ?? "").trim();
        return prNumber ? buildPrEntryKey(entry?.repo, prNumber) : "";
      })
      .filter(Boolean);

    return { visiblePrKeys, scopeLabel, totalCount: allEntries.length, searchTerms };
  };

  return {
    computeVisiblePrNumbers,
  };
};

export { createPrVisiblePrNumbersHelpers };
