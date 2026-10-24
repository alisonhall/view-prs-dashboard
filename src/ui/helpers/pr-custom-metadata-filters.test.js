/** @jest-environment jsdom */

/**
 * The notes-based row filters in rowMatchesUiFilters
 * (pr-row-match-filters.helpers.ts): custom comments, other notes, PR
 * difficulty, stories, and analysis of PR. The notes summary is injected,
 * so each test sets exactly the flags it needs.
 */

const { createPrRowMatchFiltersHelpers } = require("./pr-row-match-filters.helpers.ts");

const EMPTY_CRITERIA = {
  prNumbers: [],
  includeLabels: [],
  excludeLabels: [],
  authorLogins: [],
  assignedLogins: [],
  approverLogins: [],
  alwaysShowInReview: false,
  customComments: "",
  otherNotes: "",
  prDifficulty: "",
  stories: "",
  analysisOfPr: "",
};

describe("Custom Metadata Filters", () => {
  let getManualNotesFieldSummary;
  let rowMatchesUiFilters;

  beforeEach(() => {
    getManualNotesFieldSummary = jest.fn(() => ({}));
    const helpers = createPrRowMatchFiltersHelpers({ getManualNotesFieldSummary });
    rowMatchesUiFilters = (entry, filters) => helpers.rowMatchesUiFilters(entry, { ...EMPTY_CRITERIA, ...filters });
  });

  describe("Custom Comments Filter", () => {
    test("given filter set to 'with', when PR has custom comments, then row matches", () => {
      getManualNotesFieldSummary.mockReturnValue({ hasCustomComments: true });
      const entry = { data: {} };
      const filters = { customComments: "with" };

      expect(rowMatchesUiFilters(entry, filters)).toBe(true);
    });

    test("given filter set to 'with', when PR has no custom comments, then row does not match", () => {
      getManualNotesFieldSummary.mockReturnValue({ hasCustomComments: false });
      const entry = { data: {} };
      const filters = { customComments: "with" };

      expect(rowMatchesUiFilters(entry, filters)).toBe(false);
    });

    test("given filter set to 'without', when PR has custom comments, then row does not match", () => {
      getManualNotesFieldSummary.mockReturnValue({ hasCustomComments: true });
      const entry = { data: {} };
      const filters = { customComments: "without" };

      expect(rowMatchesUiFilters(entry, filters)).toBe(false);
    });

    test("given filter set to 'without', when PR has no custom comments, then row matches", () => {
      getManualNotesFieldSummary.mockReturnValue({ hasCustomComments: false });
      const entry = { data: {} };
      const filters = { customComments: "without" };

      expect(rowMatchesUiFilters(entry, filters)).toBe(true);
    });

    test("given filter not set, when PR has or does not have custom comments, then row matches", () => {
      getManualNotesFieldSummary.mockReturnValue({ hasCustomComments: true });
      const entry = { data: {} };
      const filters = { customComments: "" };

      expect(rowMatchesUiFilters(entry, filters)).toBe(true);

      getManualNotesFieldSummary.mockReturnValue({ hasCustomComments: false });
      expect(rowMatchesUiFilters(entry, filters)).toBe(true);
    });
  });

  describe("Other Notes Filter", () => {
    test("given filter set to 'with', when PR has other notes, then row matches", () => {
      getManualNotesFieldSummary.mockReturnValue({ hasOtherNotes: true });
      const entry = { data: {} };
      const filters = { otherNotes: "with" };

      expect(rowMatchesUiFilters(entry, filters)).toBe(true);
    });

    test("given filter set to 'with', when PR has no other notes, then row does not match", () => {
      getManualNotesFieldSummary.mockReturnValue({ hasOtherNotes: false });
      const entry = { data: {} };
      const filters = { otherNotes: "with" };

      expect(rowMatchesUiFilters(entry, filters)).toBe(false);
    });

    test("given filter set to 'without', when PR has other notes, then row does not match", () => {
      getManualNotesFieldSummary.mockReturnValue({ hasOtherNotes: true });
      const entry = { data: {} };
      const filters = { otherNotes: "without" };

      expect(rowMatchesUiFilters(entry, filters)).toBe(false);
    });

    test("given filter set to 'without', when PR has no other notes, then row matches", () => {
      getManualNotesFieldSummary.mockReturnValue({ hasOtherNotes: false });
      const entry = { data: {} };
      const filters = { otherNotes: "without" };

      expect(rowMatchesUiFilters(entry, filters)).toBe(true);
    });
  });

  describe("PR Difficulty Filter", () => {
    test("given filter set to specific difficulty '3', when PR has matching difficulty, then row matches", () => {
      getManualNotesFieldSummary.mockReturnValue({
        hasDifficulty: true,
        difficultyLevelText: "3",
      });
      const entry = { data: {} };
      const filters = { prDifficulty: "3" };

      expect(rowMatchesUiFilters(entry, filters)).toBe(true);
    });

    test("given filter set to specific difficulty '3', when PR has different difficulty, then row does not match", () => {
      getManualNotesFieldSummary.mockReturnValue({
        hasDifficulty: true,
        difficultyLevelText: "5",
      });
      const entry = { data: {} };
      const filters = { prDifficulty: "3" };

      expect(rowMatchesUiFilters(entry, filters)).toBe(false);
    });

    test("given filter set to 'not-set', when PR has difficulty set, then row does not match", () => {
      getManualNotesFieldSummary.mockReturnValue({
        hasDifficulty: true,
        difficultyLevelText: "4",
      });
      const entry = { data: {} };
      const filters = { prDifficulty: "not-set" };

      expect(rowMatchesUiFilters(entry, filters)).toBe(false);
    });

    test("given filter set to 'not-set', when PR has no difficulty set, then row matches", () => {
      getManualNotesFieldSummary.mockReturnValue({
        hasDifficulty: false,
        difficultyLevelText: "",
      });
      const entry = { data: {} };
      const filters = { prDifficulty: "not-set" };

      expect(rowMatchesUiFilters(entry, filters)).toBe(true);
    });

    test("given filter not set, when PR has any difficulty level, then row matches", () => {
      getManualNotesFieldSummary.mockReturnValue({
        hasDifficulty: true,
        difficultyLevelText: "2",
      });
      const entry = { data: {} };
      const filters = { prDifficulty: "" };

      expect(rowMatchesUiFilters(entry, filters)).toBe(true);
    });
  });

  describe("Stories Filter", () => {
    test.each([
      ["none", { hasStories: false }, true],
      ["none", { hasStories: true }, false],
      ["name-only", { hasStories: true, hasStoryNameOnly: true }, true],
      ["name-only", { hasStories: true, hasStoryNameAndUrl: true }, false],
      ["url-only", { hasStories: true, hasStoryUrlOnly: true }, true],
      ["url-only", { hasStories: true, hasStoryNameOnly: true }, false],
      ["name-and-url", { hasStories: true, hasStoryNameAndUrl: true }, true],
      ["name-and-url", { hasStories: true, hasStoryNameOnly: true, hasStoryUrlOnly: true }, false],
      ["", { hasStories: true, hasStoryNameOnly: true }, true],
    ])("given filter set to '%s' and summary %j, when matching, then the result is %s", (stories, summary, expected) => {
      getManualNotesFieldSummary.mockReturnValue(summary);

      expect(rowMatchesUiFilters({ data: {} }, { stories })).toBe(expected);
    });
  });

  describe("Analysis of PR Filter", () => {
    test("given filter set to 'with', when PR has analysis, then row matches", () => {
      getManualNotesFieldSummary.mockReturnValue({ hasAnalysisOfPr: true });
      const entry = { data: {} };
      const filters = { analysisOfPr: "with" };

      expect(rowMatchesUiFilters(entry, filters)).toBe(true);
    });

    test("given filter set to 'with', when PR has no analysis, then row does not match", () => {
      getManualNotesFieldSummary.mockReturnValue({ hasAnalysisOfPr: false });
      const entry = { data: {} };
      const filters = { analysisOfPr: "with" };

      expect(rowMatchesUiFilters(entry, filters)).toBe(false);
    });

    test("given filter set to 'without', when PR has analysis, then row does not match", () => {
      getManualNotesFieldSummary.mockReturnValue({ hasAnalysisOfPr: true });
      const entry = { data: {} };
      const filters = { analysisOfPr: "without" };

      expect(rowMatchesUiFilters(entry, filters)).toBe(false);
    });

    test("given filter set to 'without', when PR has no analysis, then row matches", () => {
      getManualNotesFieldSummary.mockReturnValue({ hasAnalysisOfPr: false });
      const entry = { data: {} };
      const filters = { analysisOfPr: "without" };

      expect(rowMatchesUiFilters(entry, filters)).toBe(true);
    });
  });

  describe("Multiple Filters Combined", () => {
    test("given multiple filters active, when PR matches all criteria, then row matches", () => {
      getManualNotesFieldSummary.mockReturnValue({
        hasCustomComments: true,
        hasOtherNotes: false,
        hasDifficulty: true,
        difficultyLevelText: "4",
        hasStories: true,
        hasStoryNameAndUrl: true,
        hasAnalysisOfPr: true,
      });
      const entry = { data: {} };
      const filters = {
        customComments: "with",
        otherNotes: "without",
        prDifficulty: "4",
        stories: "name-and-url",
        analysisOfPr: "with",
      };

      expect(rowMatchesUiFilters(entry, filters)).toBe(true);
    });

    test("given multiple filters active, when PR fails one criterion, then row does not match", () => {
      getManualNotesFieldSummary.mockReturnValue({
        hasCustomComments: true,
        hasOtherNotes: true, // This will fail the otherNotes: "without" filter
        hasDifficulty: true,
        difficultyLevelText: "4",
        hasStories: true,
        hasStoryNameAndUrl: true,
        hasAnalysisOfPr: true,
      });
      const entry = { data: {} };
      const filters = {
        customComments: "with",
        otherNotes: "without",
        prDifficulty: "4",
        stories: "name-and-url",
        analysisOfPr: "with",
      };

      expect(rowMatchesUiFilters(entry, filters)).toBe(false);
    });
  });
});
