(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsReviewStatsVisualsComponent = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrReviewStatsVisualsComponent = ({
    asArray,
    toCount,
    sumReviewerMetric,
    aggregateReviewerCommentsTimeline,
    aggregateReviewerApprovalsTimeline,
    getNormalizedStatsDateRange,
    createStatsGraphCard,
    createReviewerActivityChart,
    statsViewState,
    applyFiltersFromCache,
  } = {}) => {
    const refreshStatsView = () => {
      if (typeof applyFiltersFromCache === "function") {
        applyFiltersFromCache();
      }
    };

    const createStatsVisuals = (stats, rows = [], actorsMap = {}) => {
      const reviewerRows = asArray(stats?.reviewerRows);
      if (!reviewerRows.length) return null;

      const visuals = document.createElement("div");
      visuals.className = "stats-visuals";

      const visibleTotals = [
        {
          label: "Comments",
          value: sumReviewerMetric(reviewerRows, "comments"),
          tone: "comments",
        },
        {
          label: "Reviews",
          value: sumReviewerMetric(reviewerRows, "reviews"),
          tone: "reviews",
        },
        {
          label: "Approvals",
          value: sumReviewerMetric(reviewerRows, "approvals"),
          tone: "approvals",
        },
        {
          label: "Useful signals",
          value: sumReviewerMetric(reviewerRows, "usefulnessSignals"),
          tone: "usefulness",
        },
        {
          label: "Risky approvals",
          value: sumReviewerMetric(reviewerRows, "riskyApprovals"),
          tone: "risk",
        },
      ].filter((item) => item.value > 0);

      const topComments = reviewerRows
        .filter((reviewer) => toCount(reviewer?.comments) > 0)
        .slice(0, 8)
        .map((reviewer) => ({
          label: reviewer.name,
          segments: [
            {
              label: "Comments",
              value: reviewer.comments,
              tone: "comments",
            },
            {
              label: "Reviews",
              value: reviewer.reviews,
              tone: "reviews",
            },
            {
              label: "Approvals",
              value: reviewer.approvals,
              tone: "approvals",
            },
          ],
          login: reviewer.login,
          detail: `${reviewer.threadComments} thread comments | ${reviewer.prCount} PRs`,
        }));

      const topApprovals = reviewerRows
        .filter((reviewer) => toCount(reviewer?.approvals) > 0)
        .slice(0, 8)
        .map((reviewer) => ({
          label: reviewer.name,
          segments: [
            {
              label: "Approvals",
              value: reviewer.approvals,
              tone: "approvals",
            },
            {
              label: "Risk signals",
              value: reviewer.riskyApprovals,
              tone: "risk",
            },
            {
              label: "High-risk",
              value: reviewer.highRiskApprovals,
              tone: "risk",
            },
          ],
          login: reviewer.login,
          detail: `${reviewer.riskyApprovals} risky | ${reviewer.highRiskApprovals} high-risk`,
        }));

      const topUsefulness = reviewerRows
        .filter((reviewer) => toCount(reviewer?.usefulnessSignals) > 0)
        .slice(0, 8)
        .map((reviewer) => ({
          label: reviewer.name,
          segments: [
            {
              label: "Resolved threads",
              value: reviewer.resolvedThreadComments,
              tone: "usefulness",
            },
            {
              label: "Comments followed",
              value: reviewer.commentsFollowedByAuthorCommit,
              tone: "usefulness",
            },
          ],
          login: reviewer.login,
          detail: `${reviewer.commentsFollowedByAuthorCommit} comments followed by author commits`,
        }));

      const range = getNormalizedStatsDateRange();
      const reviewerCommentsData = aggregateReviewerCommentsTimeline(
        rows,
        actorsMap,
        range,
      );
      const reviewerCommentsDataSorted = {
        ...reviewerCommentsData,
        series: [...asArray(reviewerCommentsData?.series)].sort((a, b) => {
          const totalA = asArray(a?.points).reduce(
            (sum, point) => sum + toCount(point?.value),
            0,
          );
          const totalB = asArray(b?.points).reduce(
            (sum, point) => sum + toCount(point?.value),
            0,
          );
          if (totalB !== totalA) return totalB - totalA;
          return String(a?.actor || "").localeCompare(String(b?.actor || ""));
        }),
      };
      const reviewerApprovalsData = aggregateReviewerApprovalsTimeline(
        rows,
        actorsMap,
        range,
      );

      [
        createStatsGraphCard(
          "Visible metric totals",
          "Based on the reviewers currently shown in the table",
          visibleTotals,
          () => {
            statsViewState.sortBy = "comments";
            refreshStatsView();
          },
        ),
        createStatsGraphCard(
          "Top reviewers by comments",
          "Comments on others' PRs from the visible table rows",
          topComments,
          () => {
            statsViewState.sortBy = "comments";
            refreshStatsView();
          },
        ),
        createStatsGraphCard(
          "Top reviewers by approvals",
          "Approvals, with risky/high-risk context",
          topApprovals,
          () => {
            statsViewState.sortBy = "approvals";
            refreshStatsView();
          },
        ),
        createStatsGraphCard(
          "Top reviewers by useful signals",
          "Signals combine resolved threads and comments followed by author commits",
          topUsefulness,
          () => {
            statsViewState.sortBy = "usefulnessSignals";
            refreshStatsView();
          },
        ),
        createReviewerActivityChart(
          reviewerCommentsDataSorted,
          "Comments and reviews over time per author",
          `Heatmap + line trends for top ${reviewerCommentsDataSorted.series.length} authors (comments and reviews, excluding approvals).`,
        ),
        createReviewerActivityChart(
          reviewerApprovalsData,
          "Approvals over time per author",
          `Heatmap + line trends for top ${reviewerApprovalsData.series.length} authors (approval activity only).`,
        ),
      ]
        .filter(Boolean)
        .forEach((card) => visuals.appendChild(card));

      return visuals.children.length > 0 ? visuals : null;
    };

    return {
      createStatsVisuals,
    };
  };

  return {
    createPrReviewStatsVisualsComponent,
  };
});
