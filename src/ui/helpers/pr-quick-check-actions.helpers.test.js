/** @jest-environment jsdom */

const {
  createPrQuickCheckActionsHelpers,
} = require("./pr-quick-check-actions.helpers.js");

function buildHarness(overrides = {}) {
  const calls = {
    showErrorNotification: [],
    showWarningNotification: [],
    notifyFailureSnackbar: [],
    loadSchedulerStatus: [],
  };

  const helpers = createPrQuickCheckActionsHelpers({
    showErrorNotification: (...args) => calls.showErrorNotification.push(args),
    showWarningNotification: (...args) => calls.showWarningNotification.push(args),
    notifyFailureSnackbar: (...args) => calls.notifyFailureSnackbar.push(args),
    loadSchedulerStatus: (...args) => calls.loadSchedulerStatus.push(args),
    ...overrides,
  });

  return { helpers, calls };
}

describe("pr-quick-check-actions.helpers", () => {
  describe("collectAllLoadedPrsByRepo", () => {
    test("given entries across multiple repos, when collecting, then numbers are grouped by their own repo", () => {
      const { helpers } = buildHarness();
      const byPrNumber = {
        "1": { repo: "owner/repo-a", data: { number: "1" } },
        "2": { repo: "owner/repo-a", data: { number: "2" } },
        "3": { repo: "owner/repo-b", data: { number: "3" } },
      };

      const result = helpers.collectAllLoadedPrsByRepo(byPrNumber);

      expect(Array.from(result.entries())).toEqual([
        ["owner/repo-a", ["1", "2"]],
        ["owner/repo-b", ["3"]],
      ]);
    });

    test("given an entry missing a repo or a number, when collecting, then that entry is skipped", () => {
      const { helpers } = buildHarness();
      const byPrNumber = {
        "1": { repo: "", data: { number: "1" } },
        "2": { repo: "owner/repo-a", data: {} },
        "3": { repo: "owner/repo-a", data: { number: "3" } },
      };

      const result = helpers.collectAllLoadedPrsByRepo(byPrNumber);

      expect(Array.from(result.entries())).toEqual([["owner/repo-a", ["3"]]]);
    });

    test("given a falsy or empty payload, when collecting, then it returns an empty map", () => {
      const { helpers } = buildHarness();
      expect(helpers.collectAllLoadedPrsByRepo(null).size).toBe(0);
      expect(helpers.collectAllLoadedPrsByRepo(undefined).size).toBe(0);
      expect(helpers.collectAllLoadedPrsByRepo({}).size).toBe(0);
    });

    test("given an entry with only prNumber (no data.number), when collecting, then it falls back to prNumber", () => {
      const { helpers } = buildHarness();
      const byPrNumber = { "5": { repo: "owner/repo-a", prNumber: "5" } };

      const result = helpers.collectAllLoadedPrsByRepo(byPrNumber);

      expect(Array.from(result.entries())).toEqual([["owner/repo-a", ["5"]]]);
    });
  });

  describe("toRepoRequests", () => {
    test("given a repo->numbers map, when converting, then each entry becomes {repo, prNumbers} with a comma-joined string", () => {
      const { helpers } = buildHarness();
      const map = new Map([
        ["owner/repo-a", ["1", "2"]],
        ["owner/repo-b", ["3"]],
      ]);

      expect(helpers.toRepoRequests(map)).toEqual([
        { repo: "owner/repo-a", prNumbers: "1,2" },
        { repo: "owner/repo-b", prNumbers: "3" },
      ]);
    });

    test("given an empty map, when converting, then it returns an empty array", () => {
      const { helpers } = buildHarness();
      expect(helpers.toRepoRequests(new Map())).toEqual([]);
    });
  });

  describe("buildQuickCheckOutcome", () => {
    test("given a 409 response, when building the outcome, then it shows the already-in-progress error and reverts to the fallback label", () => {
      const { helpers, calls } = buildHarness();

      const outcome = helpers.buildQuickCheckOutcome({
        response: { status: 409, ok: false },
        result: { error: "busy" },
        fallbackLabel: "Quick check",
      });

      expect(outcome).toEqual({ label: "Quick check" });
      expect(calls.showErrorNotification).toEqual([
        ["Quick check already in progress", "busy", 6000],
      ]);
      expect(calls.loadSchedulerStatus).toHaveLength(0);
    });

    test("given a 503 response, when building the outcome, then it shows the circuit-open warning and reverts to the fallback label", () => {
      const { helpers, calls } = buildHarness();

      const outcome = helpers.buildQuickCheckOutcome({
        response: { status: 503, ok: false },
        result: { error: "circuit open" },
        fallbackLabel: "Quick check all",
      });

      expect(outcome).toEqual({ label: "Quick check all" });
      expect(calls.showWarningNotification).toEqual([
        ["Quick check unavailable", "circuit open", 8000],
      ]);
    });

    test("given a non-ok response, when building the outcome, then it shows a failure snackbar and reverts to the fallback label", () => {
      const { helpers, calls } = buildHarness();

      const outcome = helpers.buildQuickCheckOutcome({
        response: { status: 500, ok: false },
        result: { error: "boom" },
        fallbackLabel: "Quick check",
      });

      expect(outcome).toEqual({ label: "Quick check" });
      expect(calls.notifyFailureSnackbar).toEqual([
        ["Quick check failed", { error: "boom" }, "boom"],
      ]);
    });

    test("given result.ok === false even with an ok HTTP response, when building the outcome, then it is treated as a failure", () => {
      const { helpers, calls } = buildHarness();

      const outcome = helpers.buildQuickCheckOutcome({
        response: { status: 200, ok: true },
        result: { ok: false, error: "bad state" },
        fallbackLabel: "Quick check",
      });

      expect(outcome).toEqual({ label: "Quick check" });
      expect(calls.notifyFailureSnackbar).toHaveLength(1);
    });

    test("given a clean success with no pending changes, when building the outcome, then it calls buildSuccessLabel with a zero total and refreshes the scheduler status", () => {
      const { helpers, calls } = buildHarness();
      const buildSuccessLabel = jest.fn(() => "No changes found");

      const outcome = helpers.buildQuickCheckOutcome({
        response: { status: 200, ok: true },
        result: { ok: true, reposChecked: ["owner/repo"], reposFailed: [] },
        fallbackLabel: "Quick check",
        buildSuccessLabel,
      });

      expect(outcome).toEqual({ label: "No changes found", resetAfterMs: 2500 });
      expect(buildSuccessLabel).toHaveBeenCalledWith({
        pendingTotal: 0,
        reposChecked: ["owner/repo"],
        failedCount: 0,
      });
      expect(calls.showWarningNotification).toHaveLength(0);
      expect(calls.loadSchedulerStatus).toHaveLength(1);
    });

    test("given a success with pending changes, when building the outcome, then pendingTotal sums open and merged/closed counts", () => {
      const { helpers } = buildHarness();
      const buildSuccessLabel = jest.fn(() => "3 updates found");

      helpers.buildQuickCheckOutcome({
        response: { status: 200, ok: true },
        result: {
          ok: true,
          newPendingOpenCount: 2,
          newPendingMergedClosedCount: 1,
          reposChecked: ["owner/repo"],
          reposFailed: [],
        },
        fallbackLabel: "Quick check",
        buildSuccessLabel,
      });

      expect(buildSuccessLabel).toHaveBeenCalledWith({
        pendingTotal: 3,
        reposChecked: ["owner/repo"],
        failedCount: 0,
      });
    });

    test("given a success with some repos failed, when building the outcome, then it shows an incomplete warning alongside the success label", () => {
      const { helpers, calls } = buildHarness();
      const buildSuccessLabel = jest.fn(() => "1 update found");

      helpers.buildQuickCheckOutcome({
        response: { status: 200, ok: true },
        result: {
          ok: true,
          newPendingOpenCount: 1,
          reposChecked: ["owner/repo-ok"],
          reposFailed: [{ repo: "owner/repo-broken", error: "gh auth expired" }],
        },
        fallbackLabel: "Quick check all",
        buildSuccessLabel,
      });

      expect(calls.showWarningNotification).toEqual([
        [
          "Quick check incomplete",
          "Quick check failed for 1 repo(s). See server logs for details.",
          10000,
        ],
      ]);
      expect(buildSuccessLabel).toHaveBeenCalledWith({
        pendingTotal: 1,
        reposChecked: ["owner/repo-ok"],
        failedCount: 1,
      });
    });

    test("given no buildSuccessLabel callback, when building a successful outcome, then it falls back to fallbackLabel", () => {
      const { helpers } = buildHarness();

      const outcome = helpers.buildQuickCheckOutcome({
        response: { status: 200, ok: true },
        result: { ok: true, reposChecked: [], reposFailed: [] },
        fallbackLabel: "Quick check",
      });

      expect(outcome).toEqual({ label: "Quick check", resetAfterMs: 2500 });
    });
  });

  describe("safe fallbacks", () => {
    test("given no dependencies injected, when building an outcome through every branch, then nothing throws", () => {
      const helpers = createPrQuickCheckActionsHelpers();

      expect(() =>
        helpers.buildQuickCheckOutcome({
          response: { status: 409, ok: false },
          result: {},
          fallbackLabel: "Quick check",
        }),
      ).not.toThrow();

      expect(() =>
        helpers.buildQuickCheckOutcome({
          response: { status: 200, ok: true },
          result: { ok: true, reposChecked: [], reposFailed: [{ repo: "x" }] },
          fallbackLabel: "Quick check",
          buildSuccessLabel: () => "done",
        }),
      ).not.toThrow();
    });
  });
});
