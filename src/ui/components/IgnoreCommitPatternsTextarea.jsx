/**
 * IgnoreCommitPatternsTextarea - React-owned "Ignore commits matching
 * patterns (regex, one per line)" textarea for the Change Detection
 * Filters section.
 *
 * Phase 2 (see REACT_MIGRATION_PLAN.md). The only <textarea> converted so
 * far - otherwise the same shape as ScopeFilterSelect: its "change" ->
 * persist + apply behavior is handled by the delegated listener on
 * `<form id="run-script-form">` (gotcha #3), and restoreUiOptionOverrides
 * writes through the native value setter (setText, via
 * setNativeValueAndDispatch) rather than a plain `.value = ...`
 * assignment, so an externally-restored value is picked up by this
 * controlled component the same way it would be for an <input>/<select>.
 *
 * @module components/IgnoreCommitPatternsTextarea
 */

import React, { useState } from 'react';

export function IgnoreCommitPatternsTextarea({ initialValue = '' }) {
  const [value, setValue] = useState(initialValue);

  return (
    <textarea
      id="change-filter-ignore-commit-patterns"
      name="changeFilterIgnoreCommitPatterns"
      rows="4"
      placeholder={'^docs: \n^test: \n^chore: update dependencies\n^style: formatting'}
      aria-describedby="commit-patterns-help"
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  );
}
