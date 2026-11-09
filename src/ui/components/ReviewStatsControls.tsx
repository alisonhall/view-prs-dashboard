/**
 * ReviewStatsControls - React-owned controls for the "Review Stats" tab
 * (sort/filter/minComments/topN/date-range/reviewers), replacing
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
 * statsViewState via useReviewStats() (state/ReviewStatsContext.tsx)
 * directly now, instead of receiving initialState/onChange props that
 * bridged into index.page.js's window.updateStatsViewStateAndRerender -
 * that bridge also had the unrelated side effect of re-running the PR
 * table's whole local-filter pipeline on every stats-control change, which
 * writing straight to Context drops for free.
 *
 * @module components/ReviewStatsControls
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useReviewStats } from '../state/ReviewStatsContext';
import { useActorIdentity } from '../state/ActorIdentityContext';
import { usePrData } from '../state/PrDataContext';
import { useIsTabPanelVisible } from '../state/useIsTabPanelVisible';
import { MultiSelectDropdown } from './ui/MultiSelectDropdown';
import type { ReviewStatsViewState } from '../state/PrDataContext';
import { NON_CREDENTIAL_INPUT_PROPS } from '../helpers/form-parsing.helpers.ts';

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

// Show's choices: which reviewers the table lists. The phrase finishes
// "Reviewers with ..." (the option) and "No reviewers with ..." (the
// empty table, ReviewStatsContent).
export const REVIEW_STATS_FILTER_MODES = [
  ['all', 'All reviewers'],
  ['risky-only', 'risky approvals'],
  ['high-risk-approvals', 'high-risk approvals'],
  ['useful-comments', 'useful-comment signals'],
] as const;

// The shared non-credential-field attributes (form-parsing.helpers.ts);
// this file had its own identical copy until the window-bridge elimination
// Phase 7.5 follow-up.
const NON_CREDENTIAL_DATE_ATTRS = NON_CREDENTIAL_INPUT_PROPS;

// What the closed Reviewers list says: everyone, the one picked, or how many.
const describePickedReviewers = (picked: string[], nameOf: (login: string) => string) => {
  if (picked.length === 0) return 'Everyone';
  if (picked.length === 1) return nameOf(picked[0] as string);
  return `${picked.length} reviewers`;
};

export function ReviewStatsControls() {
  const { statsViewState, setStatsViewState, listReviewers } = useReviewStats();
  const [state, setState] = useState(statsViewState);
  const { payload } = usePrData();
  const isVisible = useIsTabPanelVisible('tab-panel-review-stats');

  // Reviewers' options: everyone with activity in the dates, by name
  // (worked out while the view shows, as its numbers are). Someone picked
  // with none there stays listed at the end, so they can be unpicked.
  const lastReviewersRef = useRef<Array<{ login: string; name: string }>>([]);
  const everyReviewer = useMemo(() => {
    if (!isVisible) return lastReviewersRef.current;
    lastReviewersRef.current = listReviewers(Object.values(payload?.byPrNumber || {}), payload?.actorsMap || {});
    return lastReviewersRef.current;
  }, [isVisible, listReviewers, payload]);
  const pickedReviewers = useMemo(() => (Array.isArray(state.reviewers) ? state.reviewers : []), [state.reviewers]);
  // Reviewers are people's keys: one with no activity in the dates is shown
  // by their main login.
  const { loginOfActorKey } = useActorIdentity();
  const reviewerOptions = useMemo(() => {
    const known = new Set(everyReviewer.map(({ login }) => login));
    return [
      ...everyReviewer.map(({ login, name }) => ({ value: login, label: name })),
      ...pickedReviewers
        .filter((login) => !known.has(login))
        .map((login) => ({ value: login, label: `${loginOfActorKey(login)} · no activity in the dates` })),
    ];
  }, [everyReviewer, pickedReviewers, loginOfActorKey]);
  const nameOf = (login: string) => everyReviewer.find((reviewer) => reviewer.login === login)?.name || loginOfActorKey(login);
  const toggleReviewer = (login: string) =>
    commit({
      reviewers: pickedReviewers.includes(login) ? pickedReviewers.filter((picked) => picked !== login) : [...pickedReviewers, login],
    });

  // A change made elsewhere (the table's Clear dates or Show all
  // reviewers) shows here too: only the keys that changed, so a number
  // being typed but not yet committed keeps its text.
  const previousViewStateRef = useRef(statsViewState);
  useEffect(() => {
    const previous = previousViewStateRef.current;
    previousViewStateRef.current = statsViewState;
    if (previous === statsViewState) return;
    const changed = (Object.keys(statsViewState) as (keyof ReviewStatsViewState)[]).filter(
      (key) => statsViewState[key] !== previous[key],
    );
    if (changed.length === 0) return;
    setState((current) => ({ ...current, ...Object.fromEntries(changed.map((key) => [key, statsViewState[key]])) }));
  }, [statsViewState]);

  // Commits a change to Context (setStatsViewState) - expensive enough
  // (triggers a full stats recompute) that it must only happen once per
  // real change, not once per keystroke.
  const commit = (patch: Partial<ReviewStatsViewState>) => {
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
  const updateDisplayOnly = (patch: Partial<ReviewStatsViewState>) => {
    setState((previous) => ({ ...previous, ...patch }));
  };

  return (
    <div className="ui-toolbar stats-controls">
      <label className="ui-field">
        Sort by
        <select value={state.sortBy} onChange={(e) => commit({ sortBy: e.target.value })}>
          {SORT_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="ui-field">
        Show
        <select value={state.filterMode} onChange={(e) => commit({ filterMode: e.target.value })}>
          {REVIEW_STATS_FILTER_MODES.map(([value, phrase]) => (
            <option key={value} value={value}>
              {value === 'all' ? phrase : `Reviewers with ${phrase}`}
            </option>
          ))}
        </select>
      </label>

      <label className="ui-field">
        Minimum comments
        <input
          type="number"
          min="0"
          value={state.minComments}
          onChange={(e) => updateDisplayOnly({ minComments: e.target.value })}
          onBlur={(e) => commit({ minComments: Math.max(0, Number.parseInt(e.target.value, 10) || 0) })}
        />
      </label>

      <label className="ui-field">
        Reviewers to list
        <input
          type="number"
          min="1"
          value={state.topN}
          onChange={(e) => updateDisplayOnly({ topN: e.target.value })}
          onBlur={(e) => commit({ topN: Math.max(1, Number.parseInt(e.target.value, 10) || 12) })}
        />
      </label>

      <label className="ui-field">
        Start date
        <input
          type="date"
          name="review-stats-start-date"
          {...NON_CREDENTIAL_DATE_ATTRS}
          value={state.startDate || ''}
          onChange={(e) => commit({ startDate: String(e.target.value || '').trim() })}
        />
      </label>

      <label className="ui-field">
        End date
        <input
          type="date"
          name="review-stats-end-date"
          {...NON_CREDENTIAL_DATE_ATTRS}
          value={state.endDate || ''}
          onChange={(e) => commit({ endDate: String(e.target.value || '').trim() })}
        />
      </label>

      {/* Last, so its list opening in place pushes nothing after it down
          (the toolbar wraps). Not a .ui-field: its styles would reach the
          list's checkboxes. The caption is the dropdown's name, which it
          repeats for screen readers. */}
      <div className="stats-reviewers">
        <span className="stats-reviewers-caption" aria-hidden="true">
          Reviewers
        </span>
        <MultiSelectDropdown
          listId="review-stats-reviewers"
          label="Reviewers"
          idPrefix="review-stats-reviewer"
          options={reviewerOptions}
          checked={new Set(pickedReviewers)}
          onToggle={toggleReviewer}
          description="Counts only these people's comments, reviews and approvals: the cards, charts and table."
          summary={describePickedReviewers(pickedReviewers, nameOf)}
        />
      </div>
    </div>
  );
}
