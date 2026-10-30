import type { PrData } from '../../types/pr-data.ts';
import { useMemo } from 'react';
import { describeActivity, describeSize, findLastActivityAt } from '../../helpers/pr-row-signals.helpers.ts';
import { useActorIdentity } from '../../state/ActorIdentityContext';
import { usePrInsightsDisplay } from '../../state/PrInsightsDisplayContext';
import { buildPrLastCheckedIndicator } from '../../helpers/pr-last-checked-indicator.helpers.ts';
import { Tooltip } from '../ui/Tooltip';
import { useNow } from '../../state/NowContext';

/**
 * The Size and Activity columns. Each is short text with its full value in
 * the tooltip.
 */
export function PrSizeCell({ pr }: { pr: PrData }) {
  const size = describeSize(pr);
  return (
    <td className="pr-cell pr-cell-size">
      {size ? (
        <Tooltip content={size.label} focusTarget>
          <span className="pr-size">
            <span className="pr-size-added">{size.additions}</span>
            <span className="pr-size-deleted">{size.deletions}</span>
          </span>
        </Tooltip>
      ) : (
        <span className="pr-muted">–</span>
      )}
    </td>
  );
}

/**
 * How long since the PR author's last activity, and under it the viewer's
 * own (when they have any) - the times, any merge or close, and when it was
 * last checked for updates (the old Status column's "↻ 5m ago") in the
 * tooltip. The ages have a dotted underline when an open PR's check is
 * stale.
 */
export interface PrActivityCellProps {
  pr: PrData;
  lastCheckedAt: string;
  sectionKey: string;
}

export function PrActivityCell({ pr, lastCheckedAt, sectionKey }: PrActivityCellProps) {
  // Ticks once a minute (NowProvider), so the age keeps moving.
  const now = useNow();
  const { buildActivityEvents } = usePrInsightsDisplay();
  const { normalizeActorLogin } = useActorIdentity();
  // The author's latest event among the ones the pane's Activity tab lists.
  const authorActivityAt = useMemo(
    () => findLastActivityAt(buildActivityEvents(pr, Number.POSITIVE_INFINITY), pr?.authorLogin, (login) => normalizeActorLogin(login)),
    [buildActivityEvents, normalizeActorLogin, pr],
  );
  const activity = describeActivity(pr, now, authorActivityAt);
  const lastChecked = buildPrLastCheckedIndicator({ updatedAt: lastCheckedAt, sectionKey, nowMs: now });
  const label = `${activity.label}\n${lastChecked.title}${lastChecked.isStale ? ' (stale)' : ''}`;
  return (
    <td className="pr-cell pr-cell-activity">
      <Tooltip content={label} focusTarget>
        <span className="pr-activity" data-stale={lastChecked.isStale ? 'true' : undefined}>
          <span className="pr-activity-line">
            <span className="pr-activity-who">Author</span> {activity.authorText}
          </span>
          {activity.viewerText && (
            <span className="pr-activity-line">
              <span className="pr-activity-who">You</span> {activity.viewerText}
            </span>
          )}
        </span>
      </Tooltip>
    </td>
  );
}
