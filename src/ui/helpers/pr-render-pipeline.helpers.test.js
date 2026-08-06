/** @jest-environment jsdom */

const {
  createPrRenderPipelineHelpers,
} = require("./pr-render-pipeline.helpers.js");

describe("pr render pipeline helpers", () => {
  test("given render pipeline inputs, when deriving render pipeline state, then viewer setup, summary derivation, and finalize orchestration stay ordered", () => {
    const deriveViewerFilterSetup = jest.fn(() => ({
      currentActorLoginAliases: { me: ["me"] },
      currentViewerLogin: "me",
    }));
    const deriveRenderFilterSummaryState = jest.fn(() => ({
      grouped: { opened: [{ number: 1 }] },
      appliedSummaryText: "Repo: org/repo",
      filterChips: ["author:me"],
    }));
    const deriveRenderFinalizedState = jest.fn(() => ({
      pendingAutoRenderPayload: { ok: true },
      lastRenderedPrFingerprint: "fingerprint-1",
      latestPrManifest: { count: 1 },
    }));

    const { deriveRenderPipelineState } = createPrRenderPipelineHelpers({
      deriveViewerFilterSetup,
      deriveRenderFilterSummaryState,
      deriveRenderFinalizedState,
    });

    const result = deriveRenderPipelineState({
      payload: { actorsMap: { me: {} } },
      allEntries: [{ number: 1 }],
      repoFilter: "org/repo",
      normalizedRunStamp: "2026-07-20T00:00:00.000Z",
      rowsForRepo: [{ number: 1 }],
      ignoreScopeForPrNumberFilter: false,
      runStamp: "2026-07-20T00:00:00.000Z",
      useLastRunScope: false,
      selectedScope: "mine",
      attentionConfig: { enabled: true },
      filterPrNumbers: [1],
      filterPrNumbersRaw: "1",
      allStoredRows: [{ number: 1 }],
      sectionsHost: { nodeType: 1 },
      meta: { textContent: "" },
      prSectionOpenState: { opened: true },
      lastSuccessfulRenderedCheckAt: "2026-07-19T00:00:00.000Z",
      latestSelectedRepo: "org/repo",
      insightsViewState: { expanded: ["1"] },
      latestSchedulerState: { activePrNumbers: [1] },
    });

    expect(deriveViewerFilterSetup).toHaveBeenCalledWith({
      payload: { actorsMap: { me: {} } },
      allEntries: [{ number: 1 }],
      repoFilter: "org/repo",
    });
    expect(deriveRenderFilterSummaryState).toHaveBeenCalledWith({
      rowsForRepo: [{ number: 1 }],
      ignoreScopeForPrNumberFilter: false,
      runStamp: "2026-07-20T00:00:00.000Z",
      useLastRunScope: false,
      selectedScope: "mine",
      attentionConfig: { enabled: true },
      filterPrNumbers: [1],
      payload: { actorsMap: { me: {} } },
      repoFilter: "org/repo",
      filterPrNumbersRaw: "1",
    });
    expect(deriveRenderFinalizedState).toHaveBeenCalledWith({
      payload: { actorsMap: { me: {} } },
      allStoredRows: [{ number: 1 }],
      sectionsHost: { nodeType: 1 },
      meta: { textContent: "" },
      appliedSummaryText: "Repo: org/repo",
      filterChips: ["author:me"],
      grouped: { opened: [{ number: 1 }] },
      prSectionOpenState: { opened: true },
      lastSuccessfulRenderedCheckAt: "2026-07-20T00:00:00.000Z",
      selectedScope: "mine",
      repoFilter: "org/repo",
      latestSelectedRepo: "org/repo",
      insightsViewState: { expanded: ["1"] },
      latestSchedulerState: { activePrNumbers: [1] },
    });
    expect(
      deriveViewerFilterSetup.mock.invocationCallOrder[0],
    ).toBeLessThan(deriveRenderFilterSummaryState.mock.invocationCallOrder[0]);
    expect(
      deriveRenderFilterSummaryState.mock.invocationCallOrder[0],
    ).toBeLessThan(deriveRenderFinalizedState.mock.invocationCallOrder[0]);
    expect(result).toEqual({
      lastSuccessfulRenderedCheckAt: "2026-07-20T00:00:00.000Z",
      committedRenderState: {
        pendingAutoRenderPayload: { ok: true },
        lastRenderedPrFingerprint: "fingerprint-1",
        latestPrManifest: { count: 1 },
      },
    });
  });

  test("given an empty normalized run stamp, when deriving render pipeline state, then the previous render timestamp is preserved", () => {
    const { deriveRenderPipelineState } = createPrRenderPipelineHelpers({
      deriveViewerFilterSetup: () => {},
      deriveRenderFilterSummaryState: () => ({
        grouped: {},
        appliedSummaryText: "",
        filterChips: [],
      }),
      deriveRenderFinalizedState: () => ({
        pendingAutoRenderPayload: null,
        lastRenderedPrFingerprint: "",
        latestPrManifest: {},
      }),
    });

    const result = deriveRenderPipelineState({
      normalizedRunStamp: "",
      lastSuccessfulRenderedCheckAt: "2026-07-19T00:00:00.000Z",
    });

    expect(result.lastSuccessfulRenderedCheckAt).toBe(
      "2026-07-19T00:00:00.000Z",
    );
  });

  test("given missing dependencies, when deriving render pipeline state, then safe default render state is returned", () => {
    const { deriveRenderPipelineState } = createPrRenderPipelineHelpers();

    expect(deriveRenderPipelineState()).toEqual({
      lastSuccessfulRenderedCheckAt: "",
      committedRenderState: {
        pendingAutoRenderPayload: null,
        lastRenderedPrFingerprint: "",
        latestPrManifest: {},
      },
    });
  });
});
