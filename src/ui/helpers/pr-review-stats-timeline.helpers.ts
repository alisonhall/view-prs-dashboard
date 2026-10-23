import type { PrActivityEvent, PrEntry, PrReview } from "../types/pr-data.ts";
import type {
  ActorsMap,
  GetPreferredActorKey,
  NormalizeActorLogin,
  ResolveActorDisplayName,
} from "./pr-actor-identity.helpers.ts";
import type { StatsDateRange, TimelinePoint } from "./pr-review-stats-date-bucketing.helpers.ts";

// Review statistics' per-reviewer timelines: daily counts of each
// reviewer's activity (comments and reviews), comments (comments and
// non-approving reviews) and approvals, for the top 12 reviewers. The PR
// author's own activity and Copilot are left out.
export interface ReviewerTimelineSeries {
  login: string;
  actor: string;
  points: TimelinePoint[];
}

export interface ReviewerTimeline {
  dates: string[];
  series: ReviewerTimelineSeries[];
}

export interface PrReviewStatsTimelineDeps {
  asArray?: (value: unknown) => unknown[];
  getPreferredActorKey?: GetPreferredActorKey;
  normalizeActorLogin?: NormalizeActorLogin;
  isWithinStatsDateRange?: (isoValue: string, range: StatsDateRange) => boolean;
  resolveActorDisplayName?: ResolveActorDisplayName;
  getTimelineDateKeys?: (dates: string[], range: StatsDateRange) => string[];
}

const MAX_TIMELINE_REVIEWERS = 12;

