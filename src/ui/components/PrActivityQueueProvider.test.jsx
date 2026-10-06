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

const BRIDGE_NAMES = [
  'markPrsBusy',
  'clearPrsBusy',
  'markPrsQueued',
  'clearPrsQueued',
  'beginBulkActionBatch',
  'markBulkActionChunkInFlight',
  'markBulkActionChunkDone',
  'finishBulkActionBatch',
];

describe('PrActivityQueueProvider', () => {
  afterEach(() => {
    cleanup();
    BRIDGE_NAMES.forEach((name) => delete window[name]);
    ProbeLastValue = undefined;
  });

  test('registers all 8 window bridges on mount and removes them on unmount', () => {
    const { unmount } = render(
      <PrActivityQueueProvider>
        <Probe />
      </PrActivityQueueProvider>,
    );

    BRIDGE_NAMES.forEach((name) => expect(typeof window[name]).toBe('function'));

    unmount();

    BRIDGE_NAMES.forEach((name) => expect(window[name]).toBeUndefined());
  });

  test('markPrsBusy/clearPrsBusy via window bridge update busyPrNumbers', () => {
    render(
      <PrActivityQueueProvider>
        <Probe />
      </PrActivityQueueProvider>,
    );

    act(() => {
      window.markPrsBusy(['1', '2'], 'owner/repo');
    });
    expect(Array.from(ProbeLastValue.busyPrNumbers).sort()).toEqual(['owner/repo::1', 'owner/repo::2']);

    act(() => {
      window.clearPrsBusy(['1'], 'owner/repo');
    });
    expect(Array.from(ProbeLastValue.busyPrNumbers)).toEqual(['owner/repo::2']);
  });

  test('markPrsQueued/clearPrsQueued via window bridge update queuedPrNumbers', () => {
    render(
      <PrActivityQueueProvider>
        <Probe />
      </PrActivityQueueProvider>,
    );

    act(() => {
      window.markPrsQueued(['5'], 'owner/repo');
    });
    expect(Array.from(ProbeLastValue.queuedPrNumbers)).toEqual(['owner/repo::5']);

    act(() => {
      window.clearPrsQueued(['5'], 'owner/repo');
    });
    expect(Array.from(ProbeLastValue.queuedPrNumbers)).toEqual([]);
  });

  test('direct markPrBusy/clearPrBusy context methods also work (used by PrTableApp withPrBusy)', () => {
    render(
      <PrActivityQueueProvider>
        <Probe />
      </PrActivityQueueProvider>,
    );

    act(() => {
      ProbeLastValue.markPrBusy('7', 'owner/repo');
    });
    expect(Array.from(ProbeLastValue.busyPrNumbers)).toEqual(['owner/repo::7']);
  });

  test('a multi-chunk bulk batch flows through begin -> in-flight -> done -> finish', () => {
    render(
      <PrActivityQueueProvider>
        <Probe />
      </PrActivityQueueProvider>,
    );

    act(() => {
      window.beginBulkActionBatch({
        batchId: 'batch-1',
        actionLabel: 'Ack/Clear',
        repo: 'owner/repo',
        chunks: [['1', '2'], ['3', '4']],
      });
    });
    expect(ProbeLastValue.bulkBatches).toHaveLength(1);
    expect(ProbeLastValue.bulkBatches[0].totalChunks).toBe(2);

    act(() => {
      window.markBulkActionChunkInFlight({ batchId: 'batch-1', chunkIndex: 0 });
    });
    expect(ProbeLastValue.bulkBatches[0].chunks[0].state).toBe('in-flight');

    act(() => {
      window.markBulkActionChunkDone({ batchId: 'batch-1', chunkIndex: 0 });
    });
    expect(ProbeLastValue.bulkBatches[0].doneCount).toBe(1);

    act(() => {
      window.finishBulkActionBatch({ batchId: 'batch-1' });
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
      window.beginBulkActionBatch({
        batchId: 'batch-1',
        actionLabel: 'Ack/Clear',
        repo: 'owner/repo',
        chunks: [['1', '2'], ['3', '4']],
      });
    });

    act(() => {
      window.markBulkActionChunkDone({ batchId: 'batch-1', chunkIndex: 0, ok: false });
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
      window.beginBulkActionBatch({
        batchId: 'batch-1',
        actionLabel: 'Ack/Clear',
        repo: 'owner/repo',
        chunks: [['1', '2', '3']],
      });
    });

    expect(ProbeLastValue.bulkBatches).toEqual([]);
  });
});
