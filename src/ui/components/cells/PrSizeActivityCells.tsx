import type { PrData } from '../../types/pr-data.ts';
import { describeActivity, describeSize } from '../../helpers/pr-row-signals.helpers.ts';
import { buildPrLastCheckedIndicator } from '../../helpers/pr-last-checked-indicator.helpers.ts';
import { Tooltip } from '../ui/Tooltip';
import { useNow } from '../../state/NowContext';

/**
 * The Size and Activity columns (shown while the detail pane is hidden,
 * from phase 4). Each is short text with its full value in the tooltip.
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
 * How long since the PR's last activity, with that time, the viewer's last
 * activity and when it was last checked for updates in the tooltip (the
 * old Status column's "↻ 5m ago"). The age has a dotted underline when an
 * open PR's check is stale.
 */
export interface PrActivityCellProps {
  pr: PrData;
  lastCheckedAt: string;
  sectionKey: string;
}

export function PrActivityCell({ pr, lastCheckedAt, sectionKey }: PrActivityCellProps) {
  // Ticks once a minute (NowProvider), so the age keeps moving.
  const now = useNow();
  const activity = describeActivity(pr, now);
  const lastChecked = buildPrLastCheckedIndicator({ updatedAt: lastCheckedAt, sectionKey, nowMs: now });
  const label = `${activity.label}\n${lastChecked.title}${lastChecked.isStale ? ' (stale)' : ''}`;
  return (
    <td className="pr-cell pr-cell-activity">
      <Tooltip content={label} focusTarget>
        <span className="pr-activity" data-stale={lastChecked.isStale ? 'true' : undefined}>
          {activity.text}
        </span>
      </Tooltip>
    </td>
  );
}
