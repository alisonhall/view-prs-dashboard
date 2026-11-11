import { useFilterState } from '../../state/FilterStateContext';
import { NON_CREDENTIAL_INPUT_PROPS } from '../../helpers/form-parsing.helpers.ts';
import { Icon } from '../ui/Icon';

export const FILTER_SEARCH_HINT = 'Titles, authors, branch names and your notes. Every word has to match.';

/**
 * The filter bar's search box (FilterStateContext's `filterSearch`): rows
 * whose title, author, branch names or notes have every word typed
 * (pr-row-search.helpers.ts). The table applies it debounced
 * (useVisiblePrNumbers). Escape clears it. Not saved: a reload starts
 * without one.
 */
export function FilterSearchInput() {
  const { values, setValue } = useFilterState();
  const value = values.filterSearch ?? '';

  return (
    <div className="filter-bar-search">
      <Icon name="search" size={14} />
      <label htmlFor="filter-search" className="ui-visually-hidden">
        Search PRs
      </label>
      <input
        type="search"
        id="filter-search"
        name="filterSearch"
        placeholder="Search PRs"
        title={FILTER_SEARCH_HINT}
        aria-describedby="filter-search-hint"
        {...NON_CREDENTIAL_INPUT_PROPS}
        value={value}
        onChange={(event) => setValue('filterSearch', event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && value) {
            event.preventDefault();
            setValue('filterSearch', '');
          }
        }}
      />
      <span id="filter-search-hint" className="ui-visually-hidden">
        {FILTER_SEARCH_HINT}
      </span>
    </div>
  );
}
