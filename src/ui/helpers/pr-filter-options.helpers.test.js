/** @jest-environment jsdom */

const {
  createPrFilterOptionsHelpers,
} = require("./pr-filter-options.helpers.js");

// Phase 7, sub-phase 7.4 (see REACT_MIGRATION_PLAN.md): populateFilterOptions
// is now a permanent no-op shell - every populate function it used to
// orchestrate moved to FilterOptionsProvider.jsx. Kept wired into
// deriveViewerFilterSetup's call chain (renderPrData's still-vanilla
// pipeline) rather than deleted outright, so the only behavior left to
// test is that calling it never throws, regardless of arguments.
describe("pr filter options helpers", () => {
  test("given any arguments, when populating filter options, then it is a safe no-op", () => {
    const { populateFilterOptions } = createPrFilterOptionsHelpers();

    expect(() =>
      populateFilterOptions({
        entries: [{ id: 1 }],
        repoFilter: "org/repo",
        actorsMap: { user1: {} },
      }),
    ).not.toThrow();
  });

  test("given no arguments at all, when populating filter options, then it is a safe no-op", () => {
    const { populateFilterOptions } = createPrFilterOptionsHelpers();

    expect(() => populateFilterOptions()).not.toThrow();
  });
});
