import { useRuleField } from '../../state/useRuleField';

/**
 * Attention rules' "NO_ACTIVITY handling": which PRs you haven't acted on
 * yet count as needing attention. FilterStateContext's
 * `attentionNoActivityMode`.
 */
export function AttentionNoActivityModeSelect({ describedBy }: { describedBy?: string }) {
  // Every repo's, or the repo's own (Settings › Rules for a repo).
  const { value, setValue } = useRuleField('attentionNoActivityMode');
  return (
    <select
      id="attention-no-activity-mode"
      name="attentionNoActivityMode"
      aria-describedby={describedBy}
      value={String(value ?? 'all')}
      onChange={(event) => setValue(event.target.value)}
    >
      <option value="all">Every NO_ACTIVITY PR</option>
      <option value="mine-only">Only those assigned to me or where I&apos;m a requested reviewer</option>
      <option value="assigned-only">Only those assigned to me</option>
      <option value="reviewer-only">Only those where I&apos;m a requested reviewer</option>
      <option value="none">None</option>
    </select>
  );
}
