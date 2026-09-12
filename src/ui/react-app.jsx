/**
 * React App Entry Point for view-prs
 *
 * Phase 1: Hybrid React Table Migration
 * - Mounts React only for PR table rendering
 * - Keeps vanilla JS for filters, controls, and other tabs
 * - Provides bridge between vanilla JS and React
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { flushSync } from 'react-dom';
import { PrTableApp } from './components/PrTableApp';
import { PrNumberFilterInput } from './components/PrNumberFilterInput';
import { ScopeFilterSelect } from './components/ScopeFilterSelect';
import { AlwaysShowInReviewCheckbox } from './components/AlwaysShowInReviewCheckbox';
import { FilterCheckbox } from './components/FilterCheckbox';
import { AttentionNoActivityModeSelect } from './components/AttentionNoActivityModeSelect';
import { AuthorThreadResolutionModeSelect } from './components/AuthorThreadResolutionModeSelect';
import { RunScriptTextInput } from './components/RunScriptTextInput';
import { OpenModeSelect } from './components/OpenModeSelect';
import { MultiSelectCheckboxList } from './components/MultiSelectCheckboxList';
import { FilterOptionSelect } from './components/FilterOptionSelect';
import { IgnoreCommitPatternsTextarea } from './components/IgnoreCommitPatternsTextarea';
import { ReviewStatsControls } from './components/ReviewStatsControls';
import { ReviewStatsContent } from './components/ReviewStatsContent';
import { AuthorInsightsSelector } from './components/AuthorInsightsSelector';
import { AuthorCreatedPrsSection } from './components/AuthorCreatedPrsSection';
import { AuthorInsightsHeader } from './components/AuthorInsightsHeader';
import { AuthorInsightsNotesSection } from './components/AuthorInsightsNotesSection';
import { AuthorInsightsCommentsSection } from './components/AuthorInsightsCommentsSection';
import { BackfillBadges } from './components/BackfillBadges';

/**
 * Mount React app for PR table
 *
 * @param {HTMLElement} containerElement - DOM element to mount React into
 * @param {Object} props - Initial props for PrTableApp
 * @param {Object} props.initialPayload - Initial PR data payload
 * @param {string} props.selectedRepo - Currently selected repository
 * @param {string[]} [props.visiblePrNumbers] - PR numbers passing active
 *   local filters; null/undefined means show everything
 * @param {Function} props.onCheckboxChange - Callback for checkbox changes
 * @param {Function} props.onAckAction - Callback for Ack button clicks
 * @returns {Object} React root instance (for unmounting if needed)
 */
export function mountReactPrTable(containerElement, props) {
  if (!containerElement) {
    console.error('[React Migration] Cannot mount: container element not found');
    return null;
  }

  console.log('[React Migration] Mounting React PR table...');

  const root = ReactDOM.createRoot(containerElement);

  // Store props reference for updates
  let currentProps = { ...props };

  // Create update function
  const updateTable = (newPayload, newSelectedRepo, newVisiblePrNumbers) => {
    console.log('[React Migration] Updating React table with new data...');
    currentProps = {
      ...currentProps,
      initialPayload: newPayload,
      selectedRepo: newSelectedRepo || currentProps.selectedRepo,
      // undefined (param omitted) keeps the previous value; null/[] are
      // meaningful ("no filter" / "everything filtered out") and must
      // overwrite it.
      visiblePrNumbers:
        newVisiblePrNumbers !== undefined
          ? newVisiblePrNumbers
          : currentProps.visiblePrNumbers,
    };
    root.render(<PrTableApp {...currentProps} />);
  };

  // Expose update function globally
  if (typeof window !== 'undefined') {
    window.updateReactPrTable = updateTable;
  }

  // Render the actual PrTableApp component
  root.render(<PrTableApp {...currentProps} />);

  console.log('[React Migration] React PR table mounted successfully');
  return root;
}

/**
 * Mounts the "Filter by PR number(s)" input (Phase 2, first slice - see
 * REACT_MIGRATION_PLAN.md). Unlike the PR table, this control's container
 * is present in the static HTML from page load and doesn't depend on any
 * fetched PR data, so it mounts immediately rather than waiting to be
 * called - there's no "first render needs data" race to bridge.
 */
