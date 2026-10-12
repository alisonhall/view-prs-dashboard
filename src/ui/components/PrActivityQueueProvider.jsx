import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PrActivityQueueContext } from '../state/PrActivityQueueContext';
import { buildActivePrKey } from './pr-row-keys';
import { createPrBulkActionBatchesHelpers } from '../helpers/pr-bulk-action-batches.helpers.js';

const {
  getInitialBatchesState,
  beginBatch,
  markChunkInFlight,
  markChunkDone,
  finishBatch,
  getBulkQueueViewModel,
} = createPrBulkActionBatchesHelpers();

/**
 * Activity drawer feature (see REACT_MIGRATION_PLAN.md): owns the
 * busyPrNumbers/queuedPrNumbers Sets that used to live locally inside
 * PrTableApp.jsx (lifted verbatim - same Set-of-"repo::prNumber"-keys
 * shape, same markPrBusy/clearPrBusy/markPrQueued/clearPrQueued
 * semantics), plus the bulk ack/apply-label batch manifest the drawer's
 * queue section needs. The window.markPrsBusy/clearPrsBusy/markPrsQueued/
 * clearPrsQueued bridges move here too - their real external callers
 * (pr-ack-label-actions.helpers.js, pr-quick-check-actions.helpers.js) are
 * unaffected by which component registers them.
 *
 * Phase G (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"): the 4
 * bulk-batch mutators are also exposed via Context now, not just
 * window.*, so state/useAckLabelActions.jsx's own instance can call them
 * directly via usePrActivityQueue() instead of window.beginBulkActionBatch/
 * etc. The window.* bridges themselves stay (index.page.js's own
 * createPrAckLabelActionsHelpers instance and pr-quick-check-actions.helpers.js
 * are vanilla JS, structurally unable to ever become Context consumers -
 * that's Phase H's job, not this one's). Mounted wrapping <AppRoot />
 * itself now (react-app.jsx's mountAppRoot), not nested inside its own
 * returned JSX - AppRoot's own body calls useAckLabelActions() directly,
 * so it has to be a real Context descendant, not an ancestor, for that to
 * reach this Provider's live state.
 */
