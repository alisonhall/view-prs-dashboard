const {
  getManualNotesSummary,
  getManualNotesFieldSummary,
} = require("./pr-manual-notes-summary.helpers.ts");

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
        hasStories: false,
        hasStoryNameOnly: false,
        hasStoryUrlOnly: false,
        hasStoryNameAndUrl: false,
        hasAnalysisOfPr: false,
      });
    });

    test("given a difficulty value with digits, when summarizing, then difficultyLevelText extracts just the digits", () => {
      const entry = { notes: { prDifficulty: "Level 3 (medium)" } };
      const result = getManualNotesFieldSummary(entry, {});
      expect(result.hasDifficulty).toBe(true);
      expect(result.difficultyLevelText).toBe("3");
    });

    test("given stories and an analysis field, when summarizing, then both are flagged true", () => {
      const entry = {
        notes: {
          stories: [{ name: "US123", url: "http://example.com" }],
          analysisOfPr: "looks fine",
        },
      };
      const result = getManualNotesFieldSummary(entry, {});
      expect(result.hasStories).toBe(true);
      expect(result.hasAnalysisOfPr).toBe(true);
    });

    test("given story rows with only a name, only a URL, and both, when summarizing, then each kind is flagged per row", () => {
      const summarize = (stories) => getManualNotesFieldSummary({ notes: { stories } }, {});

      expect(summarize([{ name: "US1", url: "" }])).toMatchObject({
        hasStories: true,
        hasStoryNameOnly: true,
        hasStoryUrlOnly: false,
        hasStoryNameAndUrl: false,
      });
      expect(summarize([{ name: "", url: "http://x/US2" }])).toMatchObject({
        hasStoryNameOnly: false,
        hasStoryUrlOnly: true,
        hasStoryNameAndUrl: false,
      });
      // Mixed rows: one name-only and one URL-only row is not "name and URL".
      expect(summarize([{ name: "US1", url: "" }, { name: "", url: "http://x/US2" }])).toMatchObject({
        hasStoryNameOnly: true,
        hasStoryUrlOnly: true,
        hasStoryNameAndUrl: false,
      });
    });

    test("given only blank story rows, when summarizing, then there are no stories", () => {
      expect(
        getManualNotesFieldSummary({ notes: { stories: [{ name: "  ", url: "" }] } }, {}).hasStories,
      ).toBe(false);
    });
  });
});
