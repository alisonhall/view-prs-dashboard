/** @jest-environment jsdom */

const { render, act, cleanup } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { PrActivityQueueProvider } = require('./PrActivityQueueProvider');
const { usePrActivityQueue } = require('../state/PrActivityQueueContext');

let ProbeLastValue;
function Probe() {
  ProbeLastValue = usePrActivityQueue();
  return null;
}

describe('PrActivityQueueProvider', () => {
  afterEach(() => {
    cleanup();
    ProbeLastValue = undefined;
  });

  test('markPrBusy/clearPrBusy update busyPrNumbers', () => {
    render(
      <PrActivityQueueProvider>
        <Probe />
      </PrActivityQueueProvider>,
    );

    act(() => {
      ProbeLastValue.markPrBusy('1', 'owner/repo');
      ProbeLastValue.markPrBusy('2', 'owner/repo');
    });
    expect(Array.from(ProbeLastValue.busyPrNumbers).sort()).toEqual(['owner/repo::1', 'owner/repo::2']);

    act(() => {
      ProbeLastValue.clearPrBusy('1', 'owner/repo');
    });
    expect(Array.from(ProbeLastValue.busyPrNumbers)).toEqual(['owner/repo::2']);
  });

  test('markPrQueued/clearPrQueued update queuedPrNumbers', () => {
    render(
      <PrActivityQueueProvider>
        <Probe />
      </PrActivityQueueProvider>,
    );

    act(() => {
      ProbeLastValue.markPrQueued('5', 'owner/repo');
    });
    expect(Array.from(ProbeLastValue.queuedPrNumbers)).toEqual(['owner/repo::5']);

    act(() => {
      ProbeLastValue.clearPrQueued('5', 'owner/repo');
    });
    expect(Array.from(ProbeLastValue.queuedPrNumbers)).toEqual([]);
  });

  // ROADMAP.md regression test (found during the "Quick check all" feature
  // review, 2026-09-30): "Quick check all" marks every loaded PR busy up
  // front and only clears them once its whole sweep finishes; an unrelated
  // action (e.g. an Ack click) on one of those same PRs must not clear the
  // spinner early just because it finished first - two independent
  // markPrBusy callers on the same key both have to clear before
  // busyPrNumbers does.
  test('given the same PR marked busy by two independent callers, when only one clears, then it stays busy until both clear', () => {
    render(
      <PrActivityQueueProvider>
        <Probe />
      </PrActivityQueueProvider>,
    );

    act(() => {
      ProbeLastValue.markPrBusy('7', 'owner/repo');
      ProbeLastValue.markPrBusy('7', 'owner/repo');
    });
    expect(Array.from(ProbeLastValue.busyPrNumbers)).toEqual(['owner/repo::7']);

    act(() => {
      ProbeLastValue.clearPrBusy('7', 'owner/repo');
    });
    expect(Array.from(ProbeLastValue.busyPrNumbers)).toEqual(['owner/repo::7']);

    act(() => {
      ProbeLastValue.clearPrBusy('7', 'owner/repo');
    });
    expect(Array.from(ProbeLastValue.busyPrNumbers)).toEqual([]);
  });

  test('given clearPrBusy is called more times than markPrBusy for the same key, when it runs, then it never goes negative or throws', () => {
    render(
      <PrActivityQueueProvider>
        <Probe />
      </PrActivityQueueProvider>,
    );

    act(() => {
      ProbeLastValue.markPrBusy('9', 'owner/repo');
      ProbeLastValue.clearPrBusy('9', 'owner/repo');
      ProbeLastValue.clearPrBusy('9', 'owner/repo');
    });
    expect(Array.from(ProbeLastValue.busyPrNumbers)).toEqual([]);

    act(() => {
      ProbeLastValue.markPrBusy('9', 'owner/repo');
    });
    expect(Array.from(ProbeLastValue.busyPrNumbers)).toEqual(['owner/repo::9']);
  });

  // Tenth follow-up (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit"):
  // window.beginBulkActionBatch/markBulkActionChunkInFlight/
  // markBulkActionChunkDone/finishBulkActionBatch are gone - useAckLabelActions.jsx
  // is the only real caller, and it already calls these 4 directly via
  // usePrActivityQueue(), so every test below exercises that path only.
  test('a multi-chunk bulk batch flows through begin -> in-flight -> done -> finish', () => {
    render(
      <PrActivityQueueProvider>
        <Probe />
      </PrActivityQueueProvider>,
    );

    act(() => {
      ProbeLastValue.beginBulkActionBatch({
        batchId: 'batch-1',
        actionLabel: 'Ack/Clear',
        repo: 'owner/repo',
        chunks: [['1', '2'], ['3', '4']],
      });
    });
    expect(ProbeLastValue.bulkBatches).toHaveLength(1);
    expect(ProbeLastValue.bulkBatches[0].totalChunks).toBe(2);

    act(() => {
      ProbeLastValue.markBulkActionChunkInFlight({ batchId: 'batch-1', chunkIndex: 0 });
    });
    expect(ProbeLastValue.bulkBatches[0].chunks[0].state).toBe('in-flight');

    act(() => {
      ProbeLastValue.markBulkActionChunkDone({ batchId: 'batch-1', chunkIndex: 0 });
    });
    expect(ProbeLastValue.bulkBatches[0].doneCount).toBe(1);

    act(() => {
      ProbeLastValue.finishBulkActionBatch({ batchId: 'batch-1' });
    });
    expect(ProbeLastValue.bulkBatches).toEqual([]);
  });

  test('markBulkActionChunkDone with ok:false marks the chunk failed, surfaced separately from doneCount', () => {
    render(
      <PrActivityQueueProvider>
        <Probe />
      </PrActivityQueueProvider>,
    );

    act(() => {
      ProbeLastValue.beginBulkActionBatch({
        batchId: 'batch-1',
        actionLabel: 'Ack/Clear',
        repo: 'owner/repo',
        chunks: [['1', '2'], ['3', '4']],
      });
    });

    act(() => {
      ProbeLastValue.markBulkActionChunkDone({ batchId: 'batch-1', chunkIndex: 0, ok: false });
    });

    expect(ProbeLastValue.bulkBatches[0].chunks[0].state).toBe('failed');
    expect(ProbeLastValue.bulkBatches[0].doneCount).toBe(0);
    expect(ProbeLastValue.bulkBatches[0].failedCount).toBe(1);
  });

  test('a single-chunk batch is never tracked (begin is a no-op)', () => {
    render(
      <PrActivityQueueProvider>
        <Probe />
      </PrActivityQueueProvider>,
    );

    act(() => {
      ProbeLastValue.beginBulkActionBatch({
        batchId: 'batch-1',
        actionLabel: 'Ack/Clear',
        repo: 'owner/repo',
        chunks: [['1', '2', '3']],
      });
    });

    expect(ProbeLastValue.bulkBatches).toEqual([]);
  });
});
