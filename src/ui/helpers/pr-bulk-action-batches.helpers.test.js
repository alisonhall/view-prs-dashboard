const { createPrBulkActionBatchesHelpers } = require("./pr-bulk-action-batches.helpers.js");

describe("pr bulk action batches helpers", () => {
  const {
    getInitialBatchesState,
    beginBatch,
    markChunkInFlight,
    markChunkDone,
    finishBatch,
    getBulkQueueViewModel,
  } = createPrBulkActionBatchesHelpers();

  describe("beginBatch", () => {
    test("tracks a batch with 2+ chunks, in true array order", () => {
      const state = beginBatch(getInitialBatchesState(), {
        batchId: "b1",
        actionLabel: "Ack/Clear",
        repo: "owner/repo",
        chunks: [["1", "2"], ["3", "4"], ["5"]],
      });

      const viewModel = getBulkQueueViewModel(state);
      expect(viewModel).toHaveLength(1);
      expect(viewModel[0]).toMatchObject({
        batchId: "b1",
        actionLabel: "Ack/Clear",
        repo: "owner/repo",
        totalChunks: 3,
        doneCount: 0,
      });
      expect(viewModel[0].chunks.map((c) => c.prNumbers)).toEqual([["1", "2"], ["3", "4"], ["5"]]);
      expect(viewModel[0].chunks.every((c) => c.state === "waiting")).toBe(true);
    });

    test("does not track a single-chunk batch - matches pr-ack-label-actions.helpers.js's own single-chunk skip", () => {
      const state = beginBatch(getInitialBatchesState(), {
        batchId: "b1",
        actionLabel: "Ack/Clear",
        repo: "owner/repo",
        chunks: [["1", "2", "3"]],
      });

      expect(getBulkQueueViewModel(state)).toEqual([]);
    });

    test("does nothing without a batchId", () => {
      const initial = getInitialBatchesState();
      const state = beginBatch(initial, { chunks: [["1"], ["2"]] });
      expect(state).toBe(initial);
    });
  });

  describe("chunk state transitions", () => {
    test("markChunkInFlight then markChunkDone update only the targeted chunk", () => {
      let state = beginBatch(getInitialBatchesState(), {
        batchId: "b1",
        chunks: [["1"], ["2"], ["3"]],
      });

      state = markChunkInFlight(state, { batchId: "b1", chunkIndex: 0 });
      let viewModel = getBulkQueueViewModel(state);
      expect(viewModel[0].chunks[0].state).toBe("in-flight");
      expect(viewModel[0].chunks[1].state).toBe("waiting");

      state = markChunkDone(state, { batchId: "b1", chunkIndex: 0 });
      viewModel = getBulkQueueViewModel(state);
      expect(viewModel[0].chunks[0].state).toBe("done");
      expect(viewModel[0].doneCount).toBe(1);
      expect(viewModel[0].failedCount).toBe(0);
    });

    test("markChunkDone with ok:false marks the chunk failed, not done", () => {
      let state = beginBatch(getInitialBatchesState(), {
        batchId: "b1",
        chunks: [["1"], ["2"]],
      });

      state = markChunkDone(state, { batchId: "b1", chunkIndex: 0, ok: false });
      const viewModel = getBulkQueueViewModel(state);

      expect(viewModel[0].chunks[0].state).toBe("failed");
      expect(viewModel[0].doneCount).toBe(0);
      expect(viewModel[0].failedCount).toBe(1);
    });

    test("a batch with one done and one failed chunk reports both counts correctly", () => {
      let state = beginBatch(getInitialBatchesState(), {
        batchId: "b1",
        chunks: [["1"], ["2"]],
      });

      state = markChunkDone(state, { batchId: "b1", chunkIndex: 0, ok: true });
      state = markChunkDone(state, { batchId: "b1", chunkIndex: 1, ok: false });
      const viewModel = getBulkQueueViewModel(state);

      expect(viewModel[0].doneCount).toBe(1);
      expect(viewModel[0].failedCount).toBe(1);
      expect(viewModel[0].chunks.map((c) => c.state)).toEqual(["done", "failed"]);
    });

    test("is a no-op for an unknown batchId", () => {
      const initial = beginBatch(getInitialBatchesState(), { batchId: "b1", chunks: [["1"], ["2"]] });
      const state = markChunkInFlight(initial, { batchId: "unknown", chunkIndex: 0 });
      expect(state).toBe(initial);
    });
  });

  describe("finishBatch", () => {
    test("removes the batch entirely", () => {
      let state = beginBatch(getInitialBatchesState(), { batchId: "b1", chunks: [["1"], ["2"]] });
      state = finishBatch(state, { batchId: "b1" });
      expect(getBulkQueueViewModel(state)).toEqual([]);
    });

    test("is a no-op for an unknown batchId", () => {
      const initial = beginBatch(getInitialBatchesState(), { batchId: "b1", chunks: [["1"], ["2"]] });
      const state = finishBatch(initial, { batchId: "unknown" });
      expect(state).toBe(initial);
    });
  });

  describe("multiple concurrent batches", () => {
    test("tracks each batch independently", () => {
      let state = beginBatch(getInitialBatchesState(), { batchId: "b1", actionLabel: "Ack/Clear", chunks: [["1"], ["2"]] });
      state = beginBatch(state, { batchId: "b2", actionLabel: "Apply label", chunks: [["3"], ["4"]] });

      const viewModel = getBulkQueueViewModel(state);
      expect(viewModel.map((b) => b.batchId).sort()).toEqual(["b1", "b2"]);
    });
  });
});
