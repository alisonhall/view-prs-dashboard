/** @jest-environment jsdom */

const {
  createPrRowCheckboxActionsHelpers,
} = require("./pr-row-checkbox-actions.helpers.js");

const jsonResponse = (body, overrides = {}) => ({
  ok: true,
  status: 200,
  json: async () => body,
  ...overrides,
});

function buildHarness(overrides = {}) {
  const calls = {
    setStatusTextOnly: [],
    notifyFailureSnackbar: [],
    applyLatestPrData: [],
    loadStoredData: [],
  };
  const state = {
    latestStoredPayload: overrides.initialPayload ?? null,
    latestSelectedRepo: overrides.initialRepo ?? "",
  };

  const helpers = createPrRowCheckboxActionsHelpers({
    fetchFn: overrides.fetchFn,
    setStatusTextOnly: (...args) => calls.setStatusTextOnly.push(args),
    notifyFailureSnackbar: (...args) => calls.notifyFailureSnackbar.push(args),
    getLatestStoredPayload: () => state.latestStoredPayload,
    getLatestSelectedRepo: () => state.latestSelectedRepo,
    applyLatestPrData: (args) => {
      calls.applyLatestPrData.push(args);
      if (args?.payload !== undefined) state.latestStoredPayload = args.payload;
      if (args?.selectedRepo !== undefined) state.latestSelectedRepo = args.selectedRepo;
    },
    loadStoredData: (...args) => {
      calls.loadStoredData.push(args);
      return Promise.resolve();
    },
  });

  return { helpers, state, calls };
}

function buildCheckbox(checked) {
  return { checked, disabled: false };
}

