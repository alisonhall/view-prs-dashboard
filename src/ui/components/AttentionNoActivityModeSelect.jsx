/**
 * AttentionNoActivityModeSelect - React-owned "NO_ACTIVITY handling" dropdown.
 *
 * Phase 2 (see REACT_MIGRATION_PLAN.md), same pattern as ScopeFilterSelect.
 *
 * @module components/AttentionNoActivityModeSelect
 */

import React, { useState } from 'react';

export function AttentionNoActivityModeSelect({ initialValue = 'all' }) {
  const [value, setValue] = useState(initialValue);

  return (
    <select
      id="attention-no-activity-mode"
      name="attentionNoActivityMode"
      value={value}
      onChange={(e) => setValue(e.target.value)}
    >
      <option value="all">Mark all NO_ACTIVITY PRs</option>
      <option value="mine-only">Only NO_ACTIVITY PRs assigned to me or where I am a reviewer</option>
      <option value="assigned-only">Only NO_ACTIVITY PRs assigned to me</option>
      <option value="reviewer-only">Only PRs where I am a reviewer</option>
      <option value="none">Never mark NO_ACTIVITY PRs</option>
    </select>
  );
}