function mountPrNumberFilterInput() {
  const container = document.getElementById('filter-pr-numbers-root');
  if (!container) {
    return;
  }
  // index.page.js's restoreUiOptionOverrides() fetches a persisted value
  // and can resolve before this module (fetched/parsed/executed as a
  // Vite-bundled ES module, not a fast same-origin JSON call) finishes
  // loading - if it wins that race, it sets the value on the static
  // fallback <input> this replaces. Read it as the initial value instead
  // of hardcoding empty, so createRoot().render() below doesn't wipe out
  // an already-restored value.
  const fallbackInput = container.querySelector('input');
  const initialValue = fallbackInput?.value || '';
  ReactDOM.createRoot(container).render(<PrNumberFilterInput initialValue={initialValue} />);
}

/**
 * Mounts the "View scope" dropdown (Phase 2, second slice - see
 * REACT_MIGRATION_PLAN.md). Same reasoning as mountPrNumberFilterInput:
 * seeds initialValue from the fallback <select>'s current value in case
 * restoreUiOptionOverrides() already won the race and set it.
 */
function mountScopeFilterSelect() {
  const container = document.getElementById('scope-mode-root');
  if (!container) {
    return;
  }
  const fallbackSelect = container.querySelector('select');
  const initialValue = fallbackSelect?.value || 'all';
  ReactDOM.createRoot(container).render(<ScopeFilterSelect initialValue={initialValue} />);
}

/**
 * Mounts the "Always show PRs In Review" checkbox (Phase 2, third slice -
 * see REACT_MIGRATION_PLAN.md). First checkbox conversion; seeds
 * initialChecked from the fallback <input>'s current `checked` state in
 * case restoreUiOptionOverrides() already won the race and set it (via
 * element.click(), see setCheckbox in index.page.js).
 */
function mountAlwaysShowInReviewCheckbox() {
  const container = document.getElementById('always-show-in-review-root');
  if (!container) {
    return;
  }
  const fallbackInput = container.querySelector('input');
  const initialChecked = fallbackInput?.checked || false;
  ReactDOM.createRoot(container).render(
    <AlwaysShowInReviewCheckbox initialChecked={initialChecked} />,
  );
}

/**
 * Mounts the "NO_ACTIVITY handling" dropdown (Phase 2 - see
 * REACT_MIGRATION_PLAN.md). Same reasoning as mountScopeFilterSelect.
 */
function mountAttentionNoActivityModeSelect() {
  const container = document.getElementById('attention-no-activity-mode-root');
  if (!container) {
    return;
  }
  const fallbackSelect = container.querySelector('select');
  const initialValue = fallbackSelect?.value || 'all';
  ReactDOM.createRoot(container).render(
    <AttentionNoActivityModeSelect initialValue={initialValue} />,
  );
}

/**
 * Mounts one FilterCheckbox per `{id, name}` pair into its own
 * `#<id>-root` container. Same restore-race reasoning as
 * mountAlwaysShowInReviewCheckbox, applied per field. Shared by the
 * "Needs Attention rules" checkboxes and the "Run Script options"
 * checkboxes below - both are just batches of plain checkboxes with no
 * field-specific behavior.
 */
function mountFilterCheckboxes(fields) {
  fields.forEach(({ id, name }) => {
    const container = document.getElementById(`${id}-root`);
    if (!container) {
      return;
    }
    const fallbackInput = container.querySelector('input');
    const initialChecked = fallbackInput?.checked || false;
    ReactDOM.createRoot(container).render(
      <FilterCheckbox id={id} name={name} initialChecked={initialChecked} />,
    );
  });
}

const ATTENTION_RULE_CHECKBOX_FIELDS = [
  { id: 'attention-include-pending-comments', name: 'attentionIncludePendingComments' },
  { id: 'attention-ignore-merge-only-commits', name: 'attentionIgnoreMergeOnlyCommits' },
  { id: 'attention-include-closed-merged', name: 'attentionIncludeClosedMerged' },
  { id: 'attention-include-draft-changed', name: 'attentionIncludeDraftChanged' },
  { id: 'attention-include-draft-no-activity', name: 'attentionIncludeDraftNoActivity' },
];

