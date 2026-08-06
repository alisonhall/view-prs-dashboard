/** @jest-environment jsdom */

const {
  createPrReviewStatsVisualsComponent,
} = require("./pr-review-stats-visuals.component.js");

describe("review stats visuals component", () => {
  test("given reviewer rows, when visuals are created, then graph cards and charts are rendered", () => {
    const statsViewState = { sortBy: "comments" };
    const applyFiltersFromCache = jest.fn();

    const graphCards = [];
    const chartCards = [];

    const component = createPrReviewStatsVisualsComponent({
      asArray: (value) => (Array.isArray(value) ? value : []),
      toCount: (value) => Number(value) || 0,
      sumReviewerMetric: (rows, key) =>
        rows.reduce((sum, row) => sum + (Number(row?.[key]) || 0), 0),
      aggregateReviewerCommentsTimeline: () => ({ dates: [], series: [] }),
      aggregateReviewerApprovalsTimeline: () => ({ dates: [], series: [] }),
      getNormalizedStatsDateRange: () => ({ startDate: "", endDate: "" }),
      createStatsGraphCard: (title, subtitle, items, onHeaderClick) => {
        if (!Array.isArray(items) || items.length === 0) return null;
        const section = document.createElement("section");
        section.className = "graph-card";
        section.dataset.title = title;
        section.dataset.subtitle = subtitle;
        section.onclick = () => onHeaderClick?.();
        graphCards.push(section);
        return section;
      },
      createReviewerActivityChart: (_data, title) => {
        const section = document.createElement("section");
        section.className = "timeline-chart";
        section.dataset.title = title;
        chartCards.push(section);
        return section;
      },
      statsViewState,
      applyFiltersFromCache,
    });

    const visuals = component.createStatsVisuals(
      {
        reviewerRows: [
          {
            name: "Alex",
            login: "alex",
            comments: 3,
            reviews: 2,
            approvals: 1,
            usefulnessSignals: 1,
            riskyApprovals: 1,
            highRiskApprovals: 0,
            threadComments: 1,
            prCount: 2,
            resolvedThreadComments: 1,
            commentsFollowedByAuthorCommit: 1,
          },
        ],
      },
      [],
      {},
    );

    expect(visuals).toBeTruthy();
    expect(graphCards.length).toBe(4);
    expect(chartCards.length).toBe(2);
    expect(visuals.querySelectorAll(".graph-card").length).toBe(4);
    expect(visuals.querySelectorAll(".timeline-chart").length).toBe(2);

    graphCards[2].click();
    expect(statsViewState.sortBy).toBe("approvals");
    expect(applyFiltersFromCache).toHaveBeenCalledTimes(1);
  });

  test("given no reviewer rows, when visuals are created, then no visuals are returned", () => {
    const component = createPrReviewStatsVisualsComponent({
      asArray: (value) => (Array.isArray(value) ? value : []),
      toCount: (value) => Number(value) || 0,
      sumReviewerMetric: () => 0,
      aggregateReviewerCommentsTimeline: () => ({ dates: [], series: [] }),
      aggregateReviewerApprovalsTimeline: () => ({ dates: [], series: [] }),
      getNormalizedStatsDateRange: () => ({ startDate: "", endDate: "" }),
      createStatsGraphCard: () => null,
      createReviewerActivityChart: () => null,
      statsViewState: { sortBy: "comments" },
      applyFiltersFromCache: () => {},
    });

    const visuals = component.createStatsVisuals({ reviewerRows: [] }, [], {});
    expect(visuals).toBeNull();
  });
});
