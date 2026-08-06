/** @jest-environment jsdom */

const {
  createPrFilterOptionsHelpers,
} = require("./pr-filter-options.helpers.js");

describe("pr filter options helpers", () => {
  test("given entries, repo, and actors map, when populating filter options, then all option populations receive the same sources", () => {
    const populateIncludeLabelOptions = jest.fn();
    const populateExcludeLabelOptions = jest.fn();
    const populateAuthorOptions = jest.fn();
    const populateAssignedOptions = jest.fn();
    const populateApproverOptions = jest.fn();
    const populateAuthorThreadResolutionActorOptions = jest.fn();
    const { populateFilterOptions } = createPrFilterOptionsHelpers({
      populateIncludeLabelOptions,
      populateExcludeLabelOptions,
      populateAuthorOptions,
      populateAssignedOptions,
      populateApproverOptions,
      populateAuthorThreadResolutionActorOptions,
    });
    const entries = [{ id: 1 }];
    const repoFilter = "org/repo";
    const actorsMap = { user1: { displayName: "User One" } };

    populateFilterOptions({
      entries,
      repoFilter,
      actorsMap,
    });

    expect(populateIncludeLabelOptions).toHaveBeenCalledWith(entries, repoFilter);
    expect(populateExcludeLabelOptions).toHaveBeenCalledWith(entries, repoFilter);
    expect(populateAuthorOptions).toHaveBeenCalledWith(
      entries,
      repoFilter,
      actorsMap,
    );
    expect(populateAssignedOptions).toHaveBeenCalledWith(
      entries,
      repoFilter,
      actorsMap,
    );
    expect(populateApproverOptions).toHaveBeenCalledWith(
      entries,
      repoFilter,
      actorsMap,
    );
    expect(populateAuthorThreadResolutionActorOptions).toHaveBeenCalledWith(
      actorsMap,
    );
  });

  test("given missing actors map, when populating filter options, then actor-dependent options receive empty object fallback", () => {
    const populateAuthorOptions = jest.fn();
    const populateAssignedOptions = jest.fn();
    const populateApproverOptions = jest.fn();
    const populateAuthorThreadResolutionActorOptions = jest.fn();
    const { populateFilterOptions } = createPrFilterOptionsHelpers({
      populateIncludeLabelOptions: () => {},
      populateExcludeLabelOptions: () => {},
      populateAuthorOptions,
      populateAssignedOptions,
      populateApproverOptions,
      populateAuthorThreadResolutionActorOptions,
    });

    populateFilterOptions({
      entries: [{ id: 1 }],
      repoFilter: "org/repo",
    });

    expect(populateAuthorOptions).toHaveBeenCalledWith(
      [{ id: 1 }],
      "org/repo",
      {},
    );
    expect(populateAssignedOptions).toHaveBeenCalledWith(
      [{ id: 1 }],
      "org/repo",
      {},
    );
    expect(populateApproverOptions).toHaveBeenCalledWith(
      [{ id: 1 }],
      "org/repo",
      {},
    );
    expect(populateAuthorThreadResolutionActorOptions).toHaveBeenCalledWith({});
  });

  test("given invalid entries and repo filter, when populating filter options, then defaults are used", () => {
    const populateIncludeLabelOptions = jest.fn();
    const populateExcludeLabelOptions = jest.fn();
    const populateAuthorOptions = jest.fn();
    const { populateFilterOptions } = createPrFilterOptionsHelpers({
      populateIncludeLabelOptions,
      populateExcludeLabelOptions,
      populateAuthorOptions,
      populateAssignedOptions: () => {},
      populateApproverOptions: () => {},
    });

    populateFilterOptions({
      entries: null,
      repoFilter: 123,
      actorsMap: "bad",
    });

    expect(populateIncludeLabelOptions).toHaveBeenCalledWith([], "");
    expect(populateExcludeLabelOptions).toHaveBeenCalledWith([], "");
    expect(populateAuthorOptions).toHaveBeenCalledWith([], "", {});
  });

  test("given missing dependency functions, when populating filter options, then no error is thrown", () => {
    const { populateFilterOptions } = createPrFilterOptionsHelpers();

    expect(() =>
      populateFilterOptions({
        entries: [{ id: 1 }],
        repoFilter: "org/repo",
        actorsMap: { user1: {} },
      }),
    ).not.toThrow();
  });
});
