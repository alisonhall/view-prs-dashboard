import { useFilterState } from '../../state/FilterStateContext';
import { isLastActivityRangeReversed } from '../../helpers/pr-last-activity-range.helpers.ts';

/**
 * The filter bar's "Last activity" range: two dates bound to
 * filterLastActivityFrom / filterLastActivityTo, either one empty for no
 * limit on that side (pr-last-activity-range.helpers.ts decides what
 * matches).
 */
export function LastActivityRangeFilter() {
  const { values, setValue } = useFilterState();
  const from = String(values.filterLastActivityFrom ?? '');
  const to = String(values.filterLastActivityTo ?? '');
  const reversed = isLastActivityRangeReversed(from, to);

  return (
    <fieldset className="filter-bar-field filter-bar-date-range" aria-describedby="filter-last-activity-hint">
      <legend>Last activity</legend>
      <div className="filter-bar-date-range-inputs">
        <label htmlFor="filter-last-activity-from">From</label>
        <input
          id="filter-last-activity-from"
          type="date"
          value={from}
          max={to || undefined}
          onChange={(event) => setValue('filterLastActivityFrom', event.target.value)}
        />
        <label htmlFor="filter-last-activity-to">To</label>
        <input
          id="filter-last-activity-to"
          type="date"
          value={to}
          min={from || undefined}
          onChange={(event) => setValue('filterLastActivityTo', event.target.value)}
        />
      </div>
      <p id="filter-last-activity-hint" className="filter-bar-hint">
        When anything last happened on the PR on GitHub (a comment, review, push, label, merge or close), both days
        included. Leave a date empty for no limit on that side.
      </p>
      {reversed && (
        <p className="filter-bar-hint filter-bar-warning" role="status">
          The start date is after the end date, so no PR matches.
        </p>
      )}
    </fieldset>
  );
}
