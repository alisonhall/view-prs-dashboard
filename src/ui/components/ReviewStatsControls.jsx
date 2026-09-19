/**
 * ReviewStatsControls - React-owned controls for the "Review Stats" tab
 * (sort/filter/minComments/topN/date-range), replacing
 * pr-review-stats-controls.component.js's createStatsControls().
 *
 * Phase 3 (see REACT_MIGRATION_PLAN.md). Unlike Phase 2's filter controls,
 * `statsViewState` has no persisted/restored override and is only ever
 * written by these controls themselves (confirmed: nothing else in
 * index.page.js assigns to statsViewState fields) - so this mounts once
 * with the current statsViewState as its initial value and owns it from
 * then on, with no restore-race handling needed.
 *
 * renderStatsView (index.page.js) used to rebuild this same markup from
 * scratch via `host.innerHTML = ""` on every stats render (identical
 * discard-and-rebuild shape to the old vanilla multi-select lists before
 * Phase 2 converted those) - so, mirroring Phase 1's #pr-sections
 * approach, renderStatsView no longer touches this component's container
 * (#stats-controls-root) at all; it only rebuilds the sibling
 * #stats-content-root. Every change here calls back into vanilla via the
 * onChange prop, which mutates the real statsViewState object and calls
 * applyFiltersFromCache() - vanilla remains the source of truth for
 * *when* a re-render happens, same as every other Phase 1/2 bridge.
 *
 * @module components/ReviewStatsControls
 */

import React, { useState } from 'react';

const SORT_OPTIONS = [
  ['riskyApprovals', 'Risky approvals'],
  ['highRiskApprovals', 'High-risk approvals'],
  ['approvals', 'Approvals'],
  ['comments', "Comments on others' PRs"],
  ['usefulnessSignals', 'Comment usefulness signals'],
  ['commentsFollowedByAuthorCommit', 'Comments followed by author commit'],
  ['resolvedThreadComments', 'Resolved thread comments'],
  ['reviews', 'Reviews'],
];

const FILTER_MODE_OPTIONS = [
  ['all', 'All reviewers'],
  ['risky-only', 'Only risky approvals'],
  ['high-risk-approvals', 'Only high-risk approvals'],
  ['useful-comments', 'Only useful-comment signals'],
];

const NON_CREDENTIAL_DATE_ATTRS = {
  autoComplete: 'off',
  autoCapitalize: 'off',
  autoCorrect: 'off',
  spellCheck: false,
  'data-lpignore': 'true',
  'data-1p-ignore': 'true',
  'data-bwignore': 'true',
  'data-form-type': 'other',
};

export function ReviewStatsControls({ initialState, onChange }) {
  const [state, setState] = useState(initialState);

  // Commits a change to vanilla (statsViewState + applyFiltersFromCache,
  // via the onChange bridge prop) and re-renders the whole stats view -
  // expensive enough that it must only happen once per real change, not
  // once per keystroke.
  const commit = (patch) => {
    setState((previous) => ({ ...previous, ...patch }));
    onChange?.(patch);
  };

  // For number inputs specifically: only updates the displayed value as
  // the user types, without committing yet - matches the original
  // vanilla control's `onchange` handler (native "change", which only
  // fires on blur/commit for a text-entry <input>, unlike React's
  // onChange which fires on every keystroke). Committing on every
  // keystroke would re-trigger the full stats recompute mid-edit and
  // fight the user's typing (e.g. clearing the field to retype would
  // momentarily clamp to 0/12 and re-render immediately).
  const updateDisplayOnly = (patch) => {
    setState((previous) => ({ ...previous, ...patch }));
  };

  return (
    <div className="stats-controls">
      <label>
        Sort by
        <select value={state.sortBy} onChange={(e) => commit({ sortBy: e.target.value })}>
          {SORT_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label>
        Filter
        <select value={state.filterMode} onChange={(e) => commit({ filterMode: e.target.value })}>
          {FILTER_MODE_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label>
        Min comments
        <input
          type="number"
          min="0"
          value={state.minComments}
          onChange={(e) => updateDisplayOnly({ minComments: e.target.value })}
          onBlur={(e) => commit({ minComments: Math.max(0, Number.parseInt(e.target.value, 10) || 0) })}
        />
      </label>

      <label>
        Top reviewers
        <input
          type="number"
          min="1"
          value={state.topN}
          onChange={(e) => updateDisplayOnly({ topN: e.target.value })}
          onBlur={(e) => commit({ topN: Math.max(1, Number.parseInt(e.target.value, 10) || 12) })}
        />
      </label>

      <label>
        Start date
        <input
          type="date"
          name="review-stats-start-date"
          {...NON_CREDENTIAL_DATE_ATTRS}
          value={state.startDate || ''}
          onChange={(e) => commit({ startDate: String(e.target.value || '').trim() })}
        />
      </label>

      <label>
        End date
        <input
          type="date"
          name="review-stats-end-date"
          {...NON_CREDENTIAL_DATE_ATTRS}
          value={state.endDate || ''}
          onChange={(e) => commit({ endDate: String(e.target.value || '').trim() })}
        />
      </label>
    </div>
  );
}
