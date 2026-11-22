import type { PrEntry } from "../types/pr-data.ts";
import type { GetPreferredActorKey } from "./pr-actor-identity.helpers.ts";
import { prCreatedAt } from "./pr-section-sort.helpers.ts";
import { parseSortableTime } from "./pr-sortable-time.helpers.ts";

// The Authors view's stats for one author, from their stored PRs: how long
// their PRs wait for a first review and take to merge, how big they are,
// how often reviewers ask for changes, and who reviews them most - with
// the PRs behind each number, and the same medians across every author's
// PRs for comparison. Optionally only PRs opened since a time.

// How many of the author's reviewers the stats list.
export const AUTHOR_TOP_REVIEWERS = 3;

// The stats' time ranges: PRs opened in the last 90 days, or all of them.
export const AUTHOR_STATS_RANGES = ["90d", "all"] as const;
export type AuthorStatsRange = (typeof AUTHOR_STATS_RANGES)[number];
export const AUTHOR_STATS_RANGE_DAYS = 90;

export interface AuthorReviewerCount {
  // The reviewer's preferred key (as the picker's options are).
  login: string;
  // How many of the author's PRs they've reviewed.
  prs: number;
}

// A PR behind a number, with its value (a wait in ms, or lines).
export interface AuthorStatSource {
  entry: PrEntry;
  value: number;
}

// One PR's measures, each null when it can't be worked out.
export interface PrReviewMeasures {
  authorKey: string;
  createdAt: number;
  // From ready for review to the first review by a person other than its
  // author (0 when reviewed while still a draft).
  firstReviewMs: number | null;
  mergeMs: number | null;
  lines: number | null;
  // Whether people other than its author reviewed it, and asked for changes.
  reviewed: boolean;
  changesRequested: boolean;
  reviewerKeys: string[];
}

