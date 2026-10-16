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
    postJson: [],
    markPrsBusy: [],
    clearPrsBusy: [],
  };

  const helpers = createPrQuickCheckActionsHelpers({
    showErrorNotification: (...args) => calls.showErrorNotification.push(args),
    showWarningNotification: (...args) => calls.showWarningNotification.push(args),
    notifyFailureSnackbar: (...args) => calls.notifyFailureSnackbar.push(args),
    loadSchedulerStatus: (...args) => calls.loadSchedulerStatus.push(args),
    markPrsBusy: (...args) => calls.markPrsBusy.push(args),
    clearPrsBusy: (...args) => calls.clearPrsBusy.push(args),
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

  describe("runQuickCheckWorkflow", () => {
    test("given no entered PR numbers, when running the workflow, then it POSTs an empty payload and applies the success label", async () => {
      const postJson = jest.fn().mockResolvedValue({
        response: { status: 200, ok: true },
        result: { ok: true, newPendingOpenCount: 2, reposChecked: ["owner/repo"], reposFailed: [] },
      });
      const { helpers } = buildHarness({ postJson, getFormBody: () => ({ repo: "", prNumbers: "" }) });

      const outcome = await helpers.runQuickCheckWorkflow({
        fallbackLabel: "Quick check",
        buildSuccessLabel: ({ pendingTotal }) => `${pendingTotal} found`,
      });

      expect(postJson).toHaveBeenCalledWith("/view-prs/quick-check", {});
      expect(outcome).toEqual({ label: "2 found", resetAfterMs: 2500 });
    });

    test("given entered PR numbers, when running the workflow, then it POSTs the scoped repo/prNumbers payload", async () => {
      const postJson = jest.fn().mockResolvedValue({
        response: { status: 200, ok: true },
        result: { ok: true, reposChecked: [], reposFailed: [] },
      });
      const { helpers } = buildHarness({
        postJson,
        getFormBody: () => ({ repo: "owner/repo", prNumbers: "12,15" }),
      });

      await helpers.runQuickCheckWorkflow({ fallbackLabel: "Quick check" });

      expect(postJson).toHaveBeenCalledWith("/view-prs/quick-check", {
        repo: "owner/repo",
        prNumbers: "12,15",
      });
    });

    test("given a 409 response, when running the workflow, then it reverts to the fallback label", async () => {
      const postJson = jest.fn().mockResolvedValue({
        response: { status: 409, ok: false },
        result: { error: "busy" },
      });
      const { helpers, calls } = buildHarness({ postJson, getFormBody: () => ({}) });

      const outcome = await helpers.runQuickCheckWorkflow({ fallbackLabel: "Quick check" });

      expect(outcome).toEqual({ label: "Quick check" });
      expect(calls.showErrorNotification).toHaveLength(1);
    });

    test("given postJson rejects, when running the workflow, then it reports a failure snackbar and reverts to the fallback label", async () => {
      const postJson = jest.fn().mockRejectedValue(new Error("network down"));
      const { helpers, calls } = buildHarness({ postJson, getFormBody: () => ({}) });

      const outcome = await helpers.runQuickCheckWorkflow({ fallbackLabel: "Quick check" });

      expect(outcome).toEqual({ label: "Quick check" });
      expect(calls.notifyFailureSnackbar).toEqual([
        ["Quick check failed", expect.any(Error), "Unable to reach the server"],
      ]);
    });
  });

  describe("runQuickCheckAllWorkflow", () => {
    test("given nothing loaded, when running the workflow, then it short-circuits without calling postJson", async () => {
      const postJson = jest.fn();
      const { helpers } = buildHarness({ postJson, getLatestStoredPayload: () => ({ byPrNumber: {} }) });

      const outcome = await helpers.runQuickCheckAllWorkflow({ fallbackLabel: "Quick check all" });

      expect(outcome).toEqual({ label: "Nothing to check", resetAfterMs: 2500 });
      expect(postJson).not.toHaveBeenCalled();
    });

    test("given PRs loaded across repos, when running the workflow, then it marks/clears busy per repo and POSTs the grouped repo requests", async () => {
      const postJson = jest.fn().mockResolvedValue({
        response: { status: 200, ok: true },
        result: { ok: true, newPendingOpenCount: 1, reposChecked: ["owner/repo-a", "owner/repo-b"], reposFailed: [] },
      });
      const byPrNumber = {
        "1": { repo: "owner/repo-a", data: { number: "1" } },
        "2": { repo: "owner/repo-b", data: { number: "2" } },
      };
      const { helpers, calls } = buildHarness({
        postJson,
        getLatestStoredPayload: () => ({ byPrNumber }),
      });

      const outcome = await helpers.runQuickCheckAllWorkflow({
        fallbackLabel: "Quick check all",
        buildSuccessLabel: ({ pendingTotal, reposChecked }) =>
          `${pendingTotal} across ${reposChecked.length} repos`,
      });

      expect(postJson).toHaveBeenCalledWith("/view-prs/quick-check-all", {
        repos: [
          { repo: "owner/repo-a", prNumbers: "1" },
          { repo: "owner/repo-b", prNumbers: "2" },
        ],
      });
      expect(calls.markPrsBusy).toEqual([
        [["1"], "owner/repo-a"],
        [["2"], "owner/repo-b"],
      ]);
      expect(calls.clearPrsBusy).toEqual([
        [["1"], "owner/repo-a"],
        [["2"], "owner/repo-b"],
      ]);
      expect(outcome).toEqual({ label: "1 across 2 repos", resetAfterMs: 2500 });
    });

    test("given postJson rejects, when running the workflow, then it still clears busy state via finally and reverts to the fallback label", async () => {
      const postJson = jest.fn().mockRejectedValue(new Error("network down"));
      const byPrNumber = { "1": { repo: "owner/repo-a", data: { number: "1" } } };
      const { helpers, calls } = buildHarness({
        postJson,
        getLatestStoredPayload: () => ({ byPrNumber }),
      });

      const outcome = await helpers.runQuickCheckAllWorkflow({ fallbackLabel: "Quick check all" });

      expect(outcome).toEqual({ label: "Quick check all" });
      expect(calls.notifyFailureSnackbar).toEqual([
        ["Quick check failed", expect.any(Error), "Unable to reach the server"],
      ]);
      expect(calls.clearPrsBusy).toEqual([[["1"], "owner/repo-a"]]);
    });

    test("given a partial repo failure, when running the workflow, then it still applies the success label alongside the incomplete warning", async () => {
      const postJson = jest.fn().mockResolvedValue({
        response: { status: 200, ok: true },
        result: {
          ok: true,
          newPendingOpenCount: 1,
          reposChecked: ["owner/repo-a"],
          reposFailed: [{ repo: "owner/repo-b", error: "gh auth expired" }],
        },
      });
      const byPrNumber = { "1": { repo: "owner/repo-a", data: { number: "1" } } };
      const { helpers, calls } = buildHarness({ postJson, getLatestStoredPayload: () => ({ byPrNumber }) });

      await helpers.runQuickCheckAllWorkflow({ fallbackLabel: "Quick check all" });

      expect(calls.showWarningNotification).toHaveLength(1);
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

    test("given no dependencies injected, when running either workflow, then it rejects safely to the fallback label instead of throwing", async () => {
      const helpers = createPrQuickCheckActionsHelpers();

      await expect(
        helpers.runQuickCheckWorkflow({ fallbackLabel: "Quick check" }),
      ).resolves.toEqual({ label: "Quick check" });

      await expect(
        helpers.runQuickCheckAllWorkflow({ fallbackLabel: "Quick check all" }),
      ).resolves.toEqual({ label: "Nothing to check", resetAfterMs: 2500 });
    });
  });
});
