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

  test("given a raw date value, when creating the date cell, then formatted date text is rendered", () => {
    const helpers = createHelpers();

    const result = helpers.createDateCell({}, {}, "2026-07-22T10:00:00Z");

    expect(result?.querySelector(".date-cell-content")?.textContent).toBe(
      "formatted:2026-07-22T10:00:00Z",
    );
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
});
