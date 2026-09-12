/**
 * ContextFilterCheckbox - generic React-owned checkbox, Context-backed.
 *
 * Phase 6 (see REACT_MIGRATION_PLAN.md): same generic shape as
 * FilterCheckbox.jsx (id/name-driven, no field-specific behavior), but
 * reads/writes FilterStateProvider's shared Context instead of local
 * `useState` - for fields migrated off the vanilla DOM-is-the-source-of-
 * truth pattern. Kept as a separate component rather than adding a
 * Context/local-state branch inside FilterCheckbox itself: FilterCheckbox
 * is still used, unmigrated, by fields with no relationship to filter
 * state (e.g. the Run Script options checkboxes), and forking its
 * behavior by id would contradict its own "no field-specific behavior"
 * design.
 *
 * Each field must have a matching entry in index.page.js's
 * `FILTER_STATE_FIELD_MAP` (DOM id -> Context key) for its value to
 * actually reach the render pipeline/persistence - this component only
 * handles the React side.
 *
 * @module components/ContextFilterCheckbox
 */

import React from 'react';
import { useFilterState } from '../state/FilterStateContext';

export function ContextFilterCheckbox({ id, name, filterStateKey }) {
  const { values, setValue } = useFilterState();

  return (
    <input
      type="checkbox"
      id={id}
      name={name}
      checked={Boolean(values[filterStateKey])}
      onChange={(e) => setValue(filterStateKey, e.target.checked)}
    />
  );
}
