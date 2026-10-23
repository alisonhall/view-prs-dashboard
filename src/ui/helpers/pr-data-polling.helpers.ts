import type { PrDataPayload, PrEntry, PrManifest } from "../types/pr-data.ts";
import type { EntryDerivedCache } from "./pr-entry-derived-cache.helpers.ts";

// The pure pieces of PrDataProvider's data polling: fingerprints and row
// manifests to detect changes, the manifest delta and merging a delta
// response into the stored payload, and whether a poll result should
// render now, wait (unsaved edits or a focused text field), or be skipped.

// What getDataPollRenderAction / getPendingAutoRenderAction decide.
export type DataPollRenderAction =
  | { type: "skip-render" }
  | { type: "render"; payload: PrDataPayload }
  | { type: "queue-render"; payload: PrDataPayload }
  | { type: "queue-render-and-listen"; payload: PrDataPayload };

export type PendingAutoRenderAction =
  | { type: "none" }
  | { type: "wait-for-blur" }
  | { type: "wait-for-clean" }
  | { type: "render"; payload: PrDataPayload };

export interface ManifestDelta {
  changedPrNumbers: string[];
  removedPrNumbers: string[];
  hasChanges: boolean;
}

export interface MergeDataDeltaInput {
  basePayload?: PrDataPayload | null;
  deltaByPrNumber?: Record<string, PrEntry> | null;
  removedPrNumbers?: unknown[];
  nextDataMeta?: PrDataPayload["dataMeta"] | null;
  nextScheduler?: unknown;
  nextLastRun?: PrDataPayload["lastRun"] | null;
  nextManifest?: PrManifest | null;
}

// Something with a tagName, like document.activeElement.
type FocusedElement = { tagName?: string } | null | undefined;

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
const computePrDataMetaFingerprint = (payload: PrDataPayload | null | undefined): string =>
  JSON.stringify({
    lastRun: payload?.lastRun || null,
    dataMeta: payload?.dataMeta || null,
    scheduler: payload?.scheduler || null,
  });

const computePrDataManifest = (payload: PrDataPayload | null | undefined): PrManifest => {
  const byPrNumber = payload?.byPrNumber || {};
  const manifest: PrManifest = {};
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
}: { previousManifest?: PrManifest | null; nextManifest?: PrManifest | null } = {}): ManifestDelta => {
  const previousKeys = new Set(Object.keys(previousManifest || {}));
  const nextKeys = new Set(Object.keys(nextManifest || {}));
  const changedPrNumbers: string[] = [];
  const removedPrNumbers: string[] = [];

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

// Shallow: unchanged entries keep their object identity, which the
// per-entry caches rely on (see pr-entry-derived-cache.helpers.ts).
const mergeDataDeltaPayload = ({
  basePayload = {},
  deltaByPrNumber = {},
  removedPrNumbers = [],
  nextDataMeta = null,
  nextScheduler = null,
  nextLastRun = null,
  nextManifest = null,
}: MergeDataDeltaInput = {}): PrDataPayload => {
  const mergedByPrNumber: Record<string, PrEntry> = {
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

const isTextEntryElement = (element: FocusedElement): boolean => {
  const tagName = String(element?.tagName || "").toUpperCase();
  return tagName === "INPUT" || tagName === "TEXTAREA";
};

const getPendingAutoRenderAction = ({
  pendingPayload,
  focusedElement,
  hasDirtyPrSectionsFields,
}: {
  pendingPayload: PrDataPayload | null | undefined;
  focusedElement: FocusedElement;
  hasDirtyPrSectionsFields: boolean;
}): PendingAutoRenderAction => {
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

export interface DataPollRenderInput {
  newFingerprint: string;
  lastRenderedPrFingerprint: string;
  newMetaFingerprint?: string;
  lastRenderedMetaFingerprint?: string;
  focusedElement: FocusedElement;
  hasDirtyPrSectionsFields: boolean;
  hasPendingAutoRender: boolean;
  result: PrDataPayload;
}

const getDataPollRenderAction = ({
  newFingerprint,
  lastRenderedPrFingerprint,
  newMetaFingerprint,
  lastRenderedMetaFingerprint,
  focusedElement,
  hasDirtyPrSectionsFields,
  hasPendingAutoRender,
  result,
}: DataPollRenderInput): DataPollRenderAction => {
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

export interface PrDataPollingDeps {
  // Optional per-entry cache (PrDataProvider passes its own
  // createEntryDerivedCache() instance). Without it every fingerprint
  // piece is recomputed, which is correct, just slower.
  getOrCompute?: EntryDerivedCache["getOrCompute"];
}

const createPrDataPollingHelpers = ({ getOrCompute }: PrDataPollingDeps = {}) => {
  const getOrComputeSafe: EntryDerivedCache["getOrCompute"] =
    typeof getOrCompute === "function" ? getOrCompute : (_entry, _key, compute) => compute();

  // computePrDataFingerprint used to JSON.stringify every stored entry's
  // full data/notes on every call (called twice per render - once to
  // decide whether to skip rendering, once again afterward to refresh
  // lastRenderedPrFingerprint), regardless of how many entries actually
  // changed. Caches each entry's own stringified piece by entry
  // reference - safe because mergeDataDeltaPayload's shallow merge keeps
  // an unchanged entry's object identity stable across polls, so a real
  // change is simply a different/absent cache key, never a stale hit.
  const computePrDataFingerprint = (payload: PrDataPayload | null | undefined): string => {
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

export { createPrDataPollingHelpers };
