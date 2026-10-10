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

      const result = await helpers.toggleInReviewForRow({}, {}, true, checkbox);

      expect(fetchFn).not.toHaveBeenCalled();
      expect(checkbox.checked).toBe(false);
      expect(calls.notifyFailureSnackbar).toEqual([
        ["In-review update failed", "Missing PR number", "Unable to update in-review state"],
      ]);
      expect(result).toBeNull();
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

      const result = await helpers.toggleInReviewForRow({ repo: "o/r" }, { number: "5" }, true, checkbox);

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
      expect(result).toEqual({ payload: state.latestStoredPayload, selectedRepo: "o/r" });
    });

    test("given a full-payload (backward-compat) response, when disabling in-review, then the payload is replaced wholesale", async () => {
      const fullPrData = { byPrNumber: { 5: { updated: true } } };
      const fetchFn = jest.fn(async () => jsonResponse({ ok: true, prData: fullPrData }));
      const { helpers, calls } = buildHarness({ fetchFn, initialRepo: "o/r" });
      const checkbox = buildCheckbox(true);

      const result = await helpers.toggleInReviewForRow({ repo: "o/r" }, { number: "5" }, false, checkbox);

      expect(calls.applyLatestPrData).toEqual([{ payload: fullPrData, selectedRepo: "o/r" }]);
      expect(result).toEqual({ payload: fullPrData, selectedRepo: "o/r" });
    });

    test("given no data in the response, when toggling, then it falls back to a full reload and returns the reloaded payload", async () => {
      const fetchFn = jest.fn(async () => jsonResponse({ ok: true }));
      const reloadedPayload = { byPrNumber: { 5: { reloaded: true } } };
      const { helpers, calls, state } = buildHarness({ fetchFn, initialRepo: "o/r" });
      state.latestStoredPayload = reloadedPayload;
      const checkbox = buildCheckbox(true);

      const result = await helpers.toggleInReviewForRow({ repo: "o/r" }, { number: "5" }, true, checkbox);

      expect(calls.loadStoredData).toEqual([["o/r"]]);
      expect(result).toEqual({ payload: reloadedPayload, selectedRepo: "o/r" });
    });

    test("given a failed response, when toggling, then the checkbox reverts, a failure notification shows, and it returns null", async () => {
      const fetchFn = jest.fn(async () => jsonResponse({ ok: false, error: "nope" }, { ok: false, status: 500 }));
      const { helpers, calls } = buildHarness({ fetchFn, initialRepo: "o/r" });
      const checkbox = buildCheckbox(false);

      const result = await helpers.toggleInReviewForRow({ repo: "o/r" }, { number: "5" }, true, checkbox);

      expect(checkbox.checked).toBe(false);
      expect(calls.notifyFailureSnackbar[0][0]).toBe("In-review update failed for #5");
      expect(result).toBeNull();
    });

    test("given fetch throws, when toggling, then the checkbox reverts, the catch-path notification shows, and it returns null", async () => {
      const fetchFn = jest.fn(async () => {
        throw new Error("network down");
      });
      const { helpers, calls } = buildHarness({ fetchFn, initialRepo: "o/r" });
      const checkbox = buildCheckbox(false);

      const result = await helpers.toggleInReviewForRow({ repo: "o/r" }, { number: "5" }, true, checkbox);

      expect(checkbox.checked).toBe(false);
      expect(checkbox.disabled).toBe(false);
      expect(calls.notifyFailureSnackbar[0][0]).toBe("In-review update failed for #5");
      expect(result).toBeNull();
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

      const result = await helpers.toggleFlaggedForRow({ repo: "o/r" }, { number: "9" }, true, checkbox);

      expect(fetchFn).toHaveBeenCalledWith(
        "/view-prs/ack",
        expect.objectContaining({ body: JSON.stringify({ repo: "o/r", flagged: "9" }) }),
      );
      expect(calls.applyLatestPrData).toHaveLength(1);
      expect(result).toEqual({ payload: calls.applyLatestPrData[0].payload, selectedRepo: "o/r" });
    });

    test("given no PR number, when toggling, then it reverts, shows the flagged-specific failure message, and returns null", async () => {
      const { helpers, calls } = buildHarness({ fetchFn: jest.fn() });
      const checkbox = buildCheckbox(true);

      const result = await helpers.toggleFlaggedForRow({}, {}, true, checkbox);

      expect(checkbox.checked).toBe(false);
      expect(calls.notifyFailureSnackbar).toEqual([
        ["Flagged update failed", "Missing PR number", "Unable to update flagged state"],
      ]);
      expect(result).toBeNull();
    });

    test("given unflagging, when the request succeeds with a full payload, then the payload is replaced and returned", async () => {
      const fullPrData = { byPrNumber: { 9: {} } };
      const fetchFn = jest.fn(async (_url, init) => {
        expect(JSON.parse(init.body)).toEqual({ repo: "o/r", flaggedClear: "9" });
        return jsonResponse({ ok: true, prData: fullPrData });
      });
      const { helpers, calls } = buildHarness({ fetchFn, initialRepo: "o/r" });
      const checkbox = buildCheckbox(true);

      const result = await helpers.toggleFlaggedForRow({ repo: "o/r" }, { number: "9" }, false, checkbox);

      expect(calls.applyLatestPrData).toEqual([{ payload: fullPrData, selectedRepo: "o/r" }]);
      expect(result).toEqual({ payload: fullPrData, selectedRepo: "o/r" });
    });
  });
});
