import { useFilterState } from '../../state/FilterStateContext';

/**
 * Attention rules' "NO_ACTIVITY handling": which PRs you haven't acted on
 * yet count as needing attention. FilterStateContext's
 * `attentionNoActivityMode`.
 */
export function AttentionNoActivityModeSelect({ describedBy }: { describedBy?: string }) {
  const { values, setValue } = useFilterState();
  return (
    <select
      id="attention-no-activity-mode"
      name="attentionNoActivityMode"
      aria-describedby={describedBy}
      value={String(values.attentionNoActivityMode ?? 'all')}
      onChange={(event) => setValue('attentionNoActivityMode', event.target.value)}
    >
      <option value="all">Every NO_ACTIVITY PR</option>
      <option value="mine-only">Only those assigned to me or where I&apos;m a requested reviewer</option>
      <option value="assigned-only">Only those assigned to me</option>
      <option value="reviewer-only">Only those where I&apos;m a requested reviewer</option>
      <option value="none">None</option>
    </select>
  );
}
