/**
 * FilterOptionSelect - generic React-owned "Any (with/without)"-style
 * select for the six near-identical plain-metadata filters in the "Run &
 * Filter" tab: Custom comments, Other notes, PR difficulty, Rally
 * stories, Rally links, Analysis of PR.
 *
 * Phase 2 (see REACT_MIGRATION_PLAN.md). Like RunScriptTextInput/
 * OpenModeSelect, none of these fields ever had a vanilla "change"
 * listener or a persisted override - each is only read via `.value` when
 * "Apply filters (local)" is clicked (getCustomCommentsFilter etc. in
 * pr-filter-panel.component.js), so this needs only the standard
 * restore-race handling every Phase 2 field gets (none of these actually
 * restore anything, but the mount pattern stays consistent), not the
 * event-delegation or flushSync fixes other categories needed.
 *
 * @module components/FilterOptionSelect
 */

import React, { useState } from 'react';

export function FilterOptionSelect({ id, name, options, initialValue = '' }) {
  const [value, setValue] = useState(initialValue);

  return (
    <select id={id} name={name} value={value} onChange={(e) => setValue(e.target.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
