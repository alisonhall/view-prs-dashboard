/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { PrActivityQueueContext } = require('../state/PrActivityQueueContext');
const { ActivityDrawerQueueSection } = require('./ActivityDrawerQueueSection');

const renderWithBatches = (bulkBatches) =>
  render(
    <PrActivityQueueContext.Provider
      value={{
        busyPrNumbers: new Set(),
        queuedPrNumbers: new Set(),
        markPrBusy: () => {},
        clearPrBusy: () => {},
        markPrQueued: () => {},
        clearPrQueued: () => {},
        bulkBatches,
      }}
    >
      <ActivityDrawerQueueSection />
    </PrActivityQueueContext.Provider>,
  );

describe('ActivityDrawerQueueSection', () => {
  test('renders nothing when there are no tracked batches', () => {
    const { container } = renderWithBatches([]);
    expect(container).toBeEmptyDOMElement();
  });

  test('renders chunks in true array order with a "chunk X of Y" header', () => {
    renderWithBatches([
      {
        batchId: 'batch-1',
        actionLabel: 'Ack/Clear',
        repo: 'owner/repo',
        totalChunks: 3,
        doneCount: 1,
        failedCount: 0,
        chunks: [
          { index: 0, prNumbers: ['1', '2'], state: 'done' },
          { index: 1, prNumbers: ['3', '4'], state: 'in-flight' },
          { index: 2, prNumbers: ['5'], state: 'waiting' },
        ],
      },
    ]);

    expect(screen.getByText(/Ack\/Clear — chunk 2 of 3/)).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toMatch(/PR\(s\) 1, 2 — done/);
    expect(items[1].textContent).toMatch(/PR\(s\) 3, 4 — in flight/);
    expect(items[2].textContent).toMatch(/PR\(s\) 5 — waiting/);
  });

  test('this is the only drawer section allowed to show a numbered position - copy must say "chunk N of M"', () => {
    renderWithBatches([
      {
        batchId: 'batch-1',
        actionLabel: 'Apply label',
        repo: 'owner/repo',
        totalChunks: 2,
        doneCount: 0,
        failedCount: 0,
        chunks: [
          { index: 0, prNumbers: ['1'], state: 'waiting' },
          { index: 1, prNumbers: ['2'], state: 'waiting' },
        ],
      },
    ]);

    expect(screen.getByText(/chunk 1 of 2/)).toBeInTheDocument();
  });

  test('a failed chunk renders as "failed", distinct from "done", and the batch header shows the failed count', () => {
    renderWithBatches([
      {
        batchId: 'batch-1',
        actionLabel: 'Ack/Clear',
        repo: 'owner/repo',
        totalChunks: 2,
        doneCount: 0,
        failedCount: 1,
        chunks: [
          { index: 0, prNumbers: ['1', '2'], state: 'failed' },
          { index: 1, prNumbers: ['3', '4'], state: 'waiting' },
        ],
      },
    ]);

    const items = screen.getAllByRole('listitem');
    expect(items[0].textContent).toMatch(/PR\(s\) 1, 2 — failed/);
    expect(items[0]).toHaveClass('is-failed');
    expect(screen.getByText(/\(1 failed\)/)).toBeInTheDocument();
    // Resolved (done + failed) count advances the "chunk N of M" header the
    // same as a success would - a failed chunk isn't retried on its own,
    // it's resolved, just unsuccessfully.
    expect(screen.getByText(/chunk 2 of 2/)).toBeInTheDocument();
  });

  test('a batch with no failed chunks shows no failed-count annotation', () => {
    renderWithBatches([
      {
        batchId: 'batch-1',
        actionLabel: 'Ack/Clear',
        repo: 'owner/repo',
        totalChunks: 2,
        doneCount: 1,
        failedCount: 0,
        chunks: [
          { index: 0, prNumbers: ['1'], state: 'done' },
          { index: 1, prNumbers: ['2'], state: 'waiting' },
        ],
      },
    ]);

    expect(screen.queryByText(/failed/)).not.toBeInTheDocument();
  });
});
