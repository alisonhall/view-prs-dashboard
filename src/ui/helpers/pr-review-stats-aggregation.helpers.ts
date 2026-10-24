import type { PrData, PrEntry, PrMetricsApproval } from "../types/pr-data.ts";
import type {
  ActorsMap,
  GetPreferredActorKey,
  NormalizeActorLogin,
  ResolveActorDisplayName,
} from "./pr-actor-identity.helpers.ts";
import type { StatsDateRange } from "./pr-review-stats-date-bucketing.helpers.ts";

// Review statistics' numbers: each PR's metrics with every count coerced
// to a number, the per-reviewer stats table (comments, usefulness
// signals, reviews, approvals and their risk) with the PRs behind each
// number, the summary cards, and the table's sort/filter/top-N controls.

export interface StatsViewState {
  sortBy?: string;
  filterMode?: string;
  topN?: number | string;
  minComments?: number | string;
}

export interface NormalizedRowMetrics {
  counts: {
    topLevelComments: number;
    threadComments: number;
    totalComments: number;
    reviews: number;
    approvals: number;
    commits: number;
    conversations: number;
    openConversations: number;
  };
  commentsByActor: unknown[];
  reviewsByActor: unknown[];
  approvals: PrMetricsApproval[];
  approvalSummary: {
    totalApprovals: number;
    riskyApprovals: number;
    highRiskApprovals: number;
    approvalsWithChangeRequestsAfter: number;
    approvalsWithCommentsAfter: number;
    approvalsWithCommitsAfter: number;
    averageMergeLeadMinutes: number | null;
  };
  commentUsefulnessSummary: {
    commentsOnOthersPrs: number;
    resolvedThreadCommentsOnOthersPrs: number;
    commentsFollowedByAuthorCommit: number;
    commentsFollowedByAuthorCommitWithin24h: number;
    usefulnessSignals: number;
  };
  conversationSummary: {
    totalThreads: number;
    openThreads: number;
    resolvedThreads: number;
    totalThreadComments: number;
    topLevelConversations: number;
    reviewConversations: number;
    estimatedTotalConversations: number;
    estimatedOpenConversations: number;
  };
}

// The PR a stats number came from (shown under "Show sources").
export type StatsPrContext = {
  prNumber: string;
  prTitle: string;
  prUrl: string;
  prAuthor: string;
};

export type StatsSource = StatsPrContext & Record<string, unknown>;

export interface StatsSummary {
  rows: number;
  commentsOnOthersPrs: number;
  usefulnessSignals: number;
  commentsFollowedByAuthorCommit: number;
  resolvedThreadCommentsOnOthersPrs: number;
  approvals: number;
  riskyApprovals: number;
  highRiskApprovals: number;
  openConversations: number;
  sources: Record<
    | "rows"
    | "commentsOnOthersPrs"
    | "usefulnessSignals"
    | "commentsFollowedByAuthorCommit"
    | "resolvedThreadCommentsOnOthersPrs"
    | "approvals"
    | "riskyApprovals"
    | "highRiskApprovals"
    | "openConversations",
    StatsSource[]
  >;
}

export interface ReviewerStat {
  login: string;
  name: string;
  comments: number;
  threadComments: number;
  resolvedThreadComments: number;
  commentsFollowedByAuthorCommit: number;
  commentsFollowedByAuthorCommitWithin24h: number;
  usefulnessSignals: number;
  reviews: number;
  approvals: number;
  riskyApprovals: number;
  highRiskApprovals: number;
  approvalsBeforeChangeRequest: number;
  prsTouched: Set<string>;
  sources: Record<
    | "comments"
    | "reviews"
    | "approvals"
    | "riskyApprovals"
    | "highRiskApprovals"
    | "usefulnessSignals"
    | "commentsFollowedByAuthorCommit"
    | "resolvedThreadComments",
    StatsSource[]
  >;
}

