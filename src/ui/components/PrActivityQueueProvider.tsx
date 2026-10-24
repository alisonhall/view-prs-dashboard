import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { PrActivityQueueContext, type PrActivityQueueValue } from '../state/PrActivityQueueContext';
import type { BatchesState } from '../helpers/pr-bulk-action-batches.helpers.ts';
import { buildActivePrKey } from './pr-row-keys';
import { createPrBulkActionBatchesHelpers } from '../helpers/pr-bulk-action-batches.helpers.ts';

const {
  getInitialBatchesState,
  beginBatch,
  markChunkInFlight,
  markChunkDone,
  finishBatch,
  getBulkQueueViewModel,
} = createPrBulkActionBatchesHelpers();

/**
 * Owns which PRs are busy/queued and the bulk ack/apply-label batch
 * manifest (see PrActivityQueueContext). Wraps <AppRoot /> from
 * react-app.jsx's mountAppRoot(), not nested inside AppRoot's JSX, because
 * AppRoot's own body calls useAckLabelActions(), which needs this
 * Provider as an ancestor to reach its live state.
 */
export function PrActivityQueueProvider({ children }: { children?: ReactNode }) {
  const [busyPrNumbers, setBusyPrNumbers] = useState<Set<string>>(() => new Set());

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
  const busyCountByKeyRef = useRef(new Map<string, number>());

  const markPrBusy = useCallback<PrActivityQueueValue['markPrBusy']>((prNumber, repo) => {
    const key = buildActivePrKey(prNumber, repo);
    const counts = busyCountByKeyRef.current;
    const nextCount = (counts.get(key) || 0) + 1;
    counts.set(key, nextCount);
    if (nextCount === 1) {
      setBusyPrNumbers((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
    }
  }, []);

  const clearPrBusy = useCallback<PrActivityQueueValue['clearPrBusy']>((prNumber, repo) => {
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

  const [queuedPrNumbers, setQueuedPrNumbers] = useState<Set<string>>(() => new Set());

  const markPrQueued = useCallback<PrActivityQueueValue['markPrQueued']>((prNumber, repo) => {
    const key = buildActivePrKey(prNumber, repo);
    setQueuedPrNumbers((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }, []);

  const clearPrQueued = useCallback<PrActivityQueueValue['clearPrQueued']>((prNumber, repo) => {
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

  // The bulk ack/apply-label chunk manifest - the one real ordered queue
  // the drawer surfaces (see pr-bulk-action-batches.helpers.ts). A plain
  // Map in a ref would avoid re-renders too, but this state IS the
  // drawer's own display data, so it needs to trigger a re-render on every
  // chunk transition.
  const [bulkBatchesState, setBulkBatchesState] = useState<BatchesState>(getInitialBatchesState);

  // Stable useCallbacks (same shape as markPrBusy/clearPrBusy above) so
  // useAckLabelActions can call them directly via usePrActivityQueue().
  const beginBulkActionBatch = useCallback<PrActivityQueueValue['beginBulkActionBatch']>(({ batchId, actionLabel, repo, chunks }) => {
    setBulkBatchesState((prev) => beginBatch(prev, { batchId, actionLabel, repo, chunks }));
  }, []);
  const markBulkActionChunkInFlight = useCallback<PrActivityQueueValue['markBulkActionChunkInFlight']>(({ batchId, chunkIndex }) => {
    setBulkBatchesState((prev) => markChunkInFlight(prev, { batchId, chunkIndex }));
  }, []);
  const markBulkActionChunkDone = useCallback<PrActivityQueueValue['markBulkActionChunkDone']>(({ batchId, chunkIndex, ok }) => {
    setBulkBatchesState((prev) => markChunkDone(prev, { batchId, chunkIndex, ok }));
  }, []);
  const finishBulkActionBatch = useCallback<PrActivityQueueValue['finishBulkActionBatch']>(({ batchId }) => {
    setBulkBatchesState((prev) => finishBatch(prev, { batchId }));
  }, []);

  const bulkBatches = useMemo(() => getBulkQueueViewModel(bulkBatchesState), [bulkBatchesState]);

  const value = useMemo<PrActivityQueueValue>(
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
