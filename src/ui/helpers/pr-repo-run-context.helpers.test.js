/** @jest-environment jsdom */

const {
  createPrRepoRunContextHelpers,
} = require("./pr-repo-run-context.helpers.js");

describe("pr repo run context helpers", () => {
  test("given selected repo, when deriving repo run context, then selected repo has highest priority", () => {
    const { deriveRepoRunContext } = createPrRepoRunContextHelpers();

    const context = deriveRepoRunContext({
      selectedRepo: "org/selected",
      inputRepo: "org/input",
      lastRun: {
        repo: "org/last-run",
        updatedAt: "2026-07-17T00:00:00.000Z",
      },
    });

    expect(context).toEqual({
      repoFilter: "org/selected",
      runStamp: "2026-07-17T00:00:00.000Z",
      normalizedRunStamp: "2026-07-17T00:00:00.000Z",
    });
  });

  test("given no selected repo and no input repo, when deriving repo run context, then last run repo is used", () => {
    const { deriveRepoRunContext } = createPrRepoRunContextHelpers();

    const context = deriveRepoRunContext({
      selectedRepo: "",
      inputRepo: "",
      lastRun: {
        repo: "org/last-run",
        updatedAt: "",
      },
    });

    expect(context).toEqual({
      repoFilter: "org/last-run",
      runStamp: "",
      normalizedRunStamp: "",
    });
  });

  test("given run stamp with whitespace, when deriving repo run context, then normalized run stamp is trimmed", () => {
    const { deriveRepoRunContext } = createPrRepoRunContextHelpers();

    const context = deriveRepoRunContext({
      selectedRepo: "",
      inputRepo: "",
      lastRun: {
        repo: "",
        updatedAt: " 2026-07-17T10:11:12.000Z ",
      },
    });

    expect(context.runStamp).toBe(" 2026-07-17T10:11:12.000Z ");
    expect(context.normalizedRunStamp).toBe("2026-07-17T10:11:12.000Z");
  });

  test("given no repo sources, when deriving repo run context, then repo filter is empty string", () => {
    const { deriveRepoRunContext } = createPrRepoRunContextHelpers();

    const context = deriveRepoRunContext({
      selectedRepo: "",
      inputRepo: "",
      lastRun: null,
    });

    expect(context).toEqual({
      repoFilter: "",
      runStamp: "",
      normalizedRunStamp: "",
    });
  });
});
