/**
 * AlwaysShowInReviewCheckbox - React-owned "Always show PRs In Review" checkbox.
 *
 * Phase 6 (see REACT_MIGRATION_PLAN.md): migrated from local `useState` to
 * `<FilterStateProvider>`'s shared Context - the other Slice 1
 * proof-of-concept field. Still renders the same
 * `<input type="checkbox" id="always-show-in-review">` vanilla used to
 * render statically, nested inside vanilla's own `<label class="checkbox-row">`
 * wrapper (unconverted) so the label-click-toggles-checkbox behavior and
 * layout are unaffected by which side renders the input itself.
 *
 * `shouldAlwaysShowInReviewRows` (index.page.js) now reads this field's
 * value from `window.getFilterStateValues().alwaysShowInReview` instead of
 * `.checked` off this element, and `persistUiOptionOverrides`/
 * `restoreUiOptionOverrides` read/write through the same bridge for this
 * field id too - see those call sites' own comments.
 *
 * @module components/AlwaysShowInReviewCheckbox
 */

import { useFilterState } from '../state/FilterStateContext';

export function AlwaysShowInReviewCheckbox() {
  const { values, setValue } = useFilterState();

  return (
    <input
      type="checkbox"
      id="always-show-in-review"
      name="alwaysShowInReview"
      checked={values.alwaysShowInReview}
      onChange={(e) => setValue('alwaysShowInReview', e.target.checked)}
    />
  );
}
