/** @jest-environment jsdom */

const {
  createPrMergedRequestMoreConfigHelpers,
} = require("./pr-merged-request-more-config.helpers.js");

describe("pr merged request more config helpers", () => {
  test("given all scope and repo filter, when building request more options, then action is visible and repo filter is used", () => {
    const { buildMergedRequestMoreActionOptions } =
      createPrMergedRequestMoreConfigHelpers();

    const options = buildMergedRequestMoreActionOptions({
      selectedScope: "all",
      repoFilter: "org/repo-a",
      lastRunRepo: "org/repo-b",
      latestSelectedRepo: "org/repo-c",
    });

    expect(options).toEqual({
      isVisible: true,
      repo: "org/repo-a",
    });
  });

  test("given non-all scope, when building request more options, then action is hidden", () => {
    const { buildMergedRequestMoreActionOptions } =
      createPrMergedRequestMoreConfigHelpers();

    const options = buildMergedRequestMoreActionOptions({
      selectedScope: "needs-attention",
      repoFilter: "org/repo-a",
      lastRunRepo: "org/repo-b",
      latestSelectedRepo: "org/repo-c",
    });

    expect(options).toEqual({
      isVisible: false,
      repo: "org/repo-a",
    });
  });

  test("given missing repo filter and last run repo, when building request more options, then latest selected repo fallback is used", () => {
    const { buildMergedRequestMoreActionOptions } =
      createPrMergedRequestMoreConfigHelpers();

    const options = buildMergedRequestMoreActionOptions({
      selectedScope: "all",
      repoFilter: "",
      lastRunRepo: "",
      latestSelectedRepo: "org/repo-c",
    });

    expect(options).toEqual({
      isVisible: true,
      repo: "org/repo-c",
    });
  });

  test("given no repo sources, when building request more options, then repo is empty string", () => {
    const { buildMergedRequestMoreActionOptions } =
      createPrMergedRequestMoreConfigHelpers();

    const options = buildMergedRequestMoreActionOptions({
      selectedScope: "all",
    });

    expect(options).toEqual({
      isVisible: true,
      repo: "",
    });
  });
});
