(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsPrDataPollingHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const computePrDataFingerprint = (payload) => {
    const byPrNumber = payload?.byPrNumber || {};
    return Object.keys(byPrNumber)
      .sort()
      .map((prNumber) => {
        const entry = byPrNumber[prNumber] || {};
        return JSON.stringify({
          prNumber,
          repo: entry?.repo || "",
          section: entry?.section || "",
          updatedAt: entry?.updatedAt || "",
          notes: entry?.notes || null,
          data: entry?.data || null,
        });
      })
      .join("|");
  };

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

  const createPrDataPollingHelpers = () => ({
    computePrDataFingerprint,
    computePrDataMetaFingerprint,
    computePrDataManifest,
    getManifestDelta,
    mergeDataDeltaPayload,
    getPendingAutoRenderAction,
    getDataPollRenderAction,
    isTextEntryElement,
  });

  return {
    createPrDataPollingHelpers,
  };
});
