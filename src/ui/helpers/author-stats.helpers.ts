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
  // When the PR was ready for review (ms; NaN without a known opening).
  readyAt: number;
  // Each reviewer's first review (ms) and whether they approved or asked
  // for changes, by their preferred key.
  byReviewer: Record<string, ReviewerOnPr>;
}

export interface ReviewerOnPr {
  firstAt: number;
  approved: boolean;
  changesRequested: boolean;
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
  // 1 in 10 of their PRs waited (or were) longer than this; null with
  // fewer than AUTHOR_P90_MIN_VALUES.
  p90: { firstReviewMs: number | null; mergeMs: number | null; size: number | null };
  // The PRs behind each number, longest wait (or biggest) first.
  sources: {
    firstReview: AuthorStatSource[];
    merge: AuthorStatSource[];
    size: AuthorStatSource[];
    changesRequested: AuthorStatSource[];
  };
  // The same across every author's PRs in the range.
  team: TeamMedians;
  // Their reviews of other people's PRs in the range.
  given: ReviewsGiven;
  // Their PRs by the month they were opened, oldest first.
  months: AuthorMonth[];
  // Their PRs by size.
  bySize: AuthorSizeBucket[];
}

export interface ReviewsGiven {
  prs: number;
  approvedPrs: number;
  changesRequestedPrs: number;
  // From a PR being ready for review to their first review of it.
  firstResponseMs: number | null;
  firstResponsePrs: number;
  firstResponseP90: number | null;
  // The same over every reviewer's first review of every PR in the range.
  teamFirstResponseMs: number | null;
  // Whose PRs they reviewed most (preferred keys).
  topAuthors: AuthorReviewerCount[];
  // The PRs they reviewed, longest first response first.
  sources: AuthorStatSource[];
}

export interface AuthorMonth {
  // "2026-07", local time.
  month: string;
  prs: number;
  firstReviewMs: number | null;
  mergeMs: number | null;
}

export interface AuthorSizeBucket {
  label: string;
  // Lines, from (inclusive) and to (exclusive; null for no upper end).
  from: number;
  to: number | null;
  prs: number;
  firstReviewMs: number | null;
  mergeMs: number | null;
}

// The size buckets "By size" compares.
export const AUTHOR_SIZE_BUCKETS: Array<Pick<AuthorSizeBucket, "label" | "from" | "to">> = [
  { label: "Under 100 lines", from: 0, to: 100 },
  { label: "100 to 499 lines", from: 100, to: 500 },
  { label: "500+ lines", from: 500, to: null },
];

// How many months "Over time" shows at most.
export const AUTHOR_TREND_MONTHS = 12;

const monthKey = (ms: number) => {
  const date = new Date(ms);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

// Every month from the first to the last (inclusive), at most the last
// AUTHOR_TREND_MONTHS.
const monthsBetween = (first: number, last: number): string[] => {
  const months: string[] = [];
  const cursor = new Date(first);
  cursor.setDate(1);
  const end = monthKey(last);
  while (months.length < 1000) {
    const key = monthKey(cursor.getTime());
    months.push(key);
    if (key >= end) break;
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months.slice(-AUTHOR_TREND_MONTHS);
};

const topCounts = (counts: Map<string, number>): AuthorReviewerCount[] =>
  [...counts]
    .map(([login, count]) => ({ login, prs: count }))
    .sort((a, b) => b.prs - a.prs || a.login.localeCompare(b.login))
    .slice(0, AUTHOR_TOP_REVIEWERS);

// The middle value (the mean of the middle two for an even count); null
// for none.
export const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? 0;
  return sorted.length % 2 ? upper : ((sorted[middle - 1] ?? upper) + upper) / 2;
};

// The value 1 in 10 are above (nearest rank), with enough values for that
// to mean something; null otherwise.
export const AUTHOR_P90_MIN_VALUES = 5;
export const percentile90 = (values: number[]): number | null => {
  if (values.length < AUTHOR_P90_MIN_VALUES) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(0.9 * sorted.length) - 1] ?? null;
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
    readyAt,
    byReviewer: reviewsByReviewer(reviews, getPreferredActorKey),
  };
};

