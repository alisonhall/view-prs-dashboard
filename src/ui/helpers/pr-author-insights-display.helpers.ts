import type { PrEntry } from "../types/pr-data.ts";
import type {
  ActorsMap,
  GetPreferredActorKey,
  ResolveActorDisplayName,
} from "./pr-actor-identity.helpers.ts";
import type { AuthorManualComment } from "./pr-author-insights-data.helpers.ts";

// Author Insights' display helpers: the author dropdown's options,
// sentiment and status badge labels/classes, and newest-first sorting of
// comments, notes and created PRs. (Whether a note is about the selected
// author is pr-author-insights-identity.helpers.ts's
// noteAuthorMatchesSelection.)

export interface AuthorOption {
  login: string;
  name: string;
}

// A note comment found on a PR, with the PR entry it belongs to.
export interface AuthorNoteMatch {
  entry?: PrEntry & { updatedAt?: string };
  comment?: { createdAt?: string; updatedAt?: string };
}

// The functions are required by the helpers that use them; the argument
// itself stays optional, as before conversion.
export interface PrAuthorInsightsDisplayDeps {
  resolveActorDisplayName?: ResolveActorDisplayName;
  getPreferredActorKey?: GetPreferredActorKey;
  normalizeAuthorInsightsSentiment?: (value: unknown) => string;
  isChangedStatus?: (status: unknown) => boolean;
  asArray?: (value: unknown) => unknown[];
  parseSortableTime?: (value: unknown) => number;
  formatIsoDatetime?: (value: unknown) => string;
}

// Entries plus the data fields only these sorts read.
type CreatedPrEntry = PrEntry & { data?: PrEntry["data"] & { updatedAt?: string } };

