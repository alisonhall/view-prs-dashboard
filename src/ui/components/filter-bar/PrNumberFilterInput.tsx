import { useFilterState } from '../../state/FilterStateContext';
import { NON_CREDENTIAL_INPUT_PROPS } from '../../helpers/form-parsing.helpers.ts';

/**
 * The filter bar's PR numbers field (comma-separated): only those PRs,
 * whatever the scope. FilterStateContext's `filterPrNumbers`; the table
 * applies it debounced (useVisiblePrNumbers). The non-credential props
 * keep password managers from treating it as a login field.
 */
export function PrNumberFilterInput() {
  const { values, setValue } = useFilterState();

  return (
    <input
      type="text"
      id="filter-pr-numbers"
      name="filterPrNumbers"
      placeholder="912, 921"
      {...NON_CREDENTIAL_INPUT_PROPS}
      value={values.filterPrNumbers ?? ''}
      onChange={(event) => setValue('filterPrNumbers', event.target.value)}
    />
  );
}
