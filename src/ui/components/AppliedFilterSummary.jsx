/**
 * AppliedFilterSummary - the "Applied filters: ..." summary line plus its
 * chip list, shown in the Run & Filter tab's Visibility Filters panel.
 *
 * Phase H.12 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
 * vanilla's renderManagementFilterSummary (helpers/pr-filter-panel.helpers.js)
 * and the window.renderReactFilterSummary push bridge that used to feed this
 * component are both deleted outright - confirmed dead in production.
 * react-app.jsx's AppliedFilterSummaryLive now derives summaryText/
 * filterChips live from Context (useAppliedFilterSummary) and passes them
 * straight to this component as props.
 *
 * @module components/AppliedFilterSummary
 */


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
