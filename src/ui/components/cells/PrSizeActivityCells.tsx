import type { PrData, PrEntry } from '../../types/pr-data.ts';
import { useMemo } from 'react';
import { describeActivity, describeSize, findLastActivityAt } from '../../helpers/pr-row-signals.helpers.ts';
import { useActorIdentity } from '../../state/ActorIdentityContext';
import { usePrInsightsDisplay } from '../../state/PrInsightsDisplayContext';
import { describeRepoListing, describeRowFreshness } from '../../helpers/pr-row-freshness.helpers.ts';
import { Tooltip } from '../ui/Tooltip';
import { useNow } from '../../state/NowContext';
import { useRepoFreshness } from '../../state/RepoFreshnessContext';

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
 * own (when they have any) - the times and any merge or close in the
 * tooltip, with how current the row is (pr-row-freshness.helpers.ts): when
 * an open PR's summary was last confirmed, and when its details were
 * fetched. The ages have a dotted underline when an open PR is stale, and
 * are dimmed while its details are behind GitHub (they come from them).
 */
export interface PrActivityCellProps {
  pr: PrData;
  entry: PrEntry;
}

export function PrActivityCell({ pr, entry }: PrActivityCellProps) {
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
  const { liveSummary, defaultIntervalMs } = useRepoFreshness();
  const listing = describeRepoListing(liveSummary[String(entry?.repo || '')], { nowMs: now, defaultIntervalMs });
  const freshness = describeRowFreshness({ entry, listing, nowMs: now });
  const label = [activity.label, ...freshness.lines].join('\n');
  return (
    <td className="pr-cell pr-cell-activity">
      <Tooltip content={label} focusTarget>
        <span
          className="pr-activity"
          data-stale={freshness.isStale ? 'true' : undefined}
          data-details-behind={freshness.detailsBehind ? 'true' : undefined}
        >
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
