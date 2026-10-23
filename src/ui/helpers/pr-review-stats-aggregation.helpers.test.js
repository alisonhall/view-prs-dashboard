/** @jest-environment jsdom */

const {
  createPrReviewStatsAggregationHelpers,
} = require("./pr-review-stats-aggregation.helpers.ts");

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

  describe("edge cases", () => {
    const comment = (actor, occurredAt, extra = {}) => ({
      actor,
      channel: "thread",
      occurredAt,
      ...extra,
    });
    const authorCommit = (occurredAt, actor = "pr-author") => ({ type: "commit", actor, occurredAt });
    const row = (prNumber, data) => ({
      prNumber,
      data: { number: prNumber, title: `PR ${prNumber}`, authorLogin: "pr-author", author: "PR Author", ...data },
    });
    const reviewerByLogin = (result, login) => result.reviewerRows.find((reviewer) => reviewer.login === login);

    test("given author commits around a reviewer comment, when building stats, then only later author commits count and 'within 24h' includes exactly 24h", () => {
      const { buildReviewerStats } = createHelpers();

      const result = buildReviewerStats(
        [
          // Commit exactly 24h later: followed, and within 24h.
          row("1", {
            commentEvents: [comment("reviewer-a", "2026-07-10T12:00:00Z")],
            activityEvents: [authorCommit("2026-07-11T12:00:00Z")],
          }),
          // One second past 24h: followed, but not within 24h.
          row("2", {
            commentEvents: [comment("reviewer-b", "2026-07-10T12:00:00Z")],
            activityEvents: [authorCommit("2026-07-11T12:00:01Z")],
          }),
          // An author commit before the comment, and a later commit by
          // someone else: neither counts.
          row("3", {
            commentEvents: [comment("reviewer-c", "2026-07-10T12:00:00Z")],
            activityEvents: [authorCommit("2026-07-10T11:00:00Z"), authorCommit("2026-07-10T13:00:00Z", "reviewer-c")],
          }),
        ],
        {},
      );

      expect(reviewerByLogin(result, "reviewer-a")).toMatchObject({
        commentsFollowedByAuthorCommit: 1,
        commentsFollowedByAuthorCommitWithin24h: 1,
        usefulnessSignals: 2,
      });
      expect(reviewerByLogin(result, "reviewer-b")).toMatchObject({
        commentsFollowedByAuthorCommit: 1,
        commentsFollowedByAuthorCommitWithin24h: 0,
        usefulnessSignals: 1,
      });
      expect(reviewerByLogin(result, "reviewer-c")).toMatchObject({
        commentsFollowedByAuthorCommit: 0,
        commentsFollowedByAuthorCommitWithin24h: 0,
        usefulnessSignals: 0,
      });
      expect(result.summary.usefulnessSignals).toBe(3);
    });

    test("given a date range, when building stats, then only PRs with in-range non-author activity or open threads count as rows", () => {
      const { buildReviewerStats } = createHelpers();

      const result = buildReviewerStats(
        [
          // Everything before the July range.
          row("1", {
            commentEvents: [comment("reviewer-a", "2026-06-10T12:00:00Z")],
            reviews: [{ authorLogin: "reviewer-a", submittedAt: "2026-06-11T00:00:00Z", state: "APPROVED" }],
            metrics: { approvals: [{ login: "reviewer-a", approvedAt: "2026-06-11T00:00:00Z" }] },
            reviewThreads: [{ isResolved: false, comments: [{ createdAt: "2026-06-10T12:00:00Z" }] }],
          }),
          // In range, but the thread is resolved.
          row("2", {
            reviewThreads: [{ isResolved: true, comments: [{ createdAt: "2026-07-10T12:00:00Z" }] }],
          }),
          // In range, but only the PR author's own comment.
          row("3", {
            commentEvents: [comment("pr-author", "2026-07-10T12:00:00Z")],
          }),
          // An open thread with an in-range comment.
          row("4", {
            reviewThreads: [{ isResolved: false, comments: [{ createdAt: "2026-07-15T09:00:00Z" }] }],
          }),
        ],
        {},
      );

      expect(result.summary.rows).toBe(1);
      expect(result.summary.sources.rows.map((source) => source.prNumber)).toEqual(["4"]);
      expect(result.summary.openConversations).toBe(1);
      expect(result.summary.commentsOnOthersPrs).toBe(0);
      expect(result.reviewerRows).toEqual([]);
    });

    test("given metric approvals, when building stats, then in-range ones feed the risk columns while the approvals column counts APPROVED reviews only", () => {
      const { buildReviewerStats } = createHelpers();

      const result = buildReviewerStats(
        [
          row("1", {
            metrics: {
              approvals: [
                {
                  login: "reviewer-a",
                  name: "Reviewer A",
                  approvedAt: "2026-07-11T00:00:00Z",
                  riskyApproval: true,
                  highRiskApproval: true,
                  changeRequestCountAfterApproval: 2,
                },
                {
                  login: "reviewer-b",
                  name: "Reviewer B",
                  approvedAt: "2026-07-12T00:00:00Z",
                  riskyApproval: false,
                  changeRequestCountAfterApproval: "0",
                },
                { login: "reviewer-c", approvedAt: "2026-06-01T00:00:00Z", riskyApproval: true },
              ],
            },
          }),
        ],
        {},
      );

      expect(result.summary).toMatchObject({ approvals: 2, riskyApprovals: 1, highRiskApprovals: 1 });
      expect(reviewerByLogin(result, "reviewer-a")).toMatchObject({
        approvals: 0,
        riskyApprovals: 1,
        highRiskApprovals: 1,
        approvalsBeforeChangeRequest: 1,
        prCount: 1,
      });
      expect(reviewerByLogin(result, "reviewer-b")).toMatchObject({
        riskyApprovals: 0,
        approvalsBeforeChangeRequest: 0,
      });
      expect(reviewerByLogin(result, "reviewer-c")).toBeUndefined();
      expect(result.summary.sources.highRiskApprovals).toEqual([
        expect.objectContaining({ prNumber: "1", reviewer: "Reviewer A", approvedAt: "2026-07-11T00:00:00Z" }),
      ]);
    });

    test("given one reviewer across several PRs, when building stats, then reviews of every state, approvals and distinct PRs are counted", () => {
      const { buildReviewerStats } = createHelpers();

      const result = buildReviewerStats(
        [
          row("1", {
            commentEvents: [comment("reviewer-a", "2026-07-10T12:00:00Z")],
            reviews: [{ authorLogin: "reviewer-a", authorName: "Reviewer A", submittedAt: "2026-07-10T13:00:00Z", state: "COMMENTED" }],
          }),
          row("2", {
            reviews: [{ authorLogin: "reviewer-a", submittedAt: "2026-07-11T13:00:00Z", state: "APPROVED" }],
          }),
          row("3", {
            reviews: [{ authorLogin: "reviewer-a", submittedAt: "2026-07-12T13:00:00Z", state: "CHANGES_REQUESTED" }],
          }),
        ],
        {},
      );

      expect(reviewerByLogin(result, "reviewer-a")).toMatchObject({
        name: "Reviewer A",
        comments: 1,
        reviews: 3,
        approvals: 1,
        prCount: 3,
      });
    });

    test("given equal sort values, when applying stats controls, then ties break by risky approvals, approvals, comments and then name", () => {
      const { applyStatsControls } = createHelpers({ statsViewState: { sortBy: "comments", topN: 0 } });
      const reviewer = (name, riskyApprovals, approvals) => ({
        login: name.toLowerCase(),
        name,
        comments: 5,
        riskyApprovals,
        approvals,
        highRiskApprovals: 0,
        usefulnessSignals: 0,
      });

      const result = applyStatsControls({
        summary: {},
        reviewerRows: [
          reviewer("Ann", 1, 9),
          reviewer("Bob", 2, 1),
          reviewer("Carol", 2, 3),
          reviewer("Alpha", 2, 3),
          reviewer("Beta", 2, 3),
        ],
      });

      expect(result.reviewerRows.map((row) => row.name)).toEqual(["Alpha", "Beta", "Carol", "Bob", "Ann"]);
      // topN 0 falls back to 12.
      expect(result.topN).toBe(12);
      expect(result.totalBeforeLimit).toBe(5);
    });

    test("given each filter mode and minimum comments, when applying stats controls, then only matching reviewers remain; without a stats view the defaults apply", () => {
      const reviewerRows = () => [
        { login: "x", name: "X", comments: 0, usefulnessSignals: 1, highRiskApprovals: 0, riskyApprovals: 0, approvals: 0 },
        { login: "y", name: "Y", comments: 3, usefulnessSignals: 0, highRiskApprovals: 1, riskyApprovals: 3, approvals: 0 },
      ];
      const loginsFor = (statsViewState) =>
        createHelpers({ statsViewState })
          .applyStatsControls({ summary: {}, reviewerRows: reviewerRows() })
          .reviewerRows.map((row) => row.login);

      expect(loginsFor({ filterMode: "useful-comments" })).toEqual(["x"]);
      expect(loginsFor({ filterMode: "high-risk-approvals" })).toEqual(["y"]);
      expect(loginsFor({ filterMode: "all", minComments: 1 })).toEqual(["y"]);

      // No statsViewState: sorted by risky approvals, top 12.
      const defaults = createPrReviewStatsAggregationHelpers({}).applyStatsControls({
        summary: {},
        reviewerRows: reviewerRows(),
      });
      expect(defaults.reviewerRows.map((row) => row.login)).toEqual(["y", "x"]);
      expect(defaults.topN).toBe(12);
    });

    test("given loosely typed metrics, when normalizing row metrics, then counts become numbers and an unusable average merge lead becomes null", () => {
      const { normalizeRowMetrics } = createPrReviewStatsAggregationHelpers({});

      const parsed = normalizeRowMetrics({
        metrics: {
          counts: { totalComments: "4", reviews: "x" },
          approvalSummary: { averageMergeLeadMinutes: "12.5" },
          approvals: "not a list",
        },
      });
      expect(parsed.counts.totalComments).toBe(4);
      expect(parsed.counts.reviews).toBe(0);
      expect(parsed.counts.openConversations).toBe(0);
      expect(parsed.approvalSummary.averageMergeLeadMinutes).toBe(12.5);
      expect(parsed.approvals).toEqual([]);

      expect(normalizeRowMetrics({}).approvalSummary.averageMergeLeadMinutes).toBeNull();
      expect(
        normalizeRowMetrics({ metrics: { approvalSummary: { averageMergeLeadMinutes: "abc" } } }).approvalSummary
          .averageMergeLeadMinutes,
      ).toBeNull();
    });
  });
});
