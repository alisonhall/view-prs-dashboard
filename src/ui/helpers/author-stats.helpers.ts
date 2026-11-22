import type { PrEntry } from "../types/pr-data.ts";
import type { GetPreferredActorKey } from "./pr-actor-identity.helpers.ts";
import { prCreatedAt } from "./pr-section-sort.helpers.ts";
import { parseSortableTime } from "./pr-sortable-time.helpers.ts";

// The Authors view's stats for one author, from their stored PRs: how long
// their PRs wait for a first review and take to merge, how big they are,
// how often reviewers ask for changes, and who reviews them most.

// How many of the author's reviewers the stats list.
export const AUTHOR_TOP_REVIEWERS = 3;

export interface AuthorReviewerCount {
  // The reviewer's preferred key (as the picker's options are).
  login: string;
  // How many of the author's PRs they've reviewed.
  prs: number;
}

export interface AuthorStats {
  prs: number;
  // Each median with the number of PRs it's worked out from; null with none.
  firstReviewMs: number | null;
  firstReviewPrs: number;
  mergeMs: number | null;
  mergedPrs: number;
  // Lines added and deleted.
  size: number | null;
  sizedPrs: number;
  // PRs with at least one "changes requested" review, of those reviewed.
  changesRequestedPrs: number;
  reviewedPrs: number;
  topReviewers: AuthorReviewerCount[];
}

// The middle value (the mean of the middle two for an even count); null
// for none.
export const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? 0;
  return sorted.length % 2 ? upper : ((sorted[middle - 1] ?? upper) + upper) / 2;
};

// Copilot, GitHub Apps ("app/…") and "…[bot]" accounts.
export const isBotReviewer = (login: unknown, name: unknown = ""): boolean => {
  const value = String(login || "").trim().toLowerCase();
  return /copilot/i.test(`${value} ${String(name || "")}`) || value.startsWith("app/") || value.endsWith("[bot]");
};

const toLines = (value: unknown): number | null => {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

export const buildAuthorStats = (
  entries: Iterable<PrEntry>,
  authorKey: string,
  getPreferredActorKey: GetPreferredActorKey,
): AuthorStats => {
  const firstReviewTimes: number[] = [];
  const mergeTimes: number[] = [];
  const sizes: number[] = [];
  const prsByReviewer = new Map<string, number>();
  let prs = 0;
  let reviewedPrs = 0;
  let changesRequestedPrs = 0;

  for (const entry of entries) {
    const data = entry?.data || {};
    if (getPreferredActorKey(data.authorLogin, data.author) !== authorKey) continue;
    prs += 1;
    const createdAt = parseSortableTime(prCreatedAt(entry));
    const hasCreatedAt = Number.isFinite(createdAt);
    // A first review's wait starts once the PR was ready for review: a PR
    // opened as a draft waits from when it was marked ready, not created.
    const readyAt = Math.max(createdAt, parseSortableTime(data.readyForReviewAt));

    // Reviews by people other than the author (their replies to a review
    // are reviews too); a bot's, such as Copilot's automatic review, would
    // make every PR look reviewed within minutes.
    const reviews = (Array.isArray(data.reviews) ? data.reviews : []).filter((review) => {
      const key = getPreferredActorKey(review?.authorLogin, review?.authorName);
      return Boolean(key) && key !== authorKey && !isBotReviewer(review?.authorLogin, review?.authorName);
    });
    if (reviews.length > 0) {
      reviewedPrs += 1;
      if (reviews.some((review) => String(review?.state || "").toUpperCase() === "CHANGES_REQUESTED")) {
        changesRequestedPrs += 1;
      }
      const firstReviewAt = Math.min(
        ...reviews.map((review) => parseSortableTime(review?.submittedAt)).filter(Number.isFinite),
      );
      // Someone who reviewed it while it was still a draft: no wait once
      // it was ready.
      if (hasCreatedAt && Number.isFinite(firstReviewAt) && firstReviewAt >= createdAt) {
        firstReviewTimes.push(Math.max(0, firstReviewAt - readyAt));
      }
      new Set(reviews.map((review) => getPreferredActorKey(review?.authorLogin, review?.authorName))).forEach((key) => {
        prsByReviewer.set(key, (prsByReviewer.get(key) ?? 0) + 1);
      });
    }

    const mergedAt = parseSortableTime(data.mergedAt);
    if (hasCreatedAt && Number.isFinite(mergedAt) && mergedAt >= createdAt) {
      mergeTimes.push(mergedAt - createdAt);
    }

    const additions = toLines(data.additions);
    const deletions = toLines(data.deletions);
    if (additions !== null || deletions !== null) {
      sizes.push((additions ?? 0) + (deletions ?? 0));
    }
  }

  const topReviewers = [...prsByReviewer]
    .map(([login, count]) => ({ login, prs: count }))
    .sort((a, b) => b.prs - a.prs || a.login.localeCompare(b.login))
    .slice(0, AUTHOR_TOP_REVIEWERS);

  return {
    prs,
    firstReviewMs: median(firstReviewTimes),
    firstReviewPrs: firstReviewTimes.length,
    mergeMs: median(mergeTimes),
    mergedPrs: mergeTimes.length,
    size: median(sizes),
    sizedPrs: sizes.length,
    changesRequestedPrs,
    reviewedPrs,
    topReviewers,
  };
};

const HOUR_MS = 60 * 60 * 1000;

// A wait in the unit that reads best: "<1m", "25m", "5h", "3.5 days".
export const formatWait = (ms: number): string => {
  if (ms < 60000) return '<1m';
  if (ms < HOUR_MS) return `${Math.round(ms / 60000)}m`;
  if (ms < 48 * HOUR_MS) return `${Math.round(ms / HOUR_MS)}h`;
  const days = Math.round((ms / (24 * HOUR_MS)) * 10) / 10;
  return `${days} days`;
};
