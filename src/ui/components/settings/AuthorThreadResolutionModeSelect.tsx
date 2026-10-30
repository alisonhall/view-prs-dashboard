import { useFilterState } from '../../state/FilterStateContext';

/**
 * Attention rules' "PR author thread resolution policy": whether a PR's
 * author may resolve threads others started - always, only for the
 * starters picked, or except for them (AttentionRulesSection shows that
 * list). FilterStateContext's `attentionAuthorThreadResolutionMode`, read
 * by useAuthorThreadResolutionPolicy (the Conversations tab).
 */
export function AuthorThreadResolutionModeSelect() {
  const { values, setValue } = useFilterState();
  return (
    <select
      id="attention-author-thread-resolution-mode"
      name="attentionAuthorThreadResolutionMode"
      value={String(values.attentionAuthorThreadResolutionMode ?? 'allow-all')}
      onChange={(event) => setValue('attentionAuthorThreadResolutionMode', event.target.value)}
    >
      <option value="allow-all">Allow PR authors to resolve all own-PR threads</option>
      <option value="allow-only">Allow only for selected thread starters</option>
      <option value="deny-only">Disallow for selected thread starters</option>
    </select>
  );
}
