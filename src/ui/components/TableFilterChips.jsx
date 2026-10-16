/**
 * TableFilterChips - the removable "filter is applied" chip row shown
 * above the PR table (Data Views tab). Unlike AppliedFilterSummary.jsx
 * (the Run & Filter tab's own non-interactive summary chips, which mix in
 * rows/last-run/scheduler text), every chip here represents exactly one
 * non-default row-filter and can be cleared on its own via its "x" button.
 *
 * @module components/TableFilterChips
 */

export function TableFilterChips({ chips }) {
  const safeChips = Array.isArray(chips) ? chips : [];

  if (safeChips.length === 0) {
    return null;
  }

  return (
    <div id="table-filter-chips" className="applied-filter-chips">
      {safeChips.map((chip) => (
        <span key={chip.id} className="applied-filter-chip applied-filter-chip-removable">
          {chip.label}
          <button
            type="button"
            className="applied-filter-chip-remove"
            aria-label={`Remove filter: ${chip.label}`}
            onClick={chip.onRemove}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}
