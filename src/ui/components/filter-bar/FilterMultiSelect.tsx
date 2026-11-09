import { useMemo } from 'react';
import { MultiSelectDropdown } from '../ui/MultiSelectDropdown';
import { useFilterOptions } from '../../state/FilterOptionsContext';
import { useRowFilterSelection } from '../../state/RowFilterSelectionContext';
import { useActorIdentity } from '../../state/ActorIdentityContext';
import { useOptionalPrData } from '../../state/PrDataContext';
import { isActorId } from '../../helpers/pr-actor-identity.helpers.ts';
import type { RowFilterList } from './filter-bar-fields';

const NONE_CHECKED: ReadonlySet<string> = new Set();

/**
 * One of the filter bar's row-filter lists (labels, authors...): a
 * dropdown of checkboxes on RowFilterSelectionContext (ListSelectionSeeding
 * keeps it in step with the options).
 */
export function FilterMultiSelect({ list }: { list: RowFilterList }) {
  const loadedOptions = useFilterOptions()[list.optionsKey];
  const { checkedByListId, toggle } = useRowFilterSelection();
  const checked = checkedByListId[list.listId] ?? NONE_CHECKED;
  // A ticked value no loaded PR has (from a saved view, or saved filters)
  // stays ticked, and listed at the end so it can be unticked - a person
  // (their id) by name.
  const { resolveActorDisplayName } = useActorIdentity();
  const actorsMap = useOptionalPrData()?.payload?.actorsMap;
  const options = useMemo(() => {
    const known = new Set(loadedOptions.map((option) => String(option.value)));
    const missing = Array.from(checked).filter((value) => !known.has(value));
    const labelOf = (value: string) => (isActorId(value) ? resolveActorDisplayName(value, actorsMap || {}) : value);
    return missing.length
      ? [...loadedOptions, ...missing.map((value) => ({ value, label: `${labelOf(value)} · no PRs loaded` }))]
      : loadedOptions;
  }, [loadedOptions, checked, resolveActorDisplayName, actorsMap]);
  return (
    <MultiSelectDropdown
      listId={list.listId}
      label={list.label}
      idPrefix={list.idPrefix}
      options={options}
      checked={checked}
      onToggle={(value) => toggle(list.listId, value)}
      description={list.description}
    />
  );
}
