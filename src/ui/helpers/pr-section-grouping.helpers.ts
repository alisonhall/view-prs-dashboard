import type { PrEntry } from "../types/pr-data.ts";

// Splits PrTableApp's rows into the four lifecycle sections, each sorted
// (open/draft by PR number, closed/merged by close/merge date).
type RowSorter = <E extends PrEntry>(rows: E[]) => E[];
type DateRowSorter = <E extends PrEntry>(rows: E[], fieldName: string) => E[];

export interface PrSectionGroupingDeps {
  sortRowsByPrNumberDesc?: RowSorter;
  sortRowsByDateFieldDesc?: DateRowSorter;
}

export interface GroupedPrSections<E extends PrEntry> {
  open: E[];
  draft: E[];
  closed: E[];
  merged: E[];
}

const createPrSectionGroupingHelpers = ({
  sortRowsByPrNumberDesc,
  sortRowsByDateFieldDesc,
}: PrSectionGroupingDeps = {}) => {
  const sortRowsByPrNumberDescSafe: RowSorter =
    typeof sortRowsByPrNumberDesc === "function"
      ? sortRowsByPrNumberDesc
      : (value) => (Array.isArray(value) ? value : []);
  const sortRowsByDateFieldDescSafe: DateRowSorter =
    typeof sortRowsByDateFieldDesc === "function"
      ? sortRowsByDateFieldDesc
      : (value) => (Array.isArray(value) ? value : []);

  // Skips the re-filter and re-sort when `rows` is reference-identical
  // (same length, same entry at every position) to the last call - safe
  // because an unchanged PR entry keeps stable object identity across
  // polls (see pr-entry-derived-cache.helpers.js's own documented
  // guarantee, relied on the same way here); any real change means a
  // different reference at that position, so this only ever skips when
  // nothing that could affect grouping/sorting changed. Worst case (a
  // miss) behaves identically to before.
  let lastRows: PrEntry[] | null = null;
  let lastResult: GroupedPrSections<PrEntry> | null = null;

  const rowsUnchanged = (rows: PrEntry[]): boolean => {
    if (!lastRows || rows.length !== lastRows.length) {
      return false;
    }
    for (let index = 0; index < rows.length; index += 1) {
      if (rows[index] !== lastRows[index]) {
        return false;
      }
    }
    return true;
  };

  const buildGroupedPrSections = <E extends PrEntry>(rows: E[] | null | undefined): GroupedPrSections<E> => {
    const safeRows = Array.isArray(rows) ? rows : [];
    if (rowsUnchanged(safeRows) && lastResult) {
      // Same entries as last time, so the cached sections hold this E.
      return lastResult as GroupedPrSections<E>;
    }

    const result: GroupedPrSections<E> = {
      open: sortRowsByPrNumberDescSafe(
        safeRows.filter((entry) => entry.section === "open"),
      ),
      draft: sortRowsByPrNumberDescSafe(
        safeRows.filter((entry) => entry.section === "draft"),
      ),
      closed: sortRowsByDateFieldDescSafe(
        safeRows.filter((entry) => entry.section === "closed"),
        "closedAt",
      ),
      merged: sortRowsByDateFieldDescSafe(
        safeRows.filter((entry) => entry.section === "merged"),
        "mergedAt",
      ),
    };

    lastRows = safeRows;
    lastResult = result;
    return result;
  };

  return {
    buildGroupedPrSections,
  };
};

export { createPrSectionGroupingHelpers };
