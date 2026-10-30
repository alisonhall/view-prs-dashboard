import { useEffect, useRef } from 'react';
import { Button } from '../ui/Button';
import { createPrBackfillHelpers } from '../../helpers/pr-backfill.helpers.ts';
import { useBackfillStatus } from '../../state/BackfillStatusContext';

const { shouldAutoScrollBackfillLog, getBackfillScrollTop } = createPrBackfillHelpers();

export interface BackfillLogProps {
  logText: string;
  // Bumped on every log refresh, even one that returns the same text.
  logUpdateTick: number;
  refreshLogDisabled?: boolean;
  onRefreshLog: () => void;
}

/**
 * The Backfill section's log (#backfill-log), with "Auto-scroll log while
 * running" and "Refresh log". While auto-scroll is on and a backfill is
 * running, each refresh scrolls to the newest line (shouldAutoScrollBackfillLog).
 *
 * The scroll sync is keyed on `logUpdateTick`, not the text: polling an
 * unchanged log returns the same text, which wouldn't re-render.
 */
export function BackfillLog({ logText, logUpdateTick, refreshLogDisabled, onRefreshLog }: BackfillLogProps) {
  const autoscrollRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLPreElement>(null);
  const { isBackfillRunning } = useBackfillStatus();

  const syncScrollPosition = () => {
    const log = logRef.current;
    if (!log) return;
    const shouldAutoScroll = shouldAutoScrollBackfillLog({
      autoScrollEnabled: Boolean(autoscrollRef.current?.checked),
      isBackfillRunning: Boolean(isBackfillRunning),
    });
    log.scrollTop = getBackfillScrollTop({
      scrollHeight: log.scrollHeight,
      currentScrollTop: log.scrollTop,
      shouldAutoScroll,
    });
  };

  useEffect(() => {
    syncScrollPosition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logUpdateTick]);

  return (
    <>
      <div className="settings-actions">
        <label className="settings-check">
          <input type="checkbox" id="backfill-log-autoscroll" ref={autoscrollRef} defaultChecked onChange={() => syncScrollPosition()} />
          Auto-scroll log while running
        </label>
        <Button id="backfill-log-refresh-btn" icon="refresh" disabled={Boolean(refreshLogDisabled)} onClick={() => onRefreshLog()}>
          Refresh log
        </Button>
      </div>
      <pre ref={logRef} id="backfill-log" className="settings-output" role="region" aria-label="Backfill log">
        {logText}
      </pre>
    </>
  );
}