describe("pr row checkbox actions helpers", () => {
  describe("toggleInReviewForRow", () => {
    test("given no PR number, when toggling, then it reverts the checkbox and shows a failure without fetching", async () => {
      const fetchFn = jest.fn();
      const { helpers, calls } = buildHarness({ fetchFn });
      const checkbox = buildCheckbox(true);

      await helpers.toggleInReviewForRow({}, {}, true, checkbox);

      expect(fetchFn).not.toHaveBeenCalled();
      expect(checkbox.checked).toBe(false);
      expect(calls.notifyFailureSnackbar).toEqual([
        ["In-review update failed", "Missing PR number", "Unable to update in-review state"],
      ]);
    });

    test("given a minimal-delta response, when enabling in-review, then it merges the delta and does not call renderPrData-equivalent (no re-render signal)", async () => {
      const fetchFn = jest.fn(async () =>
        jsonResponse({
          ok: true,
          flaggedByRepo: { "o/r": [] },
          inReviewByRepo: { "o/r": ["5"] },
        }),
      );
      const { helpers, state, calls } = buildHarness({
        fetchFn,
        initialPayload: { byPrNumber: { 5: {} } },
        initialRepo: "o/r",
      });
      const checkbox = buildCheckbox(false);

      await helpers.toggleInReviewForRow({ repo: "o/r" }, { number: "5" }, true, checkbox);

      expect(fetchFn).toHaveBeenCalledWith(
        "/view-prs/ack",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ repo: "o/r", inReview: "5" }),
        }),
      );
      expect(state.latestStoredPayload).toEqual({
        byPrNumber: { 5: {} },
        flaggedByRepo: { "o/r": [] },
        inReviewByRepo: { "o/r": ["5"] },
      });
      expect(calls.applyLatestPrData).toHaveLength(1);
      expect(checkbox.disabled).toBe(false);
    });

    test("given a full-payload (backward-compat) response, when disabling in-review, then the payload is replaced wholesale", async () => {
      const fullPrData = { byPrNumber: { 5: { updated: true } } };
      const fetchFn = jest.fn(async () => jsonResponse({ ok: true, prData: fullPrData }));
      const { helpers, calls } = buildHarness({ fetchFn, initialRepo: "o/r" });
      const checkbox = buildCheckbox(true);

      await helpers.toggleInReviewForRow({ repo: "o/r" }, { number: "5" }, false, checkbox);

      expect(calls.applyLatestPrData).toEqual([{ payload: fullPrData, selectedRepo: "o/r" }]);
    });

    test("given no data in the response, when toggling, then it falls back to a full reload", async () => {
      const fetchFn = jest.fn(async () => jsonResponse({ ok: true }));
      const { helpers, calls } = buildHarness({ fetchFn, initialRepo: "o/r" });
      const checkbox = buildCheckbox(true);

      await helpers.toggleInReviewForRow({ repo: "o/r" }, { number: "5" }, true, checkbox);

      expect(calls.loadStoredData).toEqual([["o/r"]]);
    });

    test("given a failed response, when toggling, then the checkbox reverts and a failure notification shows", async () => {
      const fetchFn = jest.fn(async () => jsonResponse({ ok: false, error: "nope" }, { ok: false, status: 500 }));
      const { helpers, calls } = buildHarness({ fetchFn, initialRepo: "o/r" });
      const checkbox = buildCheckbox(false);

      await helpers.toggleInReviewForRow({ repo: "o/r" }, { number: "5" }, true, checkbox);

      expect(checkbox.checked).toBe(false);
      expect(calls.notifyFailureSnackbar[0][0]).toBe("In-review update failed for #5");
    });

    test("given fetch throws, when toggling, then the checkbox reverts and the catch-path notification shows", async () => {
      const fetchFn = jest.fn(async () => {
        throw new Error("network down");
      });
      const { helpers, calls } = buildHarness({ fetchFn, initialRepo: "o/r" });
      const checkbox = buildCheckbox(false);

      await helpers.toggleInReviewForRow({ repo: "o/r" }, { number: "5" }, true, checkbox);

      expect(checkbox.checked).toBe(false);
      expect(checkbox.disabled).toBe(false);
      expect(calls.notifyFailureSnackbar[0][0]).toBe("In-review update failed for #5");
    });
  });

  describe("toggleFlaggedForRow", () => {
    test("given a minimal-delta response, when flagging, then it posts the flagged field and merges the delta", async () => {
      const fetchFn = jest.fn(async () =>
        jsonResponse({
          ok: true,
          flaggedByRepo: { "o/r": ["9"] },
          inReviewByRepo: { "o/r": [] },
        }),
      );
      const { helpers, calls } = buildHarness({
        fetchFn,
        initialPayload: { byPrNumber: { 9: {} } },
        initialRepo: "o/r",
      });
      const checkbox = buildCheckbox(false);

      await helpers.toggleFlaggedForRow({ repo: "o/r" }, { number: "9" }, true, checkbox);

      expect(fetchFn).toHaveBeenCalledWith(
        "/view-prs/ack",
        expect.objectContaining({ body: JSON.stringify({ repo: "o/r", flagged: "9" }) }),
      );
      expect(calls.applyLatestPrData).toHaveLength(1);
    });

    test("given no PR number, when toggling, then it reverts and shows the flagged-specific failure message", async () => {
      const { helpers, calls } = buildHarness({ fetchFn: jest.fn() });
      const checkbox = buildCheckbox(true);

      await helpers.toggleFlaggedForRow({}, {}, true, checkbox);

      expect(checkbox.checked).toBe(false);
      expect(calls.notifyFailureSnackbar).toEqual([
        ["Flagged update failed", "Missing PR number", "Unable to update flagged state"],
      ]);
    });

    test("given unflagging, when the request succeeds with a full payload, then the payload is replaced", async () => {
      const fullPrData = { byPrNumber: { 9: {} } };
      const fetchFn = jest.fn(async (_url, init) => {
        expect(JSON.parse(init.body)).toEqual({ repo: "o/r", flaggedClear: "9" });
        return jsonResponse({ ok: true, prData: fullPrData });
      });
      const { helpers, calls } = buildHarness({ fetchFn, initialRepo: "o/r" });
      const checkbox = buildCheckbox(true);

      await helpers.toggleFlaggedForRow({ repo: "o/r" }, { number: "9" }, false, checkbox);

      expect(calls.applyLatestPrData).toEqual([{ payload: fullPrData, selectedRepo: "o/r" }]);
    });
  });
});
