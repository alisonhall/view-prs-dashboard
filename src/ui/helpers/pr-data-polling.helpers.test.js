const { createPrDataPollingHelpers } = require("../helpers/pr-data-polling.helpers.ts");

describe("pr data polling helpers", () => {
  const {
    computePrDataFingerprint,
    computePrDataMetaFingerprint,
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

  test("given a getOrCompute cache, when computePrDataFingerprint runs twice with an unchanged entry reference, then that entry isn't re-stringified", () => {
    // A minimal real WeakMap-backed getOrCompute (not a bare passthrough),
    // so this exercises actual cache-hit behavior - only calls `compute()`
    // on a genuine miss, matching pr-entry-derived-cache.helpers.ts's own
    // contract.
    const cache = new WeakMap();
    const getOrCompute = (entry, cacheKey, compute) => {
      let entryCache = cache.get(entry);
      if (!entryCache) {
        entryCache = new Map();
        cache.set(entry, entryCache);
      }
      if (!entryCache.has(cacheKey)) {
        entryCache.set(cacheKey, compute());
      }
      return entryCache.get(cacheKey);
    };
    const { computePrDataFingerprint: computeWithCache } = createPrDataPollingHelpers({
      getOrCompute,
    });

    const stringifySpy = jest.spyOn(JSON, "stringify");
    try {
      const unchangedEntry = { repo: "owner/repo", section: "open", updatedAt: "2026-01-01" };
      const changedEntry = { repo: "owner/repo", section: "closed", updatedAt: "2026-01-01" };
      const payload1 = { byPrNumber: { 100: unchangedEntry, 200: changedEntry } };

      computeWithCache(payload1);
      expect(stringifySpy).toHaveBeenCalledTimes(2);

      stringifySpy.mockClear();
      const changedEntryV2 = { ...changedEntry, updatedAt: "2026-01-02" };
      const payload2 = { byPrNumber: { 100: unchangedEntry, 200: changedEntryV2 } };

      const fingerprint2 = computeWithCache(payload2);
      // Only the new (different-reference) entry triggers a fresh
      // JSON.stringify - the unchanged entry's cached piece is reused.
      expect(stringifySpy).toHaveBeenCalledTimes(1);

      stringifySpy.mockClear();
      expect(fingerprint2).toBe(computeWithCache(payload2));
      expect(stringifySpy).not.toHaveBeenCalled();
    } finally {
      stringifySpy.mockRestore();
    }
  });

  // The page keeps the last fingerprint for the tab's life: it was every
  // row written out, detail and all (190 MB on a large dataset).
  test("given a row with a lot of data, when computePrDataFingerprint runs, then the fingerprint stays small and still changes with the data", () => {
    const bigData = { detail: "x".repeat(500000) };
    const payload = { byPrNumber: { "owner/repo#1": { repo: "owner/repo", section: "open", data: bigData } } };
    const fingerprint = computePrDataFingerprint(payload);

    expect(fingerprint.length).toBeLessThan(200);
    expect(
      computePrDataFingerprint({
        byPrNumber: { "owner/repo#1": { repo: "owner/repo", section: "open", data: { detail: `${bigData.detail}y` } } },
      }),
    ).not.toBe(fingerprint);
  });

  test("given a getOrCompute cache, when computePrDataManifest runs again with the same entries, then no row is written out again", () => {
    const cache = new WeakMap();
    const getOrCompute = (entry, cacheKey, compute) => {
      let entryCache = cache.get(entry);
      if (!entryCache) {
        entryCache = new Map();
        cache.set(entry, entryCache);
      }
      if (!entryCache.has(cacheKey)) {
        entryCache.set(cacheKey, compute());
      }
      return entryCache.get(cacheKey);
    };
    const helpers = createPrDataPollingHelpers({ getOrCompute });
    const payload = {
      byPrNumber: {
        1: { repo: "owner/repo", data: { labels: ["a"] } },
        2: { repo: "owner/repo", data: { labels: ["b"] } },
      },
    };
    const first = helpers.computePrDataManifest(payload);

    const stringifySpy = jest.spyOn(JSON, "stringify");
    try {
      expect(helpers.computePrDataManifest(payload)).toEqual(first);
      helpers.mergeDataDeltaPayload({ basePayload: payload });
      expect(stringifySpy).not.toHaveBeenCalled();
    } finally {
      stringifySpy.mockRestore();
    }
    expect(first).toEqual(computePrDataManifest(payload));
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

  // The page falls back to its own manifest as the previous one, so it must
  // match the server's, or every row reads as changed.
  test("computePrDataManifest's row versions match the server's", () => {
    const { computeViewPrsRowVersion } = require("../../server/helpers/view-prs-data-helpers.js");
    const entry = {
      repo: "owner/repo",
      section: "open",
      updatedAt: "2026-06-01T10:00:00Z",
      fetchedAt: "2026-06-01T10:01:00Z",
      ciFetchedAt: "2026-06-01T10:02:00Z",
      notes: { otherNotes: "x" },
      data: { labels: ["a"] },
    };
    expect(computePrDataManifest({ byPrNumber: { 5: entry } })["5"].rowVersion).toBe(computeViewPrsRowVersion(entry, "5"));
  });

  test("the page's row-version hash is the server's, whatever the text", () => {
    const { hashRowVersion: serverHash } = require("../../server/helpers/view-prs-data-helpers.js");
    const { hashRowVersion: pageHash } = require("./pr-data-polling.helpers.ts");
    ["", "a", '{"prNumber":"5"}', "naïve – “quotes” ✓ 🙂 日本語", "x".repeat(100000)].forEach((text) => {
      expect(pageHash(text)).toBe(serverHash(text));
    });
    expect(pageHash("a")).not.toBe(pageHash("b"));
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

  test("mergeDataDeltaPayload takes a new lastFullRun, or keeps the one it had", () => {
    const basePayload = {
      byPrNumber: {},
      lastRun: { updatedAt: "2026-01-01T00:00:00Z" },
      lastFullRun: { updatedAt: "2026-01-01T00:00:00Z" },
    };
    // A refresh of a few PRs: lastRun moves, lastFullRun doesn't.
    const afterFewPrs = mergeDataDeltaPayload({
      basePayload,
      deltaByPrNumber: {},
      nextLastRun: { updatedAt: "2026-01-01T00:05:00Z" },
    });
    expect(afterFewPrs.lastRun).toEqual({ updatedAt: "2026-01-01T00:05:00Z" });
    expect(afterFewPrs.lastFullRun).toEqual({ updatedAt: "2026-01-01T00:00:00Z" });

    const afterFullRun = mergeDataDeltaPayload({
      basePayload,
      deltaByPrNumber: {},
      nextLastFullRun: { updatedAt: "2026-01-01T00:15:00Z" },
    });
    expect(afterFullRun.lastFullRun).toEqual({ updatedAt: "2026-01-01T00:15:00Z" });
  });

  test("mergeDataDeltaPayload takes new per-repo runs, or keeps the ones it had", () => {
    const { mergeDataDeltaPayload } = createPrDataPollingHelpers();
    const byRepo = { "acme/api": { repo: "acme/api", updatedAt: "2026-01-01T00:00:00Z" } };
    const basePayload = { byPrNumber: {}, lastRunByRepo: byRepo, lastFullRunByRepo: byRepo };

    const kept = mergeDataDeltaPayload({ basePayload, deltaByPrNumber: {} });
    expect(kept.lastFullRunByRepo).toEqual(byRepo);

    const next = { ...byRepo, "acme/web": { repo: "acme/web", updatedAt: "2026-01-01T00:15:00Z" } };
    const moved = mergeDataDeltaPayload({ basePayload, deltaByPrNumber: {}, nextLastRunByRepo: next, nextLastFullRunByRepo: next });
    expect(moved.lastRunByRepo).toEqual(next);
    expect(moved.lastFullRunByRepo).toEqual(next);
  });

  test("mergeDataDeltaPayload takes the manifest's user state (an Ack cleared by a run), or keeps the stored one", () => {
    const basePayload = {
      byPrNumber: {},
      ackByRepo: { "o/r": { 1: "2026-01-02T00:00:00Z" } },
      ackHistoryByRepo: { "o/r": { 1: ["2026-01-02T00:00:00Z"] } },
    };
    const nextUserState = { ackByRepo: {}, ackHistoryByRepo: basePayload.ackHistoryByRepo };

    const merged = mergeDataDeltaPayload({ basePayload, nextUserState });
    expect(merged.ackByRepo).toEqual({});
    expect(merged.ackHistoryByRepo).toEqual(basePayload.ackHistoryByRepo);
    expect(mergeDataDeltaPayload({ basePayload }).ackByRepo).toEqual(basePayload.ackByRepo);
    // So the poll renders it.
    expect(computePrDataMetaFingerprint(merged)).not.toBe(computePrDataMetaFingerprint(basePayload));
  });

  test("mergeDataDeltaPayload takes the manifest's names and logins (a save in Settings › People), or keeps the stored ones, and the poll renders them", () => {
    const basePayload = {
      byPrNumber: {},
      actorsMap: { ann: "Ann" },
      actorLoginAliases: {},
    };
    const nextActorMaps = { actorsMap: { ann: "Ann Lee", "ann-2": "Ann Lee" }, actorLoginAliases: { "ann-2": "ann" } };

    const merged = mergeDataDeltaPayload({ basePayload, nextActorMaps });
    expect(merged.actorsMap).toEqual(nextActorMaps.actorsMap);
    expect(merged.actorLoginAliases).toEqual(nextActorMaps.actorLoginAliases);
    expect(mergeDataDeltaPayload({ basePayload }).actorsMap).toEqual(basePayload.actorsMap);
    expect(computePrDataMetaFingerprint(merged)).not.toBe(computePrDataMetaFingerprint(basePayload));
  });

  test("mergeDataDeltaPayload takes the manifest's archive summary, or keeps the stored one, and the poll renders it (Show older's count)", () => {
    const archived = { 501: { repo: "owner/repo", section: "merged", archived: true } };
    const basePayload = { byPrNumber: { ...archived }, archiveSummary: { version: "v1", merged: 1, closed: 0 } };
    const nextArchiveSummary = { version: "v2", merged: 3, closed: 1 };

    const merged = mergeDataDeltaPayload({ basePayload, nextArchiveSummary });
    expect(merged.archiveSummary).toEqual(nextArchiveSummary);
    expect(mergeDataDeltaPayload({ basePayload }).archiveSummary).toEqual(basePayload.archiveSummary);
    expect(computePrDataMetaFingerprint(merged)).not.toBe(computePrDataMetaFingerprint(basePayload));
  });

  test("computePrDataFingerprint returns an empty string for empty payloads", () => {
    expect(computePrDataFingerprint(null)).toBe("");
    expect(computePrDataFingerprint({ byPrNumber: {} })).toBe("");
  });

  test("computePrDataMetaFingerprint changes when lastRun/dataMeta/scheduler change, independent of byPrNumber", () => {
    const withSameContentDifferentLastRun = {
      byPrNumber: { 1: { repo: "owner/repo", updatedAt: "2026-01-01" } },
      lastRun: { updatedAt: "2026-01-01T10:00:00Z" },
      dataMeta: { dataVersion: "v1" },
      scheduler: { intervalMinutes: 15 },
    };
    const withSameContentLaterLastRun = {
      byPrNumber: { 1: { repo: "owner/repo", updatedAt: "2026-01-01" } },
      lastRun: { updatedAt: "2026-01-01T10:15:00Z" },
      dataMeta: { dataVersion: "v2" },
      scheduler: { intervalMinutes: 15 },
    };

    // The PR-content fingerprint must NOT change - this is the whole
    // point of keeping the two fingerprints separate.
    expect(computePrDataFingerprint(withSameContentDifferentLastRun)).toBe(
      computePrDataFingerprint(withSameContentLaterLastRun),
    );
    // But the meta fingerprint must, so a poll that only advanced
    // lastRun/dataMeta isn't silently indistinguishable from one that
    // changed nothing at all.
    expect(computePrDataMetaFingerprint(withSameContentDifferentLastRun)).not.toBe(
      computePrDataMetaFingerprint(withSameContentLaterLastRun),
    );
  });

  test("computePrDataMetaFingerprint is stable for identical lastRun/dataMeta/scheduler", () => {
    const payloadA = {
      lastRun: { updatedAt: "2026-01-01T10:00:00Z" },
      dataMeta: { dataVersion: "v1" },
      scheduler: { intervalMinutes: 15 },
    };
    const payloadB = {
      lastRun: { updatedAt: "2026-01-01T10:00:00Z" },
      dataMeta: { dataVersion: "v1" },
      scheduler: { intervalMinutes: 15 },
    };

    expect(computePrDataMetaFingerprint(payloadA)).toBe(
      computePrDataMetaFingerprint(payloadB),
    );
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

  // Regression coverage: skip-render used to depend only on the PR-content
  // fingerprint, so a poll where only lastRun/dataMeta/scheduler changed
  // (the backend script ran again, no PR actually changed) was
  // indistinguishable from "nothing changed at all" - renderPrData was
  // never called, so the visible "Last Updated: Xh ago" indicator and
  // data-meta summary stayed stuck on stale values (even though
  // `latestStoredPayload` in index.page.js had already been reassigned to
  // the fresher payload) until some unrelated interaction forced a
  // render.
  test("getDataPollRenderAction still renders when only the meta fingerprint changed, even with an unchanged PR fingerprint", () => {
    expect(
      getDataPollRenderAction({
        newFingerprint: "same",
        lastRenderedPrFingerprint: "same",
        newMetaFingerprint: "meta-v2",
        lastRenderedMetaFingerprint: "meta-v1",
        hasDirtyPrSectionsFields: false,
        focusedElement: { tagName: "DIV" },
        hasPendingAutoRender: false,
        result: { payload: 5 },
      }),
    ).toEqual({ type: "render", payload: { payload: 5 } });
  });

  test("getDataPollRenderAction skips only when both the PR and meta fingerprints are unchanged", () => {
    expect(
      getDataPollRenderAction({
        newFingerprint: "same",
        lastRenderedPrFingerprint: "same",
        newMetaFingerprint: "meta-v1",
        lastRenderedMetaFingerprint: "meta-v1",
        hasDirtyPrSectionsFields: false,
        focusedElement: { tagName: "DIV" },
        hasPendingAutoRender: false,
        result: { payload: 6 },
      }),
    ).toEqual({ type: "skip-render" });
  });

  test("getDataPollRenderAction falls back to PR-only comparison when meta fingerprints are omitted (backward compatible)", () => {
    expect(
      getDataPollRenderAction({
        newFingerprint: "same",
        lastRenderedPrFingerprint: "same",
        hasDirtyPrSectionsFields: false,
        focusedElement: { tagName: "DIV" },
        hasPendingAutoRender: false,
        result: { payload: 7 },
      }),
    ).toEqual({ type: "skip-render" });
  });
});
