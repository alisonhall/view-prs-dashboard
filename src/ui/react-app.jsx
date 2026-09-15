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
import { flushSync, createPortal } from 'react-dom';
import { PrTableApp } from './components/PrTableApp';
import { PrNumberFilterInput } from './components/PrNumberFilterInput';
import { ScopeFilterSelect } from './components/ScopeFilterSelect';
import { AlwaysShowInReviewCheckbox } from './components/AlwaysShowInReviewCheckbox';
import { ContextFilterCheckbox } from './components/ContextFilterCheckbox';
import { AttentionNoActivityModeSelect } from './components/AttentionNoActivityModeSelect';
import { AuthorThreadResolutionModeSelect } from './components/AuthorThreadResolutionModeSelect';
import { ContextRunScriptTextInput } from './components/ContextRunScriptTextInput';
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
import { AppliedFilterSummary } from './components/AppliedFilterSummary';
import { FilterStateProvider } from './state/FilterStateProvider';

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

  const root = ReactDOM.createRoot(containerElement);

  // Store props reference for updates
  let currentProps = { ...props };

  // Create update function
  const updateTable = (newPayload, newSelectedRepo, newVisiblePrNumbers) => {
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

  return root;
}

/**
 * Mounts the shared filter-state Context provider (Phase 6 - see
 * REACT_MIGRATION_PLAN.md) and, via `createPortal`, every Run & Filter
 * field migrated onto it.
 *
 * Every field mounted by this module needs its value to reach a *shared*
 * Context, and Context can't cross independent `createRoot()` tree
 * boundaries - `createPortal` is what makes one shared tree possible
 * without moving any markup in index.html: this function mounts exactly
 * one root (attached to a detached anchor node, never inserted into the
 * visible DOM - it doesn't need to be, since portals render their
 * children into the *target* nodes below, not the anchor), and portals
 * each field into its existing, now-empty `<span id="…-root">` container.
 *
 * Initial Context values are the same hardcoded defaults
 * `getUiOptionDefaults()` (index.page.js) uses - there's no vanilla
 * fallback markup left to read a "currently showing" value from, since
 * React is the only thing that ever renders into these containers now.
 * `restoreUiOptionOverrides()` (a real async fetch) still overwrites these
 * via `window.setFilterStateValue` once it resolves, same as any other
 * Context update.
 */
// Context-backed checkboxes with no field-specific behavior (see
// ContextFilterCheckbox.jsx) - each entry's `key` must have a matching
// entry in index.page.js's FILTER_STATE_FIELD_MAP for its value to reach
// the render pipeline/persistence, and in FilterStateProvider's own
// debounced-apply effect dependency list if it should auto-apply on
// change. The five "Needs Attention rules" checkboxes do (mirroring their
// membership in debouncedApplyOnChangeIds); the three "Run Script
// options" checkboxes don't - they're only ever read via `new
// FormData(form)` when the "Run script" button is clicked (see
// getFormBody, index.page.js), same as the Run Script text inputs/select
// below, so no debounced-apply behavior applies to them either way.
const FILTER_STATE_CONTEXT_CHECKBOX_FIELDS = [
  { id: 'attention-include-pending-comments', name: 'attentionIncludePendingComments', key: 'attentionIncludePendingComments', defaultValue: true },
  { id: 'attention-ignore-merge-only-commits', name: 'attentionIgnoreMergeOnlyCommits', key: 'attentionIgnoreMergeOnlyCommits', defaultValue: false },
  { id: 'attention-include-closed-merged', name: 'attentionIncludeClosedMerged', key: 'attentionIncludeClosedMerged', defaultValue: true },
  { id: 'attention-include-draft-changed', name: 'attentionIncludeDraftChanged', key: 'attentionIncludeDraftChanged', defaultValue: true },
  { id: 'attention-include-draft-no-activity', name: 'attentionIncludeDraftNoActivity', key: 'attentionIncludeDraftNoActivity', defaultValue: false },
  { id: 'ack-changed', name: 'ackChanged', key: 'ackChanged', defaultValue: false },
  { id: 'show-reason', name: 'showReason', key: 'showReason', defaultValue: true },
  { id: 'quiet', name: 'quiet', key: 'quiet', defaultValue: false },
  // change-filter-use-builtin-merge-pattern DOES auto-persist+apply on
  // change (its own special-case branch in the delegated #run-script-form
  // listener, index.page.js) - but that stays owned entirely by the
  // delegated listener reacting to the real native "change" event this
  // element always fires, unaffected by Context migration, so it's added
  // to FilterStateProvider's own debounced-apply deps below only for the
  // same "harmless double-hookup" consistency every other auto-apply
  // field gets, not because it's required for correctness.
  { id: 'change-filter-use-builtin-merge-pattern', name: 'changeFilterUseBuiltinMergePattern', key: 'changeFilterUseBuiltinMergePattern', defaultValue: true },
];

