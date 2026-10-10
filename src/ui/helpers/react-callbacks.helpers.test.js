const { createReactCallbackHelpers } = require("./react-callbacks.helpers.js");

// Phase 7, sub-phase 7.3 follow-up (see REACT_MIGRATION_PLAN.md): the
// vanilla action functions now return { payload, selectedRepo } on
// success and null on failure - react-callbacks.helpers.js uses that
// return value directly instead of reading back a shared
// getLatestStoredPayload getter (removed entirely, see that module's own
// comment for why).
describe("react callbacks helpers", () => {
  const makeHelpers = (overrides = {}) => {
    const deps = {
      toggleInReviewForRow: jest.fn().mockResolvedValue(null),
      toggleFlaggedForRow: jest.fn().mockResolvedValue(null),
      runAckOnlyWorkflow: jest.fn().mockResolvedValue(null),
      runClearOnlyWorkflow: jest.fn().mockResolvedValue(null),
      runApplyLabelWorkflow: jest.fn().mockResolvedValue(null),
      updateReactTable: jest.fn(),
      stateGetters: {
        getLatestSelectedRepo: jest.fn().mockReturnValue(""),
      },
      ...overrides,
    };
    return { deps, callbacks: createReactCallbackHelpers(deps) };
  };

  describe("handleCheckboxChange", () => {
    test("given type 'flagged', when called, then calls toggleFlaggedForRow (not toggleInReviewForRow)", async () => {
      const { deps, callbacks } = makeHelpers();
      await callbacks.handleCheckboxChange(101, "flagged", true, "owner/repo");
      expect(deps.toggleFlaggedForRow).toHaveBeenCalledTimes(1);
      expect(deps.toggleInReviewForRow).not.toHaveBeenCalled();
    });

    test("given type 'inReview', when called, then calls toggleInReviewForRow (not toggleFlaggedForRow)", async () => {
      const { deps, callbacks } = makeHelpers();
      await callbacks.handleCheckboxChange(101, "inReview", true, "owner/repo");
      expect(deps.toggleInReviewForRow).toHaveBeenCalledTimes(1);
      expect(deps.toggleFlaggedForRow).not.toHaveBeenCalled();
    });

    test("given a repoOverride, when called, then builds the vanilla entry/row objects with that repo and the checked flag", async () => {
      const { deps, callbacks } = makeHelpers();
      await callbacks.handleCheckboxChange(101, "flagged", false, "owner/repo");
      const [entry, row, checked, mockCheckbox] = deps.toggleFlaggedForRow.mock.calls[0];
      expect(entry).toEqual({ prNumber: "101", repo: "owner/repo" });
      expect(row).toEqual({ number: 101 });
      expect(checked).toBe(false);
      expect(mockCheckbox).toEqual({ checked: false });
    });

    test("given no repoOverride, when called, then falls back to getLatestSelectedRepo", async () => {
      const { deps, callbacks } = makeHelpers({
        stateGetters: { getLatestSelectedRepo: jest.fn().mockReturnValue("fallback/repo") },
      });
      await callbacks.handleCheckboxChange(101, "flagged", true);
      expect(deps.toggleFlaggedForRow.mock.calls[0][0].repo).toBe("fallback/repo");
    });

    test("given a repoOverride, when called, then it takes priority over getLatestSelectedRepo", async () => {
      const { deps, callbacks } = makeHelpers({
        stateGetters: { getLatestSelectedRepo: jest.fn().mockReturnValue("should-not-be-used") },
      });
      await callbacks.handleCheckboxChange(101, "flagged", true, "owner/repo");
      expect(deps.toggleFlaggedForRow.mock.calls[0][0].repo).toBe("owner/repo");
    });

    test("given the toggle resolves with a payload, when it completes, then updates the React table with that exact payload and repo", async () => {
      const payload = { byPrNumber: { 101: {} } };
      const { deps, callbacks } = makeHelpers({
        toggleFlaggedForRow: jest.fn().mockResolvedValue({ payload, selectedRepo: "owner/repo" }),
      });
      await callbacks.handleCheckboxChange(101, "flagged", true, "owner/repo");
      expect(deps.updateReactTable).toHaveBeenCalledWith(payload, "owner/repo");
    });

    test("given the toggle resolves with null (its own internal failure), when it completes, then the table is not updated", async () => {
      const { deps, callbacks } = makeHelpers({
        toggleFlaggedForRow: jest.fn().mockResolvedValue(null),
      });
      await callbacks.handleCheckboxChange(101, "flagged", true, "owner/repo");
      expect(deps.updateReactTable).not.toHaveBeenCalled();
    });

    test("given the toggle function rejects, when called, then the error is caught (does not throw) and the table is not updated", async () => {
      const { deps, callbacks } = makeHelpers({
        toggleFlaggedForRow: jest.fn().mockRejectedValue(new Error("boom")),
      });
      await expect(callbacks.handleCheckboxChange(101, "flagged", true, "owner/repo")).resolves.toBeUndefined();
      expect(deps.updateReactTable).not.toHaveBeenCalled();
    });
  });

  describe("handleAckAction", () => {
    // This guards against a real bug: the caller passes "is this PR CURRENTLY
    // acked" so handleAckAction can decide ack vs. clear — a caller that
    // instead passes the *toggled target* state inverts every request
    // (clicking "Ack" on an unacked PR would send ackClear instead of ack).
    test("given isAcked=false (not currently acked), when called, then runs the Ack workflow, not Clear", async () => {
      const { deps, callbacks } = makeHelpers();
      await callbacks.handleAckAction(101, false, "owner/repo");
      expect(deps.runAckOnlyWorkflow).toHaveBeenCalledWith("101", "owner/repo");
      expect(deps.runClearOnlyWorkflow).not.toHaveBeenCalled();
    });

    test("given isAcked=true (currently acked), when called, then runs the Clear workflow, not Ack", async () => {
      const { deps, callbacks } = makeHelpers();
      await callbacks.handleAckAction(101, true, "owner/repo");
      expect(deps.runClearOnlyWorkflow).toHaveBeenCalledWith("101", "owner/repo");
      expect(deps.runAckOnlyWorkflow).not.toHaveBeenCalled();
    });

    test("given a repoOverride, when called, then it takes priority over getLatestSelectedRepo", async () => {
      const { deps, callbacks } = makeHelpers({
        stateGetters: { getLatestSelectedRepo: jest.fn().mockReturnValue("should-not-be-used") },
      });
      await callbacks.handleAckAction(101, false, "owner/repo");
      expect(deps.runAckOnlyWorkflow).toHaveBeenCalledWith("101", "owner/repo");
    });

    test("given no repoOverride, when called, then falls back to getLatestSelectedRepo", async () => {
      const { deps, callbacks } = makeHelpers({
        stateGetters: { getLatestSelectedRepo: jest.fn().mockReturnValue("fallback/repo") },
      });
      await callbacks.handleAckAction(101, false);
      expect(deps.runAckOnlyWorkflow).toHaveBeenCalledWith("101", "fallback/repo");
    });

    test("given the workflow resolves with a payload, when it completes, then updates the React table with that exact payload and repo", async () => {
      const payload = { byPrNumber: { 101: {} } };
      const { deps, callbacks } = makeHelpers({
        runAckOnlyWorkflow: jest.fn().mockResolvedValue({ payload, selectedRepo: "owner/repo" }),
      });
      await callbacks.handleAckAction(101, false, "owner/repo");
      expect(deps.updateReactTable).toHaveBeenCalledWith(payload, "owner/repo");
    });

    test("given the workflow resolves with null (its own internal failure), when it completes, then the table is not updated", async () => {
      const { deps, callbacks } = makeHelpers({
        runAckOnlyWorkflow: jest.fn().mockResolvedValue(null),
      });
      await callbacks.handleAckAction(101, false, "owner/repo");
      expect(deps.updateReactTable).not.toHaveBeenCalled();
    });

    test("given the workflow rejects, when called, then the error is caught (does not throw) and the table is not updated", async () => {
      const { deps, callbacks } = makeHelpers({
        runAckOnlyWorkflow: jest.fn().mockRejectedValue(new Error("boom")),
      });
      await expect(callbacks.handleAckAction(101, false, "owner/repo")).resolves.toBeUndefined();
      expect(deps.updateReactTable).not.toHaveBeenCalled();
    });
  });

  describe("missing dependencies", () => {
    test("given no deps at all, when handleCheckboxChange is called, then it resolves without throwing", async () => {
      const { handleCheckboxChange } = createReactCallbackHelpers();
      await expect(handleCheckboxChange(101, "flagged", true, "owner/repo")).resolves.toBeUndefined();
    });

    test("given no deps at all, when handleAckAction is called, then it resolves without throwing", async () => {
      const { handleAckAction } = createReactCallbackHelpers();
      await expect(handleAckAction(101, false, "owner/repo")).resolves.toBeUndefined();
    });

    test("given no deps at all, when handleApplyLabel is called, then it resolves without throwing", async () => {
      const { handleApplyLabel } = createReactCallbackHelpers();
      await expect(handleApplyLabel(101, "bug", "owner/repo")).resolves.toBeUndefined();
    });
  });

  describe("handleApplyLabel", () => {
    test("given a prNumber/label/repo, when called, then runs the apply-label workflow with the stringified PR number", async () => {
      const { deps, callbacks } = makeHelpers();
      await callbacks.handleApplyLabel(101, "bug", "owner/repo");
      expect(deps.runApplyLabelWorkflow).toHaveBeenCalledWith("101", "bug", "owner/repo");
    });

    test("given no repoOverride, when called, then falls back to getLatestSelectedRepo", async () => {
      const { deps, callbacks } = makeHelpers({
        stateGetters: { getLatestSelectedRepo: jest.fn().mockReturnValue("fallback/repo") },
      });
      await callbacks.handleApplyLabel(101, "bug");
      expect(deps.runApplyLabelWorkflow).toHaveBeenCalledWith("101", "bug", "fallback/repo");
    });

    test("given the workflow resolves with a payload, when it completes, then updates the React table with that exact payload and repo", async () => {
      const payload = { byPrNumber: { 101: {} } };
      const { deps, callbacks } = makeHelpers({
        runApplyLabelWorkflow: jest.fn().mockResolvedValue({ payload, selectedRepo: "owner/repo" }),
      });
      await callbacks.handleApplyLabel(101, "bug", "owner/repo");
      expect(deps.updateReactTable).toHaveBeenCalledWith(payload, "owner/repo");
    });

    test("given the workflow resolves with null (its own internal failure), when it completes, then the table is not updated", async () => {
      const { deps, callbacks } = makeHelpers({
        runApplyLabelWorkflow: jest.fn().mockResolvedValue(null),
      });
      await callbacks.handleApplyLabel(101, "bug", "owner/repo");
      expect(deps.updateReactTable).not.toHaveBeenCalled();
    });

    test("given the workflow rejects, when called, then the error is caught (does not throw) and the table is not updated", async () => {
      const { deps, callbacks } = makeHelpers({
        runApplyLabelWorkflow: jest.fn().mockRejectedValue(new Error("boom")),
      });
      await expect(callbacks.handleApplyLabel(101, "bug", "owner/repo")).resolves.toBeUndefined();
      expect(deps.updateReactTable).not.toHaveBeenCalled();
    });
  });
});
