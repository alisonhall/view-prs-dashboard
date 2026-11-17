import { useFilterState } from '../../state/FilterStateContext';

/**
 * One of the filter bar's checkboxes: FilterStateContext's `valueKey`
 * (saved as the form field `id`; FILTER_STATE_FIELD_MAP). Its label wraps
 * it, and its hint (FilterBar) describes it as `${id}-hint`:
 * - always-show-in-review: PRs marked In review show whatever the other
 *   filters say.
 * - only-needs-attention / only-threads-to-check: every section shows only
 *   those PRs (pr-scope-selection.helpers.ts).
 */
export function FilterCheckbox({ id, valueKey }: { id: string; valueKey: string }) {
  const { values, setValue } = useFilterState();

  return (
    <input
      type="checkbox"
      id={id}
      aria-describedby={`${id}-hint`}
      name={valueKey}
      checked={Boolean(values[valueKey])}
      onChange={(event) => setValue(valueKey, event.target.checked)}
    />
  );
}
