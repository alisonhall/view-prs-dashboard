import type { PrEntry } from "../types/pr-data.ts";
import type { EntryDerivedCache } from "./pr-entry-derived-cache.helpers.ts";

// The row filters' criteria object, and applying it to the stored rows
// (with each entry's match result cached).
export interface RowFilterCriteria {
  prNumbers: string[];
  includeLabels: string[];
  excludeLabels: string[];
  authorLogins: string[];
  assignedLogins: string[];
  approverLogins: string[];
  alwaysShowInReview: boolean;
  customComments: string;
  otherNotes: string;
  prDifficulty: string;
  // The Stories filter: "" (any), "none", "name-only", "url-only" or
  // "name-and-url".
  stories: string;
  analysisOfPr: string;
}

export type RowFilterCriteriaInput = {
  [K in keyof RowFilterCriteria]?: unknown;
};

export interface PrRowFilteringDeps {
  rowMatchesUiFilters?: (entry: PrEntry, criteria: RowFilterCriteria) => boolean;
  getOrCompute?: EntryDerivedCache["getOrCompute"];
  getOrComputeLatest?: EntryDerivedCache["getOrComputeLatest"];
}

const asStringArray = (value: unknown): string[] => (Array.isArray(value) ? value : []);

const createPrRowFilteringHelpers = ({
  rowMatchesUiFilters,
  getOrCompute,
  getOrComputeLatest,
}: PrRowFilteringDeps = {}) => {
  const rowMatchesUiFiltersSafe =
    typeof rowMatchesUiFilters === "function"
      ? rowMatchesUiFilters
      : () => true;
  // Defaults to an uncached passthrough so callers/tests that don't wire
  // a shared cache in keep working exactly as before - the cache is
  // purely a perf optimization, never required for correctness.
  const getOrComputeSafe: EntryDerivedCache["getOrCompute"] =
    typeof getOrCompute === "function" ? getOrCompute : (_entry, _key, compute) => compute();

  const buildRowFilterCriteria = ({
    prNumbers,
    includeLabels,
    excludeLabels,
    authorLogins,
    assignedLogins,
    approverLogins,
    alwaysShowInReview,
    customComments,
    otherNotes,
    prDifficulty,
    stories,
    analysisOfPr,
  }: RowFilterCriteriaInput = {}): RowFilterCriteria => ({
    prNumbers: asStringArray(prNumbers),
    includeLabels: asStringArray(includeLabels),
    excludeLabels: asStringArray(excludeLabels),
    authorLogins: asStringArray(authorLogins),
    assignedLogins: asStringArray(assignedLogins),
    approverLogins: asStringArray(approverLogins),
    alwaysShowInReview: Boolean(alwaysShowInReview),
    customComments: String(customComments || ""),
    otherNotes: String(otherNotes || ""),
    prDifficulty: String(prDifficulty || ""),
    stories: String(stories || ""),
    analysisOfPr: String(analysisOfPr || ""),
  });

  const applyRowUiFilters = <E extends PrEntry>(rows: E[] | null | undefined, criteria: RowFilterCriteria): E[] => {
    const safeRows = Array.isArray(rows) ? rows : [];
    // rowMatchesUiFilters is a fairly expensive, many-condition predicate
    // re-run for every entry on every render. Caching per (entry, current
    // filter criteria) means an *unchanged* entry's match result is
    // reused instead of recomputed - correctness is unaffected (a changed
    // entry is a different object reference/cache miss; a changed filter
    // selection changes filtersFingerprint, busting every entry's cached
    // result for it) while an actual delta-changed subset of entries does
    // real new work.
    //
    // Only the latest criteria's result is kept per entry
    // (getOrComputeLatest), NOT one result per fingerprint ever seen:
    // the 6 free-text filter fields are undebounced, so every keystroke
    // is a new fingerprint, and a key-per-fingerprint cache grew by one
    // permanent result per keystroke per loaded PR until Chrome killed
    // the renderer ("Error code: 5"). Callers that only inject a plain
    // getOrCompute (no getOrComputeLatest) still get the old
    // key-per-fingerprint behavior, which is unbounded - wire both.
    const filtersFingerprint = JSON.stringify(criteria);
    return safeRows.filter((entry) =>
      typeof getOrComputeLatest === "function"
        ? getOrComputeLatest(entry, "filterMatch", filtersFingerprint, () =>
            rowMatchesUiFiltersSafe(entry, criteria),
          )
        : getOrComputeSafe(entry, `filterMatch:${filtersFingerprint}`, () =>
            rowMatchesUiFiltersSafe(entry, criteria),
          ),
    );
  };

  return {
    buildRowFilterCriteria,
    applyRowUiFilters,
  };
};

export { createPrRowFilteringHelpers };