export type ReviewerRow = ReviewerStat & { prCount: number };

export interface ReviewerStats {
  summary: StatsSummary;
  reviewerRows: ReviewerRow[];
}

export interface PrReviewStatsAggregationDeps {
  toCount?: (value: unknown) => number;
  asArray?: (value: unknown) => unknown[];
  getNormalizedStatsDateRange?: () => StatsDateRange;
  normalizeActorLogin?: NormalizeActorLogin;
  getPreferredActorKey?: GetPreferredActorKey;
  formatTitleWithIcons?: (titleDisplay?: string | null, fallbackTitle?: string | null) => string;
  isWithinStatsDateRange?: (isoValue: unknown, range: StatsDateRange) => boolean;
  resolveActorDisplayName?: ResolveActorDisplayName;
  statsViewState?: StatsViewState | null;
}

// Per-PR, per-person tallies built while scanning one PR.
interface CommentStat {
  login: string;
  name: string;
  topLevelCount: number;
  threadCount: number;
  resolvedThreadCount: number;
  followedByAuthorCommitCount: number;
  followedByAuthorCommitWithin24hCount: number;
  usefulnessSignals: number;
  totalCount: number;
  commentsOnOthersPr: boolean;
}

interface ReviewStat {
  login: string;
  name: string;
  reviewCount: number;
  approvalCount: number;
  commentCount: number;
  changesRequestedCount: number;
  dismissedCount: number;
  reviewsOnOthersPr: boolean;
}

type RawSection = Record<string, unknown>;

