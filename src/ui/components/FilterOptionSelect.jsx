/**
 * FilterOptionSelect - generic React-owned "Any (with/without)"-style
 * select for the six near-identical plain-metadata filters in the "Run &
 * Filter" tab: Custom comments, Other notes, PR difficulty, Rally
 * stories, Rally links, Analysis of PR.
 *
 * Phase 6 (see REACT_MIGRATION_PLAN.md): migrated from local `useState` to
 * `<FilterStateProvider>`'s shared Context via a `filterStateKey` prop -
 * all six of this component's consumers are migrating in the same slice
 * (unlike FilterCheckbox/RunScriptTextInput, which have other,
 * unmigrated consumers), so there was no reason to fork a parallel
 * Context-backed component here; every usage just gained the prop. Each
 * field is part of FilterStateContext's own `values` object, so
 * FilterStateProvider.tsx's debounced persistence watcher already covers
 * it with no separate read path needed.
 *
 * @module components/FilterOptionSelect
 */

import { useFilterState } from '../state/FilterStateContext';

export function FilterOptionSelect({ id, name, options, filterStateKey }) {
  const { values, setValue } = useFilterState();

  return (
    <select
      id={id}
      name={name}
      value={values[filterStateKey] ?? ''}
      onChange={(e) => setValue(filterStateKey, e.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
