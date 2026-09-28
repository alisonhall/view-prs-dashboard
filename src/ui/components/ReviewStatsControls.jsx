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
 * Phase 7, sub-phase 7.0 (see REACT_MIGRATION_PLAN.md): reads/writes
 * statsViewState via useReviewStats() (state/ReviewStatsContext.jsx)
 * directly now, instead of receiving initialState/onChange props that
 * bridged into index.page.js's window.updateStatsViewStateAndRerender -
 * that bridge also had the unrelated side effect of re-running the PR
 * table's whole local-filter pipeline on every stats-control change, which
 * writing straight to Context drops for free.
 *
 * @module components/ReviewStatsControls
 */

import { useState } from 'react';
import { useReviewStats } from '../state/ReviewStatsContext';

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

export function ReviewStatsControls() {
  const { statsViewState, setStatsViewState } = useReviewStats();
  const [state, setState] = useState(statsViewState);

  // Commits a change to Context (setStatsViewState) - expensive enough
  // (triggers a full stats recompute) that it must only happen once per
  // real change, not once per keystroke.
  const commit = (patch) => {
    setState((previous) => ({ ...previous, ...patch }));
    setStatsViewState(patch);
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
