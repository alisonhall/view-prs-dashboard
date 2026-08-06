/** @jest-environment jsdom */

const {
  createPrReviewStatsSummaryComponent,
} = require("./pr-review-stats-summary.component.js");

describe("review stats summary component", () => {
  const createComponent = (overrides = {}) =>
    createPrReviewStatsSummaryComponent({
      asArray: (value) => (Array.isArray(value) ? value : []),
      activateDataTab: () => {},
      collectNodesByTag: () => [],
      createTextCell: (value) => {
        const td = document.createElement("td");
        td.textContent = String(value || "");
        return td;
      },
      formatIsoDatetime: (value) => String(value || "-"),
      getNormalizedStatsDateRange: () => ({ startDate: "", endDate: "" }),
      renderActivityTrendNote: () => {
        const note = document.createElement("p");
        note.className = "stats-trend-note";
        note.textContent = "trend";
        return note;
      },
      createStatsVisuals: () => null,
      ...overrides,
    });

  test("given reviewer stats, when rendered, then cards table and summary note are shown", () => {
    const component = createComponent();
    const host = document.createElement("div");
    const stats = {
      summary: {
        rows: 2,
        commentsOnOthersPrs: 4,
        approvals: 3,
        riskyApprovals: 1,
        highRiskApprovals: 0,
        usefulnessSignals: 2,
        commentsFollowedByAuthorCommit: 1,
        sources: {
          rows: [{ prNumber: 101, prTitle: "Alpha" }],
          commentsOnOthersPrs: [{ reviewer: "Alex", count: 2 }],
          approvals: [{ reviewer: "Alex", approvedAt: "2026-07-01T10:00:00Z" }],
          usefulnessSignals: [{ reviewer: "Alex", count: 1 }],
        },
      },
      reviewerRows: [
        {
          name: "Alex",
          comments: 2,
          threadComments: 1,
          reviews: 3,
          approvals: 2,
          riskyApprovals: 1,
          highRiskApprovals: 0,
          usefulnessSignals: 1,
          commentsFollowedByAuthorCommit: 1,
          resolvedThreadComments: 1,
          prCount: 2,
          sources: {
            comments: [{ prNumber: 101, count: 2 }],
            reviews: [],
            riskyApprovals: [],
            usefulnessSignals: [],
          },
        },
      ],
      totalBeforeLimit: 1,
    };

    component.renderStatsSummaryAndTable(host, stats, [], {});

    expect(host.querySelectorAll(".stat-card").length).toBe(4);
    expect(host.querySelectorAll(".stats-table tbody tr").length).toBe(2);
    expect(host.querySelector(".stats-note")?.textContent).toContain(
      "Showing 1 of 1 reviewers",
    );
    expect(host.querySelector(".stats-trend-note")?.textContent).toBe("trend");
  });

  test("given a date range, when rendered, then summary note includes the range", () => {
    const component = createComponent({
      getNormalizedStatsDateRange: () => ({
        startDate: "2026-07-01",
        endDate: "2026-07-10",
      }),
    });
    const host = document.createElement("div");
    const stats = {
      summary: {
        rows: 0,
        commentsOnOthersPrs: 0,
        approvals: 0,
        riskyApprovals: 0,
        highRiskApprovals: 0,
        usefulnessSignals: 0,
        commentsFollowedByAuthorCommit: 0,
        sources: {
          rows: [],
          commentsOnOthersPrs: [],
          approvals: [],
          usefulnessSignals: [],
        },
      },
      reviewerRows: [],
      totalBeforeLimit: 0,
    };

    component.renderStatsSummaryAndTable(host, stats, [], {});

    expect(host.querySelector(".stats-note")?.textContent).toContain(
      "Date range: 2026-07-01 to 2026-07-10.",
    );
  });
});
