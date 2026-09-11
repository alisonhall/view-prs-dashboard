/**
 * FilterCheckbox - generic React-owned checkbox for the "Run & Filter" tab.
 *
 * Phase 2 (see REACT_MIGRATION_PLAN.md): rather than one named component
 * per field (like AlwaysShowInReviewCheckbox, a one-off from earlier in
 * Phase 2), this single parameterized component is reused across every
 * plain checkbox in the tab that has no field-specific behavior of its
 * own - originally the five "Needs Attention rules" checkboxes
 * (attention-include-pending-comments, attention-ignore-merge-only-commits,
 * attention-include-closed-merged, attention-include-draft-changed,
 * attention-include-draft-no-activity), later also the three "Run Script
 * options" checkboxes (ack-changed, show-reason, quiet). See the various
 * mount*Checkbox(es) functions in react-app.jsx for where each id/name
 * pair is mounted.
 *
 * @module components/FilterCheckbox
 */

import React, { useState } from 'react';

export function FilterCheckbox({ id, name, initialChecked = false }) {
  const [checked, setChecked] = useState(initialChecked);

  return (
    <input
      type="checkbox"
      id={id}
      name={name}
      checked={checked}
      onChange={(e) => setChecked(e.target.checked)}
    />
  );
}
