// Pure chunk-manifest builder for the activity drawer's bulk ack/apply-label
// queue section - the one place a REAL ordered queue already exists
// (pr-ack-label-actions.helpers.ts's own `chunks` array, run with
// CONCURRENCY_LIMIT in flight at a time via pr-concurrency.helpers.ts).
// This module doesn't invent any new chunking - it just mirrors the chunks
// the caller already computed into a drawer-displayable manifest, keyed by
// batchId so more than one bulk action's progress can be tracked at once.
//
// A batch with fewer than 2 chunks is deliberately never tracked
// (beginBatch is a no-op for it) - pr-ack-label-actions.helpers.ts itself
// skips the "queued" phase entirely for a single-chunk batch (see its own
// comment), and showing a one-item "queue" here would be inventing
// structure that isn't real.
export type ChunkState = "waiting" | "in-flight" | "done" | "failed";

export interface BatchChunk {
  index: number;
  prNumbers: string[];
  state: ChunkState;
}

export interface BulkActionBatch {
  batchId: string;
  actionLabel: string;
  repo: string;
  chunks: BatchChunk[];
}

export type BatchesState = Map<string, BulkActionBatch>;

export interface BulkQueueItem extends BulkActionBatch {
  totalChunks: number;
  doneCount: number;
  failedCount: number;
}

const createPrBulkActionBatchesHelpers = () => {
  const getInitialBatchesState = (): BatchesState => new Map();

  const beginBatch = (
    batchesMap: BatchesState,
    {
      batchId,
      actionLabel,
      repo,
      chunks,
    }: { batchId?: string; actionLabel?: string; repo?: string; chunks?: unknown[] } = {},
  ): BatchesState => {
    if (!batchId || !Array.isArray(chunks) || chunks.length < 2) {
      return batchesMap;
    }
    const next = new Map(batchesMap);
    next.set(batchId, {
      batchId,
      actionLabel: actionLabel || "",
      repo: repo || "",
      chunks: chunks.map((prNumbers, index) => ({
        index,
        prNumbers: Array.isArray(prNumbers) ? prNumbers : [],
        state: "waiting",
      })),
    });
    return next;
  };

  const setChunkState = (
    batchesMap: BatchesState,
    { batchId, chunkIndex, state }: { batchId: string; chunkIndex: number; state: ChunkState },
  ): BatchesState => {
    const batch = batchesMap.get(batchId);
    if (!batch) {
      return batchesMap;
    }
    const next = new Map(batchesMap);
    next.set(batchId, {
      ...batch,
      chunks: batch.chunks.map((chunk) =>
        chunk.index === chunkIndex ? { ...chunk, state } : chunk,
      ),
    });
    return next;
  };

  const markChunkInFlight = (
    batchesMap: BatchesState,
    { batchId, chunkIndex }: { batchId: string; chunkIndex: number },
  ): BatchesState => setChunkState(batchesMap, { batchId, chunkIndex, state: "in-flight" });

  // ok defaults to true so an existing caller that doesn't pass it keeps
  // behaving exactly as before this field existed. A chunk whose request
  // failed (ok: false) gets its own "failed" state, distinct from "done" -
  // the whole point of this section existing is to be honest about what
  // actually happened to each chunk, not just that it finished.
  const markChunkDone = (
    batchesMap: BatchesState,
    { batchId, chunkIndex, ok = true }: { batchId: string; chunkIndex: number; ok?: boolean },
  ): BatchesState => setChunkState(batchesMap, { batchId, chunkIndex, state: ok ? "done" : "failed" });

  const finishBatch = (batchesMap: BatchesState, { batchId }: { batchId?: string } = {}): BatchesState => {
    if (!batchId || !batchesMap.has(batchId)) {
      return batchesMap;
    }
    const next = new Map(batchesMap);
    next.delete(batchId);
    return next;
  };

  // doneCount/failedCount are reported separately so a caller can both
  // show an honest per-chunk outcome and still compute "how many chunks
  // are left to resolve" as totalChunks - doneCount - failedCount
  // (a failed chunk isn't going to retry on its own - it's resolved,
  // just unsuccessfully).
  const getBulkQueueViewModel = (batchesMap: BatchesState): BulkQueueItem[] =>
    Array.from(batchesMap.values()).map((batch) => ({
      batchId: batch.batchId,
      actionLabel: batch.actionLabel,
      repo: batch.repo,
      totalChunks: batch.chunks.length,
      doneCount: batch.chunks.filter((chunk) => chunk.state === "done").length,
      failedCount: batch.chunks.filter((chunk) => chunk.state === "failed").length,
      chunks: batch.chunks,
    }));

  return {
    getInitialBatchesState,
    beginBatch,
    markChunkInFlight,
    markChunkDone,
    finishBatch,
    getBulkQueueViewModel,
  };
};

export { createPrBulkActionBatchesHelpers };