// Context-backed text/number inputs (see ContextRunScriptTextInput.jsx) -
// the four "Run Script options" fields. Same "only read via FormData on
// button click" reasoning as the checkboxes above.
const FILTER_STATE_TEXT_FIELDS = [
  { id: 'repo', name: 'repo', key: 'repo', type: 'text', placeholder: 'optum-rx-clinicalproducts/orx-cpp-mp-uis', defaultValue: '' },
  { id: 'limit', name: 'limit', key: 'limit', type: 'number', placeholder: '200', defaultValue: '' },
  { id: 'merged-limit', name: 'mergedLimit', key: 'mergedLimit', type: 'number', placeholder: '15', defaultValue: '' },
  { id: 'jobs', name: 'jobs', key: 'jobs', type: 'number', placeholder: '6', defaultValue: '' },
];

function mountFilterStateProvider() {
  const scopeModeContainer = document.getElementById('scope-mode-root');
  const alwaysShowInReviewContainer = document.getElementById('always-show-in-review-root');
  const attentionNoActivityModeContainer = document.getElementById(
    'attention-no-activity-mode-root',
  );
  const openModeContainer = document.getElementById('open-mode-root');
  const filterPrNumbersContainer = document.getElementById('filter-pr-numbers-root');
  const authorThreadResolutionModeContainer = document.getElementById(
    'attention-author-thread-resolution-mode-root',
  );
  const ignoreCommitPatternsContainer = document.getElementById(
    'change-filter-ignore-commit-patterns-root',
  );
  const contextCheckboxContainers = FILTER_STATE_CONTEXT_CHECKBOX_FIELDS.map((field) => ({
    ...field,
    container: document.getElementById(`${field.id}-root`),
  }));
  const contextTextContainers = FILTER_STATE_TEXT_FIELDS.map((field) => ({
    ...field,
    container: document.getElementById(`${field.id}-root`),
  }));
  const contextOptionSelectContainers = FILTER_OPTION_SELECT_FIELDS.map((field) => ({
    ...field,
    container: document.getElementById(`${field.id}-root`),
  }));

  const anyContainerExists =
    scopeModeContainer ||
    alwaysShowInReviewContainer ||
    attentionNoActivityModeContainer ||
    openModeContainer ||
    filterPrNumbersContainer ||
    authorThreadResolutionModeContainer ||
    ignoreCommitPatternsContainer ||
    contextCheckboxContainers.some((field) => field.container) ||
    contextTextContainers.some((field) => field.container) ||
    contextOptionSelectContainers.some((field) => field.container);
  if (!anyContainerExists) {
    return;
  }

  // Same defaults as getUiOptionDefaults() (index.page.js) - no vanilla
  // fallback markup is left to read a "currently showing" value from.
  const initialValues = {
    scopeMode: 'all',
    alwaysShowInReview: false,
    attentionNoActivityMode: 'all',
    openMode: 'none',
    filterPrNumbers: '',
    attentionAuthorThreadResolutionMode: 'allow-all',
    changeFilterIgnoreCommitPatterns: '',
  };
  contextCheckboxContainers.forEach((field) => {
    initialValues[field.key] = field.defaultValue;
  });
  contextTextContainers.forEach((field) => {
    initialValues[field.key] = field.defaultValue;
  });
  contextOptionSelectContainers.forEach((field) => {
    initialValues[field.key] = field.options[0]?.value ?? '';
  });

  // The anchor must actually be attached to the document (just hidden),
  // not a fully detached node: React attaches this root's own delegated
  // native event listener to the container passed to createRoot(), and a
  // detached container would never receive events that bubble through the
  // real document tree from the portal targets below (which *are*
  // attached - every "…-root" container is a real part of the page).
  // Portal targets get their own listener attachment too, but there's no
  // reason to depend on that nuance when a hidden, attached anchor
  // sidesteps the question entirely.
  const anchor = document.createElement('div');
  anchor.hidden = true;
  document.body.appendChild(anchor);
  const root = ReactDOM.createRoot(anchor);
  root.render(
    <FilterStateProvider initialValues={initialValues}>
      {scopeModeContainer && createPortal(<ScopeFilterSelect />, scopeModeContainer)}
      {alwaysShowInReviewContainer &&
        createPortal(<AlwaysShowInReviewCheckbox />, alwaysShowInReviewContainer)}
      {attentionNoActivityModeContainer &&
        createPortal(<AttentionNoActivityModeSelect />, attentionNoActivityModeContainer)}
      {openModeContainer && createPortal(<OpenModeSelect />, openModeContainer)}
      {filterPrNumbersContainer &&
        createPortal(<PrNumberFilterInput />, filterPrNumbersContainer)}
      {authorThreadResolutionModeContainer &&
        createPortal(<AuthorThreadResolutionModeSelect />, authorThreadResolutionModeContainer)}
      {ignoreCommitPatternsContainer &&
        createPortal(<IgnoreCommitPatternsTextarea />, ignoreCommitPatternsContainer)}
      {contextCheckboxContainers.map(
        (field) =>
          field.container &&
          createPortal(
            <ContextFilterCheckbox id={field.id} name={field.name} filterStateKey={field.key} />,
            field.container,
            field.id,
          ),
      )}
      {contextTextContainers.map(
        (field) =>
          field.container &&
          createPortal(
            <ContextRunScriptTextInput
              id={field.id}
              name={field.name}
              type={field.type}
              placeholder={field.placeholder}
              filterStateKey={field.key}
            />,
            field.container,
            field.id,
          ),
      )}
      {contextOptionSelectContainers.map(
        (field) =>
          field.container &&
          createPortal(
            <FilterOptionSelect
              id={field.id}
              name={field.name}
              options={field.options}
              filterStateKey={field.key}
            />,
            field.container,
            field.id,
          ),
      )}
    </FilterStateProvider>,
  );
}

