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

    expect(chip?.title).toContain("unsubmitted draft review comments");
  });

  describe("createLifecycleBadge", () => {
    test("given PR in smart group with open section, when creating badge, then returns open badge", () => {
      const { createLifecycleBadge } = createPrTitleCellHelpers({ documentRef: document });

      const badge = createLifecycleBadge("open", true);

      expect(badge?.tagName).toBe("SPAN");
      expect(badge?.className).toBe("lifecycle-badge lifecycle-badge-open");
      expect(badge?.textContent).toBe("Open");
      expect(badge?.title).toBe("Lifecycle status: Open");
    });

    test("given PR in smart group with draft section, when creating badge, then returns draft badge", () => {
      const { createLifecycleBadge } = createPrTitleCellHelpers({ documentRef: document });

      const badge = createLifecycleBadge("draft", true);

      expect(badge?.className).toBe("lifecycle-badge lifecycle-badge-draft");
      expect(badge?.textContent).toBe("Draft");
    });

    test("given PR in smart group with merged section, when creating badge, then returns merged badge", () => {
      const { createLifecycleBadge } = createPrTitleCellHelpers({ documentRef: document });

      const badge = createLifecycleBadge("merged", true);

      expect(badge?.className).toBe("lifecycle-badge lifecycle-badge-merged");
      expect(badge?.textContent).toBe("Merged");
    });

    test("given PR in smart group with closed section, when creating badge, then returns closed badge", () => {
      const { createLifecycleBadge } = createPrTitleCellHelpers({ documentRef: document });

      const badge = createLifecycleBadge("closed", true);

      expect(badge?.className).toBe("lifecycle-badge lifecycle-badge-closed");
      expect(badge?.textContent).toBe("Closed");
    });

    test("given PR not in smart group, when creating badge, then returns null", () => {
      const { createLifecycleBadge } = createPrTitleCellHelpers({ documentRef: document });

      const badge = createLifecycleBadge("open", false);

      expect(badge).toBeNull();
    });

    test("given invalid section, when creating badge, then returns null", () => {
      const { createLifecycleBadge } = createPrTitleCellHelpers({ documentRef: document });

      const badge = createLifecycleBadge("invalid", true);

      expect(badge).toBeNull();
    });

    test("given section with mixed case, when creating badge, then handles case-insensitively", () => {
      const { createLifecycleBadge } = createPrTitleCellHelpers({ documentRef: document });

      const badge = createLifecycleBadge("OpEn", true);

      expect(badge?.className).toBe("lifecycle-badge lifecycle-badge-open");
    });

    test("given no document available, when creating badge, then returns null", () => {
      const mockDocRef = { createElement: null }; // Invalid createElement
      const { createLifecycleBadge } = createPrTitleCellHelpers({ documentRef: mockDocRef });

      const badge = createLifecycleBadge("open", true);

      expect(badge).toBeNull();
    });
  });

  describe("createTitleCell with lifecycle badge", () => {
    test("given PR in smart group section, when creating title cell, then includes lifecycle badge", () => {
      const helpers = createPrTitleCellHelpers({
        formatTitleWithIcons: (_display, title) => title,
        documentRef: document,
      });
      const insightsRow = document.createElement("tr");

      const result = helpers.createTitleCell(
        { title: "Feature X" },
        insightsRow,
        { isSmartGroup: true, lifecycleSection: "open" },
      );

      const badge = result?.querySelector(".lifecycle-badge");
      expect(badge).not.toBeNull();
      expect(badge?.className).toBe("lifecycle-badge lifecycle-badge-open");
    });

    test("given PR in lifecycle section, when creating title cell, then does not include badge", () => {
      const helpers = createPrTitleCellHelpers({
        formatTitleWithIcons: (_display, title) => title,
        documentRef: document,
      });
      const insightsRow = document.createElement("tr");

      const result = helpers.createTitleCell(
        { title: "Feature X" },
        insightsRow,
        { isSmartGroup: false, lifecycleSection: "open" },
      );

      const badge = result?.querySelector(".lifecycle-badge");
      expect(badge).toBeNull();
    });

    test("given no section context, when creating title cell, then does not include badge", () => {
      const helpers = createPrTitleCellHelpers({
        formatTitleWithIcons: (_display, title) => title,
        documentRef: document,
      });
      const insightsRow = document.createElement("tr");

      const result = helpers.createTitleCell(
        { title: "Feature X" },
        insightsRow,
      );

      const badge = result?.querySelector(".lifecycle-badge");
      expect(badge).toBeNull();
    });

    test("given lifecycleSection from sectionContext parameter, when creating title cell, then uses lifecycleSection", () => {
      const helpers = createPrTitleCellHelpers({
        formatTitleWithIcons: (_display, title) => title,
        documentRef: document,
      });
      const insightsRow = document.createElement("tr");

      const result = helpers.createTitleCell(
        { title: "Feature X" },
        insightsRow,
        { lifecycleSection: "draft", isSmartGroup: true },
      );

      const badge = result?.querySelector(".lifecycle-badge-draft");
      expect(badge).not.toBeNull();
    });
  });
});
