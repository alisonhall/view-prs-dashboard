/** @jest-environment jsdom */

const {
  createPrRenderApplyHelpers,
} = require("./pr-render-apply.helpers.js");

describe("pr render apply helpers", () => {
  test("given render artifacts and payload, when applying render results, then side effects are coordinated and next render state is returned", () => {
    const renderAuthorInsights = jest.fn();
    const computePrDataFingerprint = jest.fn(() => "fingerprint-1");
    const computePrDataManifest = jest.fn(() => ({ fallback: true }));

    const { applyRenderResults } = createPrRenderApplyHelpers({
      renderAuthorInsights,
      computePrDataFingerprint,
      computePrDataManifest,
    });

    const meta = { textContent: "" };
    const payload = {
      actorsMap: { user1: { displayName: "User One" } },
      dataManifest: { version: "v1" },
      lastRun: { repo: "org/repo" },
    };

    const result = applyRenderResults({
      payload,
      allStoredRows: [{ id: 1 }],
      filteredRows: [{ id: 2 }],
      meta,
      appliedSummaryText: "Applied filters: repo=org/repo",
      filterChips: ["repo=org/repo"],
      selectedScope: "all",
      repoFilter: "org/repo",
      latestSelectedRepo: "org/repo",
    });

    // Deferred-items follow-up (full vanilla-to-React sweep, see
    // REACT_MIGRATION_PLAN.md): #data-meta is React-owned now - `meta`
    // (the DOM element) is still threaded through as a param but no
    // longer written to directly, and (Phase H.12) neither is
    // appliedSummaryText/filterChips anymore - AppliedFilterSummaryLive
    // (react-app.jsx) owns both live, reactively, with no bridge left for
    // this function to call.
    expect(meta.textContent).toBe("");
    expect(renderAuthorInsights).toHaveBeenCalledWith([{ id: 1 }], payload.actorsMap);
    expect(computePrDataFingerprint).toHaveBeenCalledWith(payload);
    expect(computePrDataManifest).not.toHaveBeenCalled();
    expect(result).toEqual({
      pendingAutoRenderPayload: null,
      lastRenderedPrFingerprint: "fingerprint-1",
      latestPrManifest: { version: "v1" },
      filteredRows: [{ id: 2 }],
    });
  });

  test("given missing payload fields, when applying render results, then fallback values are used", () => {
    const computePrDataManifest = jest.fn(() => ({ fallback: true }));
    const { applyRenderResults } = createPrRenderApplyHelpers({
      renderManagementFilterSummary: () => {},
      renderAuthorInsights: () => {},
      computePrDataFingerprint: () => "",
      computePrDataManifest,
    });

    const result = applyRenderResults({
      payload: {},
      allStoredRows: [],
      meta: {},
    });

    expect(computePrDataManifest).toHaveBeenCalledWith({});
    expect(result.latestPrManifest).toEqual({ fallback: true });
  });

  test("given the author insights tab panel is hidden, when applying render results, then its render is skipped", () => {
    const renderAuthorInsights = jest.fn();
    const panelsById = {
      "tab-panel-author-insights": { hidden: true },
    };
    const getOptionalElementById = jest.fn((id) => panelsById[id] || null);

    const { applyRenderResults } = createPrRenderApplyHelpers({
      renderAuthorInsights,
      getOptionalElementById,
    });

    applyRenderResults({
      payload: { actorsMap: {} },
      allStoredRows: [{ id: 1 }],
      sectionsHost: {},
      meta: {},
    });

    expect(renderAuthorInsights).not.toHaveBeenCalled();
  });

  test("given a hidden author insights tab panel becomes visible, when its catch-up render is triggered, then it renders with the most recently applied rows", () => {
    const renderAuthorInsights = jest.fn();
    const panelsById = {
      "tab-panel-author-insights": { hidden: true },
    };
    const getOptionalElementById = jest.fn((id) => panelsById[id] || null);

    const { applyRenderResults, renderAuthorInsightsIfVisible } =
      createPrRenderApplyHelpers({
        renderAuthorInsights,
        getOptionalElementById,
      });

    const actorsMap = { user1: { displayName: "User One" } };
    applyRenderResults({
      payload: { actorsMap },
      allStoredRows: [{ id: 1 }],
      sectionsHost: {},
      meta: {},
    });
    expect(renderAuthorInsights).not.toHaveBeenCalled();

    panelsById["tab-panel-author-insights"].hidden = false;
    renderAuthorInsightsIfVisible();
    expect(renderAuthorInsights).toHaveBeenCalledWith([{ id: 1 }], actorsMap);
  });

  test("given a caller with a fresh payload that never went through applyRenderResults, when applyFreshAuthorInsightsIfVisible runs with the tab visible, then it renders from that fresh payload, not a stale cache", () => {
    // Regression coverage: a caller like index.page.js's applyFreshPrPayload
    // (runSinglePrUpdate/flushPendingAutoRenderNow) never calls
    // applyRenderResults, so renderAuthorInsightsIfVisible alone would
    // render from whatever stale rows/actorsMap applyRenderResults last
    // left behind - applyFreshAuthorInsightsIfVisible must refresh that
    // same cache from the given payload first.
    const renderAuthorInsights = jest.fn();
    const panelsById = {
      "tab-panel-author-insights": { hidden: false },
    };
    const getOptionalElementById = jest.fn((id) => panelsById[id] || null);

    const { applyRenderResults, applyFreshAuthorInsightsIfVisible, renderAuthorInsightsIfVisible } =
      createPrRenderApplyHelpers({
        renderAuthorInsights,
        getOptionalElementById,
      });

    const staleActorsMap = { user1: { displayName: "Stale User" } };
    applyRenderResults({
      payload: { actorsMap: staleActorsMap },
      allStoredRows: [{ id: "stale" }],
      sectionsHost: {},
      meta: {},
    });
    expect(renderAuthorInsights).toHaveBeenLastCalledWith([{ id: "stale" }], staleActorsMap);

    const freshActorsMap = { user2: { displayName: "Fresh User" } };
    applyFreshAuthorInsightsIfVisible({
      byPrNumber: { 7: { id: "fresh" } },
      actorsMap: freshActorsMap,
    });
    expect(renderAuthorInsights).toHaveBeenLastCalledWith([{ id: "fresh" }], freshActorsMap);

    // The cache itself was updated, not just this one render - a later
    // tab-activation catch-up render (renderAuthorInsightsIfVisible, called
    // independently of applyFreshAuthorInsightsIfVisible) must also see
    // the fresh data, not fall back to the pre-fresh-update stale cache.
    renderAuthorInsights.mockClear();
    renderAuthorInsightsIfVisible();
    expect(renderAuthorInsights).toHaveBeenCalledWith([{ id: "fresh" }], freshActorsMap);
  });

  test("given missing dependencies, when applying render results, then safe defaults are returned without throwing", () => {
    const { applyRenderResults } = createPrRenderApplyHelpers();

    expect(() =>
      applyRenderResults({
        payload: null,
      }),
    ).not.toThrow();

    expect(
      applyRenderResults({
        payload: null,
      }),
    ).toEqual({
      pendingAutoRenderPayload: null,
      lastRenderedPrFingerprint: "",
      latestPrManifest: {},
    });
  });
});
