const {
  getManualNotesSummary,
  getManualNotesFieldSummary,
} = require("./pr-manual-notes-summary.helpers.js");

describe("pr manual notes summary helpers", () => {
  describe("getManualNotesSummary", () => {
    test("given no notes at all, when summarizing, then everything is falsy/zero", () => {
      expect(getManualNotesSummary({}, {})).toEqual({
        hasNotes: false,
        commentsCount: 0,
        hasOtherNotes: false,
      });
    });

    test("given comments with a note or author, when summarizing, then they count and hasNotes is true", () => {
      const entry = { notes: { comments: [{ note: "hi" }, { author: "alice" }, {}] } };
      expect(getManualNotesSummary(entry, {})).toEqual({
        hasNotes: true,
        commentsCount: 2,
        hasOtherNotes: false,
      });
    });

    test("given otherNotes but no comments, when summarizing, then hasNotes is true via hasOtherNotes", () => {
      const entry = { notes: { otherNotes: "  some context  " } };
      expect(getManualNotesSummary(entry, {})).toEqual({
        hasNotes: true,
        commentsCount: 0,
        hasOtherNotes: true,
      });
    });

    test("given notes only on the row (not the entry), when summarizing, then it falls back to row.notes", () => {
      const row = { notes: { otherNotes: "x" } };
      expect(getManualNotesSummary({}, row).hasOtherNotes).toBe(true);
    });
  });

  describe("getManualNotesFieldSummary", () => {
    test("given no notes at all, when summarizing, then every flag is falsy", () => {
      expect(getManualNotesFieldSummary({}, {})).toEqual({
        hasCustomComments: false,
        hasOtherNotes: false,
        hasDifficulty: false,
        difficultyLevelText: "",
        hasRallyStories: false,
        hasRallyLinks: false,
        hasAnalysisOfPr: false,
      });
    });

    test("given a difficulty value with digits, when summarizing, then difficultyLevelText extracts just the digits", () => {
      const entry = { notes: { prDifficulty: "Level 3 (medium)" } };
      const result = getManualNotesFieldSummary(entry, {});
      expect(result.hasDifficulty).toBe(true);
      expect(result.difficultyLevelText).toBe("3");
    });

    test("given rally stories/links and an analysis field, when summarizing, then all 3 are flagged true", () => {
      const entry = {
        notes: {
          rallyStories: ["US123", ""],
          rallyLinks: ["http://example.com"],
          analysisOfPr: "looks fine",
        },
      };
      const result = getManualNotesFieldSummary(entry, {});
      expect(result.hasRallyStories).toBe(true);
      expect(result.hasRallyLinks).toBe(true);
      expect(result.hasAnalysisOfPr).toBe(true);
    });
  });
});
