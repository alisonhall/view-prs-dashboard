/** @jest-environment jsdom */

const {
  createPrRenderApplyHelpers,
} = require("./pr-render-apply.helpers.js");

describe("pr render apply helpers", () => {
  test("given render artifacts and payload, when applying render results, then all render side effects are coordinated and next render state is returned", () => {
    const renderManagementFilterSummary = jest.fn();
    const renderExportFieldCatalog = jest.fn();
    const renderAuthorInsights = jest.fn();
    const renderStatsView = jest.fn();
    const clearElementContents = jest.fn();
    const buildPrSectionConfigs = jest.fn(() => [{ id: "section-1" }]);
    const appendPrSections = jest.fn();
    const buildMergedRequestMoreActionOptions = jest.fn(() => ({ enabled: true }));
    const appendMergedRequestMoreAction = jest.fn();
    const restoreInsightsViewState = jest.fn();
    const applyActivePrProgressIndicators = jest.fn();
    const recomputeDirtyPrSectionsFields = jest.fn();
    const computePrDataFingerprint = jest.fn(() => "fingerprint-1");
    const computePrDataManifest = jest.fn(() => ({ fallback: true }));

    const { applyRenderResults } = createPrRenderApplyHelpers({
      renderManagementFilterSummary,
      renderExportFieldCatalog,
      renderAuthorInsights,
      renderStatsView,
      clearElementContents,
      buildPrSectionConfigs,
      appendPrSections,
      buildMergedRequestMoreActionOptions,
      appendMergedRequestMoreAction,
      restoreInsightsViewState,
      applyActivePrProgressIndicators,
      recomputeDirtyPrSectionsFields,
      computePrDataFingerprint,
      computePrDataManifest,
    });

    const sectionsHost = { id: "sections" };
    const meta = { textContent: "" };
    const payload = {
      actorsMap: { user1: { displayName: "User One" } },
      dataManifest: { version: "v1" },
      lastRun: { repo: "org/repo" },
    };

    const result = applyRenderResults({
      payload,
      allStoredRows: [{ id: 1 }],
      sectionsHost,
      meta,
      appliedSummaryText: "Applied filters: repo=org/repo",
      filterChips: ["repo=org/repo"],
      grouped: { opened: [{ id: 1 }] },
      prSectionOpenState: { opened: true },
      lastSuccessfulRenderedCheckAt: "2026-07-17T00:00:00Z",
      selectedScope: "all",
      repoFilter: "org/repo",
      latestSelectedRepo: "org/repo",
      insightsViewState: { expanded: ["1"] },
      latestSchedulerState: { activePrNumbers: [123, 456] },
    });

    expect(meta.textContent).toBe("Applied filters: repo=org/repo");
    expect(renderManagementFilterSummary).toHaveBeenCalledWith({
      summaryText: "Applied filters: repo=org/repo",
      filterChips: ["repo=org/repo"],
    });
    expect(renderExportFieldCatalog).toHaveBeenCalledWith(payload);
    expect(renderAuthorInsights).toHaveBeenCalledWith([{ id: 1 }], payload.actorsMap);
    expect(renderStatsView).toHaveBeenCalledWith([{ id: 1 }], payload.actorsMap);
    expect(clearElementContents).toHaveBeenCalledWith(sectionsHost);
    expect(buildPrSectionConfigs).toHaveBeenCalledWith({
      grouped: { opened: [{ id: 1 }] },
      prSectionOpenState: { opened: true },
      lastCheckedAt: "2026-07-17T00:00:00Z",
      actorsMapFromPayload: payload.actorsMap,
    });
    expect(appendPrSections).toHaveBeenCalledWith(sectionsHost, [{ id: "section-1" }]);
    expect(buildMergedRequestMoreActionOptions).toHaveBeenCalledWith({
      selectedScope: "all",
      repoFilter: "org/repo",
      lastRunRepo: "org/repo",
      latestSelectedRepo: "org/repo",
    });
    expect(appendMergedRequestMoreAction).toHaveBeenCalledWith(sectionsHost, {
      enabled: true,
    });
    expect(restoreInsightsViewState).toHaveBeenCalledWith(sectionsHost, {
      expanded: ["1"],
    });
    expect(applyActivePrProgressIndicators).toHaveBeenCalledWith([123, 456]);
    expect(recomputeDirtyPrSectionsFields).toHaveBeenCalled();
    expect(computePrDataFingerprint).toHaveBeenCalledWith(payload);
    expect(computePrDataManifest).not.toHaveBeenCalled();
    expect(result).toEqual({
      pendingAutoRenderPayload: null,
      lastRenderedPrFingerprint: "fingerprint-1",
      latestPrManifest: { version: "v1" },
    });
  });

  test("given missing payload fields and scheduler state, when applying render results, then fallback values are used", () => {
    const computePrDataManifest = jest.fn(() => ({ fallback: true }));
    const applyActivePrProgressIndicators = jest.fn();
    const { applyRenderResults } = createPrRenderApplyHelpers({
      renderManagementFilterSummary: () => {},
      renderExportFieldCatalog: () => {},
      renderAuthorInsights: () => {},
      renderStatsView: () => {},
      clearElementContents: () => {},
      buildPrSectionConfigs: () => [],
      appendPrSections: () => {},
      buildMergedRequestMoreActionOptions: () => ({}),
      appendMergedRequestMoreAction: () => {},
      restoreInsightsViewState: () => {},
      applyActivePrProgressIndicators,
      recomputeDirtyPrSectionsFields: () => {},
      computePrDataFingerprint: () => "",
      computePrDataManifest,
    });

    const result = applyRenderResults({
      payload: {},
      allStoredRows: [],
      sectionsHost: {},
      meta: {},
      grouped: {},
    });

    expect(applyActivePrProgressIndicators).toHaveBeenCalledWith([]);
    expect(computePrDataManifest).toHaveBeenCalledWith({});
    expect(result.latestPrManifest).toEqual({ fallback: true });
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