const createPrReviewStatsTimelineHelpers = ({
  asArray,
  getPreferredActorKey,
  normalizeActorLogin,
  isWithinStatsDateRange,
  resolveActorDisplayName,
  getTimelineDateKeys,
}: PrReviewStatsTimelineDeps = {}) => {
  // Callers pass typed lists; the injected asArray only coerces.
  const asArraySafe = <T>(value: T[] | null | undefined): T[] =>
    (typeof asArray === "function" ? asArray(value) : Array.isArray(value) ? value : []) as T[];
  const getPreferredActorKeySafe =
    typeof getPreferredActorKey === "function"
      ? getPreferredActorKey
      : (login: unknown, fallback?: unknown) => String(login || fallback || "").trim();
  const normalizeActorLoginSafe =
    typeof normalizeActorLogin === "function"
      ? normalizeActorLogin
      : (value: unknown) => String(value || "").trim();
  const isWithinStatsDateRangeSafe =
    typeof isWithinStatsDateRange === "function"
      ? isWithinStatsDateRange
      : () => true;
  const resolveActorDisplayNameSafe =
    typeof resolveActorDisplayName === "function"
      ? resolveActorDisplayName
      : (login: string, _actorsMap: ActorsMap, fallback?: string) =>
          String(fallback || login || "").trim();
  const getTimelineDateKeysSafe =
    typeof getTimelineDateKeys === "function"
      ? getTimelineDateKeys
      : (dates: string[]) =>
          asArraySafe(dates)
            .map((value) => String(value || "").trim())
            .filter(Boolean)
            .sort();

  const isCopilotName = (value: unknown): boolean => /copilot/i.test(String(value || ""));

  // Counts one timeline's events per reviewer per day. Each aggregate
  // below feeds it the events it wants, then reads the top series.
  const createReviewerTimelineCollector = (actorsMap: ActorsMap, range: StatsDateRange) => {
    const timelineByReviewer = new Map<string, { login: string; actor: string; dateMap: Map<string, number> }>();
    const allDates = new Set<string>();

    const record = (actorLogin: string, actorName: string, date: string) => {
      allDates.add(date);
      let reviewer = timelineByReviewer.get(actorLogin);
      if (!reviewer) {
        reviewer = { login: actorLogin, actor: actorName, dateMap: new Map() };
        timelineByReviewer.set(actorLogin, reviewer);
      }
      reviewer.dateMap.set(date, (reviewer.dateMap.get(date) || 0) + 1);
    };

    // Comment events count only on threads and the top level; an event
    // without a time counts as midday on its date for the range check.
    const addCommentEvent = (event: PrActivityEvent, prAuthorLogin: string) => {
      const date = String(event?.date || "").trim();
      const actorLogin = normalizeActorLoginSafe(event?.actor);
      if (!date || !actorLogin) return;
      if (prAuthorLogin && actorLogin === prAuthorLogin) return;
      const eventIso =
        String(event?.occurredAt || "").trim() || `${date}T12:00:00Z`;
      if (!isWithinStatsDateRangeSafe(eventIso, range)) return;
      const actorName = resolveActorDisplayNameSafe(
        actorLogin,
        actorsMap,
        actorLogin,
      );
      if (isCopilotName(actorLogin) || isCopilotName(actorName)) return;
      if (event?.channel === "thread" || event?.channel === "top-level") {
        record(actorLogin, actorName, date);
      }
    };

    const addReview = (review: PrReview, prAuthorLogin: string) => {
      const reviewIso = String(review?.submittedAt || "").trim();
      const date = (reviewIso.split("T")[0] ?? "").trim();
      const actorLogin = normalizeActorLoginSafe(review?.authorLogin);
      if (!date || !actorLogin) return;
      if (prAuthorLogin && actorLogin === prAuthorLogin) return;
      if (!isWithinStatsDateRangeSafe(reviewIso, range)) return;
      const actorName = resolveActorDisplayNameSafe(
        actorLogin,
        actorsMap,
        actorLogin,
      );
      if (isCopilotName(actorLogin) || isCopilotName(actorName)) return;
      record(actorLogin, actorName, date);
    };

    // The busiest reviewers first, keeping only those with any activity
    // on the shown dates.
    const toTimeline = (): ReviewerTimeline => {
      const sortedDates = getTimelineDateKeysSafe(Array.from(allDates), range);

      const series = Array.from(timelineByReviewer.entries())
        .map(([login, item]) => ({
          login,
          actor: item.actor,
          points: sortedDates.map((date) => ({
            date,
            value: item.dateMap.get(date) || 0,
          })),
        }))
        .filter((reviewerSeries) => reviewerSeries.points.some((point) => point.value > 0))
        .sort(
          (a, b) =>
            b.points.reduce((sum, point) => sum + point.value, 0) -
            a.points.reduce((sum, point) => sum + point.value, 0),
        )
        .slice(0, MAX_TIMELINE_REVIEWERS);

      return { dates: sortedDates, series };
    };

    return { addCommentEvent, addReview, toTimeline };
  };

  const buildTimeline = (
    rows: PrEntry[] | null | undefined,
    actorsMap: ActorsMap,
    range: StatsDateRange,
    { includeCommentEvents, includeReview }: { includeCommentEvents: boolean; includeReview: (review: PrReview) => boolean },
  ): ReviewerTimeline => {
    const collector = createReviewerTimelineCollector(actorsMap, range);

    asArraySafe(rows).forEach((entry) => {
      const row = entry?.data || {};
      const prAuthorLogin = getPreferredActorKeySafe(row.authorLogin, row.author);
      if (includeCommentEvents) {
        asArraySafe(row.commentEvents).forEach((event) => collector.addCommentEvent(event, prAuthorLogin));
      }
      asArraySafe(row.reviews).forEach((review) => {
        if (includeReview(review)) {
          collector.addReview(review, prAuthorLogin);
        }
      });
    });

    return collector.toTimeline();
  };

  const isApproval = (review: PrReview): boolean => String(review?.state || "").trim() === "APPROVED";

  // Comments plus every review.
  const aggregateReviewerActivityTimeline = (
    rows: PrEntry[] | null | undefined,
    actorsMap: ActorsMap = {},
    range: StatsDateRange = {},
  ): ReviewerTimeline =>
    buildTimeline(rows, actorsMap, range, { includeCommentEvents: true, includeReview: () => true });

  // Comments plus reviews that aren't approvals.
  const aggregateReviewerCommentsTimeline = (
    rows: PrEntry[] | null | undefined,
    actorsMap: ActorsMap = {},
    range: StatsDateRange = {},
  ): ReviewerTimeline =>
    buildTimeline(rows, actorsMap, range, {
      includeCommentEvents: true,
      includeReview: (review) => !isApproval(review),
    });

  // Approvals only.
  const aggregateReviewerApprovalsTimeline = (
    rows: PrEntry[] | null | undefined,
    actorsMap: ActorsMap = {},
    range: StatsDateRange = {},
  ): ReviewerTimeline =>
    buildTimeline(rows, actorsMap, range, { includeCommentEvents: false, includeReview: isApproval });

  return {
    aggregateReviewerActivityTimeline,
    aggregateReviewerCommentsTimeline,
    aggregateReviewerApprovalsTimeline,
  };
};

export { createPrReviewStatsTimelineHelpers };
