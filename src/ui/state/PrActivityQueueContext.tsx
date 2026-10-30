import { createContext, useContext } from 'react';
import type { BulkQueueItem, ChunkState } from '../helpers/pr-bulk-action-batches.helpers.ts';

/**
 * Which PRs are busy (a request in flight) or queued (waiting in a bulk
 * batch), keyed by pr-row-keys.ts's buildActivePrKey ("repo::prNumber"),
 * plus the bulk ack/apply-label batch manifest. PrTableApp shows the
 * per-row spinners; the activity popover's queue section (a sibling,
 * not a descendant of PrTableApp) shows the batches.
 *
 * Default value (unwrapped) is a safe empty/no-op shape, matching every
 * other Context in this app.
 */
export interface BulkActionBatchStart {
  batchId: string;
  actionLabel?: string;
  repo?: string;
  chunks?: string[][];
}

export interface PrActivityQueueValue {
  busyPrNumbers: Set<string>;
  queuedPrNumbers: Set<string>;
  markPrBusy: (prNumber: string | number, repo?: string | null) => void;
  clearPrBusy: (prNumber: string | number, repo?: string | null) => void;
  markPrQueued: (prNumber: string | number, repo?: string | null) => void;
  clearPrQueued: (prNumber: string | number, repo?: string | null) => void;
  bulkBatches: BulkQueueItem[];
  beginBulkActionBatch: (batch: BulkActionBatchStart) => void;
  markBulkActionChunkInFlight: (chunk: { batchId: string; chunkIndex: number }) => void;
  markBulkActionChunkDone: (chunk: { batchId: string; chunkIndex: number; ok?: boolean }) => void;
  finishBulkActionBatch: (batch: { batchId: string }) => void;
}

// Re-exported for consumers that render chunk states.
export type { ChunkState };

export const PrActivityQueueContext = createContext<PrActivityQueueValue>({
  busyPrNumbers: new Set(),
  queuedPrNumbers: new Set(),
  markPrBusy: () => {},
  clearPrBusy: () => {},
  markPrQueued: () => {},
  clearPrQueued: () => {},
  bulkBatches: [],
  // No-ops so useAckLabelActions (and anything else reading this Context
  // without a mounted Provider, e.g. a test) doesn't crash on a call to
  // undefined.
  beginBulkActionBatch: () => {},
  markBulkActionChunkInFlight: () => {},
  markBulkActionChunkDone: () => {},
  finishBulkActionBatch: () => {},
});

export function usePrActivityQueue(): PrActivityQueueValue {
  return useContext(PrActivityQueueContext);
}
