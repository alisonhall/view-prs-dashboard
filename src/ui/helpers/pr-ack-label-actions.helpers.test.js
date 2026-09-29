/** @jest-environment jsdom */

const {
  createPrAckLabelActionsHelpers,
} = require("./pr-ack-label-actions.helpers.js");

function buildHarness(overrides = {}) {
  const calls = {
    setStatusMessage: [],
    setOutputMessage: [],
    showErrorNotification: [],
    showWarningNotification: [],
    renderPrData: [],
    loadStoredData: [],
  };
  const finishActivity = jest.fn();

  const helpers = createPrAckLabelActionsHelpers({
    postJson: overrides.postJson,
    setStatusMessage: (...args) => calls.setStatusMessage.push(args),
    setOutputMessage: (...args) => calls.setOutputMessage.push(args),
    beginRequestActivity: () => finishActivity,
    getGithubAuthFailureHint: overrides.getGithubAuthFailureHint || (() => ""),
    formatCommandOutput: overrides.formatCommandOutput || (() => "formatted output"),
    formatCommandOutputWithAuthHint: overrides.formatCommandOutputWithAuthHint || (() => "formatted with hint"),
    showErrorNotification: (...args) => calls.showErrorNotification.push(args),
    showWarningNotification: (...args) => calls.showWarningNotification.push(args),
    summarizeAckRefreshWarnings: overrides.summarizeAckRefreshWarnings || (() => null),
    renderPrData: (...args) => calls.renderPrData.push(args),
    loadStoredData: (...args) => {
      calls.loadStoredData.push(args);
      return Promise.resolve();
    },
    getFormBody: overrides.getFormBody || (() => ({})),
    defaultRepo: overrides.defaultRepo ?? "fallback/repo",
  });

  return { helpers, calls, finishActivity };
}

