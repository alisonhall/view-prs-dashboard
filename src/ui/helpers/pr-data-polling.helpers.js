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
    focusedElement,
    hasDirtyPrSectionsFields,
    hasPendingAutoRender,
    result,
  }) => {
    if (newFingerprint === lastRenderedPrFingerprint) {
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
