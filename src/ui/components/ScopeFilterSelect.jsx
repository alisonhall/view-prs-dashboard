/**
 * ScopeFilterSelect - React-owned "View scope" dropdown.
 *
 * Phase 2 second slice (see REACT_MIGRATION_PLAN.md) - same pattern as
 * PrNumberFilterInput: renders the same `<select id="scope-mode">` vanilla
 * used to render statically, so every existing vanilla read
 * (`getElementById("scope-mode").value`) and the "change" listener that
 * debounces `applyFiltersFromCache()` (see index.page.js) keep working
 * unchanged - real DOM events, not something React's synthetic event
 * system intercepts or replaces.
 *
 * Same restore-race fix applies here as for PrNumberFilterInput:
 * index.page.js's setText() writes through the native value setter and
 * dispatches a real 'input' event (which HTMLSelectElement treats the same
 * as 'change' for React's purposes) so a persisted override picked up
 * after this component mounts still reaches its state; and
 * mountScopeFilterSelect() (react-app.jsx) seeds initialValue from
 * whatever the fallback <select> already shows, in case restore won the
 * race and set it before React replaced the fallback.
 *
 * @module components/ScopeFilterSelect
 */

import React, { useState } from 'react';

export function ScopeFilterSelect({ initialValue = 'all' }) {
  const [value, setValue] = useState(initialValue);

  return (
    <select
      id="scope-mode"
      name="scopeMode"
      value={value}
      onChange={(e) => setValue(e.target.value)}
    >
      <option value="all">All stored rows</option>
      <option value="last-run">Last run rows</option>
      <option value="needs-attention">Needs attention rows</option>
      <option value="needs-attention-or-interacted">Needs attention or interacted rows</option>
    </select>
  );
}
