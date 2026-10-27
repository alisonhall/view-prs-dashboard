import { useFilterState } from '../../state/FilterStateContext';

/**
 * A Settings checkbox bound to a FilterStateContext key (the Script
 * options' toggles and the Needs Attention rules). Its label wraps it.
 */
export interface ContextFilterCheckboxProps {
  id: string;
  name: string;
  filterStateKey: string;
}

export function ContextFilterCheckbox({ id, name, filterStateKey }: ContextFilterCheckboxProps) {
  const { values, setValue } = useFilterState();
  return (
    <input
      type="checkbox"
      id={id}
      name={name}
      checked={Boolean(values[filterStateKey])}
      onChange={(event) => setValue(filterStateKey, event.target.checked)}
    />
  );
}