export interface TeamMedians {
  firstReviewMs: number | null;
  mergeMs: number | null;
  size: number | null;
  // Share of reviewed PRs with a change request, 0-1.
  changesRequestedShare: number | null;
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
  // The PRs behind each number, longest wait (or biggest) first.
  sources: {
    firstReview: AuthorStatSource[];
    merge: AuthorStatSource[];
    size: AuthorStatSource[];
    changesRequested: AuthorStatSource[];
  };
  // The same across every author's PRs in the range.
  team: TeamMedians;
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

export const measurePrReview = (entry: PrEntry, getPreferredActorKey: GetPreferredActorKey): PrReviewMeasures => {
  const data = entry?.data || {};
  const authorKey = String(getPreferredActorKey(data.authorLogin, data.author) || "");
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
  const firstReviewAt = Math.min(...reviews.map((review) => parseSortableTime(review?.submittedAt)).filter(Number.isFinite));
  const mergedAt = parseSortableTime(data.mergedAt);
  const additions = toLines(data.additions);
  const deletions = toLines(data.deletions);

  return {
    authorKey,
    createdAt,
    // Someone who reviewed it while it was still a draft: no wait once it
    // was ready.
    firstReviewMs:
      hasCreatedAt && Number.isFinite(firstReviewAt) && firstReviewAt >= createdAt ? Math.max(0, firstReviewAt - readyAt) : null,
    mergeMs: hasCreatedAt && Number.isFinite(mergedAt) && mergedAt >= createdAt ? mergedAt - createdAt : null,
    lines: additions !== null || deletions !== null ? (additions ?? 0) + (deletions ?? 0) : null,
    reviewed: reviews.length > 0,
    changesRequested: reviews.some((review) => String(review?.state || "").toUpperCase() === "CHANGES_REQUESTED"),
    reviewerKeys: [...new Set(reviews.map((review) => getPreferredActorKey(review?.authorLogin, review?.authorName)))],
  };
};

// When a range starts (ms), or -Infinity for all time.
export const authorStatsRangeStart = (range: AuthorStatsRange, now: number): number =>
  range === "all" ? Number.NEGATIVE_INFINITY : now - AUTHOR_STATS_RANGE_DAYS * 24 * 60 * 60 * 1000;

const valuesOf = (measured: PrReviewMeasures[], pick: (m: PrReviewMeasures) => number | null) =>
  measured.map(pick).filter((value): value is number => value !== null);

const share = (part: number, whole: number) => (whole ? part / whole : null);

export const buildAuthorStats = (
  entries: Iterable<PrEntry>,
  authorKey: string,
  getPreferredActorKey: GetPreferredActorKey,
  { since = Number.NEGATIVE_INFINITY }: { since?: number } = {},
): AuthorStats => {
  // Every PR in the range (opened since `since`; with a start, a PR whose
  // opening isn't known is left out), measured once.
  const inRange: Array<{ entry: PrEntry; measures: PrReviewMeasures }> = [];
  for (const entry of entries) {
    const measures = measurePrReview(entry, getPreferredActorKey);
    if (Number.isFinite(since) && !(measures.createdAt >= since)) continue;
    inRange.push({ entry, measures });
  }
  const all = inRange.map(({ measures }) => measures);
  const theirs = inRange.filter(({ measures }) => measures.authorKey === authorKey);
  const mine = theirs.map(({ measures }) => measures);

  const sourcesOf = (pick: (m: PrReviewMeasures) => number | null): AuthorStatSource[] =>
    theirs
      .flatMap(({ entry, measures }) => {
        const value = pick(measures);
        return value === null ? [] : [{ entry, value }];
      })
      .sort((a, b) => b.value - a.value);

  const prsByReviewer = new Map<string, number>();
  mine.forEach((m) => m.reviewerKeys.forEach((key) => prsByReviewer.set(key, (prsByReviewer.get(key) ?? 0) + 1)));
  const topReviewers = [...prsByReviewer]
    .map(([login, count]) => ({ login, prs: count }))
    .sort((a, b) => b.prs - a.prs || a.login.localeCompare(b.login))
    .slice(0, AUTHOR_TOP_REVIEWERS);

  const firstReviewTimes = valuesOf(mine, (m) => m.firstReviewMs);
  const mergeTimes = valuesOf(mine, (m) => m.mergeMs);
  const sizes = valuesOf(mine, (m) => m.lines);
  const reviewed = mine.filter((m) => m.reviewed);
  const teamReviewed = all.filter((m) => m.reviewed);

  return {
    prs: mine.length,
    firstReviewMs: median(firstReviewTimes),
    firstReviewPrs: firstReviewTimes.length,
    mergeMs: median(mergeTimes),
    mergedPrs: mergeTimes.length,
    size: median(sizes),
    sizedPrs: sizes.length,
    changesRequestedPrs: reviewed.filter((m) => m.changesRequested).length,
    reviewedPrs: reviewed.length,
    topReviewers,
    sources: {
      firstReview: sourcesOf((m) => m.firstReviewMs),
      merge: sourcesOf((m) => m.mergeMs),
      size: sourcesOf((m) => m.lines),
      changesRequested: sourcesOf((m) => (m.changesRequested ? 1 : null)),
    },
    team: {
      firstReviewMs: median(valuesOf(all, (m) => m.firstReviewMs)),
      mergeMs: median(valuesOf(all, (m) => m.mergeMs)),
      size: median(valuesOf(all, (m) => m.lines)),
      changesRequestedShare: share(teamReviewed.filter((m) => m.changesRequested).length, teamReviewed.length),
    },
  };
};

const HOUR_MS = 60 * 60 * 1000;

// A wait in the unit that reads best: "<1m", "25m", "5h", "3.5 days".
export const formatWait = (ms: number): string => {
  if (ms < 60000) return "<1m";
  if (ms < HOUR_MS) return `${Math.round(ms / 60000)}m`;
  if (ms < 48 * HOUR_MS) return `${Math.round(ms / HOUR_MS)}h`;
  const days = Math.round((ms / (24 * HOUR_MS)) * 10) / 10;
  return `${days} days`;
};
