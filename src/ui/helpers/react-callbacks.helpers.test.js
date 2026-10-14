const { createReactCallbackHelpers } = require("./react-callbacks.helpers.js");

// Phase 7, sub-phase 7.3 follow-up (see REACT_MIGRATION_PLAN.md): the
// vanilla action functions now return { payload, selectedRepo } on
// success and null on failure - react-callbacks.helpers.js uses that
// return value directly instead of reading back a shared
// getLatestStoredPayload getter (removed entirely, see that module's own
// comment for why).
//
// Phase H.5 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// handleAckAction/handleApplyLabel (and their own describe blocks here)
// were deleted outright along with this factory's runAckOnlyWorkflow/
// runClearOnlyWorkflow/runApplyLabelWorkflow DI - PrTableApp.jsx now
// builds the equivalent handlers itself via useAckLabelActions(). Only
// handleCheckboxChange remains.
describe("react callbacks helpers", () => {
  const makeHelpers = (overrides = {}) => {
    const deps = {
      toggleInReviewForRow: jest.fn().mockResolvedValue(null),
      toggleFlaggedForRow: jest.fn().mockResolvedValue(null),
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

  describe("missing dependencies", () => {
    test("given no deps at all, when handleCheckboxChange is called, then it resolves without throwing", async () => {
      const { handleCheckboxChange } = createReactCallbackHelpers();
      await expect(handleCheckboxChange(101, "flagged", true, "owner/repo")).resolves.toBeUndefined();
    });
  });
});
