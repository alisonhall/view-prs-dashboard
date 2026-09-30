/**
 * ContextRunScriptTextInput - generic React-owned text/number input,
 * Context-backed.
 *
 * Phase 6 (see REACT_MIGRATION_PLAN.md): same generic shape as
 * RunScriptTextInput.jsx (id/name/type/placeholder-driven, no
 * field-specific behavior), but reads/writes FilterStateProvider's shared
 * Context instead of local `useState` - for the four "Run Script options"
 * text/number fields (repo, Open PR limit, Merged PR limit, Parallel
 * jobs). Kept as a separate component rather than branching
 * RunScriptTextInput itself, same reasoning as ContextFilterCheckbox vs.
 * FilterCheckbox - there's no other consumer of this one yet, but the
 * pattern stays consistent either way.
 *
 * @module components/ContextRunScriptTextInput
 */

import { useFilterState } from '../state/FilterStateContext';

export function ContextRunScriptTextInput({ id, name, type = 'text', placeholder = '', filterStateKey }) {
  const { values, setValue } = useFilterState();

  return (
    <input
      type={type}
      id={id}
      name={name}
      placeholder={placeholder}
      {...(type === 'number' ? { min: 1 } : {})}
      value={values[filterStateKey] ?? ''}
      onChange={(e) => setValue(filterStateKey, e.target.value)}
    />
  );
}
