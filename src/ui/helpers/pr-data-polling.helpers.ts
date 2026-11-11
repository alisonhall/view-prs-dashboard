import type { PrDataPayload, PrEntry, PrManifest } from "../types/pr-data.ts";
import type { EntryDerivedCache } from "./pr-entry-derived-cache.helpers.ts";

// The pure pieces of PrDataProvider's data polling: fingerprints and row
// manifests to detect changes, the manifest delta and merging a delta
// response into the stored payload, and whether a poll result should
// render now, wait (unsaved edits or a focused text field), or be skipped.
// AutoRenderBlockingProvider also uses getPendingAutoRenderAction to decide
// when a queued update can be applied.

// cyrb53 (public domain), twice with different seeds: the server's
// hashRowVersion (view-prs-data-helpers.js) exactly, as the manifests this
// page computes are compared with the server's.
const cyrb53 = (text: string, seed: number): string => {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
};
export const hashRowVersion = (text: string): string => `${cyrb53(text, 0)}.${cyrb53(text, 1)}`;

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
  nextLastFullRun?: PrDataPayload["lastFullRun"] | null;
  nextLastRunByRepo?: PrDataPayload["lastRunByRepo"] | null;
  nextLastFullRunByRepo?: PrDataPayload["lastFullRunByRepo"] | null;
  nextManifest?: PrManifest | null;
  // The user state's per-repo maps (the manifest's userState): replace the
  // stored ones when given.
  nextUserState?: PollUserState | null;
  // The people's names and logins (the manifest's actorMaps): replace the
  // stored ones when given.
  nextActorMaps?: PollActorMaps | null;
}

// The people's names and logins a poll's manifest carries.
export type PollActorMaps = Pick<PrDataPayload, "actorsMap" | "actors" | "actorIdMoves">;

// The user state's per-repo maps a poll's manifest carries (the server's
// buildDataManifestPayload).
export type PollUserState = Pick<
  PrDataPayload,
  "ackByRepo" | "ackHistoryByRepo" | "reverifyByRepo" | "inReviewByRepo" | "flaggedByRepo" | "threadChecksByRepo"
>;

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
    lastFullRun: payload?.lastFullRun || null,
    lastFullRunByRepo: payload?.lastFullRunByRepo || null,
    dataMeta: payload?.dataMeta || null,
    scheduler: payload?.scheduler || null,
    // Not the rows', but shown in them and the pane (Ack'd, the Activity
    // tab's Acks, flags): a poll that changes only these still renders.
    ackByRepo: payload?.ackByRepo || null,
    ackHistoryByRepo: payload?.ackHistoryByRepo || null,
    reverifyByRepo: payload?.reverifyByRepo || null,
    inReviewByRepo: payload?.inReviewByRepo || null,
    flaggedByRepo: payload?.flaggedByRepo || null,
    threadChecksByRepo: payload?.threadChecksByRepo || null,
    // Names and logins shown in rows, lists and the pane (Settings › People).
    actorsMap: payload?.actorsMap || null,
    actors: payload?.actors || null,
    actorIdMoves: payload?.actorIdMoves || null,
  });

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

  // A hash per entry, cached by entry reference (mergeDataDeltaPayload's
  // shallow merge keeps an unchanged entry's object identity, so a change
  // is a different key, never a stale hit), joined. Not the entries
  // written out: each entry's data carries its detail, so that string was
  // every row in full - 190 MB on a large dataset - kept for the tab's
  // life as lastRenderedPrFingerprint, with a second copy in the cache.
  const computePrDataFingerprint = (payload: PrDataPayload | null | undefined): string => {
    const byPrNumber = payload?.byPrNumber || {};
    return Object.keys(byPrNumber)
      .sort()
      .map((prNumber) => {
        const entry = byPrNumber[prNumber] || {};
        const hash = getOrComputeSafe(entry, `fingerprint:${prNumber}`, () =>
          hashRowVersion(
            JSON.stringify({
              prNumber,
              repo: entry?.repo || "",
              section: entry?.section || "",
              updatedAt: entry?.updatedAt || "",
              notes: entry?.notes || null,
              data: entry?.data || null,
            }),
          ),
        );
        return `${prNumber}=${hash}`;
      })
      .join("|");
  };

  const computePrDataManifest = (payload: PrDataPayload | null | undefined): PrManifest => {
    const byPrNumber = payload?.byPrNumber || {};
    const manifest: PrManifest = {};
    // Keyed as the rows are (repo#number), in PR number order - as the
    // server's buildViewPrsDataManifest.
    const numberOf = (key: string) => Number(key.split("#").pop());
    Object.keys(byPrNumber)
      .sort((a, b) => numberOf(a) - numberOf(b) || (a < b ? -1 : a > b ? 1 : 0))
      .forEach((prNumber) => {
        const entry = byPrNumber[prNumber] || {};
        manifest[prNumber] = {
          // As the server's computeViewPrsRowVersion (view-prs-data-helpers.js):
          // a hash, not the row written out (which made each manifest a
          // second copy of every row).
          // Cached by entry, as the fingerprint above: each row (with its
          // detail) is written out once, not on every poll and render.
          rowVersion: getOrComputeSafe(entry, `rowVersion:${prNumber}`, () =>
            hashRowVersion(
              JSON.stringify({
                prNumber,
                repo: entry?.repo || "",
                section: entry?.section || "",
                updatedAt: entry?.updatedAt || "",
                fetchedAt: entry?.fetchedAt || "",
                ciFetchedAt: entry?.ciFetchedAt || "",
                notes: entry?.notes || null,
                data: entry?.data || null,
              }),
            ),
          ),
          repo: entry?.repo || "",
          section: entry?.section || "",
          updatedAt: entry?.updatedAt || "",
        };
      });
    return manifest;
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
    nextLastFullRun = null,
    nextLastRunByRepo = null,
    nextLastFullRunByRepo = null,
    nextManifest = null,
    nextUserState = null,
    nextActorMaps = null,
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
      ...(nextUserState || {}),
      ...(nextActorMaps || {}),
      byPrNumber: mergedByPrNumber,
      dataMeta: nextDataMeta || basePayload?.dataMeta || null,
      scheduler: nextScheduler || basePayload?.scheduler || null,
      lastRun: nextLastRun || basePayload?.lastRun || null,
      lastFullRun: nextLastFullRun || basePayload?.lastFullRun || null,
      lastRunByRepo: nextLastRunByRepo || basePayload?.lastRunByRepo || {},
      lastFullRunByRepo: nextLastFullRunByRepo || basePayload?.lastFullRunByRepo || {},
      dataManifest:
        nextManifest ||
        computePrDataManifest({ byPrNumber: mergedByPrNumber }),
    };
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
