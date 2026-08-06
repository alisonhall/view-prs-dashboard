/** @jest-environment jsdom */

const {
  createPrTitleCellHelpers,
} = require("./pr-title-cell.helpers.js");

describe("pr title cell helpers", () => {
  test("given title and non-main target branch, when creating title cell, then title text and target branch detail are rendered", () => {
    const helpers = createPrTitleCellHelpers({
      formatTitleWithIcons: (_titleDisplay, title) => `formatted:${title}`,
      autoResizeTextarea: () => {},
      countPendingThreadComments: () => 0,
      documentRef: document,
    });

    const insightsRow = document.createElement("tr");
    insightsRow.hidden = true;

    const result = helpers.createTitleCell(
      {
        title: "Feature title",
        titleDisplay: "Feature title [CHK:PASS]",
        targetBranch: "release/2026",
      },
      insightsRow,
    );

    expect(result?.querySelector(".title-text")?.textContent).toBe("formatted:Feature title");
    expect(result?.textContent).toContain("Target branch: release/2026");
  });

  test("given an insights row with notes textareas, when toggle button is clicked, then visibility and aria state are updated and textareas are resized", () => {
    const resized = [];
    const helpers = createPrTitleCellHelpers({
      formatTitleWithIcons: (_titleDisplay, title) => String(title || ""),
      autoResizeTextarea: (node) => resized.push(node),
      countPendingThreadComments: () => 0,
      documentRef: document,
    });

    const insightsRow = document.createElement("tr");
    insightsRow.hidden = true;
    const textarea = document.createElement("textarea");
    textarea.className = "pr-notes-textarea";
    insightsRow.appendChild(textarea);

    const result = helpers.createTitleCell({ title: "x", number: "101" }, insightsRow);
    const toggle = result?.querySelector(".row-insights-toggle");

    expect(toggle?.textContent).toBe("More insights");
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    toggle?.onclick();
    expect(insightsRow.hidden).toBe(false);
    expect(toggle?.textContent).toBe("Hide insights");
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(resized).toHaveLength(1);

    toggle?.onclick();
    expect(insightsRow.hidden).toBe(true);
    expect(toggle?.textContent).toBe("More insights");
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
  });

  test("given pending comments count, when creating title cell, then pending comments chip is shown", () => {
    const helpers = createPrTitleCellHelpers({
      formatTitleWithIcons: (_titleDisplay, title) => String(title || ""),
      autoResizeTextarea: () => {},
      countPendingThreadComments: () => 3,
      documentRef: document,
    });

    const insightsRow = document.createElement("tr");
    insightsRow.hidden = true;

    const result = helpers.createTitleCell({ title: "x" }, insightsRow);
    const chip = result?.querySelector(".row-pending-comments-chip");

    expect(chip?.textContent).toBe("Pending comments: 3");
  });
});