function reviewsByReviewer(reviews: NonNullable<PrEntry["data"]>["reviews"], getPreferredActorKey: GetPreferredActorKey) {
  const byReviewer: Record<string, ReviewerOnPr> = {};
  (reviews || []).forEach((review) => {
    const key = String(getPreferredActorKey(review?.authorLogin, review?.authorName) || "");
    const at = parseSortableTime(review?.submittedAt);
    const state = String(review?.state || "").toUpperCase();
    const current = byReviewer[key] ?? { firstAt: Number.NaN, approved: false, changesRequested: false };
    byReviewer[key] = {
      firstAt: Number.isFinite(at) && !(current.firstAt <= at) ? at : current.firstAt,
      approved: current.approved || state === "APPROVED",
      changesRequested: current.changesRequested || state === "CHANGES_REQUESTED",
    };
  });
  return byReviewer;
}

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
  const topReviewers = topCounts(prsByReviewer);

  const firstReviewTimes = valuesOf(mine, (m) => m.firstReviewMs);
  const mergeTimes = valuesOf(mine, (m) => m.mergeMs);
  const sizes = valuesOf(mine, (m) => m.lines);
  const reviewed = mine.filter((m) => m.reviewed);
  const teamReviewed = all.filter((m) => m.reviewed);

  // Their reviews of other people's PRs.
  const givenOn = inRange.filter(({ measures }) => measures.authorKey !== authorKey && measures.byReviewer[authorKey]);
  const givenSources = givenOn
    .flatMap(({ entry, measures }) => {
      const firstAt = measures.byReviewer[authorKey]?.firstAt ?? Number.NaN;
      if (!Number.isFinite(firstAt) || !Number.isFinite(measures.createdAt) || firstAt < measures.createdAt) return [];
      return [{ entry, value: Math.max(0, firstAt - measures.readyAt) }];
    })
    .sort((a, b) => b.value - a.value);
  const responseTimes = givenSources.map((source) => source.value);
  const prsByAuthor = new Map<string, number>();
  givenOn.forEach(({ measures }) => prsByAuthor.set(measures.authorKey, (prsByAuthor.get(measures.authorKey) ?? 0) + 1));

  // Their PRs by month opened, with every month in between.
  const dated = mine.filter((m) => Number.isFinite(m.createdAt));
  const monthKeys = dated.length
    ? monthsBetween(Math.min(...dated.map((m) => m.createdAt)), Math.max(...dated.map((m) => m.createdAt)))
    : [];
  const months = monthKeys.map((month) => {
    const inMonth = dated.filter((m) => monthKey(m.createdAt) === month);
    return {
      month,
      prs: inMonth.length,
      firstReviewMs: median(valuesOf(inMonth, (m) => m.firstReviewMs)),
      mergeMs: median(valuesOf(inMonth, (m) => m.mergeMs)),
    };
  });

  const bySize = AUTHOR_SIZE_BUCKETS.map((bucket) => {
    const inBucket = mine.filter((m) => m.lines !== null && m.lines >= bucket.from && (bucket.to === null || m.lines < bucket.to));
    return {
      ...bucket,
      prs: inBucket.length,
      firstReviewMs: median(valuesOf(inBucket, (m) => m.firstReviewMs)),
      mergeMs: median(valuesOf(inBucket, (m) => m.mergeMs)),
    };
  });

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
    p90: { firstReviewMs: percentile90(firstReviewTimes), mergeMs: percentile90(mergeTimes), size: percentile90(sizes) },
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
    given: {
      prs: givenOn.length,
      approvedPrs: givenOn.filter(({ measures }) => measures.byReviewer[authorKey]?.approved).length,
      changesRequestedPrs: givenOn.filter(({ measures }) => measures.byReviewer[authorKey]?.changesRequested).length,
      firstResponseMs: median(responseTimes),
      firstResponsePrs: responseTimes.length,
      firstResponseP90: percentile90(responseTimes),
      teamFirstResponseMs: median(
        all.flatMap((m) =>
          Object.values(m.byReviewer)
            .map((reviewer) => reviewer.firstAt)
            .filter((firstAt) => Number.isFinite(m.createdAt) && firstAt >= m.createdAt)
            .map((firstAt) => Math.max(0, firstAt - m.readyAt)),
        ),
      ),
      topAuthors: topCounts(prsByAuthor),
      sources: givenSources,
    },
    months,
    bySize,
  };
};

const HOUR_MS = 60 * 60 * 1000;

// A wait in the unit that reads best: "<1m", "25m", "5h", "3.5 days",
// "41 days" (whole days from 10 on).
export const formatWait = (ms: number): string => {
  if (ms < 60000) return "<1m";
  if (ms < HOUR_MS) return `${Math.round(ms / 60000)}m`;
  if (ms < 48 * HOUR_MS) return `${Math.round(ms / HOUR_MS)}h`;
  const days = ms / (24 * HOUR_MS);
  return `${days >= 10 ? Math.round(days) : Math.round(days * 10) / 10} days`;
};
