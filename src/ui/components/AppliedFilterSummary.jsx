/**
 * AppliedFilterSummary - the "Applied filters: ..." summary line plus its
 * chip list, shown in the Run & Filter tab's Visibility Filters panel.
 * Matches vanilla's renderManagementFilterSummary
 * (helpers/pr-filter-panel.helpers.js), which now delegates to this
 * component via react-app.jsx's renderReactFilterSummary bridge instead of
 * building DOM itself.
 *
 * @module components/AppliedFilterSummary
 */

import React from 'react';

export function AppliedFilterSummary({ summaryText, filterChips }) {
  const chips = (Array.isArray(filterChips) ? filterChips : []).filter(Boolean);

  return (
    <>
      <pre id="management-filter-summary" className="management-filter-summary">
        {summaryText || 'Applied filters summary unavailable.'}
      </pre>
      <div id="management-filter-chips" className="applied-filter-chips">
        {chips.length === 0 ? (
          <span className="applied-filter-chip">No filters applied</span>
        ) : (
          chips.map((label, index) => (
            <span key={`${label}-${index}`} className="applied-filter-chip">
              {String(label)}
            </span>
          ))
        )}
      </div>
    </>
  );
}
