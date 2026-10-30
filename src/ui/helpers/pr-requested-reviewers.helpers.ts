import type { PrData } from "../types/pr-data.ts";
import type { ActorsMap, ResolveActorDisplayName } from "./pr-actor-identity.helpers.ts";

// A PR's requested reviewers, deduped by login. The request fields come in
// several shapes (plain logins, { login, name }, or the reviewer nested
// under requestedReviewer/reviewer/user), so they're read as unknown and
// narrowed here. collectRequestedReviewers means reviewers broadly: with no
// requests at all, whoever has reviewed is used. collectPendingReviewRequests
// is only the outstanding requests (GitHub drops one once that person
// reviews).

export interface PrRequestedReviewersDeps {
  asArray?: (value: unknown) => unknown[];
  resolveActorDisplayName?: ResolveActorDisplayName;
}

export interface RequestedReviewer {
  login: string;
  name: string;
}

type RequestedReviewersRow = PrData & {
  requestedReviewers?: unknown;
  reviewRequests?: unknown;
  reviewers?: unknown;
};

type LooseRecord = Record<string, unknown>;

const createPrRequestedReviewersHelpers = ({
  asArray,
  resolveActorDisplayName,
}: PrRequestedReviewersDeps = {}) => {
  // Callers pass typed lists; the injected asArray only coerces.
  const asArraySafe = <T>(value: T[] | null | undefined): T[] =>
    (typeof asArray === "function" ? asArray(value) : Array.isArray(value) ? value : []) as T[];
  const resolveActorDisplayNameSafe =
    typeof resolveActorDisplayName === "function"
      ? resolveActorDisplayName
      : (login: string, _actorsMap: ActorsMap, fallbackName?: string) =>
          String(fallbackName || login || "").trim();

  const collectReviewers = (row: RequestedReviewersRow | null | undefined, fallBackToReviews: boolean): RequestedReviewer[] => {
    const safeRow: RequestedReviewersRow = row || {};
    const ordered: RequestedReviewer[] = [];
    const seen = new Set<string>();

    const addReviewer = (login: unknown, name: unknown = "") => {
      const normalizedLogin = String(login || "").trim();
      if (!normalizedLogin || seen.has(normalizedLogin)) return;
      seen.add(normalizedLogin);
      ordered.push({ login: normalizedLogin, name: String(name || "").trim() });
    };

    const addFromValue = (value: unknown): void => {
      if (!value) return;
      if (Array.isArray(value)) {
        value.forEach(addFromValue);
        return;
      }
      if (typeof value === "string") {
        addReviewer(value, "");
        return;
      }
      if (typeof value !== "object") return;

      const record = value as LooseRecord;
      const nestedReviewer = record.requestedReviewer || record.reviewer || record.user || null;
      if (nestedReviewer && typeof nestedReviewer === "object") {
        addFromValue(nestedReviewer);
      }

      const login = record.login || record.userLogin || record.reviewerLogin || record.username;
      const name = record.name || record.userName || record.reviewerName || "";
      if (typeof login === "string") {
        addReviewer(login, name);
      }
    };

    [safeRow.requestedReviewers, safeRow.reviewRequests, safeRow.reviewers].forEach(addFromValue);

    if (fallBackToReviews && ordered.length === 0) {
      asArraySafe(safeRow.reviews).forEach((review) =>
        addFromValue({
          login: review?.authorLogin,
          name: review?.authorName || review?.author?.name,
        }),
      );
      asArraySafe(safeRow?.metrics?.reviewsByActor).forEach((reviewer) =>
        addFromValue({ login: reviewer?.login, name: reviewer?.name }),
      );
    }

    return ordered;
  };

  const collectRequestedReviewers = (row: RequestedReviewersRow | null | undefined = {}): RequestedReviewer[] =>
    collectReviewers(row, true);

  const collectPendingReviewRequests = (row: RequestedReviewersRow | null | undefined = {}): RequestedReviewer[] =>
    collectReviewers(row, false);

  const formatRequestedReviewersDisplay = (
    row: RequestedReviewersRow | null | undefined,
    actorsMap: ActorsMap = {},
  ): string => {
    const reviewers = collectRequestedReviewers(row);
    if (!reviewers.length) return "-";

    return reviewers
      .map((reviewer) => {
        const login = String(reviewer?.login || "").trim();
        const name = resolveActorDisplayNameSafe(login, actorsMap, reviewer?.name);
        return `${name}${login && login !== name ? ` (${login})` : ""}`;
      })
      .join("; ");
  };

  return {
    collectRequestedReviewers,
    collectPendingReviewRequests,
    formatRequestedReviewersDisplay,
  };
};

export { createPrRequestedReviewersHelpers };
