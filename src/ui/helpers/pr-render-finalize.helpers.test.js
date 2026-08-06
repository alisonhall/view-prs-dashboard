/** @jest-environment jsdom */

const {
  createPrRenderFinalizeHelpers,
} = require("./pr-render-finalize.helpers.js");

describe("pr render finalize helpers", () => {
  test("given render summary state, when deriving render finalized state, then apply inputs, render side effects, and committed state are coordinated", () => {
    const deriveRenderApplyInputs = jest.fn((inputs) => ({
      ...inputs,
      marker: "apply-inputs",
    }));
    const applyRenderResults = jest.fn(() => ({
      pendingAutoRenderPayload: { ok: true },
      lastRenderedPrFingerprint: "fingerprint-1",
      latestPrManifest: { count: 2 },
    }));
    const deriveCommittedRenderState = jest.fn(({ nextRenderState }) => ({
      ...nextRenderState,
      committed: true,
    }));

    const { deriveRenderFinalizedState } = createPrRenderFinalizeHelpers({
      deriveRenderApplyInputs,
      applyRenderResults,
      deriveCommittedRenderState,
    });

    const result = deriveRenderFinalizedState({
      payload: { lastRun: { repo: "org/repo" } },
      allStoredRows: [{ number: 1 }],
      sectionsHost: { nodeType: 1 },
      meta: { textContent: "" },
      appliedSummaryText: "Repo: org/repo",
      filterChips: ["author:alice"],
      grouped: { opened: [{ number: 1 }] },
      prSectionOpenState: { opened: true },
      lastSuccessfulRenderedCheckAt: "2026-07-20T00:00:00.000Z",
      selectedScope: "mine",
      repoFilter: "org/repo",
      latestSelectedRepo: "org/repo",
      insightsViewState: { expanded: ["1"] },
      latestSchedulerState: { activePrNumbers: [1] },
    });

    expect(deriveRenderApplyInputs).toHaveBeenCalledWith({
      payload: { lastRun: { repo: "org/repo" } },
      allStoredRows: [{ number: 1 }],
      sectionsHost: { nodeType: 1 },
      meta: { textContent: "" },
      appliedSummaryText: "Repo: org/repo",
      filterChips: ["author:alice"],
      grouped: { opened: [{ number: 1 }] },
      prSectionOpenState: { opened: true },
      lastSuccessfulRenderedCheckAt: "2026-07-20T00:00:00.000Z",
      selectedScope: "mine",
      repoFilter: "org/repo",
      latestSelectedRepo: "org/repo",
      insightsViewState: { expanded: ["1"] },
      latestSchedulerState: { activePrNumbers: [1] },
    });
    expect(applyRenderResults).toHaveBeenCalledWith({
      payload: { lastRun: { repo: "org/repo" } },
      allStoredRows: [{ number: 1 }],
      sectionsHost: { nodeType: 1 },
      meta: { textContent: "" },
      appliedSummaryText: "Repo: org/repo",
      filterChips: ["author:alice"],
      grouped: { opened: [{ number: 1 }] },
      prSectionOpenState: { opened: true },
      lastSuccessfulRenderedCheckAt: "2026-07-20T00:00:00.000Z",
      selectedScope: "mine",
      repoFilter: "org/repo",
      latestSelectedRepo: "org/repo",
      insightsViewState: { expanded: ["1"] },
      latestSchedulerState: { activePrNumbers: [1] },
      marker: "apply-inputs",
    });
    expect(deriveCommittedRenderState).toHaveBeenCalledWith({
      nextRenderState: {
        pendingAutoRenderPayload: { ok: true },
        lastRenderedPrFingerprint: "fingerprint-1",
        latestPrManifest: { count: 2 },
      },
    });
    expect(result).toEqual({
      pendingAutoRenderPayload: { ok: true },
      lastRenderedPrFingerprint: "fingerprint-1",
      latestPrManifest: { count: 2 },
      committed: true,
    });
  });

  test("given missing dependencies, when deriving render finalized state, then safe default committed state is returned", () => {
    const { deriveRenderFinalizedState } = createPrRenderFinalizeHelpers();

    expect(
      deriveRenderFinalizedState({
        payload: null,
      }),
    ).toEqual({
      pendingAutoRenderPayload: null,
      lastRenderedPrFingerprint: "",
      latestPrManifest: {},
    });
  });
});
