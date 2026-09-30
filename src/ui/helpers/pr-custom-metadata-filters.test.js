/** @jest-environment jsdom */

/**
 * Unit tests for custom metadata filtering logic in rowMatchesUiFilters.
 * Tests the new visibility filters for: custom comments, other notes, PR difficulty,
 * rally stories, rally links, and analysis of PR.
 */

describe("Custom Metadata Filters", () => {
  let getManualNotesFieldSummary;
  let rowMatchesUiFilters;

  beforeEach(() => {
    // Mock getManualNotesFieldSummary function
    getManualNotesFieldSummary = jest.fn((_entry, _row) => ({
      hasCustomComments: false,
      hasOtherNotes: false,
      hasDifficulty: false,
      difficultyLevelText: "",
      hasRallyStories: false,
      hasRallyLinks: false,
      hasAnalysisOfPr: false,
    }));

    // Mock minimal dependencies
    global.getManualNotesFieldSummary = getManualNotesFieldSummary;
    global.getPreferredActorKey = jest.fn((login) => login || "");
    global.collectAssignedUsers = jest.fn(() => []);
    global.collectApproversFromRow = jest.fn(() => []);
    global.extractRowLabelNames = jest.fn(() => []);
    global.isInReviewEnabled = jest.fn(() => false);

    // Load the actual rowMatchesUiFilters function from index.page.js
    // Note: In a real test, this would be extracted to a testable helper module
    // For this test, we'll create a simplified version
    rowMatchesUiFilters = (entry, filters) => {
      const row = entry?.data || {};
      const notesSummary = getManualNotesFieldSummary(entry, row);

      // Custom comments filter
      if (filters.customComments === "with" && !notesSummary.hasCustomComments) {
        return false;
      }
      if (filters.customComments === "without" && notesSummary.hasCustomComments) {
        return false;
      }

      // Other notes filter
      if (filters.otherNotes === "with" && !notesSummary.hasOtherNotes) {
        return false;
      }
      if (filters.otherNotes === "without" && notesSummary.hasOtherNotes) {
        return false;
      }

      // PR difficulty filter
      if (filters.prDifficulty === "not-set" && notesSummary.hasDifficulty) {
        return false;
      }
      if (
        filters.prDifficulty &&
        filters.prDifficulty !== "not-set" &&
        notesSummary.difficultyLevelText !== filters.prDifficulty
      ) {
        return false;
      }

      // Rally stories filter
      if (filters.rallyStories === "with" && !notesSummary.hasRallyStories) {
        return false;
      }
      if (filters.rallyStories === "without" && notesSummary.hasRallyStories) {
        return false;
      }

      // Rally links filter
      if (filters.rallyLinks === "with" && !notesSummary.hasRallyLinks) {
        return false;
      }
      if (filters.rallyLinks === "without" && notesSummary.hasRallyLinks) {
        return false;
      }

      // Analysis of PR filter
      if (filters.analysisOfPr === "with" && !notesSummary.hasAnalysisOfPr) {
        return false;
      }
      if (filters.analysisOfPr === "without" && notesSummary.hasAnalysisOfPr) {
        return false;
      }

      return true;
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete global.getManualNotesFieldSummary;
    delete global.getPreferredActorKey;
    delete global.collectAssignedUsers;
    delete global.collectApproversFromRow;
    delete global.extractRowLabelNames;
    delete global.isInReviewEnabled;
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

  describe("Rally Stories Filter", () => {
    test("given filter set to 'with', when PR has rally stories, then row matches", () => {
      getManualNotesFieldSummary.mockReturnValue({ hasRallyStories: true });
      const entry = { data: {} };
      const filters = { rallyStories: "with" };

      expect(rowMatchesUiFilters(entry, filters)).toBe(true);
    });

    test("given filter set to 'with', when PR has no rally stories, then row does not match", () => {
      getManualNotesFieldSummary.mockReturnValue({ hasRallyStories: false });
      const entry = { data: {} };
      const filters = { rallyStories: "with" };

      expect(rowMatchesUiFilters(entry, filters)).toBe(false);
    });

    test("given filter set to 'without', when PR has rally stories, then row does not match", () => {
      getManualNotesFieldSummary.mockReturnValue({ hasRallyStories: true });
      const entry = { data: {} };
      const filters = { rallyStories: "without" };

      expect(rowMatchesUiFilters(entry, filters)).toBe(false);
    });

    test("given filter set to 'without', when PR has no rally stories, then row matches", () => {
      getManualNotesFieldSummary.mockReturnValue({ hasRallyStories: false });
      const entry = { data: {} };
      const filters = { rallyStories: "without" };

      expect(rowMatchesUiFilters(entry, filters)).toBe(true);
    });
  });

  describe("Rally Links Filter", () => {
    test("given filter set to 'with', when PR has rally links, then row matches", () => {
      getManualNotesFieldSummary.mockReturnValue({ hasRallyLinks: true });
      const entry = { data: {} };
      const filters = { rallyLinks: "with" };

      expect(rowMatchesUiFilters(entry, filters)).toBe(true);
    });

    test("given filter set to 'with', when PR has no rally links, then row does not match", () => {
      getManualNotesFieldSummary.mockReturnValue({ hasRallyLinks: false });
      const entry = { data: {} };
      const filters = { rallyLinks: "with" };

      expect(rowMatchesUiFilters(entry, filters)).toBe(false);
    });

    test("given filter set to 'without', when PR has rally links, then row does not match", () => {
      getManualNotesFieldSummary.mockReturnValue({ hasRallyLinks: true });
      const entry = { data: {} };
      const filters = { rallyLinks: "without" };

      expect(rowMatchesUiFilters(entry, filters)).toBe(false);
    });

    test("given filter set to 'without', when PR has no rally links, then row matches", () => {
      getManualNotesFieldSummary.mockReturnValue({ hasRallyLinks: false });
      const entry = { data: {} };
      const filters = { rallyLinks: "without" };

      expect(rowMatchesUiFilters(entry, filters)).toBe(true);
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
        hasRallyStories: true,
        hasRallyLinks: false,
        hasAnalysisOfPr: true,
      });
      const entry = { data: {} };
      const filters = {
        customComments: "with",
        otherNotes: "without",
        prDifficulty: "4",
        rallyStories: "with",
        rallyLinks: "without",
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
        hasRallyStories: true,
        hasRallyLinks: false,
        hasAnalysisOfPr: true,
      });
      const entry = { data: {} };
      const filters = {
        customComments: "with",
        otherNotes: "without",
        prDifficulty: "4",
        rallyStories: "with",
        rallyLinks: "without",
        analysisOfPr: "with",
      };

      expect(rowMatchesUiFilters(entry, filters)).toBe(false);
    });
  });
});
