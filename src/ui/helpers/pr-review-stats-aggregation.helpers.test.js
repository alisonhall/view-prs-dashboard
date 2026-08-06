/** @jest-environment jsdom */

const {
  createPrReviewStatsAggregationHelpers,
} = require("./pr-review-stats-aggregation.helpers.js");

describe("review stats aggregation helpers", () => {
  const createHelpers = (overrides = {}) => {
    const statsViewState = {
      sortBy: "riskyApprovals",
      filterMode: "all",
      topN: 12,
      minComments: 0,
    };
    const { statsViewState: overrideStatsViewState = {}, ...otherOverrides } =
      overrides;

    return createPrReviewStatsAggregationHelpers({
      toCount: (value) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
      },
      asArray: (value) => (Array.isArray(value) ? value : []),
      getNormalizedStatsDateRange: () => ({
        start: "2026-07-01T00:00:00Z",
        end: "2026-07-31T23:59:59Z",
        startDate: "2026-07-01",
        endDate: "2026-07-31",
      }),
      normalizeActorLogin: (value) => String(value || "").trim().toLowerCase(),
      getPreferredActorKey: (login, fallback) =>
        String(login || fallback || "")
          .trim()
          .toLowerCase(),
      formatTitleWithIcons: (_titleDisplay, title) => String(title || "").trim(),
      isWithinStatsDateRange: (isoValue, range) => {
        const value = String(isoValue || "").trim();
        if (!range.start && !range.end) return true;
        if (!value) return false;
        if (range.start && value < range.start) return false;
        if (range.end && value > range.end) return false;
        return true;
      },
      resolveActorDisplayName: (login, _actorsMap, fallback) =>
        String(fallback || login || "").trim(),
      ...otherOverrides,
      statsViewState: {
        ...statsViewState,
        ...overrideStatsViewState,
      },
    });
  };

  test("given reviewer rows and filter controls, when applying stats controls, then rows are filtered sorted and top-limited", () => {
    const { applyStatsControls } = createHelpers({
      statsViewState: {
        sortBy: "riskyApprovals",
        filterMode: "risky-only",
        topN: 1,
        minComments: 2,
      },
    });

    const result = applyStatsControls({
      summary: { rows: 2 },
      reviewerRows: [
        {
          login: "reviewer-a",
          name: "Reviewer A",
          comments: 3,
          approvals: 2,
          riskyApprovals: 1,
          highRiskApprovals: 0,
          usefulnessSignals: 2,
        },
        {
          login: "reviewer-b",
          name: "Reviewer B",
          comments: 5,
          approvals: 3,
          riskyApprovals: 2,
          highRiskApprovals: 1,
          usefulnessSignals: 1,
        },
        {
          login: "reviewer-c",
          name: "Reviewer C",
          comments: 1,
          approvals: 5,
          riskyApprovals: 5,
          highRiskApprovals: 2,
          usefulnessSignals: 0,
        },
      ],
    });

    expect(result.totalBeforeLimit).toBe(2);
    expect(result.topN).toBe(1);
    expect(result.reviewerRows).toHaveLength(1);
    expect(result.reviewerRows[0].login).toBe("reviewer-b");
  });

  test("given mixed row activity, when building reviewer stats, then date-filtered non-author metrics are aggregated", () => {
    const { buildReviewerStats } = createHelpers();

    const result = buildReviewerStats(
      [
        {
          prNumber: "101",
          data: {
            number: "101",
            title: "Improve telemetry",
            authorLogin: "pr-author",
            author: "PR Author",
            url: "https://example/pr/101",
            commentEvents: [
              {
                actor: "reviewer-a",
                channel: "thread",
                occurredAt: "2026-07-10T12:00:00Z",
                conversationResolved: true,
              },
              {
                actor: "pr-author",
                channel: "top-level",
                occurredAt: "2026-07-10T12:10:00Z",
              },
            ],
            reviews: [
              {
                authorLogin: "reviewer-a",
                authorName: "Reviewer A",
                submittedAt: "2026-07-11T00:00:00Z",
                state: "APPROVED",
              },
              {
                authorLogin: "reviewer-b",
                authorName: "Reviewer B",
                submittedAt: "2026-06-01T00:00:00Z",
                state: "APPROVED",
              },
            ],
            metrics: {
              approvals: [
                {
                  login: "reviewer-a",
                  name: "Reviewer A",
                  approvedAt: "2026-07-11T00:00:00Z",
                  riskyApproval: true,
                  highRiskApproval: false,
                  changeRequestCountAfterApproval: 1,
                },
              ],
            },
            reviewThreads: [
              {
                isResolved: false,
                comments: [{ createdAt: "2026-07-10T10:00:00Z" }],
              },
            ],
            activityEvents: [
              {
                type: "commit",
                actor: "pr-author",
                occurredAt: "2026-07-10T16:00:00Z",
              },
            ],
          },
        },
      ],
      {},
    );

    expect(result.summary.rows).toBe(1);
    expect(result.summary.commentsOnOthersPrs).toBe(1);
    expect(result.summary.approvals).toBe(1);
    expect(result.summary.riskyApprovals).toBe(1);
    expect(result.summary.openConversations).toBe(1);
    expect(result.reviewerRows).toHaveLength(1);
    expect(result.reviewerRows[0].login).toBe("reviewer-a");
    expect(result.reviewerRows[0].comments).toBe(1);
    expect(result.reviewerRows[0].approvals).toBe(1);
    expect(result.reviewerRows[0].commentsFollowedByAuthorCommit).toBe(1);
    expect(result.reviewerRows[0].resolvedThreadComments).toBe(1);
  });

  test("given no explicit date range and no reviewer events, when building reviewer stats, then row summary still counts baseline rows", () => {
    const { buildReviewerStats } = createHelpers({
      getNormalizedStatsDateRange: () => ({
        start: "",
        end: "",
        startDate: "",
        endDate: "",
      }),
    });

    const result = buildReviewerStats(
      [
        {
          prNumber: "11",
          data: {
            number: "11",
            title: "No activity",
            authorLogin: "pr-author",
            author: "PR Author",
            commentEvents: [],
            reviews: [],
            reviewThreads: [],
            metrics: { approvals: [] },
          },
        },
      ],
      {},
    );

    expect(result.summary.rows).toBe(1);
    expect(result.reviewerRows).toEqual([]);
  });
});
