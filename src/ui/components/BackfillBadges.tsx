import type { BackfillBadge } from '../helpers/pr-backfill.helpers.ts';

/**
 * Renders a `{text, className}[]` badge list as `<span class="scheduler-badge ...">`
 * chips: the backfill status (the Settings drawer's Backfill section) and
 * the activity popover's request-activity and backfill badges. No
 * Backfill-specific logic, despite the name; a plain display list.
 */
export function BackfillBadges({ badges = [] }: { badges?: ReadonlyArray<Pick<BackfillBadge, 'text' | 'className'>> }) {
  return (
    <>
      {badges.map((badge, index) => (
        <span key={`${badge.text}-${index}`} className={`scheduler-badge ${badge.className || ''}`.trim()}>
          {badge.text}
        </span>
      ))}
    </>
  );
}
