/**
 * AttentionNoActivityModeSelect - React-owned "NO_ACTIVITY handling" dropdown.
 *
 * Phase 6 (see REACT_MIGRATION_PLAN.md): migrated from local `useState` to
 * `<FilterStateProvider>`'s shared Context, same treatment as
 * ScopeFilterSelect/AlwaysShowInReviewCheckbox in Slice 1 -
 * `getNeedsAttentionConfig` (index.page.js) now reads this field's value
 * via `FILTER_STATE_FIELD_MAP`/`getFilterStateOverrideForFieldId` instead
 * of `.value` off this element.
 *
 * @module components/AttentionNoActivityModeSelect
 */

import { useFilterState } from '../state/FilterStateContext';

export function AttentionNoActivityModeSelect() {
  const { values, setValue } = useFilterState();

  return (
    <select
      id="attention-no-activity-mode"
      name="attentionNoActivityMode"
      value={values.attentionNoActivityMode}
      onChange={(e) => setValue('attentionNoActivityMode', e.target.value)}
    >
      <option value="all">Mark all NO_ACTIVITY PRs</option>
      <option value="mine-only">Only NO_ACTIVITY PRs assigned to me or where I am a reviewer</option>
      <option value="assigned-only">Only NO_ACTIVITY PRs assigned to me</option>
      <option value="reviewer-only">Only PRs where I am a reviewer</option>
      <option value="none">Never mark NO_ACTIVITY PRs</option>
    </select>
  );
}
