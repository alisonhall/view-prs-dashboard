/**
 * AuthorThreadResolutionModeSelect - React-owned "PR author thread
 * resolution policy" dropdown.
 *
 * Phase 6 (see REACT_MIGRATION_PLAN.md): migrated from local `useState` to
 * `<FilterStateProvider>`'s shared Context. This one has dependent UI (two
 * <details class="multi-select-dropdown"> sibling elements that show/hide
 * based on the selected mode) - as of Phase H.7, that's
 * AuthorThreadResolutionRuleVisibility.jsx, which reads this same Context
 * field directly instead of a vanilla DOM-mutating bridge
 * (updateAuthorThreadResolutionRuleVisibility, formerly in index.page.js,
 * deleted in that phase). The one canonical read site, formerly
 * `getAuthorThreadResolutionPolicy` (index.page.js), was updated to prefer
 * Context then - and has since moved entirely into
 * ReviewThreadsSection.jsx's own useAuthorThreadResolutionPolicy hook,
 * which reads this same field from FilterStateContext directly (falling
 * back to a DOM read only where no <FilterStateProvider> is mounted - see
 * that hook's own comment).
 *
 * @module components/AuthorThreadResolutionModeSelect
 */

import { useFilterState } from '../state/FilterStateContext';

export function AuthorThreadResolutionModeSelect() {
  const { values, setValue } = useFilterState();

  return (
    <select
      id="attention-author-thread-resolution-mode"
      name="attentionAuthorThreadResolutionMode"
      value={values.attentionAuthorThreadResolutionMode}
      onChange={(e) => setValue('attentionAuthorThreadResolutionMode', e.target.value)}
    >
      <option value="allow-all">Allow PR authors to resolve all own-PR threads</option>
      <option value="allow-only">Allow only for selected thread starters</option>
      <option value="deny-only">Disallow for selected thread starters</option>
    </select>
  );
}
