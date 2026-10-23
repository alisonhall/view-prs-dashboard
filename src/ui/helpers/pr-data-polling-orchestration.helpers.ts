import type { PrDataPayload, PrEntry, PrManifest } from "../types/pr-data.ts";
import type {
  DataPollRenderAction,
  DataPollRenderInput,
  ManifestDelta,
  MergeDataDeltaInput,
} from "./pr-data-polling.helpers.ts";

// PrDataProvider's data poll (pollForDataChanges): checks the data version
// (/view-prs/data-meta), fetches only the changed PRs when the server
// offers a manifest (/view-prs/data-manifest + /view-prs/data-delta),
// otherwise reloads /view-prs/data, then renders, queues the render behind
// unsaved edits, or skips it.
//
// Every piece of state the poll reads or writes is an injected getter/
// setter, and the pure fingerprint/manifest/render-decision helpers come
// from the caller's createPrDataPollingHelpers() instance, so this module
// holds no state of its own. PrDataProvider is the only caller.

type Getter<T> = () => T;
type Setter<T> = (value: T) => void;

interface MetaResult {
  ok?: boolean;
  error?: string;
  dataVersion?: string;
  supportsDataManifest?: boolean;
}

interface ManifestResult {
  ok?: boolean;
  manifest?: PrManifest;
  dataMeta?: PrDataPayload["dataMeta"];
}

interface DeltaResult {
  ok?: boolean;
  byPrNumber?: Record<string, PrEntry>;
  scheduler?: unknown;
  lastRun?: PrDataPayload["lastRun"];
}

export interface PrDataPollingOrchestrationDeps {
  fetchFn?: (input: string, init?: RequestInit) => Promise<Response>;
  documentRef?: { activeElement?: { tagName?: string } | null } | null;
  computePrDataManifest?: (payload: PrDataPayload | null | undefined) => PrManifest;
  getManifestDelta?: (input: { previousManifest?: PrManifest | null; nextManifest?: PrManifest | null }) => ManifestDelta;
  mergeDataDeltaPayload?: (input: MergeDataDeltaInput) => PrDataPayload;
  computePrDataFingerprint?: (payload: PrDataPayload) => string;
  computePrDataMetaFingerprint?: (payload: PrDataPayload) => string;
  getDataPollRenderAction?: (input: DataPollRenderInput) => DataPollRenderAction;
  getSupportsDataMetaPolling?: Getter<boolean>;
  setSupportsDataMetaPolling?: Setter<boolean>;
  getSupportsDataManifestPolling?: Getter<boolean>;
  setSupportsDataManifestPolling?: Setter<boolean>;
  getLastSeenDataVersion?: Getter<string>;
  setLastSeenDataVersion?: Setter<string>;
  getLatestPrManifest?: Getter<PrManifest | null | undefined>;
  setLatestPrManifest?: Setter<PrManifest>;
  getLatestStoredPayload?: Getter<PrDataPayload | null | undefined>;
  applyLatestPrData?: (update: { payload: PrDataPayload }) => void;
  getLastRenderedPrFingerprint?: Getter<string>;
  setLastRenderedPrFingerprint?: Setter<string>;
  getLastRenderedMetaFingerprint?: Getter<string>;
  setLastRenderedMetaFingerprint?: Setter<string>;
  getLastRenderedRunStamp?: Getter<string>;
  setLastRenderedRunStamp?: Setter<string>;
  getHasDirtyPrSectionsFields?: Getter<boolean>;
  getPendingAutoRenderPayload?: Getter<PrDataPayload | null | undefined>;
  setPendingAutoRenderPayload?: Setter<PrDataPayload | null>;
  renderPrData?: (payload: PrDataPayload) => void;
  markPollSuccess?: (attemptedAt: string) => void;
  showPollFailureWarning?: (failure: { errorSource: unknown; attemptedAt: string }) => void;
  setStatusMessage?: (message: string) => void;
}

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
  markPollSuccess,
  showPollFailureWarning,
  setStatusMessage,
}: PrDataPollingOrchestrationDeps = {}) => {
  const fetchFnSafe =
    typeof fetchFn === "function"
      ? fetchFn
      : async (): Promise<Response> => {
          throw new Error("fetchFn is not available");
        };
  const getDocumentSafe = () =>
    documentRef || (typeof document !== "undefined" ? document : null);
  const computePrDataManifestSafe =
    typeof computePrDataManifest === "function" ? computePrDataManifest : (): PrManifest => ({});
  const getManifestDeltaSafe =
    typeof getManifestDelta === "function"
      ? getManifestDelta
      : (): ManifestDelta => ({ changedPrNumbers: [], removedPrNumbers: [], hasChanges: false });
  const mergeDataDeltaPayloadSafe =
    typeof mergeDataDeltaPayload === "function"
      ? mergeDataDeltaPayload
      : ({ basePayload }: MergeDataDeltaInput = {}): PrDataPayload => basePayload || {};
  const computePrDataFingerprintSafe =
    typeof computePrDataFingerprint === "function" ? computePrDataFingerprint : () => "";
  const computePrDataMetaFingerprintSafe =
    typeof computePrDataMetaFingerprint === "function" ? computePrDataMetaFingerprint : () => "";
  const getDataPollRenderActionSafe =
    typeof getDataPollRenderAction === "function"
      ? getDataPollRenderAction
      : ({ result }: DataPollRenderInput): DataPollRenderAction => ({ type: "render", payload: result });
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
    typeof getLatestPrManifest === "function" ? getLatestPrManifest : (): PrManifest => ({});
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
  const markPollSuccessSafe = typeof markPollSuccess === "function" ? markPollSuccess : () => {};
  const showPollFailureWarningSafe =
    typeof showPollFailureWarning === "function" ? showPollFailureWarning : () => {};
  const setStatusMessageSafe = typeof setStatusMessage === "function" ? setStatusMessage : () => {};

  const pollForDataChanges = async (): Promise<void> => {
    const pollAttemptedAt = new Date().toISOString();
    try {
      let latestVersion = "";
      let shouldTryManifestDelta = false;
      let dataResult: PrDataPayload | null = null;

      if (getSupportsDataMetaPollingSafe()) {
        const metaResponse = await fetchFnSafe("/view-prs/data-meta");
        if (metaResponse.status === 404) {
          setSupportsDataMetaPollingSafe(false);
        } else {
          const metaResult: MetaResult = await metaResponse.json();
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
          const manifestResult: ManifestResult = await manifestResponse.json();
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
            const deltaResult: DeltaResult = await deltaResponse.json();
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
        const result: PrDataPayload = await response.json();
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

      // Both queue types are handled the same here: handing the payload
      // to setPendingAutoRenderPayload (AutoRenderBlockingProvider's
      // action) triggers that Provider's own effect, which makes the
      // apply / wait-for-blur / wait-for-clean decision itself (including
      // the blur listener). getDataPollRenderAction still distinguishes
      // the two (a tested branch); this call site just doesn't need to.
      if (
        renderAction.type === "queue-render" ||
        renderAction.type === "queue-render-and-listen"
      ) {
        setPendingAutoRenderPayloadSafe(renderAction.payload);
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

export { createPrDataPollingOrchestrationHelpers };
