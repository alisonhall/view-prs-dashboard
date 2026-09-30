// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsPrDataPollingHelpers fallback.
export const { createPrDataPollingHelpers } = (() => {

  // Deliberately separate from computePrDataFingerprint, which is keyed
  // only by PR content and used to decide whether the table itself needs
  // rebuilding. lastRun/dataMeta/scheduler drive the "Last Updated"/
  // "Last Checked" display and the data-meta summary line, and can change
  // (e.g. the backend script ran again and found nothing new) with zero
  // byPrNumber change - getDataPollRenderAction needs both fingerprints to
  // decide whether ANYTHING visible needs a refresh, or the poll can
  // silently update `latestStoredPayload` in memory while the on-screen
  // "Last Updated: Xh ago" stays stuck until some unrelated re-render
  // happens to pick it up.
  const computePrDataMetaFingerprint = (payload) =>
    JSON.stringify({
      lastRun: payload?.lastRun || null,
      dataMeta: payload?.dataMeta || null,
      scheduler: payload?.scheduler || null,
    });

  const computePrDataManifest = (payload) => {
    const byPrNumber = payload?.byPrNumber || {};
    const manifest = {};
    Object.keys(byPrNumber)
      .sort((a, b) => Number(a) - Number(b))
      .forEach((prNumber) => {
        const entry = byPrNumber[prNumber] || {};
        manifest[prNumber] = {
          rowVersion: JSON.stringify({
            prNumber,
            repo: entry?.repo || "",
            section: entry?.section || "",
            updatedAt: entry?.updatedAt || "",
            notes: entry?.notes || null,
            data: entry?.data || null,
          }),
          repo: entry?.repo || "",
          section: entry?.section || "",
          updatedAt: entry?.updatedAt || "",
        };
      });
    return manifest;
  };

  const getManifestDelta = ({
    previousManifest = {},
    nextManifest = {},
  } = {}) => {
    const previousKeys = new Set(Object.keys(previousManifest || {}));
    const nextKeys = new Set(Object.keys(nextManifest || {}));
    const changedPrNumbers = [];
    const removedPrNumbers = [];

    nextKeys.forEach((prNumber) => {
      const previousVersion = String(
        previousManifest?.[prNumber]?.rowVersion || "",
      );
      const nextVersion = String(nextManifest?.[prNumber]?.rowVersion || "");
      if (!previousVersion || previousVersion !== nextVersion) {
        changedPrNumbers.push(prNumber);
      }
    });

    previousKeys.forEach((prNumber) => {
      if (!nextKeys.has(prNumber)) {
        removedPrNumbers.push(prNumber);
      }
    });

    changedPrNumbers.sort((a, b) => Number(a) - Number(b));
    removedPrNumbers.sort((a, b) => Number(a) - Number(b));

    return {
      changedPrNumbers,
      removedPrNumbers,
      hasChanges: changedPrNumbers.length > 0 || removedPrNumbers.length > 0,
    };
  };

  const mergeDataDeltaPayload = ({
    basePayload = {},
    deltaByPrNumber = {},
    removedPrNumbers = [],
    nextDataMeta = null,
    nextScheduler = null,
    nextLastRun = null,
    nextManifest = null,
  } = {}) => {
    const mergedByPrNumber = {
      ...(basePayload?.byPrNumber || {}),
      ...(deltaByPrNumber || {}),
    };

    (Array.isArray(removedPrNumbers) ? removedPrNumbers : []).forEach(
      (prNumber) => {
        delete mergedByPrNumber[String(prNumber)];
      },
    );

    return {
      ...basePayload,
      byPrNumber: mergedByPrNumber,
      dataMeta: nextDataMeta || basePayload?.dataMeta || null,
      scheduler: nextScheduler || basePayload?.scheduler || null,
      lastRun: nextLastRun || basePayload?.lastRun || null,
      dataManifest:
        nextManifest ||
        computePrDataManifest({ byPrNumber: mergedByPrNumber }),
    };
  };

  const isTextEntryElement = (element) => {
    const tagName = String(element?.tagName || "").toUpperCase();
    return tagName === "INPUT" || tagName === "TEXTAREA";
  };

  const getPendingAutoRenderAction = ({
    pendingPayload,
    focusedElement,
    hasDirtyPrSectionsFields,
  }) => {
    if (!pendingPayload) {
      return { type: "none" };
    }
    if (isTextEntryElement(focusedElement)) {
      return { type: "wait-for-blur" };
    }
    if (hasDirtyPrSectionsFields) {
      return { type: "wait-for-clean" };
    }
    return {
      type: "render",
      payload: pendingPayload,
    };
  };

  const getDataPollRenderAction = ({
    newFingerprint,
    lastRenderedPrFingerprint,
    newMetaFingerprint,
    lastRenderedMetaFingerprint,
    focusedElement,
    hasDirtyPrSectionsFields,
    hasPendingAutoRender,
    result,
  }) => {
    // Regression guard: skip-render used to depend only on the PR-content
    // fingerprint, so a poll where only lastRun/dataMeta/scheduler changed
    // (the backend script ran again, nothing new happened) was silently
    // dropped - `latestStoredPayload` got the fresher metadata in memory,
    // but nothing on screen (the "Last Updated: Xh ago" indicator, the
    // data-meta summary) ever reflected it until some unrelated render
    // happened to pick it up (e.g. toggling a checkbox). Both fingerprints
    // (newMetaFingerprint/lastRenderedMetaFingerprint) must be omitted by
    // a caller for this to fall back to the old PR-only behavior.
    const prUnchanged = newFingerprint === lastRenderedPrFingerprint;
    const metaUnchanged = newMetaFingerprint === lastRenderedMetaFingerprint;
    if (prUnchanged && metaUnchanged) {
      return { type: "skip-render" };
    }
    if (hasDirtyPrSectionsFields) {
      return {
        type: "queue-render",
        payload: result,
      };
    }
    if (isTextEntryElement(focusedElement)) {
      return {
        type: hasPendingAutoRender ? "queue-render" : "queue-render-and-listen",
        payload: result,
      };
    }
    return {
      type: "render",
      payload: result,
    };
  };

  const createPrDataPollingHelpers = ({
    // Phase 5 residual (see REACT_MIGRATION_PLAN.md): optional shared
    // per-entry derived-value cache (see pr-entry-derived-cache.helpers.js),
    // the same instance pr-filter-panel.helpers.js already uses for
    // label/assignee/approver extraction - defaults to an uncached
    // passthrough so every existing call site/unit test keeps working
    // unmodified. When provided, an unchanged entry's own JSON-stringified
    // fingerprint piece is reused instead of being recomputed.
    getOrCompute,
  } = {}) => {
    const getOrComputeSafe =
      typeof getOrCompute === "function" ? getOrCompute : (_entry, _key, compute) => compute();

    // computePrDataFingerprint used to JSON.stringify every stored entry's
    // full data/notes on every call (called twice per render - once to
    // decide whether to skip rendering, once again afterward to refresh
    // lastRenderedPrFingerprint), regardless of how many entries actually
    // changed. Caches each entry's own stringified piece by entry
    // reference - safe for the same reason pr-entry-derived-cache.helpers.js's
    // other consumers are: mergeDataDeltaPayload's shallow merge keeps an
    // unchanged entry's object identity stable across polls, so a real
    // change is simply a different/absent cache key, never a stale hit.
    // Cache key "fingerprint" is distinct from pr-filter-panel.helpers.js's
    // "labels"/"assignedUsers"/"approvers" keys on the same shared cache.
    const computePrDataFingerprint = (payload) => {
      const byPrNumber = payload?.byPrNumber || {};
      return Object.keys(byPrNumber)
        .sort()
        .map((prNumber) => {
          const entry = byPrNumber[prNumber] || {};
          return getOrComputeSafe(entry, "fingerprint", () =>
            JSON.stringify({
              prNumber,
              repo: entry?.repo || "",
              section: entry?.section || "",
              updatedAt: entry?.updatedAt || "",
              notes: entry?.notes || null,
              data: entry?.data || null,
            }),
          );
        })
        .join("|");
    };

    return {
      computePrDataFingerprint,
      computePrDataMetaFingerprint,
      computePrDataManifest,
      getManifestDelta,
      mergeDataDeltaPayload,
      getPendingAutoRenderAction,
      getDataPollRenderAction,
      isTextEntryElement,
    };
  };

  return {
    createPrDataPollingHelpers,
  };
})();
