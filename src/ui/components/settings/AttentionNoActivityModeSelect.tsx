import { useFilterState } from '../../state/FilterStateContext';

/**
 * Attention rules' "NO_ACTIVITY handling": which PRs with no recent
 * activity count as needing attention. FilterStateContext's
 * `attentionNoActivityMode`.
 */
export function AttentionNoActivityModeSelect() {
  const { values, setValue } = useFilterState();
  return (
    <select
      id="attention-no-activity-mode"
      name="attentionNoActivityMode"
      value={String(values.attentionNoActivityMode ?? 'all')}
      onChange={(event) => setValue('attentionNoActivityMode', event.target.value)}
    >
      <option value="all">Mark all NO_ACTIVITY PRs</option>
      <option value="mine-only">Only NO_ACTIVITY PRs assigned to me or where I am a reviewer</option>
      <option value="assigned-only">Only NO_ACTIVITY PRs assigned to me</option>
      <option value="reviewer-only">Only PRs where I am a reviewer</option>
      <option value="none">Never mark NO_ACTIVITY PRs</option>
    </select>
  );
}
