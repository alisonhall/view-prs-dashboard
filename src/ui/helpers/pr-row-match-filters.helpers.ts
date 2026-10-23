import type { PrData, PrEntry } from "../types/pr-data.ts";
import type { ManualNotesFieldSummary } from "./pr-manual-notes-summary.helpers.ts";
import type { RowFilterCriteria } from "./pr-row-filtering.helpers.ts";

// Whether one PR entry passes the table's row filters (PR numbers, labels,
// people, notes fields). Pure with respect to its (entry, filters) args;
// useVisiblePrNumbers injects the actor-identity and notes lookups from
// Context.
interface LoginRecord {
  login: string;
}

export interface PrRowMatchFiltersDeps {
  getPreferredActorKey?: (login: unknown, fallback?: unknown) => string;
  collectAssignedUsers?: (row: PrData) => LoginRecord[];
  collectApproversFromRow?: (row: PrData) => LoginRecord[];
  extractRowLabelNames?: (row: PrData) => string[];
  normalizeFilterToken?: (value: string) => string;
  getManualNotesFieldSummary?: (entry: PrEntry, row: PrData) => Partial<ManualNotesFieldSummary>;
  isInReviewEnabled?: (row: PrData) => boolean;
}

const createPrRowMatchFiltersHelpers = ({
  getPreferredActorKey,
  collectAssignedUsers,
  collectApproversFromRow,
  extractRowLabelNames,
  normalizeFilterToken,
  getManualNotesFieldSummary,
  isInReviewEnabled,
}: PrRowMatchFiltersDeps = {}) => {
  const getPreferredActorKeySafe =
    typeof getPreferredActorKey === "function" ? getPreferredActorKey : () => "";
  const collectAssignedUsersSafe =
    typeof collectAssignedUsers === "function" ? collectAssignedUsers : (): LoginRecord[] => [];
  const collectApproversFromRowSafe =
    typeof collectApproversFromRow === "function" ? collectApproversFromRow : (): LoginRecord[] => [];
  const extractRowLabelNamesSafe =
    typeof extractRowLabelNames === "function" ? extractRowLabelNames : (): string[] => [];
  const normalizeFilterTokenSafe =
    typeof normalizeFilterToken === "function" ? normalizeFilterToken : (value: string) => value;
  const getManualNotesFieldSummarySafe =
    typeof getManualNotesFieldSummary === "function"
      ? getManualNotesFieldSummary
      : (): Partial<ManualNotesFieldSummary> => ({});
  const isInReviewEnabledSafe =
    typeof isInReviewEnabled === "function" ? isInReviewEnabled : () => false;

  const rowMatchesUiFilters = (entry: PrEntry | null | undefined, filters: RowFilterCriteria): boolean => {
    const row: PrData = entry?.data || {};
    const labels = extractRowLabelNamesSafe(row)
      .map((label) => normalizeFilterTokenSafe(label))
      .filter(Boolean);
    const prNumber = String(row.number || entry?.prNumber || "").trim();
    const authorLogin = getPreferredActorKeySafe(row.authorLogin, row.author);
    const assignedLogins = collectAssignedUsersSafe(row).map((user) => user.login);
    const approverLogins = collectApproversFromRowSafe(row).map((user) => user.login);

    if (filters.alwaysShowInReview && isInReviewEnabledSafe(row)) {
      return true;
    }

    if (filters.prNumbers.length > 0 && !filters.prNumbers.includes(prNumber)) {
      return false;
    }

    if (filters.prNumbers.length > 0) {
      return true;
    }

    if (
      filters.includeLabels.length > 0 &&
      !filters.includeLabels.some((label) =>
        labels.includes(normalizeFilterTokenSafe(label)),
      )
    ) {
      return false;
    }

    if (
      filters.excludeLabels.length > 0 &&
      filters.excludeLabels.some((label) =>
        labels.includes(normalizeFilterTokenSafe(label)),
      )
    ) {
      return false;
    }

    if (
      filters.authorLogins.length > 0 &&
      !filters.authorLogins.includes(authorLogin)
    ) {
      return false;
    }

    if (
      filters.assignedLogins.length > 0 &&
      !filters.assignedLogins.some((login) => assignedLogins.includes(login))
    ) {
      return false;
    }

    if (
      filters.approverLogins.length > 0 &&
      !filters.approverLogins.some((login) => approverLogins.includes(login))
    ) {
      return false;
    }

    // entry may be missing here (callers always pass one); the summary
    // helper treats that like an entry with no notes.
    const notesSummary = getManualNotesFieldSummarySafe(entry as PrEntry, row);

    if (filters.customComments === "with" && !notesSummary.hasCustomComments) {
      return false;
    }
    if (filters.customComments === "without" && notesSummary.hasCustomComments) {
      return false;
    }

    if (filters.otherNotes === "with" && !notesSummary.hasOtherNotes) {
      return false;
    }
    if (filters.otherNotes === "without" && notesSummary.hasOtherNotes) {
      return false;
    }

    if (filters.prDifficulty === "not-set" && notesSummary.hasDifficulty) {
      return false;
    }
    if (
      filters.prDifficulty &&
      filters.prDifficulty !== "not-set" &&
      notesSummary.difficultyLevelText !== filters.prDifficulty
    ) {
      return false;
    }

    if (filters.rallyStories === "with" && !notesSummary.hasRallyStories) {
      return false;
    }
    if (filters.rallyStories === "without" && notesSummary.hasRallyStories) {
      return false;
    }

    if (filters.rallyLinks === "with" && !notesSummary.hasRallyLinks) {
      return false;
    }
    if (filters.rallyLinks === "without" && notesSummary.hasRallyLinks) {
      return false;
    }

    if (filters.analysisOfPr === "with" && !notesSummary.hasAnalysisOfPr) {
      return false;
    }
    if (filters.analysisOfPr === "without" && notesSummary.hasAnalysisOfPr) {
      return false;
    }

    return true;
  };

  return {
    rowMatchesUiFilters,
  };
};

export { createPrRowMatchFiltersHelpers };
