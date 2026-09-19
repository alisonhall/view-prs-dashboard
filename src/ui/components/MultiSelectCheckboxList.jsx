/**
 * MultiSelectCheckboxList - React-owned checkbox items for one multi-select
 * filter dropdown (the "Filter by label name(s)" / author / assigned /
 * approver etc. `<div class="multi-select-list">` containers).
 *
 * Phase 2 (see REACT_MIGRATION_PLAN.md). Unlike every other Phase 2 field so
 * far, this list's *options* themselves are dynamically rebuilt from the PR
 * payload on every data (re)load, not just once at mount - the old vanilla
 * code did `list.innerHTML = ""` and rebuilt every checkbox from scratch on
 * every populate call. The bridge in react-app.jsx reproduces that same
 * discard-and-rebuild semantics by mounting this component with a
 * `key` that changes on every populate call, so its internal `checked`
 * state (below) always re-initializes fresh from the caller-computed
 * `options` prop rather than trying to diff/reconcile against whatever was
 * checked before - the caller (populateIncludeLabelOptions, etc.) already
 * does that diffing itself (seedSelections/selectedTokens) before calling
 * in.
 *
 * React mounts directly into the existing `<div id="...-list">` container
 * (like Phase 1's `#pr-sections`), not into a separate wrapper span - the
 * container's own id/class attributes are untouched by
 * `createRoot(container).render(...)` (it only replaces children), so the
 * vanilla code that reads checked values via
 * `list.querySelectorAll("input[type='checkbox']:checked")`
 * (getSelectedMultiSelectValues), toggles `list.classList` ("empty"), and
 * listens for "change" events on the list container itself (delegation
 * already set up before React ever mounted, since these listeners were
 * always on the stable container rather than on individual checkboxes)
 * all keep working completely unmodified.
 *
 * @module components/MultiSelectCheckboxList
 */

import React, { useState } from 'react';

const getCheckboxId = (idPrefix, value, index) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${idPrefix}-${normalized || 'item'}-${index}`;
};

export function MultiSelectCheckboxList({ options = [], idPrefix }) {
  const [checkedValues, setCheckedValues] = useState(
    () => new Set(options.filter((option) => option.checked).map((option) => option.value)),
  );

  const toggle = (value) => {
    setCheckedValues((previous) => {
      const next = new Set(previous);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  };

  return (
    <>
      {options.map((option, index) => {
        const id = getCheckboxId(idPrefix, option.value, index);
        return (
          <div className="multi-select-item" key={option.value}>
            <input
              type="checkbox"
              id={id}
              value={option.value}
              checked={checkedValues.has(option.value)}
              onChange={() => toggle(option.value)}
            />
            <label htmlFor={id}>{option.label}</label>
          </div>
        );
      })}
    </>
  );
}
