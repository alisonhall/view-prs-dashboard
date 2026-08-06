/** @jest-environment jsdom */

const {
  createPrRowInsightsComponent,
} = require("./pr-row-insights.component.js");

describe("pr row insights component", () => {
  test("given row insight dependencies, when creating insights details, then badges, grid values, and sections are appended", () => {
    const createSectionNode = (className) => {
      const node = document.createElement("details");
      node.className = className;
      return node;
    };

    const notesNode = document.createElement("div");
    notesNode.className = "pr-notes-section";

    const component = createPrRowInsightsComponent({
      parseMarkerState: () => "PASS",
      formatIsoDatetime: (value) => String(value || "-"),
      buildRowActorsMap: () => ({ user: "User" }),
      formatApproversDisplay: () => "Approver",
      formatRequestedReviewersDisplay: () => "Reviewer",
      formatAssignedUsersDisplay: () => "Assignee",
      normalizeRowMetrics: () => ({ approvals: [] }),
      getOpenConversationCountWithMe: () => ({ count: 2, isViewerSpecific: true }),
      toCount: (value) => Number(value || 0),
      getViewedFilesSummary: () => "3/5 viewed",
      createLinesChangedInsightContent: () => "120 lines",
      buildActivityTimelineSummary: () => "timeline",
      getBadgeClassForStatus: () => "status-badge",
      getBadgeClassForCheck: () => "check-badge",
      getBadgeClassForMerge: () => "merge-badge",
      formatReviewFootprint: () => "footprint",
      formatConversationStatus: () => "conversation",
      formatApprovalRisk: () => "approval",
      formatCommentUsefulness: () => "usefulness",
      createActivityEventsSection: () => createSectionNode("activity-section"),
      createReviewThreadsSection: () => createSectionNode("review-section"),
      createApprovalRiskSection: () => createSectionNode("approval-section"),
      createNotesSection: () => notesNode,
      documentRef: document,
    });

    const result = component.createInsightsDetails(
      { updatedAt: "2026-01-01T00:00:00Z" },
      {
        number: 101,
        status: "open",
        sourceBranch: "feature/abc",
        targetBranch: "main",
        baseline: "2026-01-01T00:00:00Z",
        sourceUpdatedAt: "2026-01-01T01:00:00Z",
      },
      {},
    );

    expect(result?.className).toBe("row-insights-content");
    expect(result?.getAttribute("data-pr-number")).toBe("101");
    expect(result?.querySelectorAll(".insight-badge")).toHaveLength(3);
    expect(String(result?.textContent || "")).toContain("Open conversations with me");
    expect(result?.querySelector("details.activity-section")).toBeTruthy();
    expect(result?.querySelector("details.review-section")).toBeTruthy();
    expect(result?.querySelector("details.approval-section")).toBeTruthy();
    expect(result?.querySelector(".pr-notes-section")).toBe(notesNode);
  });
});
