import React from 'react';

/**
 * Renders the Backfill tab's status badges (Phase 3 - see
 * REACT_MIGRATION_PLAN.md). Mounts directly into the existing
 * `<div id="backfill-badges">` container (like Phase 2's
 * MultiSelectCheckboxList and Phase 1's #pr-sections) rather than a
 * separate wrapper - no container-split needed since nothing else shares
 * that div. Purely a display list (no internal state, unlike
 * MultiSelectCheckboxList's checked-state), so a plain re-render on every
 * `window.updateReactBackfillBadges(badges)` call is enough; no `key` is
 * needed to force a remount.
 */
export function BackfillBadges({ badges = [] }) {
  return (
    <>
      {badges.map((badge, index) => (
        <span
          key={`${badge.text}-${index}`}
          className={`scheduler-badge ${badge.className || ''}`.trim()}
        >
          {badge.text}
        </span>
      ))}
    </>
  );
}