// Context-backed "Any (with/without)" plain-metadata filter selects (see
// FilterOptionSelect.jsx) - each `key` matches the field's `name`
// attribute and has a corresponding entry in index.page.js's
// FILTER_STATE_FIELD_MAP. None of these are read via a direct DOM read
// outside pr-filter-panel.helpers.js's getCustomCommentsFilter/etc.
// (each only called when "Apply filters (local)" is clicked), and none
// are in debouncedApplyOnChangeIds, so FilterStateProvider's
// debounced-apply effect dependency list doesn't need these keys either.
const FILTER_OPTION_SELECT_FIELDS = [
  {
    id: 'filter-custom-comments',
    name: 'filterCustomComments',
    key: 'filterCustomComments',
    options: [
      { value: '', label: 'Any (with or without)' },
      { value: 'with', label: 'With custom comments' },
      { value: 'without', label: 'Without custom comments' },
    ],
  },
  {
    id: 'filter-other-notes',
    name: 'filterOtherNotes',
    key: 'filterOtherNotes',
    options: [
      { value: '', label: 'Any (with or without)' },
      { value: 'with', label: 'With other notes' },
      { value: 'without', label: 'Without other notes' },
    ],
  },
  {
    id: 'filter-pr-difficulty',
    name: 'filterPrDifficulty',
    key: 'filterPrDifficulty',
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
    key: 'filterRallyStories',
    options: [
      { value: '', label: 'Any (with or without)' },
      { value: 'with', label: 'With Rally stories' },
      { value: 'without', label: 'Without Rally stories' },
    ],
  },
  {
    id: 'filter-rally-links',
    name: 'filterRallyLinks',
    key: 'filterRallyLinks',
    options: [
      { value: '', label: 'Any (with or without)' },
      { value: 'with', label: 'With Rally links' },
      { value: 'without', label: 'Without Rally links' },
    ],
  },
  {
    id: 'filter-analysis-of-pr',
    name: 'filterAnalysisOfPr',
    key: 'filterAnalysisOfPr',
    options: [
      { value: '', label: 'Any (with or without)' },
      { value: 'with', label: 'With analysis' },
      { value: 'without', label: 'Without analysis' },
    ],
  },
];

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
 * checkbox-id prefix its options previously used (the vanilla fallback's
 * own id-generation scheme, since removed along with the rest of its
 * DOM-building code from pr-filter-panel.helpers.js - see the
 * `${idPrefix}-${login}-${index}` scheme still in index.page.js's own
 * renderActorOptionsList/renderChangeFilterActorList) so generated ids
 * stay stable across the conversion. Covers every multi-select in the app:
 * five owned by pr-filter-panel.helpers.js (label/exclude-label/author/
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
 * index.page.js (via pr-filter-panel.helpers.js's `renderMultiSelectList`
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
  // root.render() alone doesn't commit synchronously (React 18 batches
  // it) - without flushSync, a same-tick DOM read right after this call
  // (e.g. getSelectedMultiSelectValues, used to seed a *different* list's
  // selections or a later render's "currently checked" state) could see
  // the pre-commit (stale/unchecked) state and clobber a just-restored
  // selection before the user ever sees it - vanilla's direct DOM
  // mutation never had this problem, since a plain
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

let appliedFilterSummaryRoot = null;

/**
 * Mounts the "Applied filters: ..." summary line + chip list (Run & Filter
 * tab, Visibility Filters panel) into the single #management-filter-summary-root
 * placeholder that replaced the old standalone <pre>/<div> pair in
 * index.html - one container for both pieces, since AppliedFilterSummary
 * renders them together as a fragment.
 */
function mountAppliedFilterSummary() {
  const container = document.getElementById('management-filter-summary-root');
  if (!container) {
    return;
  }
  appliedFilterSummaryRoot = ReactDOM.createRoot(container);
  appliedFilterSummaryRoot.render(<AppliedFilterSummary summaryText="" filterChips={[]} />);
}

/**
 * Renders the Applied-filters summary/chips via React. Called by
 * index.page.js (via pr-filter-panel.helpers.js's
 * renderManagementFilterSummary) every time filters are (re)applied.
 * Returns false if this module hasn't mounted it yet - the same load-order
 * race every other Phase 2/3 field tolerates - so the caller just skips
 * that one render instead of falling back to manual DOM-building.
 *
 * @param {string} summaryText
 * @param {string[]} filterChips
 * @returns {boolean} whether React handled the render
 */
function renderReactFilterSummary(summaryText, filterChips) {
  if (!appliedFilterSummaryRoot) {
    return false;
  }
  appliedFilterSummaryRoot.render(
    <AppliedFilterSummary summaryText={summaryText} filterChips={filterChips} />,
  );
  return true;
}

/**
 * Expose mounting function globally for vanilla JS to call
 * This allows the existing index.page.js to mount the React app
 */
if (typeof window !== 'undefined') {
  window.mountReactPrTable = mountReactPrTable;

  window.renderReactMultiSelectList = renderReactMultiSelectList;
  mountMultiSelectLists();

  window.renderReactFilterSummary = renderReactFilterSummary;
  mountAppliedFilterSummary();

  mountFilterStateProvider();
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
