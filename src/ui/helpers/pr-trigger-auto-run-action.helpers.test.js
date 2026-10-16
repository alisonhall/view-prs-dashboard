/** @jest-environment jsdom */

const {
  createPrTriggerAutoRunActionHelpers,
} = require("./pr-trigger-auto-run-action.helpers.js");

function buildHarness(overrides = {}) {
  const calls = {
    showErrorNotification: [],
    notifyFailureSnackbar: [],
  };

  const helpers = createPrTriggerAutoRunActionHelpers({
    showErrorNotification: (...args) => calls.showErrorNotification.push(args),
    notifyFailureSnackbar: (...args) => calls.notifyFailureSnackbar.push(args),
    ...overrides,
  });

  return { helpers, calls };
}

describe("pr-trigger-auto-run-action helpers", () => {
  describe("runTriggerAutoRunWorkflow", () => {
    test("given a successful response, when running the workflow, then no notification is shown", async () => {
      const postJson = jest.fn().mockResolvedValue({
        response: { status: 200, ok: true },
        result: { ok: true },
      });
      const { helpers, calls } = buildHarness({ postJson });

      await helpers.runTriggerAutoRunWorkflow();

      expect(postJson).toHaveBeenCalledWith("/view-prs/run-auto", {});
      expect(calls.showErrorNotification).toHaveLength(0);
      expect(calls.notifyFailureSnackbar).toHaveLength(0);
    });

    test("given a 409 response, when running the workflow, then it shows the already-in-progress error", async () => {
      const postJson = jest.fn().mockResolvedValue({
        response: { status: 409, ok: false },
        result: { error: "busy" },
      });
      const { helpers, calls } = buildHarness({ postJson });

      await helpers.runTriggerAutoRunWorkflow();

      expect(calls.showErrorNotification).toEqual([
        [
          "Auto run already in progress",
          "An auto run is already running. It will complete shortly.",
          6000,
        ],
      ]);
      expect(calls.notifyFailureSnackbar).toHaveLength(0);
    });

    test("given a non-ok response, when running the workflow, then it reports a failure snackbar", async () => {
      const postJson = jest.fn().mockResolvedValue({
        response: { status: 500, ok: false },
        result: { error: "boom" },
      });
      const { helpers, calls } = buildHarness({ postJson });

      await helpers.runTriggerAutoRunWorkflow();

      expect(calls.notifyFailureSnackbar).toEqual([
        ["Failed to trigger auto run", { error: "boom" }, "boom"],
      ]);
    });

    test("given result.ok === false even with an ok HTTP response, when running the workflow, then it is treated as a failure", async () => {
      const postJson = jest.fn().mockResolvedValue({
        response: { status: 200, ok: true },
        result: { ok: false, error: "bad state" },
      });
      const { helpers, calls } = buildHarness({ postJson });

      await helpers.runTriggerAutoRunWorkflow();

      expect(calls.notifyFailureSnackbar).toEqual([
        ["Failed to trigger auto run", { ok: false, error: "bad state" }, "bad state"],
      ]);
    });

    test("given postJson rejects, when running the workflow, then it reports a failure snackbar with the unreachable-server fallback", async () => {
      const postJson = jest.fn().mockRejectedValue(new Error("network down"));
      const { helpers, calls } = buildHarness({ postJson });

      await helpers.runTriggerAutoRunWorkflow();

      expect(calls.notifyFailureSnackbar).toEqual([
        ["Failed to trigger auto run", expect.any(Error), "Unable to reach the server"],
      ]);
    });

    test("given no dependencies injected, when running the workflow, then it does not throw", async () => {
      const { runTriggerAutoRunWorkflow } = createPrTriggerAutoRunActionHelpers();

      await expect(runTriggerAutoRunWorkflow()).resolves.toBeUndefined();
    });
  });
});
