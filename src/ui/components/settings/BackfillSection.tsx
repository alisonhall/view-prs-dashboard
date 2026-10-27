import { Button } from '../ui/Button';
import { BackfillBadges } from '../BackfillBadges';
import { useBackfillStatus } from '../../state/BackfillStatusContext';
import { useBackfillActions } from '../../state/useBackfillActions';
import { useBackfillAutoRefresh } from '../../state/useBackfillAutoRefresh';
import { BackfillLog } from './BackfillLog';

/**
 * The Settings drawer's "Backfill" (UI_REDESIGN_PLAN.md, phase 9b): the
 * background backfill of missing/old PR rows - its status badges, Start /
 * Stop / Refresh status, the status details, and the log (collapsed).
 * The display state is BackfillStatusProvider's; this section owns the
 * actions (useBackfillActions) and the loads: once at page load, as the
 * drawer is always mounted (the activity popover shows the same badges),
 * then each time this section is opened (useBackfillAutoRefresh).
 */
export function BackfillSection() {
  const { backfillBadges, backfillButtonState, backfillDetailsText, backfillLogText, backfillLogUpdateTick } = useBackfillStatus();
  const { handleBackfillAction, refreshBackfillStatus, refreshBackfillLogTail, triggerBackfillTabLoad } = useBackfillActions();
  useBackfillAutoRefresh(triggerBackfillTabLoad);

  return (
    <div className="settings-section">
      <div className="settings-group">
        <p className="subtle-copy">
          Finds stored PR rows with missing or old data and refreshes them one at a time, in the background (backfill-missing-data.js). Rarely
          needed.
        </p>
        <div id="backfill-badges" className="scheduler-badges" role="group" aria-label="Backfill status badges">
          <BackfillBadges badges={backfillBadges.badges} />
        </div>
        <div className="settings-actions">
          <Button id="backfill-start-btn" disabled={backfillButtonState.startDisabled} onClick={() => handleBackfillAction('start')}>
            Start backfill
          </Button>
          <Button id="backfill-stop-btn" disabled={backfillButtonState.stopDisabled} onClick={() => handleBackfillAction('stop')}>
            Stop backfill
          </Button>
          <Button id="backfill-refresh-btn" icon="refresh" disabled={backfillButtonState.refreshDisabled} onClick={() => refreshBackfillStatus()}>
            Refresh status
          </Button>
        </div>
        <pre id="backfill-details" className="settings-output" role="region" aria-label="Backfill status details">
          {backfillDetailsText}
        </pre>
      </div>

      <details className="settings-group settings-details">
        <summary>Log details</summary>
        <BackfillLog
          logText={backfillLogText}
          logUpdateTick={backfillLogUpdateTick}
          refreshLogDisabled={backfillButtonState.refreshLogDisabled}
          onRefreshLog={() => refreshBackfillLogTail()}
        />
      </details>
    </div>
  );
}
