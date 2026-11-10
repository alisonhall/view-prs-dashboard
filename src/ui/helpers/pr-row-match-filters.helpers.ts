import type { PrData, PrEntry } from "../types/pr-data.ts";
import type { ManualNotesFieldSummary } from "./pr-manual-notes-summary.helpers.ts";
import type { RowFilterCriteria } from "./pr-row-filtering.helpers.ts";
import type { GetPreferredActorKey } from "./pr-actor-identity.helpers.ts";
import { prFilterPicksPrs, rowMatchesPrFilter } from "./pr-filter-input.helpers.ts";
import { matchRowSearch } from "./pr-row-search.helpers.ts";
import { isInLastActivityRange } from "./pr-last-activity-range.helpers.ts";

// Whether one PR entry passes the table's row filters (PR numbers, repos,
// last activity, labels, people, notes fields). Pure with respect to its (entry, filters) args;
// useVisiblePrNumbers injects the actor-identity and notes lookups from
// Context.
interface LoginRecord {
  login: string;
}

export interface PrRowMatchFiltersDeps {
  getPreferredActorKey?: GetPreferredActorKey;
  collectAssignedUsers?: (row: PrData) => LoginRecord[];
  collectApproversFromRow?: (row: PrData) => LoginRecord[];
  extractRowLabelNames?: (row: PrData) => string[];
  normalizeFilterToken?: (value: string) => string;
  getManualNotesFieldSummary?: (entry: PrEntry, row: PrData) => Partial<ManualNotesFieldSummary>;
  isInReviewEnabled?: (row: PrData) => boolean;
  // The author's name as the row shows it, for the search box.
  getAuthorDisplayName?: (row: PrData) => string;
}

const createPrRowMatchFiltersHelpers = ({
  getPreferredActorKey,
  collectAssignedUsers,
  collectApproversFromRow,
  extractRowLabelNames,
  normalizeFilterToken,
  getManualNotesFieldSummary,
  isInReviewEnabled,
  getAuthorDisplayName,
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

    // The PRs field: PRs it picks show whatever the other filters say; repos
    // alone filter like the rest.
    const prFilter = { prNumbers: filters.prNumbers, prKeys: filters.prKeys || [], repos: filters.repos || [] };
    if (
      (prFilterPicksPrs(prFilter) || prFilter.repos.length > 0) &&
      !rowMatchesPrFilter(String(entry?.repo || ""), prNumber, prFilter)
    ) {
      return false;
    }

    if (prFilterPicksPrs(prFilter)) {
      return true;
    }

    // The Repos list: a repo picked, whatever its case.
    if (filters.repoNames?.length > 0) {
      const repo = String(entry?.repo || "").trim().toLowerCase();
      if (!filters.repoNames.some((name) => String(name).trim().toLowerCase() === repo)) {
        return false;
      }
    }

    if (!isInLastActivityRange(entry, filters.lastActivityFrom, filters.lastActivityTo)) {
      return false;
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

    // People compare by person: a pick (their id, or a login saved before
    // ids) and the row's logins as their keys.
    const keyOf = (login: string) => getPreferredActorKeySafe(login) || login;
    if (
      filters.authorLogins.length > 0 &&
      !filters.authorLogins.some((login) => keyOf(login) === authorLogin)
    ) {
      return false;
    }

    if (
      filters.assignedLogins.length > 0 &&
      !filters.assignedLogins.some((login) => assignedLogins.includes(keyOf(login)))
    ) {
      return false;
    }

    if (
      filters.approverLogins.length > 0 &&
      !filters.approverLogins.some((login) => approverLogins.includes(keyOf(login)))
    ) {
      return false;
    }

    if (
      filters.searchTerms?.length > 0 &&
      !matchRowSearch(entry, filters.searchTerms, getAuthorDisplayName ? [getAuthorDisplayName(row)] : []).matches
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

    // Stories: "none" means no story rows; the others match when at least
    // one row has only a name, only a URL, or both.
    if (filters.stories === "none" && notesSummary.hasStories) {
      return false;
    }
    if (filters.stories === "name-only" && !notesSummary.hasStoryNameOnly) {
      return false;
    }
    if (filters.stories === "url-only" && !notesSummary.hasStoryUrlOnly) {
      return false;
    }
    if (filters.stories === "name-and-url" && !notesSummary.hasStoryNameAndUrl) {
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
