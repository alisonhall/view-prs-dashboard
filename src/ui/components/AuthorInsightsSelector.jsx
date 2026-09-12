/**
 * AuthorInsightsSelector - React-owned "Author" dropdown for the Author
 * Insights tab, replacing pr-author-insights.component.js's
 * renderAuthorSelector().
 *
 * Phase 3 (see REACT_MIGRATION_PLAN.md). Unlike Review Stats' controls
 * (ReviewStatsControls.jsx), this selector's *options* are rebuilt from
 * the PR payload on every author-insights render, not seeded once at
 * mount - the same shape as Phase 2's MultiSelectCheckboxList. Mounted
 * once into the static #author-insights-selector-root container and
 * updated via window.updateAuthorInsightsSelector(options, selectedLogin),
 * which re-renders with an incrementing `key` each call so this
 * component's internal state always re-initializes fresh from the
 * caller-computed props, matching the old vanilla behavior of discarding
 * and rebuilding the <select> from scratch on every render (see
 * MultiSelectCheckboxList.jsx's own comment for the same reasoning).
 *
 * Selecting a different author calls back into vanilla via onChange,
 * which mutates authorInsightsState.selectedAuthorLogin and re-runs
 * renderAuthorInsights (through the same window.selectAuthorInsightsAuthor
 * bridge index.page.js exposes) - vanilla remains the source of truth for
 * *when* a re-render happens and what the other sections show, same as
 * every other Phase 1-3 bridge.
 *
 * @module components/AuthorInsightsSelector
 */

import React, { useState } from 'react';

export function AuthorInsightsSelector({ options, selectedLogin, onChange }) {
  const [value, setValue] = useState(selectedLogin || '');

  if (!options.length) {
    return null;
  }

  return (
    <div className="author-insights-controls">
      <label className="author-insights-label">
        Author
        <select
          id="author-insights-select"
          className="author-insights-select"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            onChange?.(e.target.value);
          }}
        >
          {options.map((author) => (
            <option key={author.login} value={author.login}>
              {author.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
