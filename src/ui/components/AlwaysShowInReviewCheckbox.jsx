/**
 * AlwaysShowInReviewCheckbox - React-owned "Always show PRs In Review" checkbox.
 *
 * Phase 2 third slice (see REACT_MIGRATION_PLAN.md) - first checkbox
 * conversion, validating the established pattern (PrNumberFilterInput,
 * ScopeFilterSelect) generalizes to checkboxes too. Renders the same
 * `<input type="checkbox" id="always-show-in-review">` vanilla used to
 * render statically, nested inside vanilla's own `<label class="checkbox-row">`
 * wrapper (unconverted) so the label-click-toggles-checkbox behavior and
 * layout are unaffected by which side renders the input itself.
 *
 * Restore-race fix: index.page.js's setCheckbox() (restoreUiOptionOverrides)
 * calls element.click() when the persisted value differs from the current
 * `checked` state, rather than assigning `.checked` directly - a real
 * click is what a controlled React checkbox needs to notice the change,
 * the same way setText()'s native-setter-plus-dispatched-event trick
 * works for text/select fields.
 *
 * @module components/AlwaysShowInReviewCheckbox
 */

import React, { useState } from 'react';

export function AlwaysShowInReviewCheckbox({ initialChecked = false }) {
  const [checked, setChecked] = useState(initialChecked);

  return (
    <input
      type="checkbox"
      id="always-show-in-review"
      name="alwaysShowInReview"
      checked={checked}
      onChange={(e) => setChecked(e.target.checked)}
    />
  );
}
