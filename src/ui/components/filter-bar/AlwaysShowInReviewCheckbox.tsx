import { useFilterState } from '../../state/FilterStateContext';

/**
 * The filter bar's "Always show PRs in review": PRs marked In review show
 * whatever the other filters say. FilterStateContext's
 * `alwaysShowInReview`. Its label wraps it (FilterBar).
 */
export function AlwaysShowInReviewCheckbox() {
  const { values, setValue } = useFilterState();

  return (
    <input
      type="checkbox"
      id="always-show-in-review"
      name="alwaysShowInReview"
      checked={Boolean(values.alwaysShowInReview)}
      onChange={(event) => setValue('alwaysShowInReview', event.target.checked)}
    />
  );
}
