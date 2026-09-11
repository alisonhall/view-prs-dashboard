/**
 * RunScriptTextInput - generic React-owned text/number input for the "Run
 * Script options" fieldset (repo, Open PR limit, Merged PR limit, Parallel
 * jobs).
 *
 * Phase 2 (see REACT_MIGRATION_PLAN.md). Same reasoning as FilterCheckbox:
 * one parameterized component (`id`/`name`/`type`/`placeholder`/
 * `initialValue` props) reused across four otherwise-identical fields
 * instead of four near-duplicate files.
 *
 * @module components/RunScriptTextInput
 */

import React, { useState } from 'react';

export function RunScriptTextInput({ id, name, type = 'text', placeholder = '', initialValue = '' }) {
  const [value, setValue] = useState(initialValue);

  return (
    <input
      type={type}
      id={id}
      name={name}
      placeholder={placeholder}
      {...(type === 'number' ? { min: 1 } : {})}
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  );
}
