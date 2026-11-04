import { useFilterState } from '../../state/FilterStateContext';

/**
 * One of the filter bar's notes filters (filter-bar-fields.ts's
 * NOTES_FILTER_FIELDS): a select bound to its FilterStateContext key.
 */
export interface FilterOptionSelectProps {
  id: string;
  name: string;
  filterStateKey: string;
  // The id of what describes it (the filter bar's hint under it).
  describedBy?: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}

export function FilterOptionSelect({ id, name, options, filterStateKey, describedBy }: FilterOptionSelectProps) {
  const { values, setValue } = useFilterState();

  return (
    <select
      id={id}
      name={name}
      aria-describedby={describedBy}
      value={String(values[filterStateKey] ?? '')}
      onChange={(event) => setValue(filterStateKey, event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