const createPrReviewStatsAggregationHelpers = ({
  toCount,
  asArray,
  getNormalizedStatsDateRange,
  normalizeActorLogin,
  getPreferredActorKey,
  formatTitleWithIcons,
  isWithinStatsDateRange,
  resolveActorDisplayName,
  statsViewState,
}: PrReviewStatsAggregationDeps = {}) => {
  const toCountSafe =
    typeof toCount === "function"
      ? toCount
      : (value: unknown) => {
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : 0;
        };
  // Callers pass typed lists; the injected asArray only coerces.
  const asArraySafe = <T>(value: T[] | null | undefined): T[] =>
    (typeof asArray === "function" ? asArray(value) : Array.isArray(value) ? value : []) as T[];
  const getNormalizedStatsDateRangeSafe =
    typeof getNormalizedStatsDateRange === "function"
      ? getNormalizedStatsDateRange
      : (): StatsDateRange => ({ start: "", end: "", startDate: "", endDate: "" });
  const normalizeActorLoginSafe =
    typeof normalizeActorLogin === "function"
      ? normalizeActorLogin
      : (value: unknown) => String(value || "").trim().toLowerCase();
  const getPreferredActorKeySafe =
    typeof getPreferredActorKey === "function"
      ? getPreferredActorKey
      : (login: unknown, fallback?: unknown) => String(login || fallback || "").trim();
  const formatTitleWithIconsSafe =
    typeof formatTitleWithIcons === "function"
      ? formatTitleWithIcons
      : (_titleDisplay?: string | null, title?: string | null) => String(title || "").trim();
  const isWithinStatsDateRangeSafe =
    typeof isWithinStatsDateRange === "function"
      ? isWithinStatsDateRange
      : () => true;
  const resolveActorDisplayNameSafe =
    typeof resolveActorDisplayName === "function"
      ? resolveActorDisplayName
      : (login: string, _actorsMap: ActorsMap, fallback?: string) =>
          String(fallback || login || "").trim();
  const statsViewStateSafe: StatsViewState =
    statsViewState && typeof statsViewState === "object"
      ? statsViewState
      : {
          sortBy: "riskyApprovals",
          filterMode: "all",
          topN: 12,
          minComments: 0,
        };

  const normalizeRowMetrics = (row: PrData | null | undefined = {}): NormalizedRowMetrics => {
    const metrics = (row?.metrics || {}) as RawSection & { approvals?: PrMetricsApproval[] };
    const counts = (metrics?.counts || {}) as RawSection;
    const approvalSummary = (metrics?.approvalSummary || {}) as RawSection;
    const commentUsefulnessSummary = (metrics?.commentUsefulnessSummary || {}) as RawSection;
    const conversationSummary = (metrics?.conversationSummary || {}) as RawSection;

    return {
      counts: {
        topLevelComments: toCountSafe(counts.topLevelComments),
        threadComments: toCountSafe(counts.threadComments),
        totalComments: toCountSafe(counts.totalComments),
        reviews: toCountSafe(counts.reviews),
        approvals: toCountSafe(counts.approvals),
        commits: toCountSafe(counts.commits),
        conversations: toCountSafe(counts.conversations),
        openConversations: toCountSafe(counts.openConversations),
      },
      commentsByActor: asArraySafe(metrics.commentsByActor as unknown[] | undefined),
      reviewsByActor: asArraySafe(metrics.reviewsByActor as unknown[] | undefined),
      approvals: asArraySafe(metrics.approvals),
      approvalSummary: {
        totalApprovals: toCountSafe(approvalSummary.totalApprovals),
        riskyApprovals: toCountSafe(approvalSummary.riskyApprovals),
        highRiskApprovals: toCountSafe(approvalSummary.highRiskApprovals),
        approvalsWithChangeRequestsAfter: toCountSafe(
          approvalSummary.approvalsWithChangeRequestsAfter,
        ),
        approvalsWithCommentsAfter: toCountSafe(
          approvalSummary.approvalsWithCommentsAfter,
        ),
        approvalsWithCommitsAfter: toCountSafe(
          approvalSummary.approvalsWithCommitsAfter,
        ),
        averageMergeLeadMinutes: Number.isFinite(
          Number(approvalSummary.averageMergeLeadMinutes),
        )
          ? Number(approvalSummary.averageMergeLeadMinutes)
          : null,
      },
      commentUsefulnessSummary: {
        commentsOnOthersPrs: toCountSafe(
          commentUsefulnessSummary.commentsOnOthersPrs,
        ),
        resolvedThreadCommentsOnOthersPrs: toCountSafe(
          commentUsefulnessSummary.resolvedThreadCommentsOnOthersPrs,
        ),
        commentsFollowedByAuthorCommit: toCountSafe(
          commentUsefulnessSummary.commentsFollowedByAuthorCommit,
        ),
        commentsFollowedByAuthorCommitWithin24h: toCountSafe(
          commentUsefulnessSummary.commentsFollowedByAuthorCommitWithin24h,
        ),
        usefulnessSignals: toCountSafe(commentUsefulnessSummary.usefulnessSignals),
      },
      conversationSummary: {
        totalThreads: toCountSafe(conversationSummary.totalThreads),
        openThreads: toCountSafe(conversationSummary.openThreads),
        resolvedThreads: toCountSafe(conversationSummary.resolvedThreads),
        totalThreadComments: toCountSafe(conversationSummary.totalThreadComments),
        topLevelConversations: toCountSafe(
          conversationSummary.topLevelConversations,
        ),
        reviewConversations: toCountSafe(conversationSummary.reviewConversations),
        estimatedTotalConversations: toCountSafe(
          conversationSummary.estimatedTotalConversations,
        ),
        estimatedOpenConversations: toCountSafe(
          conversationSummary.estimatedOpenConversations,
        ),
      },
    };
  };

  const buildReviewerStats = (rows: Iterable<PrEntry>, actorsMap: ActorsMap = {}): ReviewerStats => {
    const range = getNormalizedStatsDateRangeSafe();
    const reviewers = new Map<string, ReviewerStat>();
    const summary: StatsSummary = {
      rows: 0,
      commentsOnOthersPrs: 0,
      usefulnessSignals: 0,
      commentsFollowedByAuthorCommit: 0,
      resolvedThreadCommentsOnOthersPrs: 0,
      approvals: 0,
      riskyApprovals: 0,
      highRiskApprovals: 0,
      openConversations: 0,
      sources: {
        rows: [],
        commentsOnOthersPrs: [],
        usefulnessSignals: [],
        commentsFollowedByAuthorCommit: [],
        resolvedThreadCommentsOnOthersPrs: [],
        approvals: [],
        riskyApprovals: [],
        highRiskApprovals: [],
        openConversations: [],
      },
    };

    const pushSource = (bucket: StatsSource[] | undefined, item: StatsSource | null | undefined) => {
      if (!Array.isArray(bucket) || !item) return;
      bucket.push(item);
    };

    const ensureReviewer = (login: unknown, fallbackName: unknown = ""): ReviewerStat | null => {
      const normalizedLogin = normalizeActorLoginSafe(login);
      const normalizedFallbackName = String(fallbackName || "").trim();
      const reviewerLogin = normalizedLogin || String(login || "").trim();
      if (!reviewerLogin) return null;
      let stat = reviewers.get(reviewerLogin);
      if (!stat) {
        stat = {
          login: reviewerLogin,
          name: normalizedFallbackName || reviewerLogin,
          comments: 0,
          threadComments: 0,
          resolvedThreadComments: 0,
          commentsFollowedByAuthorCommit: 0,
          commentsFollowedByAuthorCommitWithin24h: 0,
          usefulnessSignals: 0,
          reviews: 0,
          approvals: 0,
          riskyApprovals: 0,
          highRiskApprovals: 0,
          approvalsBeforeChangeRequest: 0,
          prsTouched: new Set(),
          sources: {
            comments: [],
            reviews: [],
            approvals: [],
            riskyApprovals: [],
            highRiskApprovals: [],
            usefulnessSignals: [],
            commentsFollowedByAuthorCommit: [],
            resolvedThreadComments: [],
          },
        };
        reviewers.set(reviewerLogin, stat);
      }
      if (normalizedFallbackName && stat.name === stat.login) {
        stat.name = normalizedFallbackName;
      }
      return stat;
    };

    for (const entry of rows) {
      const row = entry?.data || {};
      const rowAuthorKey = getPreferredActorKeySafe(row.authorLogin, row.author);
      const prNumber = String(row.number || entry?.prNumber || "").trim();
      const prTitle = formatTitleWithIconsSafe(row.titleDisplay, row.title);
      const metrics = normalizeRowMetrics(row);
      const filteredCommentEvents = asArraySafe(row.commentEvents).filter(
        (event) =>
          normalizeActorLoginSafe(event?.actor) !==
            String(rowAuthorKey || "").trim() &&
          isWithinStatsDateRangeSafe(event?.occurredAt, range),
      );
      const filteredReviews = asArraySafe(row.reviews).filter(
        (review) =>
          normalizeActorLoginSafe(review?.authorLogin) !==
            String(rowAuthorKey || "").trim() &&
          isWithinStatsDateRangeSafe(review?.submittedAt, range),
      );
      const filteredApprovals = asArraySafe(metrics.approvals).filter((approval) =>
        isWithinStatsDateRangeSafe(approval?.approvedAt, range),
      );
      const filteredOpenThreads = asArraySafe(row.reviewThreads).filter((thread) => {
        if (thread?.isResolved === true) {
          return false;
        }
        const comments = asArraySafe(thread?.comments);
        if (!range.start && !range.end) {
          return true;
        }
        return comments.some((comment) =>
          isWithinStatsDateRangeSafe(comment?.createdAt, range),
        );
      });
      const prContext: StatsPrContext = {
        prNumber,
        prTitle,
        prUrl: String(row.url || "").trim(),
        prAuthor: resolveActorDisplayNameSafe(rowAuthorKey, actorsMap, row.author),
      };

      const rowContributes =
        filteredCommentEvents.length > 0 ||
        filteredReviews.length > 0 ||
        filteredApprovals.length > 0 ||
        filteredOpenThreads.length > 0;
      if (rowContributes || (!range.start && !range.end)) {
        summary.rows += 1;
        pushSource(summary.sources.rows, prContext);
      }

      summary.openConversations += filteredOpenThreads.length;
      if (filteredOpenThreads.length > 0) {
        pushSource(summary.sources.openConversations, {
          ...prContext,
          count: filteredOpenThreads.length,
        });
      }

      const commentsByActor = new Map<string, CommentStat>();
      filteredCommentEvents.forEach((event) => {
        const login = normalizeActorLoginSafe(event?.actor);
        if (!login) return;
        let commentStat = commentsByActor.get(login);
        if (!commentStat) {
          commentStat = {
            login,
            name: login,
            topLevelCount: 0,
            threadCount: 0,
            resolvedThreadCount: 0,
            followedByAuthorCommitCount: 0,
            followedByAuthorCommitWithin24hCount: 0,
            usefulnessSignals: 0,
            totalCount: 0,
            commentsOnOthersPr: true,
          };
          commentsByActor.set(login, commentStat);
        }
        commentStat.totalCount += 1;
        if (event?.channel === "thread") {
          commentStat.threadCount += 1;
        } else {
          commentStat.topLevelCount += 1;
        }
        if (event?.conversationResolved === true) {
          commentStat.resolvedThreadCount += 1;
        }

        const followingAuthorCommits = asArraySafe(row.activityEvents).filter(
          (activityEvent) =>
            activityEvent?.type === "commit" &&
            normalizeActorLoginSafe(activityEvent?.actor) ===
              String(rowAuthorKey || "").trim() &&
            String(activityEvent?.occurredAt || "") >
              String(event?.occurredAt || ""),
        );
        if (followingAuthorCommits.length > 0) {
          commentStat.followedByAuthorCommitCount += 1;
          const within24h = followingAuthorCommits.some((activityEvent) => {
            const commentTime = Date.parse(String(event?.occurredAt || ""));
            const commitTime = Date.parse(
              String(activityEvent?.occurredAt || ""),
            );
            return (
              Number.isFinite(commentTime) &&
              Number.isFinite(commitTime) &&
              commitTime - commentTime <= 24 * 60 * 60 * 1000
            );
          });
          if (within24h) {
            commentStat.followedByAuthorCommitWithin24hCount += 1;
          }
        }
        commentStat.usefulnessSignals =
          commentStat.resolvedThreadCount +
          commentStat.followedByAuthorCommitCount +
          commentStat.followedByAuthorCommitWithin24hCount;
      });

      const reviewsByActor = new Map<string, ReviewStat>();
      filteredReviews.forEach((review) => {
        const login = normalizeActorLoginSafe(review?.authorLogin);
        if (!login) return;
        let reviewStat = reviewsByActor.get(login);
        if (!reviewStat) {
          reviewStat = {
            login,
            name: String(review?.authorName || login).trim() || login,
            reviewCount: 0,
            approvalCount: 0,
            commentCount: 0,
            changesRequestedCount: 0,
            dismissedCount: 0,
            reviewsOnOthersPr: true,
          };
          reviewsByActor.set(login, reviewStat);
        }
        reviewStat.reviewCount += 1;
        const reviewState = String(review?.state || "").trim();
        if (reviewState === "APPROVED") reviewStat.approvalCount += 1;
        if (reviewState === "COMMENTED") reviewStat.commentCount += 1;
        if (reviewState === "CHANGES_REQUESTED")
          reviewStat.changesRequestedCount += 1;
        if (reviewState === "DISMISSED") reviewStat.dismissedCount += 1;
      });

      for (const commentStat of commentsByActor.values()) {
        const reviewer = ensureReviewer(commentStat.login, commentStat.name);
        if (!reviewer) continue;
        reviewer.comments += toCountSafe(commentStat.totalCount);
        reviewer.threadComments += toCountSafe(commentStat.threadCount);
        reviewer.resolvedThreadComments += toCountSafe(
          commentStat.resolvedThreadCount,
        );
        reviewer.commentsFollowedByAuthorCommit += toCountSafe(
          commentStat.followedByAuthorCommitCount,
        );
        reviewer.commentsFollowedByAuthorCommitWithin24h += toCountSafe(
          commentStat.followedByAuthorCommitWithin24hCount,
        );
        reviewer.usefulnessSignals += toCountSafe(commentStat.usefulnessSignals);
        if (prNumber) reviewer.prsTouched.add(prNumber);
        summary.commentsOnOthersPrs += toCountSafe(commentStat.totalCount);
        summary.usefulnessSignals += toCountSafe(commentStat.usefulnessSignals);
        summary.commentsFollowedByAuthorCommit += toCountSafe(
          commentStat.followedByAuthorCommitCount,
        );
        summary.resolvedThreadCommentsOnOthersPrs += toCountSafe(
          commentStat.resolvedThreadCount,
        );
        pushSource(reviewer.sources.comments, {
          ...prContext,
          count: toCountSafe(commentStat.totalCount),
          threadCount: toCountSafe(commentStat.threadCount),
          resolvedThreadCount: toCountSafe(commentStat.resolvedThreadCount),
        });
        pushSource(summary.sources.commentsOnOthersPrs, {
          ...prContext,
          reviewer: reviewer.name || reviewer.login,
          count: toCountSafe(commentStat.totalCount),
        });
        if (toCountSafe(commentStat.usefulnessSignals) > 0) {
          pushSource(reviewer.sources.usefulnessSignals, {
            ...prContext,
            count: toCountSafe(commentStat.usefulnessSignals),
          });
          pushSource(summary.sources.usefulnessSignals, {
            ...prContext,
            reviewer: reviewer.name || reviewer.login,
            count: toCountSafe(commentStat.usefulnessSignals),
          });
        }
        if (toCountSafe(commentStat.followedByAuthorCommitCount) > 0) {
          pushSource(reviewer.sources.commentsFollowedByAuthorCommit, {
            ...prContext,
            count: toCountSafe(commentStat.followedByAuthorCommitCount),
          });
          pushSource(summary.sources.commentsFollowedByAuthorCommit, {
            ...prContext,
            reviewer: reviewer.name || reviewer.login,
            count: toCountSafe(commentStat.followedByAuthorCommitCount),
          });
        }
        if (toCountSafe(commentStat.resolvedThreadCount) > 0) {
          pushSource(reviewer.sources.resolvedThreadComments, {
            ...prContext,
            count: toCountSafe(commentStat.resolvedThreadCount),
          });
          pushSource(summary.sources.resolvedThreadCommentsOnOthersPrs, {
            ...prContext,
            reviewer: reviewer.name || reviewer.login,
            count: toCountSafe(commentStat.resolvedThreadCount),
          });
        }
      }

      for (const reviewStat of reviewsByActor.values()) {
        const reviewer = ensureReviewer(reviewStat.login, reviewStat.name);
        if (!reviewer) continue;
        reviewer.reviews += toCountSafe(reviewStat.reviewCount);
        reviewer.approvals += toCountSafe(reviewStat.approvalCount);
        if (prNumber) reviewer.prsTouched.add(prNumber);
        pushSource(reviewer.sources.reviews, {
          ...prContext,
          count: toCountSafe(reviewStat.reviewCount),
          approvals: toCountSafe(reviewStat.approvalCount),
        });
      }

      for (const approval of filteredApprovals) {
        const reviewer = ensureReviewer(approval.login, approval.name);
        if (!reviewer) continue;
        reviewer.approvals += 0;
        reviewer.riskyApprovals += approval.riskyApproval ? 1 : 0;
        reviewer.highRiskApprovals += approval.highRiskApproval ? 1 : 0;
        reviewer.approvalsBeforeChangeRequest +=
          toCountSafe(approval.changeRequestCountAfterApproval) > 0 ? 1 : 0;
        if (prNumber) reviewer.prsTouched.add(prNumber);
        summary.approvals += 1;
        summary.riskyApprovals += approval.riskyApproval ? 1 : 0;
        summary.highRiskApprovals += approval.highRiskApproval ? 1 : 0;
        pushSource(reviewer.sources.approvals, {
          ...prContext,
          approvedAt: approval.approvedAt,
          risky: approval.riskyApproval === true,
          highRisk: approval.highRiskApproval === true,
        });
        pushSource(summary.sources.approvals, {
          ...prContext,
          reviewer: reviewer.name || reviewer.login,
          approvedAt: approval.approvedAt,
        });
        if (approval.riskyApproval) {
          pushSource(reviewer.sources.riskyApprovals, {
            ...prContext,
            approvedAt: approval.approvedAt,
          });
          pushSource(summary.sources.riskyApprovals, {
            ...prContext,
            reviewer: reviewer.name || reviewer.login,
            approvedAt: approval.approvedAt,
          });
        }
        if (approval.highRiskApproval) {
          pushSource(reviewer.sources.highRiskApprovals, {
            ...prContext,
            approvedAt: approval.approvedAt,
          });
          pushSource(summary.sources.highRiskApprovals, {
            ...prContext,
            reviewer: reviewer.name || reviewer.login,
            approvedAt: approval.approvedAt,
          });
        }
      }
    }

    const reviewerRows = Array.from(reviewers.values()).map((reviewer) => ({
      ...reviewer,
      name: resolveActorDisplayNameSafe(reviewer.login, actorsMap, reviewer.name),
      prCount: reviewer.prsTouched.size,
    }));

    return { summary, reviewerRows };
  };

  const applyStatsControls = ({ summary, reviewerRows }: ReviewerStats) => {
    const sortKey = statsViewStateSafe.sortBy as keyof ReviewerRow;
    const minComments = Math.max(0, toCountSafe(statsViewStateSafe.minComments));
    const topN = Math.max(1, toCountSafe(statsViewStateSafe.topN) || 12);
    const filterMode = String(statsViewStateSafe.filterMode || "all");

    const filteredRows = reviewerRows.filter((reviewer) => {
      if (reviewer.comments < minComments) {
        return false;
      }
      if (filterMode === "risky-only") {
        return reviewer.riskyApprovals > 0;
      }
      if (filterMode === "useful-comments") {
        return reviewer.usefulnessSignals > 0;
      }
      if (filterMode === "high-risk-approvals") {
        return reviewer.highRiskApprovals > 0;
      }
      return true;
    });

    const sortedRows = filteredRows.sort((a, b) => {
      const aValue = toCountSafe(a[sortKey]);
      const bValue = toCountSafe(b[sortKey]);
      if (bValue !== aValue) {
        return bValue - aValue;
      }
      if (b.riskyApprovals !== a.riskyApprovals) {
        return b.riskyApprovals - a.riskyApprovals;
      }
      if (b.approvals !== a.approvals) {
        return b.approvals - a.approvals;
      }
      if (b.comments !== a.comments) {
        return b.comments - a.comments;
      }
      return String(a.name || a.login).localeCompare(String(b.name || b.login));
    });

    return {
      summary,
      reviewerRows: sortedRows.slice(0, topN),
      totalBeforeLimit: sortedRows.length,
      topN,
    };
  };

  return {
    normalizeRowMetrics,
    buildReviewerStats,
    applyStatsControls,
  };
};

export { createPrReviewStatsAggregationHelpers };
