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
 * Deferred-items follow-up (full vanilla-to-React sweep, see
 * REACT_MIGRATION_PLAN.md): also owns the "(N selected)" summary count text
 * and the "empty" class on its own portal target now, replacing
 * pr-filter-panel.helpers.js's updateMultiSelectSummary (deleted, along
 * with the classList.add/remove("empty") calls every populateXOptions
 * function and index.page.js's renderActorOptionsList/
 * renderChangeFilterActorList used to make) - both covered every one of
 * the 9 multi-select lists uniformly, so moving the logic in here covers
 * all 9 the same way. Can't just render these as ordinary JSX children:
 * `emptyClassContainer` (the list's own portal target - toggling its class
 * from inside its own JSX isn't possible, a portal only owns a target's
 * children, not the target itself) and `summaryContainer` (a *sibling*
 * <summary class="multi-select-summary"> element, not a descendant of this
 * component's own tree at all) both need a second, explicit mechanism - a
 * ref-driven effect for the former, a second createPortal for the latter.
 * `summaryContainer`'s `data-base-label` attribute (index.html) replaces
 * the old runtime `summary.textContent.split("(")[0].trim()` parsing.
 *
 * @module components/MultiSelectCheckboxList
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const getCheckboxId = (idPrefix, value, index) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${idPrefix}-${normalized || 'item'}-${index}`;
};

export function MultiSelectCheckboxList({ options = [], idPrefix, emptyClassContainer, summaryContainer }) {
  const [checkedValues, setCheckedValues] = useState(
    () => new Set(options.filter((option) => option.checked).map((option) => option.value)),
  );

  useEffect(() => {
    emptyClassContainer?.classList.toggle('empty', options.length === 0);
  }, [emptyClassContainer, options.length]);

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

  const checkedCount = checkedValues.size;
  const baseLabel = summaryContainer?.dataset.baseLabel || '';
  const summaryText = checkedCount > 0 ? `${baseLabel} (${checkedCount} selected)` : baseLabel;

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
      {summaryContainer && createPortal(summaryText, summaryContainer)}
    </>
  );
}
