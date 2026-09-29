/** @jest-environment jsdom */

const {
  createPrDataPollingOrchestrationHelpers,
} = require("./pr-data-polling-orchestration.helpers.js");

const jsonResponse = (body, overrides = {}) => ({
  ok: true,
  status: 200,
  json: async () => body,
  ...overrides,
});

function buildHarness(overrides = {}) {
  const state = {
    supportsDataMetaPolling: true,
    supportsDataManifestPolling: true,
    lastSeenDataVersion: "",
    latestPrManifest: {},
    latestStoredPayload: null,
    lastRenderedPrFingerprint: "",
    lastRenderedMetaFingerprint: "",
    lastRenderedRunStamp: "",
    hasDirtyPrSectionsFields: false,
    pendingAutoRenderPayload: null,
    ...overrides.initialState,
  };

  const calls = {
    applyLatestPrData: [],
    renderPrData: [],
    renderAutoRenderBlockedIndicator: [],
    flushPendingAutoRender: [],
    markPollSuccess: [],
    showPollFailureWarning: [],
    setStatusMessage: [],
  };

  const helpers = createPrDataPollingOrchestrationHelpers({
    fetchFn: overrides.fetchFn,
    documentRef: overrides.documentRef || { activeElement: null },
    computePrDataManifest: overrides.computePrDataManifest || (() => ({})),
    getManifestDelta: overrides.getManifestDelta || (() => ({ changedPrNumbers: [], removedPrNumbers: [], hasChanges: false })),
    mergeDataDeltaPayload: overrides.mergeDataDeltaPayload || (({ basePayload } = {}) => basePayload),
    computePrDataFingerprint: overrides.computePrDataFingerprint || ((payload) => JSON.stringify(payload)),
    computePrDataMetaFingerprint: overrides.computePrDataMetaFingerprint || ((payload) => JSON.stringify(payload?.lastRun || null)),
    getDataPollRenderAction:
      overrides.getDataPollRenderAction ||
      (({ result }) => ({ type: "render", payload: result })),
    getSupportsDataMetaPolling: () => state.supportsDataMetaPolling,
    setSupportsDataMetaPolling: (value) => {
      state.supportsDataMetaPolling = value;
    },
    getSupportsDataManifestPolling: () => state.supportsDataManifestPolling,
    setSupportsDataManifestPolling: (value) => {
      state.supportsDataManifestPolling = value;
    },
    getLastSeenDataVersion: () => state.lastSeenDataVersion,
    setLastSeenDataVersion: (value) => {
      state.lastSeenDataVersion = value;
    },
    getLatestPrManifest: () => state.latestPrManifest,
    setLatestPrManifest: (value) => {
      state.latestPrManifest = value;
    },
    getLatestStoredPayload: () => state.latestStoredPayload,
    applyLatestPrData: (args) => {
      calls.applyLatestPrData.push(args);
      if (args?.payload !== undefined) {
        state.latestStoredPayload = args.payload;
      }
    },
    getLastRenderedPrFingerprint: () => state.lastRenderedPrFingerprint,
    setLastRenderedPrFingerprint: (value) => {
      state.lastRenderedPrFingerprint = value;
    },
    getLastRenderedMetaFingerprint: () => state.lastRenderedMetaFingerprint,
    setLastRenderedMetaFingerprint: (value) => {
      state.lastRenderedMetaFingerprint = value;
    },
    getLastRenderedRunStamp: () => state.lastRenderedRunStamp,
    setLastRenderedRunStamp: (value) => {
      state.lastRenderedRunStamp = value;
    },
    getHasDirtyPrSectionsFields: () => state.hasDirtyPrSectionsFields,
    getPendingAutoRenderPayload: () => state.pendingAutoRenderPayload,
    setPendingAutoRenderPayload: (value) => {
      state.pendingAutoRenderPayload = value;
    },
    renderPrData: (...args) => calls.renderPrData.push(args),
    renderAutoRenderBlockedIndicator: (...args) => calls.renderAutoRenderBlockedIndicator.push(args),
    flushPendingAutoRender: (...args) => calls.flushPendingAutoRender.push(args),
    markPollSuccess: (...args) => calls.markPollSuccess.push(args),
    showPollFailureWarning: (...args) => calls.showPollFailureWarning.push(args),
    setStatusMessage: (...args) => calls.setStatusMessage.push(args),
  });

  return { helpers, state, calls };
}

