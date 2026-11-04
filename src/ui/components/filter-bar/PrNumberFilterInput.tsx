import { useFilterState } from '../../state/FilterStateContext';
import { NON_CREDENTIAL_INPUT_PROPS } from '../../helpers/form-parsing.helpers.ts';

/**
 * The filter bar's PRs field (comma- or space-separated): PR numbers, PRs
 * by repo ("acme/api#12") or URL - only those PRs, whatever the scope - and
 * repos ("acme/api"), which filter like the rest (pr-filter-input.helpers.ts).
 * FilterStateContext's `filterPrNumbers`; the table applies it debounced
 * (useVisiblePrNumbers). The non-credential props keep password managers
 * from treating it as a login field.
 */
export function PrNumberFilterInput() {
  const { values, setValue } = useFilterState();

  return (
    <input
      type="text"
      id="filter-pr-numbers"
      name="filterPrNumbers"
      aria-describedby="filter-pr-numbers-hint"
      placeholder="912, acme/api#921, acme/web"
      {...NON_CREDENTIAL_INPUT_PROPS}
      value={values.filterPrNumbers ?? ''}
      onChange={(event) => setValue('filterPrNumbers', event.target.value)}
    />
  );
}
