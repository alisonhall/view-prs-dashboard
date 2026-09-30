
/**
 * Renders a `{text, className}[]` badge list as `<span class="scheduler-badge ...">`
 * chips. Originally built for the Backfill tab's status badges (Phase 3 -
 * see REACT_MIGRATION_PLAN.md), and reused as-is (post-Phase-6 follow-up)
 * for the Activity tab's Request Activity and Auto Refresh Scheduler badge
 * lists - all three were the same "compute a badges array, hand it to
 * React" vanilla shape, so this component has no Backfill-specific logic
 * to begin with. Each mounts directly into its own existing
 * `<div id="...-badges">` container (like Phase 2's MultiSelectCheckboxList
 * and Phase 1's #pr-sections) rather than a separate wrapper - no
 * container-split needed since nothing else shares those divs. Purely a
 * display list (no internal state, unlike MultiSelectCheckboxList's
 * checked-state), so a plain re-render on every `window.updateReactXxxBadges(badges)`
 * call is enough; no `key` is needed to force a remount.
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
