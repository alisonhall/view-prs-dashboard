import { useFilterOptions } from '../../state/FilterOptionsContext';
import { useRowFilterSelection } from '../../state/RowFilterSelectionContext';
import { getCheckboxId } from '../MultiSelectCheckboxList';
import type { RowFilterList } from './filter-bar-fields';

const NONE_CHECKED: ReadonlySet<string> = new Set();

/**
 * One of the filter bar's row-filter lists (labels, authors...): a
 * dropdown of checkboxes whose summary says how many are picked. The
 * selection is RowFilterSelectionContext's (RowFilterListSeeding keeps
 * it in step with the options); a click outside closes it
 * (useMultiSelectDropdownClosing, by its .multi-select-dropdown class).
 */
export function FilterMultiSelect({ list }: { list: RowFilterList }) {
  const options = useFilterOptions()[list.optionsKey];
  const { checkedByListId, toggle } = useRowFilterSelection();
  const checked = checkedByListId[list.listId] ?? NONE_CHECKED;

  return (
    <details className="multi-select-dropdown filter-bar-multi-select">
      <summary className="multi-select-summary">
        <span>{list.label}</span>
        {checked.size > 0 && <span className="filter-bar-picked">{checked.size} selected</span>}
      </summary>
      <div id={list.listId} className="multi-select-list" role="group" aria-label={list.label}>
        {options.length === 0 ? (
          <p className="filter-bar-no-options">No options</p>
        ) : (
          options.map((option, index) => {
            const id = getCheckboxId(list.idPrefix, option.value, index);
            return (
              <div className="multi-select-item" key={option.value}>
                <input type="checkbox" id={id} value={option.value} checked={checked.has(option.value)} onChange={() => toggle(list.listId, option.value)} />
                <label htmlFor={id}>{option.label}</label>
              </div>
            );
          })
        )}
      </div>
    </details>
  );
}