const RUN_SCRIPT_CHECKBOX_FIELDS = [
  { id: 'ack-changed', name: 'ackChanged' },
  { id: 'show-reason', name: 'showReason' },
  { id: 'quiet', name: 'quiet' },
];

const CHANGE_FILTER_CHECKBOX_FIELDS = [
  { id: 'change-filter-use-builtin-merge-pattern', name: 'changeFilterUseBuiltinMergePattern' },
];

const RUN_SCRIPT_TEXT_FIELDS = [
  { id: 'repo', name: 'repo', type: 'text', placeholder: 'optum-rx-clinicalproducts/orx-cpp-mp-uis' },
  { id: 'limit', name: 'limit', type: 'number', placeholder: '200' },
  { id: 'merged-limit', name: 'mergedLimit', type: 'number', placeholder: '15' },
  { id: 'jobs', name: 'jobs', type: 'number', placeholder: '6' },
];

/**
 * Mounts the "Run Script options" plain text/number inputs (repo, Open PR
 * limit, Merged PR limit, Parallel jobs) - Phase 2, see
 * REACT_MIGRATION_PLAN.md. Unlike the "Run & Filter" fields converted so
 * far, none of these have a vanilla "change" listener attached (they're
 * only ever read via `.value` when the "Run script" button is clicked),
 * so there's no event-delegation concern here - just the same
 * restore-race handling as every other field.
 */
function mountRunScriptTextInputs() {
  RUN_SCRIPT_TEXT_FIELDS.forEach(({ id, name, type, placeholder }) => {
    const container = document.getElementById(`${id}-root`);
    if (!container) {
      return;
    }
    const fallbackInput = container.querySelector('input');
    const initialValue = fallbackInput?.value || '';
    ReactDOM.createRoot(container).render(
      <RunScriptTextInput id={id} name={name} type={type} placeholder={placeholder} initialValue={initialValue} />,
    );
  });
}

/**
 * Mounts the "PR author thread resolution policy" dropdown (Phase 2 - see
 * REACT_MIGRATION_PLAN.md). Same reasoning as mountScopeFilterSelect; see
 * AuthorThreadResolutionModeSelect.jsx for why its dependent show/hide UI
 * needed no additional changes.
 */
function mountAuthorThreadResolutionModeSelect() {
  const container = document.getElementById('attention-author-thread-resolution-mode-root');
  if (!container) {
    return;
  }
  const fallbackSelect = container.querySelector('select');
  const initialValue = fallbackSelect?.value || 'allow-all';
  ReactDOM.createRoot(container).render(
    <AuthorThreadResolutionModeSelect initialValue={initialValue} />,
  );
}

/**
 * Mounts the "Open mode" dropdown (Phase 2 - see REACT_MIGRATION_PLAN.md).
 * Like the Run Script text inputs above, has no vanilla "change" listener
 * (only read via `.value` on "Run script" click) - just the same
 * restore-race handling as every other converted select.
 */
function mountOpenModeSelect() {
  const container = document.getElementById('open-mode-root');
  if (!container) {
    return;
  }
  const fallbackSelect = container.querySelector('select');
  const initialValue = fallbackSelect?.value || 'none';
  ReactDOM.createRoot(container).render(<OpenModeSelect initialValue={initialValue} />);
}