export function PrActivityQueueProvider({ children }) {
  const [busyPrNumbers, setBusyPrNumbers] = useState(() => new Set());

  // ROADMAP.md follow-up (found during the "Quick check all" feature
  // review, 2026-09-30): busyPrNumbers used to be a plain Set, with
  // markPrBusy/clearPrBusy adding/deleting a key unconditionally. "Quick
  // check all" marks every loaded PR busy up front and only clears them
  // once its whole multi-repo sweep finishes (can take minutes) - if an
  // unrelated action (e.g. an Ack click) on one of those same PRs finished
  // first, its own clearPrBusy call removed the key entirely, so that
  // row's spinner disappeared before "Quick check all" was actually done
  // with it. Cosmetic only (no duplicate requests/data issues), but a real
  // visible bug. Fixed by reference-counting each key in a useRef-held Map
  // (not React state - this bookkeeping has no UI of its own, only
  // busyPrNumbers itself does) alongside the existing Set: a key only
  // leaves the Set once its count returns to 0, so two concurrent "busy"
  // claims on the same PR both have to clear before the spinner does.
  // busyPrNumbers' own external shape (a Set of keys, spread/iterated by
  // PrTableApp.jsx) is completely unchanged.
  const busyCountByKeyRef = useRef(new Map());

  const markPrBusy = useCallback((prNumber, repo) => {
    const key = buildActivePrKey(prNumber, repo);
    const counts = busyCountByKeyRef.current;
    const nextCount = (counts.get(key) || 0) + 1;
    counts.set(key, nextCount);
    if (nextCount === 1) {
      setBusyPrNumbers((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
    }
  }, []);

  const clearPrBusy = useCallback((prNumber, repo) => {
    const key = buildActivePrKey(prNumber, repo);
    const counts = busyCountByKeyRef.current;
    const currentCount = counts.get(key) || 0;
    if (currentCount <= 0) {
      return;
    }
    const nextCount = currentCount - 1;
    if (nextCount <= 0) {
      counts.delete(key);
      setBusyPrNumbers((prev) => {
        if (!prev.has(key)) {
          return prev;
        }
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    } else {
      counts.set(key, nextCount);
    }
  }, []);

  useEffect(() => {
    window.markPrsBusy = (prNumbers, repo) => {
      (Array.isArray(prNumbers) ? prNumbers : []).forEach((prNumber) => markPrBusy(prNumber, repo));
    };
    window.clearPrsBusy = (prNumbers, repo) => {
      (Array.isArray(prNumbers) ? prNumbers : []).forEach((prNumber) => clearPrBusy(prNumber, repo));
    };
    return () => {
      delete window.markPrsBusy;
      delete window.clearPrsBusy;
    };
  }, [markPrBusy, clearPrBusy]);

  const [queuedPrNumbers, setQueuedPrNumbers] = useState(() => new Set());

  const markPrQueued = useCallback((prNumber, repo) => {
    const key = buildActivePrKey(prNumber, repo);
    setQueuedPrNumbers((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }, []);

  const clearPrQueued = useCallback((prNumber, repo) => {
    const key = buildActivePrKey(prNumber, repo);
    setQueuedPrNumbers((prev) => {
      if (!prev.has(key)) {
        return prev;
      }
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  useEffect(() => {
    window.markPrsQueued = (prNumbers, repo) => {
      (Array.isArray(prNumbers) ? prNumbers : []).forEach((prNumber) => markPrQueued(prNumber, repo));
    };
    window.clearPrsQueued = (prNumbers, repo) => {
      (Array.isArray(prNumbers) ? prNumbers : []).forEach((prNumber) => clearPrQueued(prNumber, repo));
    };
    return () => {
      delete window.markPrsQueued;
      delete window.clearPrsQueued;
    };
  }, [markPrQueued, clearPrQueued]);

  // The bulk ack/apply-label chunk manifest - the one real ordered queue
  // the drawer surfaces (see pr-bulk-action-batches.helpers.js). A plain
  // Map in a ref would avoid re-renders too, but this state IS the
  // drawer's own display data, so it needs to trigger a re-render on every
  // chunk transition.
  const [bulkBatchesState, setBulkBatchesState] = useState(getInitialBatchesState);

  // Phase G (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"): these
  // 4 used to be inlined directly in the window-bridge effect below, with
  // no Context equivalent at all. Pulled out into their own stable
  // useCallbacks (same shape as markPrBusy/clearPrBusy above) so
  // useAckLabelActions.jsx can call them directly via usePrActivityQueue()
  // instead of window.beginBulkActionBatch/etc.
  const beginBulkActionBatch = useCallback(({ batchId, actionLabel, repo, chunks }) => {
    setBulkBatchesState((prev) => beginBatch(prev, { batchId, actionLabel, repo, chunks }));
  }, []);
  const markBulkActionChunkInFlight = useCallback(({ batchId, chunkIndex }) => {
    setBulkBatchesState((prev) => markChunkInFlight(prev, { batchId, chunkIndex }));
  }, []);
  const markBulkActionChunkDone = useCallback(({ batchId, chunkIndex, ok }) => {
    setBulkBatchesState((prev) => markChunkDone(prev, { batchId, chunkIndex, ok }));
  }, []);
  const finishBulkActionBatch = useCallback(({ batchId }) => {
    setBulkBatchesState((prev) => finishBatch(prev, { batchId }));
  }, []);

  useEffect(() => {
    window.beginBulkActionBatch = (...args) => beginBulkActionBatch(...args);
    window.markBulkActionChunkInFlight = (...args) => markBulkActionChunkInFlight(...args);
    window.markBulkActionChunkDone = (...args) => markBulkActionChunkDone(...args);
    window.finishBulkActionBatch = (...args) => finishBulkActionBatch(...args);
    return () => {
      delete window.beginBulkActionBatch;
      delete window.markBulkActionChunkInFlight;
      delete window.markBulkActionChunkDone;
      delete window.finishBulkActionBatch;
    };
  }, [beginBulkActionBatch, markBulkActionChunkInFlight, markBulkActionChunkDone, finishBulkActionBatch]);

  const bulkBatches = useMemo(() => getBulkQueueViewModel(bulkBatchesState), [bulkBatchesState]);

  const value = useMemo(
    () => ({
      busyPrNumbers,
      queuedPrNumbers,
      markPrBusy,
      clearPrBusy,
      markPrQueued,
      clearPrQueued,
      bulkBatches,
      beginBulkActionBatch,
      markBulkActionChunkInFlight,
      markBulkActionChunkDone,
      finishBulkActionBatch,
    }),
    [
      busyPrNumbers,
      queuedPrNumbers,
      markPrBusy,
      clearPrBusy,
      markPrQueued,
      clearPrQueued,
      bulkBatches,
      beginBulkActionBatch,
      markBulkActionChunkInFlight,
      markBulkActionChunkDone,
      finishBulkActionBatch,
    ],
  );

  return <PrActivityQueueContext.Provider value={value}>{children}</PrActivityQueueContext.Provider>;
}