describe("pr ack label actions helpers", () => {
  describe("runAckAction", () => {
    test("given a successful ack with a full payload, when running, then it renders the fresh payload", async () => {
      const postJson = jest.fn(async () => ({
        response: { ok: true },
        result: { ok: true, prData: { byPrNumber: { 1: {} } } },
      }));
      const { helpers, calls, finishActivity } = buildHarness({ postJson });

      await helpers.runAckAction({ repo: "o/r", ack: "1" }, "Ack only");

      expect(postJson).toHaveBeenCalledWith("/view-prs/ack", { repo: "o/r", ack: "1" });
      expect(calls.setStatusMessage).toEqual([["Ack only..."], ["Ack only completed"]]);
      expect(calls.renderPrData).toEqual([[{ byPrNumber: { 1: {} } }, "o/r"]]);
      expect(finishActivity).toHaveBeenCalledTimes(1);
    });

    test("given a successful ack with warnings, when running, then a warning notification shows with the summary", async () => {
      const postJson = jest.fn(async () => ({
        response: { ok: true },
        result: { ok: true, refreshErrors: [{ prNumber: 2, error: "boom" }] },
      }));
      const summarizeAckRefreshWarnings = jest.fn(() => ({
        summaryText: "1 issue",
        sample: "#2: boom",
      }));
      const { helpers, calls } = buildHarness({ postJson, summarizeAckRefreshWarnings });

      await helpers.runAckAction({ repo: "o/r", ack: "2" }, "Ack only");

      expect(calls.showWarningNotification).toEqual([
        ["Ack only completed with warnings (1 issue)", "#2: boom"],
      ]);
      expect(calls.loadStoredData).toEqual([["o/r"]]);
    });

    test("given an auth failure response, when running, then the auth-aware failure message and notification show", async () => {
      const postJson = jest.fn(async () => ({
        response: { ok: false, status: 401 },
        result: { ok: false },
      }));
      const { helpers, calls } = buildHarness({ postJson, getGithubAuthFailureHint: () => "sign in" });

      await helpers.runAckAction({ repo: "o/r", ack: "3" }, "Ack only");

      expect(calls.setStatusMessage).toEqual([["Ack only..."], ["Failed (401) - GitHub auth required"]]);
      expect(calls.showErrorNotification[0][0]).toBe("Ack only failed");
      expect(calls.showErrorNotification[0][1]).toMatch(/GitHub authentication/);
    });

    test("given postJson throws, when running, then the network-failure path runs and finishActivity still fires", async () => {
      const postJson = jest.fn(async () => {
        throw new Error("offline");
      });
      const { helpers, calls, finishActivity } = buildHarness({ postJson });

      await helpers.runAckAction({ repo: "o/r", ack: "4" }, "Ack only");

      expect(calls.setStatusMessage).toEqual([["Ack only..."], ["Failed (network/error)"]]);
      expect(calls.showErrorNotification[0]).toEqual(["Ack only failed", "Error: offline", 0]);
      expect(finishActivity).toHaveBeenCalledTimes(1);
    });
  });

  describe("runAckOnlyWorkflow / runClearOnlyWorkflow", () => {
    test("given no PR numbers in the value or the form, when running ack-only, then it shows a validation message and never posts", async () => {
      const postJson = jest.fn();
      const { helpers, calls } = buildHarness({ postJson, getFormBody: () => ({}) });

      await helpers.runAckOnlyWorkflow("", "");

      expect(postJson).not.toHaveBeenCalled();
      expect(calls.setStatusMessage).toEqual([['Ack only requires numeric value(s) in "PR number(s)"']]);
    });

    test("given a value and repo override, when running ack-only, then it posts with the ack field", async () => {
      const postJson = jest.fn(async () => ({ response: { ok: true }, result: { ok: true } }));
      const { helpers } = buildHarness({ postJson, getFormBody: () => ({ prNumbers: "9", repo: "form/repo" }) });

      await helpers.runAckOnlyWorkflow("5", "override/repo");

      expect(postJson).toHaveBeenCalledWith("/view-prs/ack", { repo: "override/repo", ack: "5" });
    });

    test("given no clear value, when running clear-only, then it shows the clear-only validation message", async () => {
      const postJson = jest.fn();
      const { helpers, calls } = buildHarness({ postJson, getFormBody: () => ({}) });

      await helpers.runClearOnlyWorkflow("", "");

      expect(postJson).not.toHaveBeenCalled();
      expect(calls.setStatusMessage).toEqual([['Clear only requires numeric value(s) in "PR number(s)"']]);
    });

    test("given a clear value, when running clear-only, then it posts with the ackClear field", async () => {
      const postJson = jest.fn(async () => ({ response: { ok: true }, result: { ok: true } }));
      const { helpers } = buildHarness({ postJson, getFormBody: () => ({ prNumbers: "7" }) });

      await helpers.runClearOnlyWorkflow("", "");

      expect(postJson).toHaveBeenCalledWith("/view-prs/ack", { repo: "", ackClear: "7" });
    });
  });

  describe("runApplyLabelAction / runApplyLabelWorkflow", () => {
    test("given a successful apply, when running the action, then it renders the fresh payload and shows the server summary", async () => {
      const postJson = jest.fn(async () => ({
        response: { ok: true },
        result: { ok: true, summary: "Applied to 2 PRs", prData: { byPrNumber: {} } },
      }));
      const { helpers, calls } = buildHarness({ postJson });

      await helpers.runApplyLabelAction({ repo: "o/r", label: "bug", prNumbers: "1,2" }, "Apply label");

      expect(postJson).toHaveBeenCalledWith("/view-prs/labels/apply", { repo: "o/r", label: "bug", prNumbers: "1,2" });
      expect(calls.setStatusMessage).toEqual([["Apply label..."], ["Applied to 2 PRs"]]);
      expect(calls.renderPrData).toEqual([[{ byPrNumber: {} }, "o/r"]]);
    });

    test("given apply errors and refresh errors, when running the action, then a combined warning notification shows", async () => {
      const postJson = jest.fn(async () => ({
        response: { ok: true },
        result: {
          ok: true,
          applyErrors: [{ prNumber: 1, error: "no label" }],
          refreshErrors: [{ prNumber: 2, error: "stale" }],
        },
      }));
      const { helpers, calls } = buildHarness({ postJson });

      await helpers.runApplyLabelAction({ repo: "o/r", label: "bug", prNumbers: "1,2" }, "Apply label");

      expect(calls.showWarningNotification).toEqual([
        ["Apply label completed with 2 error(s)", "#1: no label\n#2: stale"],
      ]);
    });

    test("given no prNumbers value or form value, when running the workflow, then it shows a validation message and never posts", async () => {
      const postJson = jest.fn();
      const { helpers, calls } = buildHarness({ postJson, getFormBody: () => ({}) });

      await helpers.runApplyLabelWorkflow("", "bug", "");

      expect(postJson).not.toHaveBeenCalled();
      expect(calls.setStatusMessage).toEqual([['Apply label requires numeric value(s) in "PR number(s)"']]);
    });

    test("given prNumbers but no label, when running the workflow, then it shows the choose-a-label message", async () => {
      const postJson = jest.fn();
      const { helpers, calls } = buildHarness({ postJson, getFormBody: () => ({ prNumbers: "1" }) });

      await helpers.runApplyLabelWorkflow("1", "", "");

      expect(postJson).not.toHaveBeenCalled();
      expect(calls.setStatusMessage).toEqual([["Choose a label to apply"]]);
    });

    test("given valid prNumbers and label, when running the workflow, then it delegates to runApplyLabelAction", async () => {
      const postJson = jest.fn(async () => ({ response: { ok: true }, result: { ok: true } }));
      const { helpers } = buildHarness({ postJson, getFormBody: () => ({ repo: "form/repo" }) });

      await helpers.runApplyLabelWorkflow("3,4", "enhancement", "");

      expect(postJson).toHaveBeenCalledWith("/view-prs/labels/apply", {
        repo: "form/repo",
        label: "enhancement",
        prNumbers: "3,4",
      });
    });
  });
});