const FILTER_OPTION_SELECT_FIELDS = [
  {
    id: 'filter-custom-comments',
    name: 'filterCustomComments',
    options: [
      { value: '', label: 'Any (with or without)' },
      { value: 'with', label: 'With custom comments' },
      { value: 'without', label: 'Without custom comments' },
    ],
  },
  {
    id: 'filter-other-notes',
    name: 'filterOtherNotes',
    options: [
      { value: '', label: 'Any (with or without)' },
      { value: 'with', label: 'With other notes' },
      { value: 'without', label: 'Without other notes' },
    ],
  },
  {
    id: 'filter-pr-difficulty',
    name: 'filterPrDifficulty',
    options: [
      { value: '', label: 'Any (set or not set)' },
      { value: '1', label: '1' },
      { value: '2', label: '2' },
      { value: '3', label: '3' },
      { value: '4', label: '4' },
      { value: '5', label: '5' },
      { value: 'not-set', label: 'Not set' },
    ],
  },
  {
    id: 'filter-rally-stories',
    name: 'filterRallyStories',
    options: [
      { value: '', label: 'Any (with or without)' },
      { value: 'with', label: 'With Rally stories' },
      { value: 'without', label: 'Without Rally stories' },
    ],
  },
  {
    id: 'filter-rally-links',
    name: 'filterRallyLinks',
    options: [
      { value: '', label: 'Any (with or without)' },
      { value: 'with', label: 'With Rally links' },
      { value: 'without', label: 'Without Rally links' },
    ],
  },
  {
    id: 'filter-analysis-of-pr',
    name: 'filterAnalysisOfPr',
    options: [
      { value: '', label: 'Any (with or without)' },
      { value: 'with', label: 'With analysis' },
      { value: 'without', label: 'Without analysis' },
    ],
  },
];

/**
 * Mounts the six "Any (with/without)" plain-metadata filter selects
 * (Phase 2 - see REACT_MIGRATION_PLAN.md). None of these ever had a
 * vanilla "change" listener or a persisted override - each is only read
 * via `.value` when "Apply filters (local)" is clicked - so like
 * RunScriptTextInput/OpenModeSelect, only the standard restore-race
 * handling applies, not event delegation or flushSync.
 */
function mountFilterOptionSelects() {
  FILTER_OPTION_SELECT_FIELDS.forEach(({ id, name, options }) => {
    const container = document.getElementById(`${id}-root`);
    if (!container) {
      return;
    }
    const fallbackSelect = container.querySelector('select');
    const initialValue = fallbackSelect?.value || '';
    ReactDOM.createRoot(container).render(
      <FilterOptionSelect id={id} name={name} options={options} initialValue={initialValue} />,
    );
  });
}

/**
 * Mounts the "Ignore commits matching patterns" textarea (Phase 2 - see
 * REACT_MIGRATION_PLAN.md). Unlike every field above except the
 * "Use built-in merge pattern" checkbox, this one has a special-case
 * "change" -> persist + apply handler (see the delegated listener in
 * index.page.js) rather than no listener at all, so it needed gotcha #3's
 * treatment, not just the standard restore-race handling.
 */
function mountIgnoreCommitPatternsTextarea() {
  const container = document.getElementById('change-filter-ignore-commit-patterns-root');
  if (!container) {
    return;
  }
  const fallbackTextarea = container.querySelector('textarea');
  const initialValue = fallbackTextarea?.value || '';
  ReactDOM.createRoot(container).render(
    <IgnoreCommitPatternsTextarea initialValue={initialValue} />,
  );
}

/**
 * Multi-select checkbox lists (Phase 2 - see REACT_MIGRATION_PLAN.md).
 * Unlike every field above, these lists' *options* are rebuilt from the PR
 * payload on every data (re)load - see MultiSelectCheckboxList.jsx's own
 * comment for why each render uses an incrementing `key` instead of
 * relying on prop diffing. React mounts directly into the existing
 * `<div id="...-list">` container (like Phase 1's #pr-sections), not a
 * wrapper span, so no index.html/index.css change is needed for these.
 *
 * MULTI_SELECT_LIST_ID_PREFIXES maps each list's container id to the
 * checkbox-id prefix its options previously used (see
 * getMultiSelectCheckboxId in pr-filter-panel.component.js, and the
 * `${idPrefix}-${login}-${index}` scheme in index.page.js's own
 * renderActorOptionsList/renderChangeFilterActorList) so generated ids
 * stay stable across the conversion. Covers every multi-select in the app:
 * five owned by pr-filter-panel.component.js (label/exclude-label/author/
 * assigned/approver) and four built directly in index.page.js
 * (thread-resolution allow/deny, change-filter ignore-comment/review-
 * authors) - same bridge, same flushSync fix (gotcha #4), just two
 * different call sites feeding it.
 */
