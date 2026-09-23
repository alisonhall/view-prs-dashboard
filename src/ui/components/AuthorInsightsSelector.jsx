/**
 * AuthorInsightsSelector - React-owned "Author" dropdown for the Author
 * Insights tab, replacing pr-author-insights.component.js's
 * renderAuthorSelector() (deleted).
 *
 * Track C (post-Phase-6 follow-up, see REACT_MIGRATION_PLAN.md): reads
 * `payload`/`selectedAuthorLogin` straight from PrDataContext instead of
 * being pushed a pre-built option list + selected login via
 * window.updateAuthorInsightsSelector (deleted) - options are rebuilt from
 * the raw payload via window.buildAuthorInsightsEntries (already used
 * internally by renderAuthorInsights for its own auto-select-first-author
 * validation, now also exposed for this component). Options are
 * deliberately empty when there are no local rows at all, even if
 * actorsMap has entries on its own - matching renderAuthorInsights' own
 * "No local rows"/"No authors found" empty-state guards, which this
 * replaces.
 *
 * Since `selectedAuthorLogin` is now a real reactive Context value (kept
 * in sync by renderAuthorInsights, including its auto-select-first-author
 * fallback), the <select> can be a plain controlled input - no more local
 * useState/incrementing-`key` remount hack needed to catch external
 * selection changes.
 *
 * Selecting a different author still calls back into vanilla via
 * onChange, which mutates authorInsightsState.selectedAuthorLogin and
 * re-runs renderAuthorInsights (through window.selectAuthorInsightsAuthor)
 * - vanilla remains the source of truth for validating the selection and
 * driving the other sections' re-render.
 *
 * @module components/AuthorInsightsSelector
 */

import React from 'react';
import { usePrData } from '../state/PrDataContext';

const buildAuthorInsightsEntries = (rows, actorsMap) =>
  window.buildAuthorInsightsEntries ? window.buildAuthorInsightsEntries(rows, actorsMap) : [];

export function AuthorInsightsSelector({ onChange }) {
  const { payload, selectedAuthorLogin } = usePrData();
  const rows = Object.values(payload?.byPrNumber || {});
  const actorsMap = payload?.actorsMap || {};
  const options = rows.length ? buildAuthorInsightsEntries(rows, actorsMap) : [];

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
          value={selectedAuthorLogin || ''}
          onChange={(e) => onChange?.(e.target.value)}
        >
          {options.map((author) => (
            <option key={author.login} value={author.login}>
              {author.name || author.login}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
