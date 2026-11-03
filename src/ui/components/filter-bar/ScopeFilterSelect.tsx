import { useFilterState } from '../../state/FilterStateContext';

/**
 * The filter bar's "View scope": which stored rows the table starts from
 * (all, the last run's, those needing attention, or those with
 * conversations you started that someone else resolved, until you confirm
 * them). FilterStateContext's
 * `scopeMode`, saved with the other view filters.
 */
export function ScopeFilterSelect() {
  const { values, setValue } = useFilterState();

  return (
    <select id="scope-mode" name="scopeMode" value={values.scopeMode ?? 'all'} onChange={(event) => setValue('scopeMode', event.target.value)}>
      <option value="all">All stored rows</option>
      <option value="last-run">Last run rows</option>
      <option value="needs-attention">Needs attention rows</option>
      <option value="needs-attention-or-interacted">Needs attention or interacted rows</option>
      <option value="resolved-for-me">Conversations resolved for you to check</option>
    </select>
  );
}