const MULTI_SELECT_LIST_ID_PREFIXES = {
  'label-list': 'label',
  'exclude-label-list': 'exclude-label',
  'author-list': 'author',
  'assigned-list': 'assigned',
  'approver-list': 'approver',
  'attention-author-thread-resolution-allow-list': 'attention-author-thread-resolution-allow',
  'attention-author-thread-resolution-deny-list': 'attention-author-thread-resolution-deny',
  'change-filter-ignore-comment-authors-list': 'change-filter-ignore-comment-authors',
  'change-filter-ignore-review-authors-list': 'change-filter-ignore-review-authors',
};

const multiSelectListRoots = new Map();

function mountMultiSelectLists() {
  Object.keys(MULTI_SELECT_LIST_ID_PREFIXES).forEach((listId) => {
    const container = document.getElementById(listId);
    if (!container) {
      return;
    }
    multiSelectListRoots.set(listId, { root: ReactDOM.createRoot(container), renderCount: 0 });
  });
}

/**
 * Renders one multi-select list's checkbox items via React. Called by
 * index.page.js (via pr-filter-panel.component.js's `renderMultiSelectList`
 * DI hook) every time that list's options are (re)populated from fresh PR
 * data. Returns false for any list id not yet converted (or if this module
 * hasn't mounted it yet - the same load-order race every other Phase 2
 * field handles), so the caller falls back to its own vanilla DOM-building
 * path instead of silently doing nothing.
 *
 * @param {string} listId
 * @param {Array<{value: string, label: string, checked: boolean}>} options
 * @returns {boolean} whether React handled the render
 */
function renderReactMultiSelectList(listId, options) {
  const entry = multiSelectListRoots.get(listId);
  const idPrefix = MULTI_SELECT_LIST_ID_PREFIXES[listId];
  if (!entry || !idPrefix) {
    return false;
  }
  entry.renderCount += 1;
  // renderPrData's React path calls the vanilla filter-population pipeline
  // twice in quick succession per data load (prDataTabOrchestrator's own
  // side effect, then populateFilterDropdownsForCurrentPayload right
  // after, to cover the React path's skipTableRender bypass - see
  // index.page.js). Both calls read "currently checked" checkboxes via
  // getSelectedMultiSelectValues to seed the next render's selections.
  // root.render() alone doesn't commit synchronously (React 18 batches
  // it), so without flushSync the second call's DOM read would see the
  // pre-commit (stale/unchecked) state from the first call and clobber a
  // just-restored selection before the user ever sees it - vanilla's
  // direct DOM mutation never had this problem, since a plain
  // `checkbox.checked = true` assignment is synchronous.
  flushSync(() => {
    entry.root.render(
      <MultiSelectCheckboxList key={entry.renderCount} options={options} idPrefix={idPrefix} />,
    );
  });
  return true;
}

/**
 * Mounts the Review Stats tab's controls (Phase 3 - see
 * REACT_MIGRATION_PLAN.md). Mounts once into the static #stats-controls-root
 * container and is never re-mounted or torn down by vanilla afterward
 * (renderStatsView in index.page.js was updated to only rebuild the
 * sibling #stats-content-root) - statsViewState has no persisted/restored
 * override, so there's no restore-race to handle, just a one-time read of
 * its current value via window.getStatsViewState() for the initial props.
 */
function mountReviewStatsControls() {
  const container = document.getElementById('stats-controls-root');
  if (!container) {
    return;
  }
  const initialState =
    typeof window.getStatsViewState === 'function'
      ? window.getStatsViewState()
      : { sortBy: 'riskyApprovals', filterMode: 'all', topN: 12, minComments: 0, startDate: '', endDate: '' };
  ReactDOM.createRoot(container).render(
    <ReviewStatsControls
      initialState={initialState}
      onChange={(patch) => window.updateStatsViewStateAndRerender?.(patch)}
    />,
  );
}

/**
 * Mounts the Review Stats tab's summary cards/visuals/table/trend note
 * (Phase 3 - see REACT_MIGRATION_PLAN.md). Same mount-once/update-via-bridge
 * shape as Phase 1's mountReactPrTable/updateReactPrTable: mounts once into
 * the static #stats-content-root container with an empty initial state, and
 * index.page.js's renderStatsView calls window.updateReviewStatsContent(...)
 * on every subsequent stats render instead of rebuilding this container's
 * DOM directly (which would tear the mounted root out from under React -
 * see renderStatsView's own comment).
 */
