import { useMemo } from 'react';
import { MultiSelectDropdown } from '../ui/MultiSelectDropdown';
import { useFilterOptions } from '../../state/FilterOptionsContext';
import type { CheckedByListIdValue } from '../../state/useCheckedByListIdState';
import { isActorId } from '../../helpers/pr-actor-identity.helpers.ts';
import type { SettingsList } from './settings-fields';

const NONE_CHECKED: ReadonlySet<string> = new Set();

/**
 * One of the Settings drawer's actor lists (MultiSelectDropdown) on its
 * selection Context - AuthorThreadResolutionSelection or
 * ChangeFilterActorSelection. ListSelectionSeeding applies saved picks.
 * A pick the loaded data has no person for (often a bot's login) is listed
 * after the options, so it can still be unchecked: by its login, or - an id
 * whose person was removed from People - saying so.
 */
export function SettingsListDropdown<L extends string>({ list, selection }: { list: SettingsList<L>; selection: CheckedByListIdValue<L> }) {
  const actorOptions = useFilterOptions()[list.optionsKey];
  const checked = selection.checkedByListId[list.listId] ?? NONE_CHECKED;
  const options = useMemo(() => {
    const known = new Set(actorOptions.map((option) => option.value));
    const unmatched = Array.from(checked).filter((value) => !known.has(value));
    const labelOf = (value: string) => (isActorId(value) ? `${value} · no longer in People` : value);
    return unmatched.length ? [...actorOptions, ...unmatched.map((value) => ({ value, label: labelOf(value) }))] : actorOptions;
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
