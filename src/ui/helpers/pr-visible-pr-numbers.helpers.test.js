const { createPrVisiblePrNumbersHelpers } = require("./pr-visible-pr-numbers.helpers.ts");
const { createPrScopeSelectionHelpers } = require("./pr-scope-selection.helpers.ts");
const { createPrRowFilteringHelpers } = require("./pr-row-filtering.helpers.ts");
const { createPrRowMatchFiltersHelpers } = require("./pr-row-match-filters.helpers.ts");

// Phase 7 (see REACT_MIGRATION_PLAN.md, "live filtering"): wires the real
// scope-selection/row-filtering/row-matching factories together (not
// mocks) so this is an integration-style test of the exact composition
// useVisiblePrNumbers.tsx uses - the one new piece of logic this slice
// adds, everything else reused from the existing vanilla pipeline as-is.
//
// computeVisiblePrNumbers returns { visiblePrKeys, scopeLabel } (not a
// bare array) - scopeLabel feeds the Applied-filters-chip-text follow-up
// (state/useAppliedFilterSummary.tsx) and falls out of the same
// scope-resolution pass for free.
describe("pr-visible-pr-numbers helpers", () => {
  const makeEntry = (number, overrides = {}) => ({
    prNumber: String(number),
    repo: overrides.repo || "owner/repo",
    updatedAt: overrides.updatedAt,
    data: {
      number,
      authorLogin: overrides.authorLogin || "",
      labels: overrides.labels || [],
      assignedLogins: overrides.assignedLogins || [],
      approverLogins: overrides.approverLogins || [],
      inReview: overrides.inReview || false,
      notesSummary: overrides.notesSummary || {},
    },
  });

  const makeComputeVisiblePrNumbers = ({ entryNeedsAttention, entryHasYourLastActivity } = {}) => {
    const { resolveScopedRows, normalizeSelectedScope } = createPrScopeSelectionHelpers({
      entryNeedsAttention,
      entryHasYourLastActivity,
    });
    const { rowMatchesUiFilters } = createPrRowMatchFiltersHelpers({
      getPreferredActorKey: (login) => login || "",
      collectAssignedUsers: (row) => (row.assignedLogins || []).map((login) => ({ login })),
      collectApproversFromRow: (row) => (row.approverLogins || []).map((login) => ({ login })),
      extractRowLabelNames: (row) => row.labels || [],
      normalizeFilterToken: (value) => String(value || "").trim().toLowerCase(),
      getManualNotesFieldSummary: (_entry, row) => row.notesSummary || {},
      // Matches index.page.js's real isInReviewEnabled contract - inReview
      // is stored as a STRING ("true"/"false") in the real data pipeline,
      // not a boolean.
      isInReviewEnabled: (row) => {
        const value = row.inReview;
        return value === true || String(value || "").toLowerCase() === "true";
      },
    });
    const { buildRowFilterCriteria, applyRowUiFilters } = createPrRowFilteringHelpers({
      rowMatchesUiFilters,
    });
    const { computeVisiblePrNumbers } = createPrVisiblePrNumbersHelpers({
      resolveScopedRows,
      normalizeSelectedScope,
      buildRowFilterCriteria,
      applyRowUiFilters,
    });
    return computeVisiblePrNumbers;
  };

  test("given no filters active, when called, then every PR number is visible, and scopeLabel is 'all stored rows'", () => {
    const computeVisiblePrNumbers = makeComputeVisiblePrNumbers();
    const payload = { byPrNumber: { 1: makeEntry(1), 2: makeEntry(2) } };

    const { visiblePrKeys, scopeLabel } = computeVisiblePrNumbers({
      payload,
      scopeMode: "all",
      filterPrNumbersRaw: "",
    });

    expect(visiblePrKeys.sort()).toEqual(["owner/repo#1", "owner/repo#2"]);
    expect(scopeLabel).toBe("all stored rows");
  });

  test("given \"Last run rows\", when a refresh of a few PRs moved lastRun since, then it still shows the last full run's rows", () => {
    const computeVisiblePrNumbers = makeComputeVisiblePrNumbers();
    const fullRun = "2026-10-31T10:00:00Z";
    const payload = {
      byPrNumber: {
        1: makeEntry(1, { updatedAt: fullRun }),
        // A fast-follow refreshed 2, keeping its full-run stamp.
        2: makeEntry(2, { updatedAt: fullRun }),
        // Left over from an older run.
        3: makeEntry(3, { updatedAt: "2026-10-30T10:00:00Z" }),
      },
      lastRun: { updatedAt: "2026-10-31T10:05:00Z" },
      lastFullRun: { updatedAt: fullRun },
    };

    expect(computeVisiblePrNumbers({ payload, scopeMode: "last-run", filterPrNumbersRaw: "" }).visiblePrKeys.sort()).toEqual(["owner/repo#1", "owner/repo#2"]);
    // Data from before lastFullRun: lastRun.
    const { lastFullRun: _omitted, ...older } = payload;
    expect(
      computeVisiblePrNumbers({ payload: { ...older, lastRun: { updatedAt: fullRun } }, scopeMode: "last-run", filterPrNumbersRaw: "" })
        .visiblePrKeys.sort(),
    ).toEqual(["owner/repo#1", "owner/repo#2"]);
  });

  test("given a PR-number filter, when called, then only that PR is visible, regardless of scope", () => {
    const computeVisiblePrNumbers = makeComputeVisiblePrNumbers();
    const payload = { byPrNumber: { 1: makeEntry(1), 2: makeEntry(2) } };

    const { visiblePrKeys } = computeVisiblePrNumbers({
      payload,
      scopeMode: "all",
      filterPrNumbersRaw: "2",
    });

    expect(visiblePrKeys).toEqual(["owner/repo#2"]);
  });

  test("given alwaysShowInReview, when a row is in review but fails every other active filter, then it's still visible", () => {
    const computeVisiblePrNumbers = makeComputeVisiblePrNumbers();
    const payload = {
      byPrNumber: {
        1: makeEntry(1, { inReview: true, authorLogin: "nobody" }),
        2: makeEntry(2, { authorLogin: "alice" }),
      },
    };

    const { visiblePrKeys } = computeVisiblePrNumbers({
      payload,
      scopeMode: "all",
      filterPrNumbersRaw: "",
      alwaysShowInReview: true,
      rowFilterSelections: { authorLogins: ["alice"] },
    });

    expect(visiblePrKeys.sort()).toEqual(["owner/repo#1", "owner/repo#2"]);
  });

  // Regression test: inReview's real-world default is the STRING "false"
  // (see view-prs-data-helpers.js), not a boolean - this PR must NOT be
  // treated as "in review" just because that string is non-empty/truthy.
  test("given alwaysShowInReview, when a row's inReview is the string \"false\" and it fails every other active filter, then it's correctly excluded", () => {
    const computeVisiblePrNumbers = makeComputeVisiblePrNumbers();
    const payload = {
      byPrNumber: {
        1: makeEntry(1, { inReview: "false", authorLogin: "nobody" }),
        2: makeEntry(2, { authorLogin: "alice" }),
      },
    };

    const { visiblePrKeys } = computeVisiblePrNumbers({
      payload,
      scopeMode: "all",
      filterPrNumbersRaw: "",
      alwaysShowInReview: true,
      rowFilterSelections: { authorLogins: ["alice"] },
    });

    expect(visiblePrKeys).toEqual(["owner/repo#2"]);
  });

  test("given a needs-attention scope, when called, then only rows entryNeedsAttention flags are visible, and scopeLabel reflects it", () => {
    const entryNeedsAttention = (entry) => entry.prNumber === "1";
    const computeVisiblePrNumbers = makeComputeVisiblePrNumbers({ entryNeedsAttention });
    const payload = { byPrNumber: { 1: makeEntry(1), 2: makeEntry(2) } };

    const { visiblePrKeys, scopeLabel } = computeVisiblePrNumbers({
      payload,
      scopeMode: "needs-attention",
      filterPrNumbersRaw: "",
    });

    expect(visiblePrKeys).toEqual(["owner/repo#1"]);
    expect(scopeLabel).toBe("needs attention rows");
  });

  test("given an include-label filter (row-filter-selection), when called, then only matching rows are visible", () => {
    const computeVisiblePrNumbers = makeComputeVisiblePrNumbers();
    const payload = {
      byPrNumber: {
        1: makeEntry(1, { labels: ["bug"] }),
        2: makeEntry(2, { labels: ["enhancement"] }),
      },
    };

    const { visiblePrKeys } = computeVisiblePrNumbers({
      payload,
      scopeMode: "all",
      filterPrNumbersRaw: "",
      rowFilterSelections: { includeLabels: ["bug"] },
    });

    expect(visiblePrKeys).toEqual(["owner/repo#1"]);
  });

  test("given an author filter combined with an assigned filter, when called, then both must match", () => {
    const computeVisiblePrNumbers = makeComputeVisiblePrNumbers();
    const payload = {
      byPrNumber: {
        1: makeEntry(1, { authorLogin: "alice", assignedLogins: ["bob"] }),
        2: makeEntry(2, { authorLogin: "alice", assignedLogins: ["carol"] }),
      },
    };

    const { visiblePrKeys } = computeVisiblePrNumbers({
      payload,
      scopeMode: "all",
      filterPrNumbersRaw: "",
      rowFilterSelections: { authorLogins: ["alice"], assignedLogins: ["bob"] },
    });

    expect(visiblePrKeys).toEqual(["owner/repo#1"]);
  });

  test("given an approver filter (the 5th row-filtering multi-select), when called, then only matching rows are visible", () => {
    const computeVisiblePrNumbers = makeComputeVisiblePrNumbers();
    const payload = {
      byPrNumber: {
        1: makeEntry(1, { approverLogins: ["dave"] }),
        2: makeEntry(2, { approverLogins: ["erin"] }),
      },
    };

    const { visiblePrKeys } = computeVisiblePrNumbers({
      payload,
      scopeMode: "all",
      filterPrNumbersRaw: "",
      rowFilterSelections: { approverLogins: ["dave"] },
    });

    expect(visiblePrKeys).toEqual(["owner/repo#1"]);
  });

  test("given no payload/entries at all, when called, then it returns an empty array", () => {
    const computeVisiblePrNumbers = makeComputeVisiblePrNumbers();
    const { visiblePrKeys } = computeVisiblePrNumbers({
      payload: null,
      scopeMode: "all",
      filterPrNumbersRaw: "",
    });
    expect(visiblePrKeys).toEqual([]);
  });

  test("given no dependencies injected at all, when called, then it resolves safely", () => {
    const { computeVisiblePrNumbers } = createPrVisiblePrNumbersHelpers();
    const { visiblePrKeys, scopeLabel } = computeVisiblePrNumbers({
      payload: { byPrNumber: { 1: makeEntry(1) } },
    });
    expect(visiblePrKeys).toEqual(["owner/repo#1"]);
    expect(scopeLabel).toBe("all stored rows");
  });

  // Keys, not bare numbers: two repos can each have a PR #7, and a filter
  // matching one mustn't show the other.
  test("given two repos' PRs with the same number, when a filter matches one, then only that repo's is visible", () => {
    const computeVisiblePrNumbers = makeComputeVisiblePrNumbers();
    const payload = {
      byPrNumber: {
        "acme/api#7": makeEntry(7, { repo: "acme/api", authorLogin: "alice" }),
        "acme/web#7": makeEntry(7, { repo: "acme/web", authorLogin: "bob" }),
      },
    };

    const { visiblePrKeys } = computeVisiblePrNumbers({
      payload,
      scopeMode: "all",
      filterPrNumbersRaw: "",
      rowFilterSelections: { authorLogins: ["alice"] },
    });

    expect(visiblePrKeys).toEqual(["acme/api#7"]);
  });
});
