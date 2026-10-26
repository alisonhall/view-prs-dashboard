import { useId, useState } from 'react';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { useTableFilterChips } from '../../state/useTableFilterChips';
import { AlwaysShowInReviewCheckbox } from './AlwaysShowInReviewCheckbox';
import { FilterMultiSelect } from './FilterMultiSelect';
import { FilterOptionSelect } from './FilterOptionSelect';
import { PrNumberFilterInput } from './PrNumberFilterInput';
import { ScopeFilterSelect } from './ScopeFilterSelect';
import { NOTES_FILTER_FIELDS, ROW_FILTER_LISTS } from './filter-bar-fields';

// Whether the bar was left open, per browser (like the detail pane's
// show/hide): closed the first time.
export const FILTER_BAR_OPEN_STORAGE_KEY = 'view-prs:filter-bar-open';

const readOpen = (): boolean => {
  try {
    return window.localStorage.getItem(FILTER_BAR_OPEN_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

const writeOpen = (open: boolean) => {
  try {
    window.localStorage.setItem(FILTER_BAR_OPEN_STORAGE_KEY, String(open));
  } catch {
    // Not remembered (storage blocked); the bar still opens and closes.
  }
};

export interface FilterBarProps {
  // Rows shown, and every stored row; `loaded` is false until the first
  // data load (the counts mean nothing before).
  shownCount: number;
  totalCount: number;
  loaded: boolean;
}

/**
 * The filter bar above the PR table (UI_REDESIGN_PLAN.md, phase 8): the
 * row filters - scope, PR numbers, the label/author/assigned/approver
 * lists, the notes filters, and "Always show PRs in review".
 *
 * Its header always shows: the Filters button (with how many are applied),
 * "Showing N of M PRs", and a removable chip per applied filter with
 * "Clear all". The button opens the panel of controls below it; the bar
 * remembers whether it was left open. Controls stay mounted while it's
 * closed (hidden). The lists' selections are kept in step with their
 * options by <RowFilterListSeeding />, mounted beside it.
 */
export function FilterBar({ shownCount, totalCount, loaded }: FilterBarProps) {
  const { chips } = useTableFilterChips();
  const [open, setOpen] = useState(readOpen);
  const panelId = useId();
  const headingIds = { rows: useId(), people: useId(), notes: useId() };

  const toggleOpen = () => {
    setOpen(!open);
    writeOpen(!open);
  };

  return (
    <section className="filter-bar" aria-label="Filters">
      <div className="filter-bar-header">
        <Button
          icon="filter"
          className="filter-bar-toggle"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={chips.length > 0 ? `Filters, ${chips.length} applied` : 'Filters'}
          onClick={toggleOpen}
        >
          Filters
          {chips.length > 0 && <span className="filter-bar-badge">{chips.length}</span>}
          <Icon name={open ? 'chevronUp' : 'chevronDown'} size={14} />
        </Button>
        <p className="filter-bar-count" aria-live="polite">
          {loaded ? `Showing ${shownCount} of ${totalCount} ${totalCount === 1 ? 'PR' : 'PRs'}` : 'Loading…'}
        </p>
        {chips.length > 0 && (
          <>
            <div id="table-filter-chips" className="applied-filter-chips" role="group" aria-label="Applied table filters">
              {chips.map((chip) => (
                <span key={chip.id} className="applied-filter-chip applied-filter-chip-removable">
                  {chip.label}
                  <button type="button" className="applied-filter-chip-remove" aria-label={`Remove filter: ${chip.label}`} onClick={chip.onRemove}>
                    ×
                  </button>
                </span>
              ))}
            </div>
            <button type="button" className="filter-bar-clear" onClick={() => chips.forEach((chip) => chip.onRemove())}>
              Clear all
            </button>
          </>
        )}
      </div>

      <div id={panelId} className="filter-bar-panel" hidden={!open}>
        <div className="filter-bar-group" role="group" aria-labelledby={headingIds.rows}>
          <h3 id={headingIds.rows} className="filter-bar-heading">
            Rows
          </h3>
          {/* Labels by "for", not wrapping: a wrapping label's text would
              take in a select's option texts. */}
          <div className="filter-bar-field">
            <label htmlFor="scope-mode">View scope</label>
            <ScopeFilterSelect />
          </div>
          <div className="filter-bar-field">
            <label htmlFor="filter-pr-numbers">PR numbers</label>
            <PrNumberFilterInput />
          </div>
          <label className="filter-bar-check">
            <AlwaysShowInReviewCheckbox />
            Always show PRs in review
          </label>
        </div>

        <div className="filter-bar-group" role="group" aria-labelledby={headingIds.people}>
          <h3 id={headingIds.people} className="filter-bar-heading">
            Labels and people
          </h3>
          {ROW_FILTER_LISTS.map((list) => (
            <FilterMultiSelect key={list.listId} list={list} />
          ))}
        </div>

        <div className="filter-bar-group" role="group" aria-labelledby={headingIds.notes}>
          <h3 id={headingIds.notes} className="filter-bar-heading">
            Your notes
          </h3>
          {NOTES_FILTER_FIELDS.map((field) => (
            <div key={field.id} className="filter-bar-field">
              <label htmlFor={field.id}>{field.label}</label>
              <FilterOptionSelect id={field.id} name={field.key} filterStateKey={field.key} options={field.options} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
