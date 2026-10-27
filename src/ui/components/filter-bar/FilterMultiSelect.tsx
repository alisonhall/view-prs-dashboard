import { MultiSelectDropdown } from '../ui/MultiSelectDropdown';
import { useFilterOptions } from '../../state/FilterOptionsContext';
import { useRowFilterSelection } from '../../state/RowFilterSelectionContext';
import type { RowFilterList } from './filter-bar-fields';

const NONE_CHECKED: ReadonlySet<string> = new Set();

/**
 * One of the filter bar's row-filter lists (labels, authors...): a
 * dropdown of checkboxes on RowFilterSelectionContext (ListSelectionSeeding
 * keeps it in step with the options).
 */
export function FilterMultiSelect({ list }: { list: RowFilterList }) {
  const options = useFilterOptions()[list.optionsKey];
  const { checkedByListId, toggle } = useRowFilterSelection();
  return (
    <MultiSelectDropdown
      listId={list.listId}
      label={list.label}
      idPrefix={list.idPrefix}
      options={options}
      checked={checkedByListId[list.listId] ?? NONE_CHECKED}
      onToggle={(value) => toggle(list.listId, value)}
    />
  );
}
