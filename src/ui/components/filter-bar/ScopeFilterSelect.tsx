import { useFilterState } from '../../state/FilterStateContext';

/**
 * The filter bar's "View scope": which stored rows the table starts from
 * (all, the last run's, those needing attention, or those with
 * conversations you started that someone else resolved, until you confirm
 * them). FilterStateContext's
 * `scopeMode`, saved with the other view filters.
 */
// What each scope keeps, said under the select (SCOPE_HINT_ID).
export const SCOPE_DESCRIPTIONS: Record<string, string> = {
  all: 'Every stored row: all the PRs your sources follow.',
  'last-run': "The rows each repo's latest full refresh saw, plus PRs added since.",
  'needs-attention': 'PRs that need your attention (the warning icon) - Settings › Attention rules decides which.',
  'needs-attention-or-interacted': "Those, plus PRs you've taken part in (commented on, reviewed or pushed to).",
  'resolved-for-me': 'PRs with conversations you started that someone else resolved, until you confirm them.',
};
export const SCOPE_HINT_ID = 'scope-mode-hint';

export function ScopeFilterSelect() {
  const { values, setValue } = useFilterState();

  return (
    <select
      id="scope-mode"
      name="scopeMode"
      aria-describedby={SCOPE_HINT_ID}
      value={values.scopeMode ?? 'all'}
      onChange={(event) => setValue('scopeMode', event.target.value)}
    >
      <option value="all">All stored rows</option>
      <option value="last-run">Last run rows</option>
      <option value="needs-attention">Needs attention rows</option>
      <option value="needs-attention-or-interacted">Needs attention or interacted rows</option>
      <option value="resolved-for-me">Conversations resolved for you to check</option>
    </select>
  );
}
