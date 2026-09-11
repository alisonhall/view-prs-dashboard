/**
 * AuthorThreadResolutionModeSelect - React-owned "PR author thread
 * resolution policy" dropdown.
 *
 * Phase 2 (see REACT_MIGRATION_PLAN.md), same pattern as ScopeFilterSelect/
 * AttentionNoActivityModeSelect. This one has dependent UI (two
 * <details class="multi-select-dropdown"> sibling elements that show/hide
 * based on the selected mode) driven by
 * updateAuthorThreadResolutionRuleVisibility() in index.page.js - that
 * function reads this select's `.value` fresh via getOptionalElementById
 * each time it runs and is triggered by a real native "change" listener
 * bound directly to this element's id, so it needed no changes: a
 * React-rendered <select> is a real DOM node with a real, always-current
 * `.value` and real native events, indistinguishable to that vanilla code
 * from one vanilla itself rendered.
 *
 * @module components/AuthorThreadResolutionModeSelect
 */

import React, { useState } from 'react';

export function AuthorThreadResolutionModeSelect({ initialValue = 'allow-all' }) {
  const [value, setValue] = useState(initialValue);

  return (
    <select
      id="attention-author-thread-resolution-mode"
      name="attentionAuthorThreadResolutionMode"
      value={value}
      onChange={(e) => setValue(e.target.value)}
    >
      <option value="allow-all">Allow PR authors to resolve all own-PR threads</option>
      <option value="allow-only">Allow only for selected thread starters</option>
      <option value="deny-only">Disallow for selected thread starters</option>
    </select>
  );
}