function mountReviewStatsContent() {
  const container = document.getElementById('stats-content-root');
  if (!container) {
    return;
  }
  const root = ReactDOM.createRoot(container);
  root.render(<ReviewStatsContent stats={null} rows={[]} actorsMap={{}} />);
  window.updateReviewStatsContent = (stats, rows, actorsMap) => {
    root.render(<ReviewStatsContent stats={stats} rows={rows} actorsMap={actorsMap} />);
  };
}

/**
 * Mounts the Author Insights tab's "Author" selector (Phase 3 - see
 * REACT_MIGRATION_PLAN.md). Unlike Review Stats' controls, this
 * selector's *options* are rebuilt from the PR payload on every
 * author-insights render, not seeded once at mount - the same shape as
 * Phase 2's MultiSelectCheckboxList, including the incrementing `key` on
 * every update() call so this component's internal state fully
 * re-initializes from fresh props each time (matching the old vanilla
 * discard-and-rebuild behavior) rather than trying to diff against
 * whatever was selected before.
 */
function mountAuthorInsightsSelector() {
  const container = document.getElementById('author-insights-selector-root');
  if (!container) {
    return;
  }
  const root = ReactDOM.createRoot(container);
  let renderCount = 0;
  window.updateAuthorInsightsSelector = (options, selectedLogin) => {
    renderCount += 1;
    root.render(
      <AuthorInsightsSelector
        key={renderCount}
        options={options}
        selectedLogin={selectedLogin}
        onChange={(login) => window.selectAuthorInsightsAuthor?.(login)}
      />,
    );
    return true;
  };
}

/**
 * Mounts the Author Insights tab's "PRs created by this author" section
 * (Phase 3 - see REACT_MIGRATION_PLAN.md). Same shape as
 * mountAuthorInsightsSelector above: mounted once into the static
 * #author-insights-created-prs-root container, updated via
 * window.updateAuthorInsightsCreatedPrs(rows) with an incrementing `key`
 * on every call so the section's DOM (built by the legacy vanilla
 * builder wrapped inside AuthorCreatedPrsSection) is always rebuilt
 * fresh, not left stale when only the selected author changed underneath
 * an unchanged `rows` reference.
 */
function mountAuthorCreatedPrsSection() {
  const container = document.getElementById('author-insights-created-prs-root');
  if (!container) {
    return;
  }
  const root = ReactDOM.createRoot(container);
  let renderCount = 0;
  window.updateAuthorInsightsCreatedPrs = (rows) => {
    renderCount += 1;
    root.render(<AuthorCreatedPrsSection key={renderCount} rows={rows} />);
    return true;
  };
}

/**
 * Mounts the Author Insights tab's "Showing insights for <author>" header
 * (Phase 3 - see REACT_MIGRATION_PLAN.md). Mount-once/update-via-bridge, no
 * key needed: unlike the selector/created-PRs sections, this component has
 * no internal state to discard on every update, so a plain re-render with
 * new props is enough.
 */
function mountAuthorInsightsHeader() {
  const container = document.getElementById('author-insights-header-root');
  if (!container) {
    return;
  }
  const root = ReactDOM.createRoot(container);
  root.render(<AuthorInsightsHeader selectedAuthorName="" />);
  window.updateAuthorInsightsHeader = (selectedAuthorName) => {
    root.render(<AuthorInsightsHeader selectedAuthorName={selectedAuthorName} />);
    return true;
  };
}

/**
 * Mounts the Author Insights tab's "PR-linked custom comments and
 * sentiment" section (Phase 3 - see REACT_MIGRATION_PLAN.md). Mount-once/
 * update-via-bridge, no key needed: renderAuthorInsights
 * (pr-author-insights.component.js) passes a freshly-computed
 * `selectedAuthor` object as a prop (not read from a closure like
 * AuthorCreatedPrsSection's rows-only prop), so a plain
 * useEffect([rows, selectedAuthor, actorsMap]) inside
 * AuthorInsightsNotesSection already re-runs on every author switch
 * without an incrementing key.
 */
