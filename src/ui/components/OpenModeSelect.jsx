/**
 * OpenModeSelect - React-owned "Open mode" dropdown (Run Script options).
 *
 * Phase 2 (see REACT_MIGRATION_PLAN.md), same pattern as ScopeFilterSelect.
 *
 * @module components/OpenModeSelect
 */

import React, { useState } from 'react';

export function OpenModeSelect({ initialValue = 'none' }) {
  const [value, setValue] = useState(initialValue);

  return (
    <select id="open-mode" name="openMode" value={value} onChange={(e) => setValue(e.target.value)}>
      <option value="none">none</option>
      <option value="changed">changed</option>
      <option value="all">all</option>
    </select>
  );
}
