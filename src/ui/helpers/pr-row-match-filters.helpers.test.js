const { createPrRowMatchFiltersHelpers } = require("./pr-row-match-filters.helpers.js");

// Phase 7 (see REACT_MIGRATION_PLAN.md, "live filtering"): this logic used
// to be an inline, untested-in-isolation function in index.page.js
// (covered only transitively, with a mocked rowMatchesUiFilters, via
// pr-row-filtering.helpers.test.js). Extracting it into its own module
// is the first time it gets direct coverage of its actual predicate logic.
describe("pr-row-match-filters helpers", () => {
  const makeHelpers = (overrides = {}) =>
    createPrRowMatchFiltersHelpers({
      getPreferredActorKey: (login) => login || "",
      collectAssignedUsers: (row) => (row.assignedLogins || []).map((login) => ({ login })),
      collectApproversFromRow: (row) => (row.approverLogins || []).map((login) => ({ login })),
      extractRowLabelNames: (row) => row.labels || [],
      normalizeFilterToken: (value) => String(value || "").trim().toLowerCase(),
      getManualNotesFieldSummary: (_entry, row) => row.notesSummary || {},
      // Matches index.page.js's real isInReviewEnabled contract: inReview
      // is stored as a STRING in the real data pipeline ("true"/"false"),
      // not a boolean - a plain Boolean(row.inReview) would be wrong (any
      // non-empty string, including "false", is truthy).
      isInReviewEnabled: (row) => {
        const value = row.inReview;
        return value === true || String(value || "").toLowerCase() === "true";
      },
      ...overrides,
    });

  const emptyCriteria = () => ({
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
    rallyStories: "",
    rallyLinks: "",
    analysisOfPr: "",
  });

  test("given no active filters, when called, then every row matches", () => {
    const { rowMatchesUiFilters } = makeHelpers();
    expect(rowMatchesUiFilters({ data: { number: 1 } }, emptyCriteria())).toBe(true);
  });

  test("given alwaysShowInReview and the row is in review, when called, then it matches regardless of every other filter", () => {
    const { rowMatchesUiFilters } = makeHelpers();
    const entry = { data: { number: 1, inReview: true, authorLogin: "nobody" } };
    const criteria = { ...emptyCriteria(), alwaysShowInReview: true, authorLogins: ["someone-else"] };
    expect(rowMatchesUiFilters(entry, criteria)).toBe(true);
  });

  // Regression test: inReview is stored as a STRING in the real data
  // pipeline, and "false" (the literal default for every PR, see
  // view-prs-data-helpers.js) is the case that actually matters - a naive
  // Boolean(row.inReview) treats it as truthy, incorrectly short-circuiting
  // every other filter for essentially every PR whenever alwaysShowInReview
  // is on.
  test("given alwaysShowInReview and the row's inReview is the string \"false\", when called, then it does NOT bypass the other filters", () => {
    const { rowMatchesUiFilters } = makeHelpers();
    const entry = { data: { number: 1, inReview: "false", authorLogin: "nobody" } };
    const criteria = { ...emptyCriteria(), alwaysShowInReview: true, authorLogins: ["someone-else"] };
    expect(rowMatchesUiFilters(entry, criteria)).toBe(false);
  });

  test("given alwaysShowInReview and the row's inReview is the string \"true\", when called, then it DOES bypass the other filters", () => {
    const { rowMatchesUiFilters } = makeHelpers();
    const entry = { data: { number: 1, inReview: "true", authorLogin: "nobody" } };
    const criteria = { ...emptyCriteria(), alwaysShowInReview: true, authorLogins: ["someone-else"] };
    expect(rowMatchesUiFilters(entry, criteria)).toBe(true);
  });

  test("given a PR-number filter, when the row's number isn't in it, then it doesn't match", () => {
    const { rowMatchesUiFilters } = makeHelpers();
    const entry = { data: { number: 7 } };
    expect(rowMatchesUiFilters(entry, { ...emptyCriteria(), prNumbers: ["1", "2"] })).toBe(false);
  });

  test("given a PR-number filter, when the row's number IS in it, then it matches without checking any other filter", () => {
    const { rowMatchesUiFilters } = makeHelpers();
    const entry = { data: { number: 1, labels: ["unrelated"] } };
    const criteria = { ...emptyCriteria(), prNumbers: ["1"], includeLabels: ["never-matches"] };
    expect(rowMatchesUiFilters(entry, criteria)).toBe(true);
  });

  test("given an include-label filter, when the row has none of those labels, then it doesn't match", () => {
    const { rowMatchesUiFilters } = makeHelpers();
    const entry = { data: { number: 1, labels: ["bug"] } };
    expect(rowMatchesUiFilters(entry, { ...emptyCriteria(), includeLabels: ["enhancement"] })).toBe(false);
  });

  test("given an include-label filter, when the row has one of those labels, then it matches", () => {
    const { rowMatchesUiFilters } = makeHelpers();
    const entry = { data: { number: 1, labels: ["bug"] } };
    expect(rowMatchesUiFilters(entry, { ...emptyCriteria(), includeLabels: ["bug"] })).toBe(true);
  });

  test("given an exclude-label filter, when the row has one of those labels, then it doesn't match", () => {
    const { rowMatchesUiFilters } = makeHelpers();
    const entry = { data: { number: 1, labels: ["bug"] } };
    expect(rowMatchesUiFilters(entry, { ...emptyCriteria(), excludeLabels: ["bug"] })).toBe(false);
  });

  test("given an author filter, when the row's author isn't included, then it doesn't match", () => {
    const { rowMatchesUiFilters } = makeHelpers();
    const entry = { data: { number: 1, authorLogin: "alice" } };
    expect(rowMatchesUiFilters(entry, { ...emptyCriteria(), authorLogins: ["bob"] })).toBe(false);
  });

  test("given an author filter, when the row's author is included, then it matches", () => {
    const { rowMatchesUiFilters } = makeHelpers();
    const entry = { data: { number: 1, authorLogin: "alice" } };
    expect(rowMatchesUiFilters(entry, { ...emptyCriteria(), authorLogins: ["alice"] })).toBe(true);
  });

  test("given an assigned filter, when none of the row's assignees match, then it doesn't match", () => {
    const { rowMatchesUiFilters } = makeHelpers();
    const entry = { data: { number: 1, assignedLogins: ["alice"] } };
    expect(rowMatchesUiFilters(entry, { ...emptyCriteria(), assignedLogins: ["bob"] })).toBe(false);
  });

  test("given an assigned filter, when one of the row's assignees matches, then it matches", () => {
    const { rowMatchesUiFilters } = makeHelpers();
    const entry = { data: { number: 1, assignedLogins: ["alice", "bob"] } };
    expect(rowMatchesUiFilters(entry, { ...emptyCriteria(), assignedLogins: ["bob"] })).toBe(true);
  });

  test("given an approver filter, when none of the row's approvers match, then it doesn't match", () => {
    const { rowMatchesUiFilters } = makeHelpers();
    const entry = { data: { number: 1, approverLogins: ["alice"] } };
    expect(rowMatchesUiFilters(entry, { ...emptyCriteria(), approverLogins: ["bob"] })).toBe(false);
  });

  describe("the 6 'Any (with/without)' filters", () => {
    const cases = [
      ["customComments", "hasCustomComments"],
      ["otherNotes", "hasOtherNotes"],
      ["rallyStories", "hasRallyStories"],
      ["rallyLinks", "hasRallyLinks"],
      ["analysisOfPr", "hasAnalysisOfPr"],
    ];

    cases.forEach(([filterKey, summaryKey]) => {
      test(`given ${filterKey}="with", when the row's notes summary lacks ${summaryKey}, then it doesn't match`, () => {
        const { rowMatchesUiFilters } = makeHelpers();
        const entry = { data: { number: 1, notesSummary: { [summaryKey]: false } } };
        expect(rowMatchesUiFilters(entry, { ...emptyCriteria(), [filterKey]: "with" })).toBe(false);
      });

      test(`given ${filterKey}="without", when the row's notes summary has ${summaryKey}, then it doesn't match`, () => {
        const { rowMatchesUiFilters } = makeHelpers();
        const entry = { data: { number: 1, notesSummary: { [summaryKey]: true } } };
        expect(rowMatchesUiFilters(entry, { ...emptyCriteria(), [filterKey]: "without" })).toBe(false);
      });
    });

    test("given prDifficulty='not-set', when the row has a difficulty set, then it doesn't match", () => {
      const { rowMatchesUiFilters } = makeHelpers();
      const entry = { data: { number: 1, notesSummary: { hasDifficulty: true } } };
      expect(rowMatchesUiFilters(entry, { ...emptyCriteria(), prDifficulty: "not-set" })).toBe(false);
    });

    test("given a specific prDifficulty value, when the row's difficultyLevelText doesn't match, then it doesn't match", () => {
      const { rowMatchesUiFilters } = makeHelpers();
      const entry = { data: { number: 1, notesSummary: { difficultyLevelText: "Easy" } } };
      expect(rowMatchesUiFilters(entry, { ...emptyCriteria(), prDifficulty: "Hard" })).toBe(false);
    });

    test("given a specific prDifficulty value, when the row's difficultyLevelText matches, then it matches", () => {
      const { rowMatchesUiFilters } = makeHelpers();
      const entry = { data: { number: 1, notesSummary: { difficultyLevelText: "Hard" } } };
      expect(rowMatchesUiFilters(entry, { ...emptyCriteria(), prDifficulty: "Hard" })).toBe(true);
    });
  });

  test("given no dependencies at all, when called, then it resolves safely (every filter treated as empty/false)", () => {
    const { rowMatchesUiFilters } = createPrRowMatchFiltersHelpers();
    expect(rowMatchesUiFilters({ data: { number: 1 } }, emptyCriteria())).toBe(true);
  });
});
