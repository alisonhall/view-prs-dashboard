/**
 * AuthorThreadResolutionModeSelect - React-owned "PR author thread
 * resolution policy" dropdown.
 *
 * Phase 6 (see REACT_MIGRATION_PLAN.md): migrated from local `useState` to
 * `<FilterStateProvider>`'s shared Context. This one has dependent UI (two
 * <details class="multi-select-dropdown"> sibling elements that show/hide
 * based on the selected mode) driven by
 * updateAuthorThreadResolutionRuleVisibility() in index.page.js - that
 * function reads this select's `.value` fresh via getOptionalElementById
 * each time it runs and is triggered by a real native "change" listener
 * bound directly to this element's id, so it needed no changes for the
 * Context migration either: a React-rendered <select> is a real DOM node
 * with a real, always-current `.value` regardless of whether Context or
 * local state drives it. Only `getAuthorThreadResolutionPolicy`
 * (index.page.js), the canonical filtering-pipeline read site, was
 * updated to prefer Context.
 *
 * @module components/AuthorThreadResolutionModeSelect
 */

import React from 'react';
import { useFilterState } from '../state/FilterStateContext';

export function AuthorThreadResolutionModeSelect() {
  const { values, setValue } = useFilterState();

  return (
    <select
      id="attention-author-thread-resolution-mode"
      name="attentionAuthorThreadResolutionMode"
      value={values.attentionAuthorThreadResolutionMode}
      onChange={(e) => setValue('attentionAuthorThreadResolutionMode', e.target.value)}
    >
      <option value="allow-all">Allow PR authors to resolve all own-PR threads</option>
      <option value="allow-only">Allow only for selected thread starters</option>
      <option value="deny-only">Disallow for selected thread starters</option>
    </select>
  );
}
