const {
  createPrInsightMetricsSummaryHelpers,
} = require("./pr-insight-metrics-summary.helpers.js");

describe("pr insight metrics summary helpers", () => {
  test("given metrics counts, when formatting review footprint, then comments reviews and approvals are rendered", () => {
    const helpers = createPrInsightMetricsSummaryHelpers();
    const result = helpers.formatReviewFootprint({
      counts: {
        totalComments: 14,
        reviews: 3,
        approvals: 2,
      },
    });

    expect(result).toBe("14 comments, 3 reviews, 2 approvals");
  });

  test("given estimated conversation counts, when formatting conversation status, then estimated counts are preferred", () => {
    const helpers = createPrInsightMetricsSummaryHelpers();
    const result = helpers.formatConversationStatus({
      conversationSummary: {
        estimatedOpenConversations: 5,
        openThreads: 2,
        estimatedTotalConversations: 12,
        totalThreads: 4,
      },
    });

    expect(result).toBe("5 open / 12 total");
  });

  test("given approval risk and usefulness summaries, when formatting risk and usefulness, then both summaries include expected counts", () => {
    const helpers = createPrInsightMetricsSummaryHelpers();
    const metrics = {
      approvalSummary: {
        riskyApprovals: 1,
        totalApprovals: 4,
        highRiskApprovals: 1,
      },
      commentUsefulnessSummary: {
        usefulnessSignals: 6,
        commentsFollowedByAuthorCommit: 2,
        resolvedThreadCommentsOnOthersPrs: 3,
      },
    };

    expect(helpers.formatApprovalRisk(metrics)).toBe("1/4 risky, 1 high-risk");
    expect(helpers.formatCommentUsefulness(metrics)).toBe(
      "6 signals (2 comments followed by author commits, 3 on resolved threads)",
    );
  });

  test("given missing metrics fields, when formatting summaries, then zero-safe fallback text is returned", () => {
    const helpers = createPrInsightMetricsSummaryHelpers();

    expect(helpers.formatReviewFootprint({})).toBe("0 comments, 0 reviews, 0 approvals");
    expect(helpers.formatConversationStatus({})).toBe("0 open / 0 total");
    expect(helpers.formatApprovalRisk({})).toBe("0/0 risky, 0 high-risk");
    expect(helpers.formatCommentUsefulness({})).toBe(
      "0 signals (0 comments followed by author commits, 0 on resolved threads)",
    );
  });
});
