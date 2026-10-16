import { usePrActivityQueue } from '../state/PrActivityQueueContext';

/**
 * Activity drawer feature (see REACT_MIGRATION_PLAN.md): section 4, the
 * one place a REAL ordered queue exists - a chunked bulk ack/apply-label
 * batch (pr-ack-label-actions.helpers.js), surfaced via
 * PrActivityQueueProvider. Deliberately the only section in this drawer
 * that shows a numbered position/order - everywhere else (the scheduled
 * jobs section) explicitly avoids that, since no comparable real queue
 * exists there.
 */
export function ActivityDrawerQueueSection() {
  const { bulkBatches } = usePrActivityQueue();

  if (bulkBatches.length === 0) {
    return null;
  }

  return (
    <section className="activity-drawer-section">
      <h3 className="activity-drawer-section-title">Bulk ack/apply-label queue</h3>
      <p className="activity-drawer-section-caption">
        This is a real queue: chunks run in the order below, a few at a time.
      </p>

      {bulkBatches.map((batch) => {
        const resolvedCount = batch.doneCount + batch.failedCount;
        return (
          <div key={batch.batchId} className="activity-drawer-batch">
            <div className="activity-drawer-batch-header">
              {batch.actionLabel || 'Bulk action'} — chunk {Math.min(resolvedCount + 1, batch.totalChunks)} of{' '}
              {batch.totalChunks}
              {batch.failedCount > 0 && (
                <span className="activity-drawer-batch-failed-count">
                  {' '}
                  ({batch.failedCount} failed)
                </span>
              )}
            </div>
            <ol className="activity-drawer-batch-chunks">
              {batch.chunks.map((chunk) => (
                <li key={chunk.index} className={`activity-drawer-batch-chunk is-${chunk.state}`}>
                  PR(s) {chunk.prNumbers.join(', ')} — {chunk.state.replace('-', ' ')}
                </li>
              ))}
            </ol>
          </div>
        );
      })}
    </section>
  );
}
