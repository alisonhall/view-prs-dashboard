import { useCallback, useEffect, useMemo, useState } from 'react';
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
 */
export function PrActivityQueueProvider({ children }) {
  const [busyPrNumbers, setBusyPrNumbers] = useState(() => new Set());

  const markPrBusy = useCallback((prNumber, repo) => {
    const key = buildActivePrKey(prNumber, repo);
    setBusyPrNumbers((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }, []);

  const clearPrBusy = useCallback((prNumber, repo) => {
    const key = buildActivePrKey(prNumber, repo);
    setBusyPrNumbers((prev) => {
      if (!prev.has(key)) {
        return prev;
      }
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
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

  useEffect(() => {
    window.beginBulkActionBatch = ({ batchId, actionLabel, repo, chunks }) => {
      setBulkBatchesState((prev) => beginBatch(prev, { batchId, actionLabel, repo, chunks }));
    };
    window.markBulkActionChunkInFlight = ({ batchId, chunkIndex }) => {
      setBulkBatchesState((prev) => markChunkInFlight(prev, { batchId, chunkIndex }));
    };
    window.markBulkActionChunkDone = ({ batchId, chunkIndex, ok }) => {
      setBulkBatchesState((prev) => markChunkDone(prev, { batchId, chunkIndex, ok }));
    };
    window.finishBulkActionBatch = ({ batchId }) => {
      setBulkBatchesState((prev) => finishBatch(prev, { batchId }));
    };
    return () => {
      delete window.beginBulkActionBatch;
      delete window.markBulkActionChunkInFlight;
      delete window.markBulkActionChunkDone;
      delete window.finishBulkActionBatch;
    };
  }, []);

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
    }),
    [busyPrNumbers, queuedPrNumbers, markPrBusy, clearPrBusy, markPrQueued, clearPrQueued, bulkBatches],
  );

  return <PrActivityQueueContext.Provider value={value}>{children}</PrActivityQueueContext.Provider>;
}
