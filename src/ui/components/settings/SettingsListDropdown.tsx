import { useMemo } from 'react';
import { MultiSelectDropdown } from '../ui/MultiSelectDropdown';
import { useFilterOptions } from '../../state/FilterOptionsContext';
import type { CheckedByListIdValue } from '../../state/useCheckedByListIdState';
import type { SettingsList } from './settings-fields';

const NONE_CHECKED: ReadonlySet<string> = new Set();

/**
 * One of the Settings drawer's actor lists (MultiSelectDropdown) on its
 * selection Context - AuthorThreadResolutionSelection or
 * ChangeFilterActorSelection. ListSelectionSeeding applies saved picks.
 * A pick the loaded data has no actor for (often a bot) is listed by its
 * login after the options, so it can still be unchecked.
 */
export function SettingsListDropdown<L extends string>({ list, selection }: { list: SettingsList<L>; selection: CheckedByListIdValue<L> }) {
  const actorOptions = useFilterOptions()[list.optionsKey];
  const checked = selection.checkedByListId[list.listId] ?? NONE_CHECKED;
  const options = useMemo(() => {
    const known = new Set(actorOptions.map((option) => option.value));
    const unmatched = Array.from(checked).filter((value) => !known.has(value));
    return unmatched.length ? [...actorOptions, ...unmatched.map((value) => ({ value, label: value }))] : actorOptions;
  }, [actorOptions, checked]);
  return (
    <MultiSelectDropdown
      listId={list.listId}
      label={list.label}
      idPrefix={list.idPrefix}
      options={options}
      checked={checked}
      onToggle={(value) => selection.toggle(list.listId, value)}
    />
  );
}
