/** @jest-environment jsdom */

const {
  createPrSectionTableComponent,
} = require("./pr-section-table.component.js");

describe("pr section table component", () => {
  const makeCell = (className, text) => {
    const td = document.createElement("td");
    td.className = className;
    td.textContent = text;
    return td;
  };

  const createComponent = () =>
    createPrSectionTableComponent({
      tableHeaders: ["Sel", "Attention", "PR", "Status", "Approved", "Title", "Author", "Labels", "Check", "Date", "Actions"],
      tableColumnClasses: [
        "selection-column",
        "attention-column",
        "pr-column",
        "status-column",
        "approved-column",
        "title-column",
        "author-column",
        "labels-column",
        "check-column",
        "date-column",
        "actions-column",
      ],
      defaultRepo: "owner/default",
      getNeedsAttentionConfig: () => ({}),
      countPendingThreadComments: () => 0,
      shouldShowNeedsAttention: () => false,
      isInReviewEnabled: () => false,
      isFlaggedEnabled: () => false,
      createSelectionCell: () => makeCell("selection-cell", "sel"),
      createStatusCell: () => makeCell("status-cell", "status"),
      createApprovedCell: () => makeCell("approved-cell", "approved"),
      createInsightsDetails: () => {
        const node = document.createElement("div");
        node.className = "insights-content";
        return node;
      },
      createTitleCell: () => makeCell("title-cell", "title"),
      createAuthorCell: () => makeCell("author-cell", "author"),
      createLabelsCell: () => makeCell("labels-cell", "labels"),
      createTextCell: () => makeCell("text-cell", "check"),
      createDateCell: () => makeCell("date-cell", "date"),
      createActionsCell: () => makeCell("actions-cell", "actions"),
      formatChkDisplay: (value) => String(value || "-"),
      createHeaderCell: (header) => {
        const th = document.createElement("th");
        th.textContent = String(header || "");
        return th;
      },
      documentRef: document,
    });

  test("given empty rows, when building section table, then a none placeholder is returned", () => {
    const component = createComponent();

    const result = component.buildSectionTable([], "Date", () => "-", "open");

    expect(result?.tagName).toBe("PRE");
    expect(result?.textContent).toBe("(none)");
  });

  test("given one row entry, when building section table, then table rows and insights row are rendered", () => {
    const component = createComponent();

    const result = component.buildSectionTable(
      [{ prNumber: 101, repo: "owner/repo", data: { number: 101, titleDisplay: "Title [CHK:PASS]", labels: [] } }],
      "Date",
      () => "2026-01-01",
      "open",
      "2026-01-01T00:00:00Z",
      {},
    );

    expect(result?.tagName).toBe("TABLE");
    expect(result?.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(result?.querySelector(".pr-link")?.getAttribute("href")).toBe(
      "https://github.com/owner/repo/pull/101",
    );
    expect(result?.querySelector(".insights-row-cell")?.getAttribute("colspan")).toBe("11");
  });
});
