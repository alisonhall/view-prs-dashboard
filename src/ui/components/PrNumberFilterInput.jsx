/**
 * PrNumberFilterInput - React-owned "Filter by PR number(s)" input.
 *
 * Phase 2 (Filters & Controls), first slice: this is the first Run & Filter
 * control converted to a real React component (see REACT_MIGRATION_PLAN.md).
 * It renders the exact same `<input id="filter-pr-numbers">` element
 * vanilla used to render statically, so every existing vanilla read
 * (`getElementById("filter-pr-numbers").value`) keeps working unchanged -
 * this component is additive, not a rewrite of the filter pipeline.
 *
 * Two things make a React-owned form field safe to drop into an otherwise
 * vanilla form without a bigger rewrite:
 *  1. Vanilla code reads/writes this element by id via the DOM, not through
 *     React - a real DOM node with id="filter-pr-numbers" is all it needs,
 *     regardless of what rendered it.
 *  2. Vanilla's own addEventListener("change"/"input", ...) calls on this
 *     element still fire normally: those are real native DOM events, which
 *     React's synthetic event system is built on top of, not a replacement
 *     for.
 * The one gap this doesn't cover for free is external code assigning
 * `.value` directly (as index.page.js's restoreUiOptionOverrides does to
 * restore a persisted filter on page load) - a controlled React input
 * won't see that, since React tracks value changes through its own
 * property setter. index.page.js's setText() helper was updated to go
 * through the native value setter + dispatch a real 'input' event instead,
 * which is what this component's onChange is listening for below - so
 * restoring a persisted value now updates this component's state too.
 *
 * @module components/PrNumberFilterInput
 */

import React, { useState } from 'react';

export function PrNumberFilterInput({ initialValue = '' }) {
  const [value, setValue] = useState(initialValue);

  return (
    <input
      type="text"
      id="filter-pr-numbers"
      name="filterPrNumbers"
      placeholder="912, 921"
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  );
}
