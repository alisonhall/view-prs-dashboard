/** @jest-environment jsdom */

const {
  createPrRenderApplyHelpers,
} = require("./pr-render-apply.helpers.js");

describe("pr render apply helpers", () => {
  test("given render artifacts and payload, when applying render results, then side effects and the merged-request-more action are coordinated and next render state is returned", () => {
    const renderManagementFilterSummary = jest.fn();
    const renderAuthorInsights = jest.fn();
    const renderStatsView = jest.fn();
    const clearElementContents = jest.fn();
    const buildMergedRequestMoreActionOptions = jest.fn(() => ({ enabled: true }));
    const appendMergedRequestMoreAction = jest.fn();
    const computePrDataFingerprint = jest.fn(() => "fingerprint-1");
    const computePrDataManifest = jest.fn(() => ({ fallback: true }));

    const { applyRenderResults } = createPrRenderApplyHelpers({
      renderManagementFilterSummary,
      renderAuthorInsights,
      renderStatsView,
      clearElementContents,
      buildMergedRequestMoreActionOptions,
      appendMergedRequestMoreAction,
      computePrDataFingerprint,
      computePrDataManifest,
    });

    const mergedRequestMoreHost = { id: "merged-request-more-action" };
    const sectionsHost = {
      id: "sections",
      parentElement: {
        querySelector: jest.fn((selector) =>
          selector === "#merged-request-more-action" ? mergedRequestMoreHost : null,
        ),
      },
    };
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
      sectionsHost,
      meta,
      appliedSummaryText: "Applied filters: repo=org/repo",
      filterChips: ["repo=org/repo"],
      selectedScope: "all",
      repoFilter: "org/repo",
      latestSelectedRepo: "org/repo",
    });

    expect(meta.textContent).toBe("Applied filters: repo=org/repo");
    expect(renderManagementFilterSummary).toHaveBeenCalledWith({
      summaryText: "Applied filters: repo=org/repo",
      filterChips: ["repo=org/repo"],
    });
    expect(renderAuthorInsights).toHaveBeenCalledWith([{ id: 1 }], payload.actorsMap);
    expect(renderStatsView).toHaveBeenCalledWith([{ id: 1 }], payload.actorsMap);
    expect(buildMergedRequestMoreActionOptions).toHaveBeenCalledWith({
      selectedScope: "all",
      repoFilter: "org/repo",
      lastRunRepo: "org/repo",
      latestSelectedRepo: "org/repo",
    });
    expect(clearElementContents).toHaveBeenCalledWith(mergedRequestMoreHost);
    expect(appendMergedRequestMoreAction).toHaveBeenCalledWith(mergedRequestMoreHost, {
      enabled: true,
    });
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
      renderStatsView: () => {},
      clearElementContents: () => {},
      buildMergedRequestMoreActionOptions: () => ({}),
      appendMergedRequestMoreAction: () => {},
      computePrDataFingerprint: () => "",
      computePrDataManifest,
    });

    const result = applyRenderResults({
      payload: {},
      allStoredRows: [],
      sectionsHost: {},
      meta: {},
    });

    expect(computePrDataManifest).toHaveBeenCalledWith({});
    expect(result.latestPrManifest).toEqual({ fallback: true });
  });

  test("given the author insights and stats tab panels are both hidden, when applying render results, then their renders are skipped", () => {
    const renderAuthorInsights = jest.fn();
    const renderStatsView = jest.fn();
    const panelsById = {
      "tab-panel-author-insights": { hidden: true },
      "tab-panel-review-stats": { hidden: true },
    };
    const getOptionalElementById = jest.fn((id) => panelsById[id] || null);

    const { applyRenderResults } = createPrRenderApplyHelpers({
      renderAuthorInsights,
      renderStatsView,
      getOptionalElementById,
    });

    applyRenderResults({
      payload: { actorsMap: {} },
      allStoredRows: [{ id: 1 }],
      sectionsHost: {},
      meta: {},
    });

    expect(renderAuthorInsights).not.toHaveBeenCalled();
    expect(renderStatsView).not.toHaveBeenCalled();
  });

  test("given a hidden tab panel becomes visible, when its catch-up render is triggered, then it renders with the most recently applied rows", () => {
    const renderAuthorInsights = jest.fn();
    const renderStatsView = jest.fn();
    const panelsById = {
      "tab-panel-author-insights": { hidden: true },
      "tab-panel-review-stats": { hidden: true },
    };
    const getOptionalElementById = jest.fn((id) => panelsById[id] || null);

    const { applyRenderResults, renderAuthorInsightsIfVisible, renderStatsViewIfVisible } =
      createPrRenderApplyHelpers({
        renderAuthorInsights,
        renderStatsView,
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
    expect(renderStatsView).not.toHaveBeenCalled();

    panelsById["tab-panel-author-insights"].hidden = false;
    renderAuthorInsightsIfVisible();
    expect(renderAuthorInsights).toHaveBeenCalledWith([{ id: 1 }], actorsMap);
    expect(renderStatsView).not.toHaveBeenCalled();

    panelsById["tab-panel-review-stats"].hidden = false;
    renderStatsViewIfVisible();
    expect(renderStatsView).toHaveBeenCalledWith([{ id: 1 }], actorsMap);
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
