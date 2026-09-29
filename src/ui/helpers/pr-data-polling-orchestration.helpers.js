// Phase 7, sub-phase 7.2 (revised scope - see REACT_MIGRATION_PLAN.md):
// pure extraction of index.page.js's former pollForDataChanges function body
// into a DI-factory module, matching the pattern every other complex
// index.page.js function already uses (e.g. pr-single-pr-update.helpers.js).
// This is a byte-for-byte-logic-preserving move, not a rewrite - every
// module-level mutable variable pollForDataChanges used to close over
// directly is now an injected getter/setter pair instead, and the two
// variables covered by index.page.js's new centralized applyLatestPrData
// setter (see its own doc comment) go through that instead of a bare
// assignment - no other behavior changes. index.html.test.js's direct
// window.pollForDataChanges() calls (17 call sites) keep working unchanged,
// since index.page.js's own pollForDataChanges is now a thin wrapper around
// this factory's pollForDataChanges, still assigned to window the same way.
//
// The pure fingerprint/manifest-delta/render-decision helpers this function
// calls into (computePrDataManifest, getManifestDelta, mergeDataDeltaPayload,
// computePrDataFingerprint, computePrDataMetaFingerprint,
// getDataPollRenderAction) are NOT duplicated here - they're injected from
// index.page.js's existing prDataPollingHelperFactory.createPrDataPollingHelpers()
// instance (already wired with the real getOrComputeEntryDerivedValue cache),
// so this module has zero dependency on pr-data-polling.helpers.js directly.
export const { createPrDataPollingOrchestrationHelpers } = (() => {
  const createPrDataPollingOrchestrationHelpers = ({
    fetchFn,
    documentRef,
    computePrDataManifest,
    getManifestDelta,
    mergeDataDeltaPayload,
    computePrDataFingerprint,
    computePrDataMetaFingerprint,
    getDataPollRenderAction,
    getSupportsDataMetaPolling,
    setSupportsDataMetaPolling,
    getSupportsDataManifestPolling,
    setSupportsDataManifestPolling,
    getLastSeenDataVersion,
    setLastSeenDataVersion,
    getLatestPrManifest,
    setLatestPrManifest,
    getLatestStoredPayload,
    applyLatestPrData,
    getLastRenderedPrFingerprint,
    setLastRenderedPrFingerprint,
    getLastRenderedMetaFingerprint,
    setLastRenderedMetaFingerprint,
    getLastRenderedRunStamp,
    setLastRenderedRunStamp,
    getHasDirtyPrSectionsFields,
    getPendingAutoRenderPayload,
    setPendingAutoRenderPayload,
    renderPrData,
    renderAutoRenderBlockedIndicator,
    flushPendingAutoRender,
    markPollSuccess,
    showPollFailureWarning,
    setStatusMessage,
  } = {}) => {
    const fetchFnSafe = typeof fetchFn === "function" ? fetchFn : async () => {
      throw new Error("fetchFn is not available");
    };
    const getDocumentSafe = () =>
      documentRef || (typeof document !== "undefined" ? document : null);
    const computePrDataManifestSafe =
      typeof computePrDataManifest === "function" ? computePrDataManifest : () => ({});
    const getManifestDeltaSafe =
      typeof getManifestDelta === "function"
        ? getManifestDelta
        : () => ({ changedPrNumbers: [], removedPrNumbers: [], hasChanges: false });
    const mergeDataDeltaPayloadSafe =
      typeof mergeDataDeltaPayload === "function" ? mergeDataDeltaPayload : ({ basePayload } = {}) => basePayload || {};
    const computePrDataFingerprintSafe =
      typeof computePrDataFingerprint === "function" ? computePrDataFingerprint : () => "";
    const computePrDataMetaFingerprintSafe =
      typeof computePrDataMetaFingerprint === "function" ? computePrDataMetaFingerprint : () => "";
    const getDataPollRenderActionSafe =
      typeof getDataPollRenderAction === "function"
        ? getDataPollRenderAction
        : ({ result } = {}) => ({ type: "render", payload: result });
    const getSupportsDataMetaPollingSafe =
      typeof getSupportsDataMetaPolling === "function" ? getSupportsDataMetaPolling : () => true;
    const setSupportsDataMetaPollingSafe =
      typeof setSupportsDataMetaPolling === "function" ? setSupportsDataMetaPolling : () => {};
    const getSupportsDataManifestPollingSafe =
      typeof getSupportsDataManifestPolling === "function" ? getSupportsDataManifestPolling : () => true;
    const setSupportsDataManifestPollingSafe =
      typeof setSupportsDataManifestPolling === "function" ? setSupportsDataManifestPolling : () => {};
    const getLastSeenDataVersionSafe =
      typeof getLastSeenDataVersion === "function" ? getLastSeenDataVersion : () => "";
    const setLastSeenDataVersionSafe =
      typeof setLastSeenDataVersion === "function" ? setLastSeenDataVersion : () => {};
    const getLatestPrManifestSafe =
      typeof getLatestPrManifest === "function" ? getLatestPrManifest : () => ({});
    const setLatestPrManifestSafe =
      typeof setLatestPrManifest === "function" ? setLatestPrManifest : () => {};
    const getLatestStoredPayloadSafe =
      typeof getLatestStoredPayload === "function" ? getLatestStoredPayload : () => null;
    const applyLatestPrDataSafe =
      typeof applyLatestPrData === "function" ? applyLatestPrData : () => {};
    const getLastRenderedPrFingerprintSafe =
      typeof getLastRenderedPrFingerprint === "function" ? getLastRenderedPrFingerprint : () => "";
    const setLastRenderedPrFingerprintSafe =
      typeof setLastRenderedPrFingerprint === "function" ? setLastRenderedPrFingerprint : () => {};
    const getLastRenderedMetaFingerprintSafe =
      typeof getLastRenderedMetaFingerprint === "function" ? getLastRenderedMetaFingerprint : () => "";
    const setLastRenderedMetaFingerprintSafe =
      typeof setLastRenderedMetaFingerprint === "function" ? setLastRenderedMetaFingerprint : () => {};
    const getLastRenderedRunStampSafe =
      typeof getLastRenderedRunStamp === "function" ? getLastRenderedRunStamp : () => "";
    const setLastRenderedRunStampSafe =
      typeof setLastRenderedRunStamp === "function" ? setLastRenderedRunStamp : () => {};
    const getHasDirtyPrSectionsFieldsSafe =
      typeof getHasDirtyPrSectionsFields === "function" ? getHasDirtyPrSectionsFields : () => false;
    const getPendingAutoRenderPayloadSafe =
      typeof getPendingAutoRenderPayload === "function" ? getPendingAutoRenderPayload : () => null;
    const setPendingAutoRenderPayloadSafe =
      typeof setPendingAutoRenderPayload === "function" ? setPendingAutoRenderPayload : () => {};
    const renderPrDataSafe = typeof renderPrData === "function" ? renderPrData : () => {};
    const renderAutoRenderBlockedIndicatorSafe =
      typeof renderAutoRenderBlockedIndicator === "function" ? renderAutoRenderBlockedIndicator : () => {};
    const flushPendingAutoRenderSafe =
      typeof flushPendingAutoRender === "function" ? flushPendingAutoRender : () => {};
    const markPollSuccessSafe = typeof markPollSuccess === "function" ? markPollSuccess : () => {};
    const showPollFailureWarningSafe =
      typeof showPollFailureWarning === "function" ? showPollFailureWarning : () => {};
    const setStatusMessageSafe = typeof setStatusMessage === "function" ? setStatusMessage : () => {};

    const pollForDataChanges = async () => {
      const pollAttemptedAt = new Date().toISOString();
      try {
        let latestVersion = "";
        let shouldTryManifestDelta = false;
        let dataResult = null;

        if (getSupportsDataMetaPollingSafe()) {
          const metaResponse = await fetchFnSafe("/view-prs/data-meta");
          if (metaResponse.status === 404) {
            setSupportsDataMetaPollingSafe(false);
          } else {
            const metaResult = await metaResponse.json();
            if (!metaResponse.ok || metaResult.ok === false) {
              throw new Error(
                metaResult?.error ||
                  `Polling metadata request failed (HTTP ${metaResponse.status || "unknown"})`,
              );
            }

            latestVersion = String(metaResult?.dataVersion || "").trim();
            if (!latestVersion || latestVersion === getLastSeenDataVersionSafe()) {
              markPollSuccessSafe(pollAttemptedAt);
              return;
            }

            if (
              metaResult?.supportsDataManifest === true &&
              getSupportsDataManifestPollingSafe() &&
              getLatestStoredPayloadSafe()
            ) {
              shouldTryManifestDelta = true;
            }
          }
        }

        if (shouldTryManifestDelta) {
          const manifestResponse = await fetchFnSafe("/view-prs/data-manifest");
          if (manifestResponse.status === 404) {
            setSupportsDataManifestPollingSafe(false);
          } else {
            const manifestResult = await manifestResponse.json();
            if (manifestResponse.ok && manifestResult?.ok !== false) {
              const nextManifest = manifestResult?.manifest || {};
              const currentManifest = getLatestPrManifestSafe();
              const previousManifest =
                currentManifest && Object.keys(currentManifest).length > 0
                  ? currentManifest
                  : computePrDataManifestSafe(getLatestStoredPayloadSafe());
              const manifestDelta = getManifestDeltaSafe({
                previousManifest,
                nextManifest,
              });

              if (!manifestDelta.hasChanges) {
                setLatestPrManifestSafe(nextManifest);
                const manifestVersion = String(
                  manifestResult?.dataMeta?.dataVersion || latestVersion,
                ).trim();
                if (manifestVersion) {
                  setLastSeenDataVersionSafe(manifestVersion);
                }
                markPollSuccessSafe(pollAttemptedAt);
                return;
              }

              const deltaResponse = await fetchFnSafe("/view-prs/data-delta", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prNumbers: manifestDelta.changedPrNumbers }),
              });
              const deltaResult = await deltaResponse.json();
              if (deltaResponse.ok && deltaResult?.ok !== false) {
                dataResult = mergeDataDeltaPayloadSafe({
                  basePayload: getLatestStoredPayloadSafe(),
                  deltaByPrNumber: deltaResult?.byPrNumber || {},
                  removedPrNumbers: manifestDelta.removedPrNumbers,
                  nextDataMeta: manifestResult?.dataMeta || null,
                  nextScheduler: deltaResult?.scheduler || null,
                  nextLastRun: deltaResult?.lastRun || null,
                  nextManifest,
                });
                setLatestPrManifestSafe(nextManifest);
              }
            }
          }
        }

        if (!dataResult) {
          const response = await fetchFnSafe("/view-prs/data");
          const result = await response.json();
          if (!response.ok || result.ok === false) {
            throw new Error(
              result?.error ||
                `Polling data request failed (HTTP ${response.status || "unknown"})`,
            );
          }
          dataResult = result;
        }

        const fullDataVersion = String(
          dataResult?.dataMeta?.dataVersion || latestVersion,
        ).trim();
        if (fullDataVersion && fullDataVersion === getLastSeenDataVersionSafe()) {
          markPollSuccessSafe(pollAttemptedAt);
          return;
        }
        if (fullDataVersion) {
          setLastSeenDataVersionSafe(fullDataVersion);
        }

        const latestStamp = String(dataResult?.lastRun?.updatedAt || "").trim();
        applyLatestPrDataSafe({ payload: dataResult });
        setLatestPrManifestSafe(
          dataResult?.dataManifest || computePrDataManifestSafe(dataResult),
        );

        const newFingerprint = computePrDataFingerprintSafe(dataResult);
        const newMetaFingerprint = computePrDataMetaFingerprintSafe(dataResult);
        const doc = getDocumentSafe();
        const renderAction = getDataPollRenderActionSafe({
          newFingerprint,
          lastRenderedPrFingerprint: getLastRenderedPrFingerprintSafe(),
          newMetaFingerprint,
          lastRenderedMetaFingerprint: getLastRenderedMetaFingerprintSafe(),
          focusedElement: doc?.activeElement,
          hasDirtyPrSectionsFields: getHasDirtyPrSectionsFieldsSafe(),
          hasPendingAutoRender: getPendingAutoRenderPayloadSafe() != null,
          result: dataResult,
        });
        if (renderAction.type === "skip-render") {
          return;
        }

        if (
          renderAction.type === "queue-render" ||
          renderAction.type === "queue-render-and-listen"
        ) {
          setPendingAutoRenderPayloadSafe(renderAction.payload);
          renderAutoRenderBlockedIndicatorSafe();
          if (renderAction.type === "queue-render-and-listen") {
            doc?.activeElement?.addEventListener?.("blur", flushPendingAutoRenderSafe, {
              once: true,
            });
          }
          markPollSuccessSafe(pollAttemptedAt);
          return;
        }

        setLastRenderedPrFingerprintSafe(newFingerprint);
        setLastRenderedMetaFingerprintSafe(newMetaFingerprint);
        renderPrDataSafe(renderAction.payload);
        markPollSuccessSafe(pollAttemptedAt);

        if (latestStamp && latestStamp !== getLastRenderedRunStampSafe()) {
          setLastRenderedRunStampSafe(latestStamp);
          setStatusMessageSafe(`Auto-updated from latest run at ${latestStamp}`);
          return;
        }

        setStatusMessageSafe("Auto-updated from latest stored data changes");
      } catch (error) {
        showPollFailureWarningSafe({
          errorSource: error,
          attemptedAt: pollAttemptedAt,
        });
      }
    };

    return {
      pollForDataChanges,
    };
  };

  return {
    createPrDataPollingOrchestrationHelpers,
  };
})();
