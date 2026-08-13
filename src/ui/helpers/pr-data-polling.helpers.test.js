const { createPrDataPollingHelpers } = require("../helpers/pr-data-polling.helpers.js");

describe("pr data polling helpers", () => {
  const {
    computePrDataFingerprint,
    computePrDataManifest,
    getManifestDelta,
    mergeDataDeltaPayload,
    getPendingAutoRenderAction,
    getDataPollRenderAction,
    isTextEntryElement,
  } = createPrDataPollingHelpers();

  test("computePrDataFingerprint is deterministic and keyed by PR content", () => {
    const payloadA = {
      byPrNumber: {
        200: { repo: "owner/repo", section: "open", updatedAt: "2026-01-02" },
        100: { repo: "owner/repo", section: "closed", updatedAt: "2026-01-01" },
      },
    };
    const payloadB = {
      byPrNumber: {
        100: { repo: "owner/repo", section: "closed", updatedAt: "2026-01-01" },
        200: { repo: "owner/repo", section: "open", updatedAt: "2026-01-02" },
      },
    };

    expect(computePrDataFingerprint(payloadA)).toBe(
      computePrDataFingerprint(payloadB),
    );

    const payloadChanged = {
      byPrNumber: {
        100: { repo: "owner/repo", section: "closed", updatedAt: "2026-01-03" },
        200: { repo: "owner/repo", section: "open", updatedAt: "2026-01-02" },
      },
    };

    expect(computePrDataFingerprint(payloadChanged)).not.toBe(
      computePrDataFingerprint(payloadA),
    );
  });

  test("computePrDataManifest and getManifestDelta detect changed and removed rows", () => {
    const first = {
      byPrNumber: {
        1: { repo: "owner/repo", data: { labels: ["a"] } },
        2: { repo: "owner/repo", data: { labels: ["b"] } },
      },
    };
    const second = {
      byPrNumber: {
        1: { repo: "owner/repo", data: { labels: ["a", "c"] } },
        3: { repo: "owner/repo", data: { labels: ["z"] } },
      },
    };

    const delta = getManifestDelta({
      previousManifest: computePrDataManifest(first),
      nextManifest: computePrDataManifest(second),
    });

    expect(delta).toEqual({
      changedPrNumbers: ["1", "3"],
      removedPrNumbers: ["2"],
      hasChanges: true,
    });
  });

  test("computePrDataManifest returns an empty manifest for missing payload data", () => {
    expect(computePrDataManifest(null)).toEqual({});
    expect(computePrDataManifest({ byPrNumber: null })).toEqual({});
  });

  test("getManifestDelta reports no changes when manifests match", () => {
    const manifest = computePrDataManifest({
      byPrNumber: {
        7: { repo: "owner/repo", updatedAt: "2026-01-01T00:00:00Z" },
      },
    });

    expect(
      getManifestDelta({ previousManifest: manifest, nextManifest: manifest }),
    ).toEqual({
      changedPrNumbers: [],
      removedPrNumbers: [],
      hasChanges: false,
    });
  });

  test("mergeDataDeltaPayload applies changed and removed rows", () => {
    const merged = mergeDataDeltaPayload({
      basePayload: {
        byPrNumber: {
          1: { data: { status: "NO_CHANGE" } },
          2: { data: { status: "CHANGED" } },
        },
        dataMeta: { dataVersion: "v1" },
      },
      deltaByPrNumber: {
        1: { data: { status: "CHANGED" } },
        3: { data: { status: "NO_ACTIVITY" } },
      },
      removedPrNumbers: ["2"],
      nextDataMeta: { dataVersion: "v2" },
    });

    expect(Object.keys(merged.byPrNumber).sort()).toEqual(["1", "3"]);
    expect(merged.byPrNumber["1"]?.data?.status).toBe("CHANGED");
    expect(merged.byPrNumber["3"]?.data?.status).toBe("NO_ACTIVITY");
    expect(merged.dataMeta?.dataVersion).toBe("v2");
    expect(merged.dataManifest).toBeTruthy();
  });

  test("mergeDataDeltaPayload preserves base metadata when optional next values are omitted", () => {
    const merged = mergeDataDeltaPayload({
      basePayload: {
        byPrNumber: {
          5: { data: { status: "NO_CHANGE" } },
        },
        dataMeta: { dataVersion: "base-v1" },
        scheduler: { intervalMinutes: 15 },
        lastRun: { updatedAt: "2026-01-01T00:00:00Z" },
      },
      deltaByPrNumber: {
        5: { data: { status: "CHANGED" } },
      },
      removedPrNumbers: null,
      nextManifest: { 5: { rowVersion: "manifest-v2" } },
    });

    expect(merged.byPrNumber["5"]?.data?.status).toBe("CHANGED");
    expect(merged.dataMeta).toEqual({ dataVersion: "base-v1" });
    expect(merged.scheduler).toEqual({ intervalMinutes: 15 });
    expect(merged.lastRun).toEqual({ updatedAt: "2026-01-01T00:00:00Z" });
    expect(merged.dataManifest).toEqual({ 5: { rowVersion: "manifest-v2" } });
  });

  test("computePrDataFingerprint returns an empty string for empty payloads", () => {
    expect(computePrDataFingerprint(null)).toBe("");
    expect(computePrDataFingerprint({ byPrNumber: {} })).toBe("");
  });

  test("isTextEntryElement identifies input and textarea tags", () => {
    expect(isTextEntryElement({ tagName: "INPUT" })).toBe(true);
    expect(isTextEntryElement({ tagName: "textarea" })).toBe(true);
    expect(isTextEntryElement({ tagName: "DIV" })).toBe(false);
    expect(isTextEntryElement(null)).toBe(false);
  });

  test("getPendingAutoRenderAction returns branch-specific outcomes", () => {
    expect(
      getPendingAutoRenderAction({
        pendingPayload: null,
        focusedElement: null,
        hasDirtyPrSectionsFields: false,
      }),
    ).toEqual({ type: "none" });

    expect(
      getPendingAutoRenderAction({
        pendingPayload: { ok: true },
        focusedElement: { tagName: "INPUT" },
        hasDirtyPrSectionsFields: false,
      }),
    ).toEqual({ type: "wait-for-blur" });

    expect(
      getPendingAutoRenderAction({
        pendingPayload: { ok: true },
        focusedElement: { tagName: "DIV" },
        hasDirtyPrSectionsFields: true,
      }),
    ).toEqual({ type: "wait-for-clean" });

    expect(
      getPendingAutoRenderAction({
        pendingPayload: { ok: true },
        focusedElement: { tagName: "DIV" },
        hasDirtyPrSectionsFields: false,
      }),
    ).toEqual({ type: "render", payload: { ok: true } });
  });

  test("getDataPollRenderAction handles skip, queue, and immediate render", () => {
    expect(
      getDataPollRenderAction({
        newFingerprint: "same",
        lastRenderedPrFingerprint: "same",
        hasDirtyPrSectionsFields: false,
        focusedElement: { tagName: "DIV" },
        hasPendingAutoRender: false,
        result: { payload: 1 },
      }),
    ).toEqual({ type: "skip-render" });

    expect(
      getDataPollRenderAction({
        newFingerprint: "new",
        lastRenderedPrFingerprint: "old",
        hasDirtyPrSectionsFields: true,
        focusedElement: { tagName: "DIV" },
        hasPendingAutoRender: false,
        result: { payload: 11 },
      }),
    ).toEqual({ type: "queue-render", payload: { payload: 11 } });

    expect(
      getDataPollRenderAction({
        newFingerprint: "new",
        lastRenderedPrFingerprint: "old",
        hasDirtyPrSectionsFields: false,
        focusedElement: { tagName: "INPUT" },
        hasPendingAutoRender: false,
        result: { payload: 2 },
      }),
    ).toEqual({ type: "queue-render-and-listen", payload: { payload: 2 } });

    expect(
      getDataPollRenderAction({
        newFingerprint: "new",
        lastRenderedPrFingerprint: "old",
        hasDirtyPrSectionsFields: false,
        focusedElement: { tagName: "TEXTAREA" },
        hasPendingAutoRender: true,
        result: { payload: 3 },
      }),
    ).toEqual({ type: "queue-render", payload: { payload: 3 } });

    expect(
      getDataPollRenderAction({
        newFingerprint: "new",
        lastRenderedPrFingerprint: "old",
        hasDirtyPrSectionsFields: false,
        focusedElement: { tagName: "DIV" },
        hasPendingAutoRender: false,
        result: { payload: 4 },
      }),
    ).toEqual({ type: "render", payload: { payload: 4 } });
  });
});
