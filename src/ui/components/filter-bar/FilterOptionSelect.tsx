import { useFilterState } from '../../state/FilterStateContext';

/**
 * One of the filter bar's notes filters (filter-bar-fields.ts's
 * NOTES_FILTER_FIELDS): a select bound to its FilterStateContext key.
 */
export interface FilterOptionSelectProps {
  id: string;
  name: string;
  filterStateKey: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}

export function FilterOptionSelect({ id, name, options, filterStateKey }: FilterOptionSelectProps) {
  const { values, setValue } = useFilterState();

  return (
    <select id={id} name={name} value={String(values[filterStateKey] ?? '')} onChange={(event) => setValue(filterStateKey, event.target.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