function mountAuthorInsightsNotesSection() {
  const container = document.getElementById('author-insights-notes-root');
  if (!container) {
    return;
  }
  const root = ReactDOM.createRoot(container);
  root.render(<AuthorInsightsNotesSection rows={[]} selectedAuthor={null} actorsMap={{}} />);
  window.updateAuthorInsightsNotes = (rows, selectedAuthor, actorsMap) => {
    root.render(
      <AuthorInsightsNotesSection rows={rows} selectedAuthor={selectedAuthor} actorsMap={actorsMap} />,
    );
    return true;
  };
}

/**
 * Mounts the Author Insights tab's "Manual author comments" composer/list
 * (Phase 3 - see REACT_MIGRATION_PLAN.md). Reuses the existing
 * #author-insights-content-root container (previously a plain
 * "rebuild-every-render" scratch host, now this section's own persistent
 * React root, matching every other Author Insights sibling container) - no
 * index.html change needed. Mount-once/update-via-bridge, no key needed,
 * same reasoning as mountAuthorInsightsNotesSection: `selectedAuthor` is a
 * freshly-computed prop on every call, so a plain re-render already picks
 * up every author switch.
 */
function mountAuthorInsightsCommentsSection() {
  const container = document.getElementById('author-insights-content-root');
  if (!container) {
    return;
  }
  const root = ReactDOM.createRoot(container);
  root.render(<AuthorInsightsCommentsSection rows={[]} selectedAuthor={null} actorsMap={{}} />);
  window.updateAuthorInsightsComments = (rows, selectedAuthor, actorsMap) => {
    root.render(
      <AuthorInsightsCommentsSection rows={rows} selectedAuthor={selectedAuthor} actorsMap={actorsMap} />,
    );
    return true;
  };
}

/**
 * Mounts the Backfill tab's status badges (Phase 3 - see
 * REACT_MIGRATION_PLAN.md). Mounts directly into the existing
 * #backfill-badges container - see BackfillBadges.jsx's own comment for why
 * no container-split or `key` remount is needed here, unlike every other
 * Phase 3 conversion so far.
 */
function mountBackfillBadges() {
  const container = document.getElementById('backfill-badges');
  if (!container) {
    return;
  }
  const root = ReactDOM.createRoot(container);
  root.render(<BackfillBadges badges={[]} />);
  window.updateReactBackfillBadges = (badges) => {
    root.render(<BackfillBadges badges={badges} />);
    return true;
  };
}

/**
 * Expose mounting function globally for vanilla JS to call
 * This allows the existing index.page.js to mount the React app
 */
if (typeof window !== 'undefined') {
  window.mountReactPrTable = mountReactPrTable;
  console.log('[React Migration] mountReactPrTable() exposed globally');

  window.renderReactMultiSelectList = renderReactMultiSelectList;
  mountMultiSelectLists();

  mountPrNumberFilterInput();
  mountScopeFilterSelect();
  mountAlwaysShowInReviewCheckbox();
  mountAttentionNoActivityModeSelect();
  mountFilterCheckboxes(ATTENTION_RULE_CHECKBOX_FIELDS);
  mountAuthorThreadResolutionModeSelect();
  mountRunScriptTextInputs();
  mountOpenModeSelect();
  mountFilterCheckboxes(RUN_SCRIPT_CHECKBOX_FIELDS);
  mountFilterOptionSelects();
  mountFilterCheckboxes(CHANGE_FILTER_CHECKBOX_FIELDS);
  mountIgnoreCommitPatternsTextarea();
  mountReviewStatsControls();
  mountReviewStatsContent();
  mountAuthorInsightsSelector();
  mountAuthorInsightsHeader();
  mountAuthorInsightsNotesSection();
  mountAuthorInsightsCommentsSection();
  mountAuthorCreatedPrsSection();
  mountBackfillBadges();

  // react-app.jsx is loaded as an ES module, which the browser always defers
  // until after classic scripts (including index.page.js) have run. If the
  // initial PR data fetch in index.page.js resolves before this module graph
  // finishes loading, its first renderPrData() call falls back to vanilla
  // rendering since window.mountReactPrTable isn't defined yet. Announce
  // readiness so index.page.js can retry once React is actually available.
  window.dispatchEvent(new CustomEvent('viewprs:react-ready'));
}