describe("pr data polling orchestration helpers", () => {
  test("given the data-meta version is unchanged, when polling, then it marks success and fetches nothing further", async () => {
    const fetchFn = jest.fn(async () => jsonResponse({ dataVersion: "v1" }));
    const { helpers, calls } = buildHarness({
      fetchFn,
      initialState: { lastSeenDataVersion: "v1" },
    });

    await helpers.pollForDataChanges();

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith("/view-prs/data-meta");
    expect(calls.markPollSuccess).toHaveLength(1);
    expect(calls.renderPrData).toHaveLength(0);
  });

  test("given data-meta polling 404s, when polling, then it disables meta polling and falls back to a full data fetch", async () => {
    const fetchFn = jest.fn(async (url) => {
      if (url === "/view-prs/data-meta") return jsonResponse({}, { status: 404, ok: false });
      if (url === "/view-prs/data") return jsonResponse({ byPrNumber: { 1: {} } });
      throw new Error(`unexpected fetch: ${url}`);
    });
    const { helpers, state, calls } = buildHarness({ fetchFn });

    await helpers.pollForDataChanges();

    expect(state.supportsDataMetaPolling).toBe(false);
    expect(fetchFn).toHaveBeenCalledWith("/view-prs/data");
    expect(calls.applyLatestPrData).toEqual([{ payload: { byPrNumber: { 1: {} } } }]);
    expect(calls.renderPrData).toHaveLength(1);
  });

  test("given a manifest delta with no changes, when polling, then it updates the version/manifest and skips a full fetch", async () => {
    const fetchFn = jest.fn(async (url) => {
      if (url === "/view-prs/data-meta") {
        return jsonResponse({ dataVersion: "v2", supportsDataManifest: true });
      }
      if (url === "/view-prs/data-manifest") {
        return jsonResponse({ manifest: { 1: { rowVersion: "a" } }, dataMeta: { dataVersion: "v2" } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    const getManifestDelta = jest.fn(() => ({ changedPrNumbers: [], removedPrNumbers: [], hasChanges: false }));
    const { helpers, state, calls } = buildHarness({
      fetchFn,
      getManifestDelta,
      initialState: { lastSeenDataVersion: "v1", latestStoredPayload: { byPrNumber: {} } },
    });

    await helpers.pollForDataChanges();

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(state.lastSeenDataVersion).toBe("v2");
    expect(state.latestPrManifest).toEqual({ 1: { rowVersion: "a" } });
    expect(calls.markPollSuccess).toHaveLength(1);
    expect(calls.renderPrData).toHaveLength(0);
  });

  test("given a manifest delta with changes, when polling, then it merges the delta and renders the merged payload", async () => {
    const mergedPayload = { byPrNumber: { 1: { updated: true } } };
    const fetchFn = jest.fn(async (url) => {
      if (url === "/view-prs/data-meta") {
        return jsonResponse({ dataVersion: "v2", supportsDataManifest: true });
      }
      if (url === "/view-prs/data-manifest") {
        return jsonResponse({ manifest: { 1: { rowVersion: "b" } }, dataMeta: { dataVersion: "v2" } });
      }
      if (url === "/view-prs/data-delta") {
        return jsonResponse({ byPrNumber: { 1: { updated: true } } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    const getManifestDelta = jest.fn(() => ({ changedPrNumbers: ["1"], removedPrNumbers: [], hasChanges: true }));
    const mergeDataDeltaPayload = jest.fn(() => mergedPayload);
    const { helpers, calls } = buildHarness({
      fetchFn,
      getManifestDelta,
      mergeDataDeltaPayload,
      initialState: { lastSeenDataVersion: "v1", latestStoredPayload: { byPrNumber: { 1: {} } } },
    });

    await helpers.pollForDataChanges();

    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(fetchFn).toHaveBeenCalledWith(
      "/view-prs/data-delta",
      expect.objectContaining({ method: "POST" }),
    );
    expect(calls.applyLatestPrData).toEqual([{ payload: mergedPayload }]);
    expect(calls.renderPrData).toEqual([[mergedPayload]]);
  });

  test("given the render decision is skip-render, when polling, then no render or status update happens", async () => {
    const fetchFn = jest.fn(async () => jsonResponse({ dataVersion: "v2", byPrNumber: {} }, { status: 200 }));
    const { helpers, calls } = buildHarness({
      fetchFn: async (url) => (url === "/view-prs/data-meta" ? jsonResponse({}, { status: 404, ok: false }) : fetchFn()),
      getDataPollRenderAction: () => ({ type: "skip-render" }),
    });

    await helpers.pollForDataChanges();

    expect(calls.renderPrData).toHaveLength(0);
    expect(calls.setStatusMessage).toHaveLength(0);
    expect(calls.markPollSuccess).toHaveLength(0);
  });

  test("given the render decision is queue-render-and-listen, when polling, then it queues the payload, shows the indicator, and arms a blur listener", async () => {
    const focusedElement = { addEventListener: jest.fn() };
    const pendingPayload = { byPrNumber: { 2: {} } };
    const { helpers, state, calls } = buildHarness({
      fetchFn: async (url) =>
        url === "/view-prs/data-meta" ? jsonResponse({}, { status: 404, ok: false }) : jsonResponse(pendingPayload),
      documentRef: { activeElement: focusedElement },
      getDataPollRenderAction: () => ({ type: "queue-render-and-listen", payload: pendingPayload }),
    });

    await helpers.pollForDataChanges();

    expect(state.pendingAutoRenderPayload).toBe(pendingPayload);
    expect(calls.renderAutoRenderBlockedIndicator).toHaveLength(1);
    expect(focusedElement.addEventListener).toHaveBeenCalledWith("blur", expect.any(Function), { once: true });
    expect(calls.markPollSuccess).toHaveLength(1);
    expect(calls.renderPrData).toHaveLength(0);
  });

  test("given a normal render with a new run stamp, when polling, then fingerprints update and the run-stamp status message is shown", async () => {
    const result = { byPrNumber: {}, lastRun: { updatedAt: "2026-09-29T00:00:00Z" } };
    const { helpers, state, calls } = buildHarness({
      fetchFn: async (url) => (url === "/view-prs/data-meta" ? jsonResponse({}, { status: 404, ok: false }) : jsonResponse(result)),
    });

    await helpers.pollForDataChanges();

    expect(state.lastRenderedRunStamp).toBe("2026-09-29T00:00:00Z");
    expect(calls.renderPrData).toEqual([[result]]);
    expect(calls.setStatusMessage).toEqual([["Auto-updated from latest run at 2026-09-29T00:00:00Z"]]);
  });

  test("given a normal render with no new run stamp, when polling, then the generic status message is shown", async () => {
    const result = { byPrNumber: {} };
    const { helpers, calls } = buildHarness({
      fetchFn: async (url) => (url === "/view-prs/data-meta" ? jsonResponse({}, { status: 404, ok: false }) : jsonResponse(result)),
    });

    await helpers.pollForDataChanges();

    expect(calls.setStatusMessage).toEqual([["Auto-updated from latest stored data changes"]]);
  });

  test("given the data fetch fails, when polling, then the failure warning is shown instead of throwing", async () => {
    const { helpers, calls } = buildHarness({
      fetchFn: async (url) =>
        url === "/view-prs/data-meta"
          ? jsonResponse({}, { status: 404, ok: false })
          : jsonResponse({ error: "boom" }, { ok: false, status: 500 }),
    });

    await expect(helpers.pollForDataChanges()).resolves.toBeUndefined();

    expect(calls.showPollFailureWarning).toHaveLength(1);
    expect(calls.showPollFailureWarning[0][0].errorSource).toBeInstanceOf(Error);
  });
});