const createPrAuthorInsightsDisplayHelpers = (deps: PrAuthorInsightsDisplayDeps = {}) => {
  const { getPreferredActorKey, formatIsoDatetime, asArray } = deps;
  // Called without fallbacks, as before conversion: a helper whose
  // dependency is missing throws.
  const resolveActorDisplayName = deps.resolveActorDisplayName as ResolveActorDisplayName;
  const getPreferredActorKeyFn = getPreferredActorKey as GetPreferredActorKey;
  const normalizeAuthorInsightsSentiment = deps.normalizeAuthorInsightsSentiment as (value: unknown) => string;
  const isChangedStatus = deps.isChangedStatus as (status: unknown) => boolean;
  const parseSortableTime = deps.parseSortableTime as (value: unknown) => number;
  const formatIsoDatetimeFn = formatIsoDatetime as (value: unknown) => string;

  // Every PR author plus everyone in actorsMap, sorted by display name.
  const buildAuthorInsightsEntries = (rows: PrEntry[], actorsMap: ActorsMap = {}): AuthorOption[] => {
    const authors = new Map<string, string>();
    const addAuthorOption = (login: unknown, fallbackName: unknown = "") => {
      const authorLogin = String(login || "").trim();
      if (!authorLogin) return;
      if (authors.has(authorLogin)) return;
      authors.set(
        authorLogin,
        resolveActorDisplayName(authorLogin, actorsMap, fallbackName as string),
      );
    };

    rows.forEach((entry) => {
      const row = entry?.data || {};
      addAuthorOption(getPreferredActorKeyFn(row.authorLogin, row.author), row.author);
    });

    Object.entries(actorsMap || {}).forEach(([login, name]) => {
      addAuthorOption(login, name);
    });

    return Array.from(authors.entries())
      .map(([login, name]) => ({ login, name }))
      .sort((a, b) =>
        String(a.name || a.login).localeCompare(String(b.name || b.login)),
      );
  };

  const getAuthorInsightsSentimentLabel = (value: unknown): string => {
    const sentiment = normalizeAuthorInsightsSentiment(value);
    if (sentiment === "positive") return "Positive";
    if (sentiment === "negative") return "Negative";
    return "Neutral";
  };

  const getAuthorInsightsSentimentBadgeClassName = (value: unknown): string => {
    const sentiment = normalizeAuthorInsightsSentiment(value);
    return `author-insights-badge-sentiment-${sentiment}`;
  };

  const getAuthorInsightsStatusBadgeClassName = (value: unknown): string => {
    const status = String(value || "").trim().toUpperCase();
    if (status === "MERGED") {
      return "author-insights-badge-status-merged";
    }
    if (status === "CLOSED") {
      return "author-insights-badge-status-closed";
    }
    if (isChangedStatus(status)) {
      return "author-insights-badge-status-changed";
    }
    if (status === "NO_CHANGE") {
      return "author-insights-badge-status-no-change";
    }
    if (status === "NO_ACTIVITY") {
      return "author-insights-badge-status-no-activity";
    }
    return "author-insights-badge-status-default";
  };

  // MERGED or CLOSED when the PR is, otherwise the script's status.
  const getAuthorInsightsCreatedPrStatus = (entry: PrEntry | null | undefined): string => {
    if (String(entry?.data?.mergedAt || "").trim()) {
      return "MERGED";
    }
    if (
      String(entry?.data?.closedAt || "").trim() ||
      String(entry?.section || "").trim().toLowerCase() === "closed"
    ) {
      return "CLOSED";
    }
    return String(entry?.data?.status || "-").trim().toUpperCase() || "-";
  };

  const sortAuthorInsightsManualCommentsDesc = (
    comments: AuthorManualComment[] | null | undefined,
  ): AuthorManualComment[] =>
    (Array.isArray(comments) ? comments.slice() : []).sort((a, b) => {
      const dateA = parseSortableTime(a?.createdAt || a?.updatedAt || "");
      const dateB = parseSortableTime(b?.createdAt || b?.updatedAt || "");
      if (dateA !== dateB) {
        return dateB - dateA;
      }
      return String(b?.id || "").localeCompare(String(a?.id || ""));
    });

  const sortAuthorInsightsNoteMatchesDesc = <M extends AuthorNoteMatch>(matches: M[] | null | undefined): M[] =>
    (Array.isArray(matches) ? matches.slice() : []).sort((a, b) => {
      const dateA = parseSortableTime(
        a?.comment?.createdAt || a?.comment?.updatedAt || a?.entry?.updatedAt || "",
      );
      const dateB = parseSortableTime(
        b?.comment?.createdAt || b?.comment?.updatedAt || b?.entry?.updatedAt || "",
      );
      if (dateA !== dateB) {
        return dateB - dateA;
      }
      return Number(b?.entry?.prNumber || 0) - Number(a?.entry?.prNumber || 0);
    });

  // The first parseable timestamp among the note's and its PR's dates.
  const getAuthorInsightsNoteDisplayTimestamp = (
    comment: { createdAt?: string; updatedAt?: string } | null | undefined,
    entry: CreatedPrEntry | null | undefined,
  ): string => {
    const candidates = [
      comment?.createdAt,
      comment?.updatedAt,
      entry?.updatedAt,
      entry?.data?.updatedAt,
      entry?.data?.sourceUpdatedAt,
    ];
    const valid = candidates.find((value) =>
      Number.isFinite(Date.parse(String(value || "").trim())),
    );
    return formatIsoDatetimeFn(valid || "-");
  };

  const sortAuthorInsightsCreatedPrsDesc = <E extends CreatedPrEntry>(rows: E[] | null | undefined): E[] =>
    (Array.isArray(rows) ? rows.slice() : []).sort((a, b) => {
      const dateA = parseSortableTime(
        a?.data?.mergedAt ||
          a?.data?.closedAt ||
          a?.data?.sourceUpdatedAt ||
          a?.updatedAt ||
          "",
      );
      const dateB = parseSortableTime(
        b?.data?.mergedAt ||
          b?.data?.closedAt ||
          b?.data?.sourceUpdatedAt ||
          b?.updatedAt ||
          "",
      );
      if (dateA !== dateB) {
        return dateB - dateA;
      }
      return Number(b?.prNumber || 0) - Number(a?.prNumber || 0);
    });

  return {
    buildAuthorInsightsEntries,
    getAuthorInsightsSentimentLabel,
    getAuthorInsightsSentimentBadgeClassName,
    getAuthorInsightsStatusBadgeClassName,
    getAuthorInsightsCreatedPrStatus,
    sortAuthorInsightsManualCommentsDesc,
    sortAuthorInsightsNoteMatchesDesc,
    getAuthorInsightsNoteDisplayTimestamp,
    sortAuthorInsightsCreatedPrsDesc,
    // Pass-through dependencies
    resolveActorDisplayName: deps.resolveActorDisplayName,
    getPreferredActorKey,
    formatIsoDatetime,
    asArray,
  };
};

export { createPrAuthorInsightsDisplayHelpers };

// Shared by useNavigateToAuthorInsights.jsx (the "jump to unsaved author
// draft" navigation path) and AuthorInsightsSelector.jsx (the Author
// dropdown's own validation/auto-select-first-author rule), so both
// validate a requested author login against the same current options the
// same way: the requested login if it's an option, else the first option.
export const resolveValidAuthorLogin = (
  authorOptions: AuthorOption[] | null | undefined,
  requestedLogin: string,
): string => {
  if (!Array.isArray(authorOptions) || authorOptions.length === 0) {
    return "";
  }
  if (authorOptions.some((option) => option.login === requestedLogin)) {
    return requestedLogin;
  }
  return (authorOptions[0] as AuthorOption).login;
};
