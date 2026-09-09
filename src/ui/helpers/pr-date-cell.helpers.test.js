/** @jest-environment jsdom */

const {
  createPrDateCellHelpers,
} = require("./pr-date-cell.helpers.js");

describe("pr date cell helpers", () => {
  const createHelpers = (fieldSummary = {}) =>
    createPrDateCellHelpers({
      formatIsoDatetime: (value) => `formatted:${value}`,
      getManualNotesFieldSummary: () => ({
        hasCustomComments: false,
        hasOtherNotes: false,
        hasDifficulty: false,
        difficultyLevelText: "",
        hasRallyStories: false,
        hasRallyLinks: false,
        hasAnalysisOfPr: false,
        ...fieldSummary,
      }),
      createAuthorFieldIndicator: ({ hasData, title, text = "", extraClass = "" }) => {
        const node = document.createElement("span");
        node.className = ["author-notes-field-indicator", hasData ? "filled" : "empty", extraClass]
          .filter(Boolean)
          .join(" ");
        node.title = title;
        node.textContent = text;
        return node;
      },
      documentRef: document,
    });

  test("given a raw date value, when creating the date cell, then PR activity and viewer activity are rendered", () => {
    const helpers = createHelpers();

    const result = helpers.createDateCell(
      {},
      { updatedAt: "2026-07-20T10:00:00Z" },
      "2026-07-22T10:00:00Z"
    );

    // Should show PR activity line (last commit)
    expect(result?.querySelector(".date-cell-pr-activity")?.textContent).toBe(
      "formatted:2026-07-20T10:00:00Z",
    );
    expect(result?.querySelector(".date-cell-pr-activity")?.title).toBe("Last commit");

    // Should show viewer activity line
    expect(result?.querySelector(".date-cell-viewer-activity")?.textContent).toBe(
      "You: formatted:2026-07-22T10:00:00Z",
    );
    expect(result?.querySelector(".date-cell-viewer-activity")?.title).toBe(
      "Your last activity on this PR",
    );
  });

  test("given merged PR, when creating the date cell, then shows merge date with appropriate title", () => {
    const helpers = createHelpers();

    const result = helpers.createDateCell(
      {},
      { mergedAt: "2026-07-25T15:30:00Z", updatedAt: "2026-07-20T10:00:00Z" },
      "2026-07-22T10:00:00Z"
    );

    // Should show merge date (takes precedence over updatedAt)
    expect(result?.querySelector(".date-cell-pr-activity")?.textContent).toBe(
      "formatted:2026-07-25T15:30:00Z",
    );
    expect(result?.querySelector(".date-cell-pr-activity")?.title).toBe("Merged at");
  });

  test("given notes field summary flags, when creating the date cell, then one indicator is rendered for each supported notes field", () => {
    const helpers = createHelpers({
      hasCustomComments: true,
      hasOtherNotes: true,
      hasDifficulty: true,
      difficultyLevelText: "4",
      hasRallyStories: true,
      hasRallyLinks: false,
      hasAnalysisOfPr: true,
    });

    const result = helpers.createDateCell({}, {}, "2026-07-22T10:00:00Z");
    const indicators = Array.from(
      result?.querySelectorAll(".author-notes-field-indicator") || [],
    );

    expect(indicators).toHaveLength(6);
    expect(result?.querySelector(".author-notes-field-indicator-difficulty")?.textContent).toBe("4");
    expect(result?.querySelector(".author-notes-field-indicator-difficulty")?.title).toBe(
      "PR difficulty: 4",
    );
  });

  test("given no difficulty value, when creating the date cell, then difficulty indicator uses the base title and empty text", () => {
    const helpers = createHelpers({
      hasDifficulty: false,
      difficultyLevelText: "",
    });

    const result = helpers.createDateCell({}, {}, "2026-07-22T10:00:00Z");
    const difficulty = result?.querySelector(".author-notes-field-indicator-difficulty");

    expect(difficulty?.title).toBe("PR difficulty");
    expect(difficulty?.textContent).toBe("");
  });

  test("given closed PR (not merged), when creating the date cell, then shows closed date with appropriate title", () => {
    const helpers = createHelpers();

    const result = helpers.createDateCell(
      {},
      { closedAt: "2026-07-26T09:15:00Z", updatedAt: "2026-07-20T10:00:00Z" },
      "2026-07-22T10:00:00Z"
    );

    // Should show closed date (takes precedence over updatedAt)
    expect(result?.querySelector(".date-cell-pr-activity")?.textContent).toBe(
      "formatted:2026-07-26T09:15:00Z",
    );
    expect(result?.querySelector(".date-cell-pr-activity")?.title).toBe("Closed at");
  });

  test("given merged PR, when creating the date cell, then mergedAt takes precedence over closedAt", () => {
    const helpers = createHelpers();

    const result = helpers.createDateCell(
      {},
      { 
        mergedAt: "2026-07-25T15:30:00Z", 
        closedAt: "2026-07-25T15:30:00Z",
        updatedAt: "2026-07-20T10:00:00Z" 
      },
      "2026-07-22T10:00:00Z"
    );

    // Should show "Merged at" (not "Closed at") since mergedAt has higher priority
    expect(result?.querySelector(".date-cell-pr-activity")?.textContent).toBe(
      "formatted:2026-07-25T15:30:00Z",
    );
    expect(result?.querySelector(".date-cell-pr-activity")?.title).toBe("Merged at");
  });
});
