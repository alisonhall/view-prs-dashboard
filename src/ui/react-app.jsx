/**
 * React App Entry Point for view-prs
 *
 * Phase 1: Hybrid React Table Migration
 * - Mounts React only for PR table rendering
 * - Keeps vanilla JS for filters, controls, and other tabs
 * - Provides bridge between vanilla JS and React
 */

import { Suspense, lazy, useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { createPortal } from 'react-dom';
import { PrTableApp } from './components/PrTableApp';
import { PrNumberFilterInput } from './components/PrNumberFilterInput';
import { ScopeFilterSelect } from './components/ScopeFilterSelect';
import { AlwaysShowInReviewCheckbox } from './components/AlwaysShowInReviewCheckbox';
import { ContextFilterCheckbox } from './components/ContextFilterCheckbox';
import { AttentionNoActivityModeSelect } from './components/AttentionNoActivityModeSelect';
import { AuthorThreadResolutionModeSelect } from './components/AuthorThreadResolutionModeSelect';
import { AuthorThreadResolutionRuleVisibility } from './components/AuthorThreadResolutionRuleVisibility';
import { ContextRunScriptTextInput } from './components/ContextRunScriptTextInput';
import { OpenModeSelect } from './components/OpenModeSelect';
import { MultiSelectListPortals, MULTI_SELECT_LIST_ID_PREFIXES } from './components/MultiSelectListPortals';
import { FilterOptionSelect } from './components/FilterOptionSelect';
import { IgnoreCommitPatternsTextarea } from './components/IgnoreCommitPatternsTextarea';
import { ApplyLabelSelect } from './components/ApplyLabelSelect';
import { AutoRenderBlockedLinks } from './components/AutoRenderBlockedLinks';
import { MergedRequestMoreAction } from './components/MergedRequestMoreAction';
import { BackfillBadges } from './components/BackfillBadges';
import { BackfillControls } from './components/BackfillControls';
import { BackfillLogControls } from './components/BackfillLogControls';
import { AppliedFilterSummary } from './components/AppliedFilterSummary';
import { useAppliedFilterSummary } from './state/useAppliedFilterSummary';
import { TableFilterChips } from './components/TableFilterChips';
import { useTableFilterChips } from './state/useTableFilterChips';
import { useMergedRequestMoreActionOptions } from './state/useMergedRequestMoreActionOptions';
import { useRequestMoreMerged } from './state/useRequestMoreMerged';
import { Snackbar } from './components/Snackbar';
import { SnackbarProvider } from './components/SnackbarProvider';
import { TriggerAutoRunButton } from './components/TriggerAutoRunButton';
import { RunScriptActionButton } from './components/RunScriptActionButton';
import { QuickCheckButton } from './components/QuickCheckButton';
import { QuickCheckAllButton } from './components/QuickCheckAllButton';
import { PrDataPolling, readDataPollMsOverride } from './components/PrDataPolling';
import { useBackfillActions } from './state/useBackfillActions';
import { useBackfillTabAutoRefresh } from './state/useBackfillTabAutoRefresh';
import { useRunScript } from './state/useRunScript';
import { useAckLabelActions } from './state/useAckLabelActions';
import { useTriggerAutoRun } from './state/useTriggerAutoRun';
import { useQuickCheckActions } from './state/useQuickCheckActions';
import { useActivityDrawerActions } from './state/useActivityDrawerActions';
import { PrDataProvider } from './state/PrDataProvider';
import { usePrData } from './state/PrDataContext';
import { FilterStateProvider } from './state/FilterStateProvider';
import { useFilterState } from './state/FilterStateContext';
import { NeedsAttentionProvider } from './components/NeedsAttentionProvider';
import { TabStateProvider } from './components/TabStateProvider';
import { TabPanelVisibilitySync } from './components/TabPanelVisibilitySync';
import { DataTabButton } from './components/DataTabButton';
import { ManagementTabButton } from './components/ManagementTabButton';
import { AutoRenderBlockingProvider } from './components/AutoRenderBlockingProvider';
import { AutoRenderBlockingSync } from './components/AutoRenderBlockingSync';
import { useAutoRenderBlocking } from './state/AutoRenderBlockingContext';
import { useAuthorInsights } from './state/AuthorInsightsContext';
import { createPrAutoRenderIndicatorHelpers } from './helpers/pr-auto-render-indicator.helpers.js';
import { AutoRenderBlockedStatusText } from './components/AutoRenderBlockedStatusText';
import { AutoRenderBlockedApplyButton } from './components/AutoRenderBlockedApplyButton';
import { NotesDirtyProvider } from './components/NotesDirtyProvider';
import { PrInsightsDisplayProvider } from './components/PrInsightsDisplayProvider';
import { ReviewConversationsUiStateProvider } from './components/ReviewConversationsUiStateProvider';
import { ReviewStatsProvider } from './components/ReviewStatsProvider';
import { AuthorInsightsProvider } from './components/AuthorInsightsProvider';
import { FilterOptionsProvider } from './components/FilterOptionsProvider';
import { JobEventsProvider } from './components/JobEventsProvider';
import { PrActivityQueueProvider } from './components/PrActivityQueueProvider';
import { StatusTextProvider } from './components/StatusTextProvider';
import { OutputTextProvider } from './components/OutputTextProvider';
import { RequestActivityProvider } from './components/RequestActivityProvider';
import { useRequestActivityDisplay } from './state/RequestActivityContext';
import { useOutputText } from './state/OutputTextContext';
import { useBackfillStatus } from './state/BackfillStatusContext';
import { BackfillStatusProvider } from './components/BackfillStatusProvider';
import { RepoLabelsProvider } from './components/RepoLabelsProvider';
import { useRepoLabels } from './state/RepoLabelsContext';
import { AuthorInsightsDraftsProvider } from './components/AuthorInsightsDraftsProvider';
import { RowFilterSelectionProvider } from './state/RowFilterSelectionProvider';
import { AuthorThreadResolutionSelectionProvider } from './state/AuthorThreadResolutionSelectionProvider';
import { ChangeFilterActorSelectionProvider } from './state/ChangeFilterActorSelectionProvider';
import { ActivityDrawer } from './components/ActivityDrawer';
import { useHasTabPanelBeenVisible } from './state/useIsTabPanelVisible';

/**
 * Deferred-items follow-up, item 5 (see REACT_MIGRATION_PLAN.md):
 * code-splitting for the 3 tabs that are never visible on initial load
 * (Review Stats, Author Insights, and 3 of the management tabs - Action
 * Log, Actor Names, Export - all `hidden` by default in index.html, see
 * <AppRoot /> below). `React.lazy()` needs a default export; each of these
 * modules only has a named one, so the loader adapts it inline. Gated on
 * useHasTabPanelBeenVisible (sticky, not plain useIsTabPanelVisible) so
 * once a tab's chunk has loaded and mounted, switching away and back
 * doesn't unmount/remount it - see that hook's own doc comment for why
 * (several of these hold local-only UI state a remount would silently
 * reset).
 */
const ReviewStatsControls = lazy(() =>
  import('./components/ReviewStatsControls').then((m) => ({ default: m.ReviewStatsControls })),
);
const ReviewStatsContent = lazy(() =>
  import('./components/ReviewStatsContent').then((m) => ({ default: m.ReviewStatsContent })),
);
const AuthorInsightsSelector = lazy(() =>
  import('./components/AuthorInsightsSelector').then((m) => ({ default: m.AuthorInsightsSelector })),
);
const AuthorCreatedPrsSection = lazy(() =>
  import('./components/AuthorCreatedPrsSection').then((m) => ({ default: m.AuthorCreatedPrsSection })),
);
const AuthorInsightsHeader = lazy(() =>
  import('./components/AuthorInsightsHeader').then((m) => ({ default: m.AuthorInsightsHeader })),
);
const AuthorInsightsNotesSection = lazy(() =>
  import('./components/AuthorInsightsNotesSection').then((m) => ({ default: m.AuthorInsightsNotesSection })),
);
const AuthorInsightsCommentsSection = lazy(() =>
  import('./components/AuthorInsightsCommentsSection').then((m) => ({ default: m.AuthorInsightsCommentsSection })),
);
const ActionLogSection = lazy(() =>
  import('./components/ActionLogSection').then((m) => ({ default: m.ActionLogSection })),
);
const ExportTab = lazy(() => import('./components/ExportTab').then((m) => ({ default: m.ExportTab })));
const ActorNamesTab = lazy(() => import('./components/ActorNamesTab').then((m) => ({ default: m.ActorNamesTab })));

/**
 * Track C, slice C2d (post-Phase-6 follow-up, see REACT_MIGRATION_PLAN.md):
 * unifying all of react-app.jsx's independent React roots into one shared
 * tree (see <AppRoot /> below and its own doc comment) means every field
 * migrated onto FilterStateProvider - previously mounted into its own
 * dedicated root (this function) - is now just a piece of that one tree,
 * via the same `createPortal` technique this function always used. This is
 * no longer a standalone mount function; it returns the initial Context
 * values plus the portal elements themselves, for <AppRoot /> to render as
 * part of its own single root.
 *
 * Every field rendered here needs its value to reach a *shared* Context,
 * and Context can't cross independent `createRoot()` tree boundaries -
 * `createPortal` is what makes one shared tree possible without moving any
 * markup in index.html: each field portals into its existing, now-empty
 * `<span id="…-root">` container.
 *
 * Initial Context values are the same hardcoded defaults
 * `getUiOptionDefaults()` (helpers/pr-ui-option-persistence.helpers.js)
 * uses - there's no vanilla fallback markup left to read a "currently
 * showing" value from, since React is the only thing that ever renders
 * into these containers now. FilterStateProvider's own mount effect (a
 * real async fetch) still overwrites these with any saved overrides once
 * it resolves - a direct `setValues` call from inside that effect, not a
 * flushSync-wrapped bridge call reaching in from outside (see
 * state/FilterStateProvider.jsx's own header comment).
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
  { id: 'repo', name: 'repo', key: 'repo', type: 'text', placeholder: 'owner/repo', defaultValue: '' },
  { id: 'limit', name: 'limit', key: 'limit', type: 'number', placeholder: '200', defaultValue: '' },
  { id: 'merged-limit', name: 'mergedLimit', key: 'mergedLimit', type: 'number', placeholder: '15', defaultValue: '' },
  { id: 'jobs', name: 'jobs', key: 'jobs', type: 'number', placeholder: '6', defaultValue: '' },
  // Phase 7 (see REACT_MIGRATION_PLAN.md): the one remaining field in this
  // group - previously left as plain vanilla markup specifically because
  // PrSelectionCell.jsx's bulk-select checkboxes read/write its value too
  // (off their own one-off window.getSelectedPrNumbers/updateSelectedPrNumbers
  // bridge). Now Context-backed like its 4 siblings; PrSelectionCell.jsx
  // reads/writes the same prNumbersInput Context key through a per-key
  // store (useFilterFieldValue, Phase 5 of the window-bridge elimination -
  // it used to use window.getFilterStateValues()/setFilterStateValue())
  // rather than subscribing via useFilterState(), since it's mounted once
  // per visible table row - a whole-object subscription there would re-render
  // every row's checkbox on every keystroke in ANY of the 30+ filter
  // fields, not just this one.
  { id: 'pr-numbers', name: 'prNumbers', key: 'prNumbersInput', type: 'text', placeholder: '912,921', defaultValue: '' },
];

// Phase H.20 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
// cluster 6): extracted out of buildFilterStateFieldPortals() below (still
// its only other caller) so mountAppRoot() can compute FilterStateProvider's
// initialValues once, at module load, with no DOM dependency - needed now
// that FilterStateProvider itself moves from inside AppRoot's own returned
// JSX to wrapping <AppRoot/> at mountAppRoot()'s own render() call (closing
// window.getFormBody - see useFormBody.jsx). Pure defaults, same values as
// getUiOptionDefaults() (helpers/pr-ui-option-persistence.helpers.js) - no
// vanilla fallback markup is left to read a "currently showing" value from.
function buildFilterStateInitialValues() {
  const initialValues = {
    scopeMode: 'all',
    alwaysShowInReview: false,
    attentionNoActivityMode: 'all',
    openMode: 'none',
    filterPrNumbers: '',
    attentionAuthorThreadResolutionMode: 'allow-all',
    changeFilterIgnoreCommitPatterns: '',
  };
  FILTER_STATE_CONTEXT_CHECKBOX_FIELDS.forEach((field) => {
    initialValues[field.key] = field.defaultValue;
  });
  FILTER_STATE_TEXT_FIELDS.forEach((field) => {
    initialValues[field.key] = field.defaultValue;
  });
  FILTER_OPTION_SELECT_FIELDS.forEach((field) => {
    initialValues[field.key] = field.options[0]?.value ?? '';
  });
  return initialValues;
}

function buildFilterStateFieldPortals() {
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

  const portals = [
    scopeModeContainer && createPortal(<ScopeFilterSelect />, scopeModeContainer, 'scope-mode'),
    alwaysShowInReviewContainer &&
      createPortal(<AlwaysShowInReviewCheckbox />, alwaysShowInReviewContainer, 'always-show-in-review'),
    attentionNoActivityModeContainer &&
      createPortal(<AttentionNoActivityModeSelect />, attentionNoActivityModeContainer, 'attention-no-activity-mode'),
    openModeContainer && createPortal(<OpenModeSelect />, openModeContainer, 'open-mode'),
    filterPrNumbersContainer &&
      createPortal(<PrNumberFilterInput />, filterPrNumbersContainer, 'filter-pr-numbers'),
    authorThreadResolutionModeContainer &&
      createPortal(<AuthorThreadResolutionModeSelect />, authorThreadResolutionModeContainer, 'author-thread-resolution-mode'),
    // Headless (renders nothing, no container needed) - see its own header
    // comment for why it stays a plain child here instead of a portal.
    <AuthorThreadResolutionRuleVisibility key="author-thread-resolution-visibility" />,
    ignoreCommitPatternsContainer &&
      createPortal(<IgnoreCommitPatternsTextarea />, ignoreCommitPatternsContainer, 'ignore-commit-patterns'),
    ...contextCheckboxContainers.map(
      (field) =>
        field.container &&
        createPortal(
          <ContextFilterCheckbox id={field.id} name={field.name} filterStateKey={field.key} />,
          field.container,
          field.id,
        ),
    ),
    ...contextTextContainers.map(
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
    ),
    ...contextOptionSelectContainers.map(
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
    ),
  ].filter(Boolean);

  return { portals };
}

// Context-backed "Any (with/without)" plain-metadata filter selects (see
// FilterOptionSelect.jsx) - each `key` matches the field's `name`
// attribute and has a corresponding entry in index.page.js's
// FILTER_STATE_FIELD_MAP, and each is part of FilterStateContext's own
// `values` object, so FilterStateProvider.jsx's debounced persistence
// watcher already covers every one of these keys with no extra wiring
// needed here.
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
 * Track C, slice C2d (post-Phase-6 follow-up, see REACT_MIGRATION_PLAN.md):
 * looks up every static DOM container this app mounts into, once. Kept
 * separate from <AppRoot />'s render body so it only runs a single time
 * (via useState's lazy initializer), not on every re-render - AppRoot
 * re-renders on every bridge update (poll tick, filter change, author
 * switch, etc.), and re-querying ~20 elements on each of those would be
 * pure waste.
 */
function computeStaticContainers() {
  const multiSelect = {};
  // Deferred-items follow-up (full vanilla-to-React sweep, see
  // REACT_MIGRATION_PLAN.md): each list's sibling <summary
  // class="multi-select-summary"> - MultiSelectCheckboxList.jsx now owns
  // rendering its own "(N selected)" count text into this element and
  // toggling the list container's own "empty" class, replacing
  // pr-filter-panel.helpers.js's updateMultiSelectSummary (deleted) and
  // index.page.js's per-list classList.add/remove("empty") calls (also
  // deleted, both covered every one of these same 9 lists).
  const multiSelectSummary = {};
  Object.keys(MULTI_SELECT_LIST_ID_PREFIXES).forEach((listId) => {
    const listContainer = document.getElementById(listId);
    multiSelect[listId] = listContainer;
    multiSelectSummary[listId] = listContainer?.closest('details')?.querySelector('.multi-select-summary') || null;
  });

  return {
    filterFields: buildFilterStateFieldPortals(),
    multiSelect,
    multiSelectSummary,
    reviewStatsControls: document.getElementById('stats-controls-root'),
    reviewStatsContent: document.getElementById('stats-content-root'),
    authorInsightsSelector: document.getElementById('author-insights-selector-root'),
    authorInsightsCreatedPrs: document.getElementById('author-insights-created-prs-root'),
    authorInsightsHeader: document.getElementById('author-insights-header-root'),
    authorInsightsNotes: document.getElementById('author-insights-notes-root'),
    authorInsightsComments: document.getElementById('author-insights-content-root'),
    backfillBadges: document.getElementById('backfill-badges'),
    // statusText (#status) moved to StatusTextProvider.jsx (Phase H.8) - it
    // resolves that container itself, no longer via this containers object.
    outputText: document.getElementById('output'),
    backfillDetails: document.getElementById('backfill-details'),
    backfillLog: document.getElementById('backfill-log'),
    backfillControls: document.getElementById('backfill-controls-root'),
    backfillLogControls: document.getElementById('backfill-log-controls-root'),
    dataMeta: document.getElementById('data-meta'),
    tableFilterChips: document.getElementById('table-filter-chips-root'),
    appliedFilterSummary: document.getElementById('management-filter-summary-root'),
    errorSnackbar: document.getElementById('error-snackbar-root'),
    triggerAutoRunBtn: document.getElementById('trigger-auto-run-btn-root'),
    quickCheckBtn: document.getElementById('quick-check-btn-root'),
    quickCheckAllBtn: document.getElementById('quick-check-all-btn-root'),
    runScriptBtn: document.getElementById('run-script-btn-root'),
    ackOnlyBtn: document.getElementById('ack-only-btn-root'),
    clearOnlyBtn: document.getElementById('clear-only-btn-root'),
    applyLabelBtn: document.getElementById('apply-label-btn-root'),
    refreshLabelsBtn: document.getElementById('refresh-labels-btn-root'),
    actionLog: document.getElementById('action-log-container'),
    actorNames: document.getElementById('actor-names-root'),
    export: document.getElementById('export-container'),
    applyLabelSelect: document.getElementById('apply-label-select-root'),
    autoRenderBlockedLinks: document.getElementById('auto-render-blocked-pr-links'),
    mergedRequestMoreAction: document.getElementById('merged-request-more-action'),
    activityDrawer: document.getElementById('activity-drawer-root'),
    tabPrData: document.getElementById('tab-pr-data-root'),
    tabReviewStats: document.getElementById('tab-review-stats-root'),
    tabAuthorInsights: document.getElementById('tab-author-insights-root'),
    tabStatus: document.getElementById('tab-status-root'),
    tabScript: document.getElementById('tab-script-root'),
    tabBackfill: document.getElementById('tab-backfill-root'),
    tabActionLog: document.getElementById('tab-action-log-root'),
    tabActorNameCache: document.getElementById('tab-actor-name-cache-root'),
    tabExport: document.getElementById('tab-export-root'),
    autoRenderBlockedStatus: document.getElementById('auto-render-blocked-status-root'),
    autoRenderBlockedApplyBtn: document.getElementById('auto-render-blocked-apply-btn-root'),
    prSections: document.getElementById('pr-sections'),
  };
}

/**
 * Track C, slice C2d (post-Phase-6 follow-up, see REACT_MIGRATION_PLAN.md):
 * the single React root for the whole app. Every piece that used to be its
 * own independent `ReactDOM.createRoot()` (PrTableApp, the Run & Filter
 * Context fields, every multi-select list, Review Stats, Author Insights,
 * Backfill badges, the applied-filter summary, PrDataPolling) is now a
 * child of this one tree, portaled into its existing DOM container via
 * `createPortal` - the same technique FilterStateProvider's fields already
 * used, just extended to everything. <PrDataProvider /> now wraps the
 * *whole* tree (not just PrTableApp), which is what actually unlocks
 * Context-based data sharing for a future slice (e.g. Review Stats/Author
 * Insights reading PR payload directly instead of via a push bridge,
 * Track C's original C3) - today, every non-PrTableApp consumer still
 * reads via the same window.* bridges as before, this slice only unifies
 * *where* everything renders, not yet *how* each piece gets its data.
 *
 * PrTableApp is the one consumer that doesn't mount eagerly: <PrTablePortal />
 * only renders it once PrDataProvider has rendered its first payload
 * (window-bridge elimination Phase 7 - index.page.js used to trigger this via
 * window.mountReactPrTable).
 */

// Phase 7, sub-phase 7.0 (see REACT_MIGRATION_PLAN.md): same default as
// index.page.js's own former getDefaultStatsStartDate() - 3 months back
// from today, formatted as a <input type="date"> value - now computed here
// since PrDataProvider's statsViewState is the sole source of truth.
const getDefaultStatsStartDate = () => {
  const now = new Date();
  const shifted = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, now.getUTCDate()));
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const DEFAULT_STATS_VIEW_STATE = {
  sortBy: 'riskyApprovals',
  filterMode: 'all',
  topN: 12,
  minComments: 0,
  startDate: getDefaultStatsStartDate(),
  endDate: '',
};

// Phase 7 (see REACT_MIGRATION_PLAN.md, "live filtering" follow-up): a
// thin wrapper so useAppliedFilterSummary() (a hook) can be called from
// AppRoot's JSX, which otherwise can't call hooks mid-render. Must be
// mounted inside both <RowFilterSelectionProvider> and <JobEventsProvider>
// - see where it's actually portaled in AppRoot's own JSX.
//
// Also portals #data-meta's text from the same single hook call, rather
// than a separate <DataMetaTextLive> component each independently calling
// useAppliedFilterSummary() - found via code review that two separate
// component instances don't share one useMemo/cache, so the whole
// row-filtering derivation inside useFilteredPrRows() (which this hook
// composes) was running twice per render for the exact same string. #data-
// meta showed exactly this same string even before this round (both were
// fed the same appliedSummaryText by the vanilla pipeline's
// applyRenderResults, pr-render-apply.helpers.js), so sharing one call is
// correct, not just cheaper.
//
// dataMetaText specifically falls back to "Loading..." until payload.ok
// confirms a real /view-prs/data response has loaded - without this,
// PrDataProvider's initial empty-seed payload ({}) would make
// useAppliedFilterSummary() compute a premature, real-looking summary
// ("Applied filters: repo=all repos | ... | Rows: 0") in the window before
// the first fetch resolves, where the old window.updateReactDataMetaText-fed
// version showed an explicit "Loading..." placeholder. The chip text itself
// (summaryText, passed to AppliedFilterSummary below) is left as-is - this
// guard is specifically about restoring #data-meta's own prior placeholder
// behavior, not a new requirement for the chip.
function AppliedFilterSummaryLive({ appliedFilterSummaryContainer, dataMetaContainer }) {
  const { payload } = usePrData();
  const { summaryText, filterChips } = useAppliedFilterSummary();
  const dataMetaText = payload?.ok ? summaryText : 'Loading...';
  return (
    <>
      {appliedFilterSummaryContainer &&
        createPortal(
          <AppliedFilterSummary summaryText={summaryText} filterChips={filterChips} />,
          appliedFilterSummaryContainer,
          'applied-filter-summary',
        )}
      {dataMetaContainer && createPortal(dataMetaText, dataMetaContainer, 'data-meta')}
    </>
  );
}

// Removable filter chips shown above the table (Data Views tab) - a thin
// wrapper so useTableFilterChips() (a hook) can be called from AppRoot's
// JSX, same pattern as AppliedFilterSummaryLive above. Must be mounted
// inside both <RowFilterSelectionProvider> and <FilterStateProvider> - see
// where it's actually portaled in AppRoot's own JSX, right alongside
// AppliedFilterSummaryLive which has the same requirement.
function TableFilterChipsLive({ container }) {
  const { chips } = useTableFilterChips();
  if (!container) return null;
  return createPortal(<TableFilterChips chips={chips} />, container, 'table-filter-chips');
}

// The "↻ Labels" button - a thin wrapper so useRepoLabels() (a hook) can
// be called from inside <RepoLabelsProvider>'s own subtree, same pattern
// as TableFilterChipsLive above. Must be mounted inside
// <RepoLabelsProvider> specifically (see where it's actually rendered in
// AppRoot's own JSX) - AppRoot itself can't call useRepoLabels() directly
// in its own body, since that Provider is a descendant AppRoot renders
// further down its own JSX, not an ancestor (see RepoLabelsProvider.jsx's
// own comment).
function RefreshLabelsButtonLive({ container }) {
  const { refresh } = useRepoLabels();
  if (!container) return null;
  return createPortal(
    <RunScriptActionButton
      id="refresh-labels-btn"
      title="Reload labels for the current repo"
      label={'↻ Labels'}
      onClick={() => refresh()}
    />,
    container,
    'refresh-labels-btn',
  );
}

// Phase 7 (see REACT_MIGRATION_PLAN.md, "live filtering" follow-up): a thin
// wrapper so useMergedRequestMoreActionOptions() (a hook) can be called from
// AppRoot's JSX. key={repo}: same stale-state-on-repo-change reasoning the
// previous window.updateReactMergedRequestMoreAction-fed version already
// documented at its own portal call site.
//
// Ninth follow-up (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit"):
// also calls useRequestMoreMerged(), passing its returned function as
// onRequestMore - replaces window.handleRequestMoreMerged.
// Window-bridge elimination Phase 7 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
// the PR table, mounted once PrDataProvider has rendered its first payload -
// replaces window.mountReactPrTable, which index.page.js's renderPrData called
// on its first render. Its own component so only it (not AppRoot and every
// portal AppRoot builds) subscribes to the PR-data Context.
function PrTablePortal({ container }) {
  const { hasRenderedPrData } = usePrData();
  if (!container || !hasRenderedPrData) return null;
  // Window-bridge elimination Phase 7.4: NotesDirtyProvider moved up to wrap
  // <AppRoot /> (mountAppRoot), so AutoRenderBlockingSync can read it too.
  return createPortal(
    <NeedsAttentionProvider>
      <PrInsightsDisplayProvider>
        <ReviewConversationsUiStateProvider>
          <PrTableApp />
        </ReviewConversationsUiStateProvider>
      </PrInsightsDisplayProvider>
    </NeedsAttentionProvider>,
    container,
    'pr-table',
  );
}

// Window-bridge elimination Phase 7.4: the "jump to unsaved" chips read the
// blocking PRs/authors from AutoRenderBlockingProvider, and this sets the
// chip list's own `hidden`/`aria-label` (a static index.html element, the
// portal's container). Both used to come from index.page.js: the
// attributes from renderAutoRenderBlockedLinks, the lists through
// window.updateReactAutoRenderBlockedLinks into AppRoot state.
function AutoRenderBlockedLinksLive({ container }) {
  const { blockingPrNumbers, blockingAuthorInsightsLogins, blockingPrLabel } = useAutoRenderBlocking();
  const { getAuthorInsightsDisplayName } = useAuthorInsights();

  useEffect(() => {
    const { buildAutoRenderBlockedLinksAriaLabel } = createPrAutoRenderIndicatorHelpers({
      getAuthorInsightsDisplayName,
    });
    container.hidden = blockingPrNumbers.length === 0 && blockingAuthorInsightsLogins.length === 0;
    container.setAttribute(
      'aria-label',
      buildAutoRenderBlockedLinksAriaLabel({ blockingPrLabel, blockingAuthorInsightsLogins }),
    );
  }, [container, blockingPrNumbers, blockingAuthorInsightsLogins, blockingPrLabel, getAuthorInsightsDisplayName]);

  return <AutoRenderBlockedLinks prNumbers={blockingPrNumbers} authorLogins={blockingAuthorInsightsLogins} />;
}

function MergedRequestMoreActionLive() {
  const { isVisible, repo } = useMergedRequestMoreActionOptions();
  const requestMoreMerged = useRequestMoreMerged();
  return (
    <MergedRequestMoreAction
      key={repo}
      isVisible={isVisible}
      repo={repo}
      onRequestMore={requestMoreMerged}
    />
  );
}

function AppRoot() {
  const [containers] = useState(computeStaticContainers);

  // Phase D.2 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
  // BackfillControls/BackfillLogControls/RunScriptActionButton's instances
  // below used to call window.handleBackfillAction/refreshBackfillStatus/
  // refreshBackfillLogTail/autoScrollBackfillLogToBottom/handleRunScript/
  // handleAckOnly/handleClearOnly/handleApplyLabelClick directly - they now
  // call these hooks' returned functions instead. refreshAvailableRepoLabels
  // (the "↻ Labels" button's own handler) isn't one of these - it can't be
  // called from here at all, since useRepoLabels() needs a real
  // <RepoLabelsProvider> ancestor and that Provider is a descendant AppRoot
  // itself renders further down (see RepoLabelsProvider.jsx's own comment)
  // - RefreshLabelsButtonLive, below, calls it from inside that Provider's
  // own subtree instead.
  const backfillActions = useBackfillActions();
  // Phase H.11 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
  // replaces backfill-tab.orchestrator.js's own initialize()/
  // onTabActivated() (deleted outright) - see that hook's own header
  // comment for why this exact shape reproduces both.
  useBackfillTabAutoRefresh(backfillActions.triggerBackfillTabLoad);
  const runScript = useRunScript();
  // Twelfth follow-up (see REACT_MIGRATION_PLAN.md, "Remaining-effort
  // audit"): persistRunScriptOptions comes from useFilterState() directly
  // now, not window.persistRunScriptOptionOverrides - AppRoot is a
  // genuine descendant of FilterStateProvider (mountAppRoot wraps it from
  // outside AppRoot).
  const { persistRunScriptOptions } = useFilterState();
  const ackLabelActions = useAckLabelActions();
  // Phase H.9 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
  // TriggerAutoRunButton/QuickCheckButton/QuickCheckAllButton/the
  // dispatcher-bump and reset-circuit-breaker drawer actions below used to
  // call window.handleTriggerAutoRun/handleQuickCheck/handleQuickCheckAll/
  // handleDispatcherBump/handleResetCircuitBreaker directly - they now call
  // these hooks' returned functions instead.
  const triggerAutoRun = useTriggerAutoRun();
  const quickCheckActions = useQuickCheckActions();
  const activityDrawerActions = useActivityDrawerActions();

  // Deferred-items follow-up, item 5 (see REACT_MIGRATION_PLAN.md): drives
  // which lazy-loaded tab chunks below have been requested yet.
  const hasReviewStatsBeenVisible = useHasTabPanelBeenVisible('tab-panel-review-stats');
  const hasAuthorInsightsBeenVisible = useHasTabPanelBeenVisible('tab-panel-author-insights');
  const hasActionLogBeenVisible = useHasTabPanelBeenVisible('tab-panel-action-log');
  const hasExportBeenVisible = useHasTabPanelBeenVisible('tab-panel-export');
  const hasActorNamesBeenVisible = useHasTabPanelBeenVisible('tab-panel-actor-name-cache');

  // Window-bridge elimination Phase 3d (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
  // the Backfill tab's button-disabled flags live in <BackfillStatusProvider />
  // now (it computes them via getBackfillStatusViewModel anyway, and used to
  // push them into this component's own state through
  // window.updateReactBackfillButtonState - a bridge from an ancestor down
  // into its own descendant). Read back here for the buttons' props.
  //
  // Window-bridge elimination Phase 7.3: the same goes for the activity
  // drawer's request-activity badges and "Recent Activity" list - they were
  // this component's own state, pushed in by PrDataProvider (an ancestor)
  // through window.updateReactRequestActivityBadges/
  // updateReactRecentRequestActivity. RequestActivityProvider owns them now;
  // read back here only to pass to the drawer.
  const { requestActivityBadges, recentRequestActivity } = useRequestActivityDisplay();

  // Deferred-items follow-up (full vanilla-to-React sweep, see
  // REACT_MIGRATION_PLAN.md): the 7 remaining vanilla `.textContent =`
  // status/log panels, converted following the exact same shape as the
  // badge rows above (a bridge registered via useEffect, a plain-string
  // portal into the existing static `<pre>` - no dedicated component
  // needed since none of these render anything but text). Initial values
  // match each `<pre>`'s original static index.html text, so there's no
  // flash of empty content before the first bridge call.
  //
  // Phase H.8 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
  // statusText itself moved out of here into <StatusTextProvider />
  // (wrapping this whole component, see mountAppRoot below) - it owns the
  // window.updateReactStatusText bridge and writes #status's textContent
  // directly now (see that Provider's own comment for why a plain DOM
  // write, not a portal), so hooks called from this component's own body
  // (useRunScript/useBackfillActions/useAckLabelActions below) can read it
  // via useStatusText() instead of bouncing through that bridge.
  // Window-bridge elimination Phase 3c: the output text itself lives in
  // <OutputTextProvider /> (wrapping this component, see mountAppRoot) so the
  // hooks that write it - including useSinglePrUpdate, which runs inside
  // PrTableApp rather than this body - can reach it via useOutputText().
  const { outputText } = useOutputText();
  // Window-bridge elimination Phase 4 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
  // the Backfill tab's badges/details text/log text (and the log's update
  // tick - BackfillLogControls' scroll-sync effect must fire on every log
  // refresh, even identical text, which useState alone would bail out of)
  // live in <BackfillStatusProvider /> now, read back here for the portals.
  const {
    backfillButtonState,
    backfillBadges,
    backfillDetailsText,
    backfillLogText,
    backfillLogUpdateTick,
  } = useBackfillStatus();

  // Window-bridge elimination Phase 7 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
  // window.mountReactPrTable is gone. index.page.js's renderPrData called it on
  // the first data render; PrDataProvider renders the data itself now, and
  // <PrTablePortal /> (below) mounts the table once it has.

  // Phase 7 (see REACT_MIGRATION_PLAN.md, "live filtering" follow-up):
  // window.renderReactFilterSummary (the push bridge this useEffect used
  // to register) is gone - <AppliedFilterSummaryLive> now derives the
  // chip/summary text itself, reactively, via useAppliedFilterSummary().
  // Phase H.12 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
  // the vanilla call site that used to try calling this now-nonexistent
  // bridge (pr-render-apply.helpers.js's applyRenderResults, and its
  // window.updateReactDataMetaText sibling there) is deleted outright too
  // - both were confirmed dead in production (no installer anywhere in
  // this file), left wired only because index.html.test.js's own test
  // harness faked them (fixed below, see installReactFilterPanelMountBridges's
  // own comment there).

  // Window-bridge elimination Phase 7.4: window.updateReactAutoRenderBlockedLinks
  // (and the state it set here) is gone - <AutoRenderBlockedLinksLive /> reads
  // the blocking lists from AutoRenderBlockingProvider.

  // Announce readiness only once every window.* bridge above has actually
  // been assigned. React runs useEffects in declaration order after commit,
  // so this must be the LAST effect in the component - dispatching from
  // any earlier effect (even one that itself assigns a real bridge, e.g.
  // window.mountReactPrTable) fires before later effects in this list have
  // run, racing them the same way. index.page.js's one-time
  // 'viewprs:react-ready' listeners have no second chance if they fire
  // before their specific bridge is real: they re-check the relevant
  // window.* function, find it still undefined, and permanently give up.
  // Confirmed two real instances of this: window.mountReactPrTable
  // undefined left the PR table stuck on "Loading..." forever (CI trace:
  // valid data fetched in 41ms, zero console errors, table never painted);
  // window.renderReactMultiSelectList undefined (when dispatch lived in the
  // mountReactPrTable effect above, which runs before this one) left every
  // filter multi-select (label/author/assigned/etc.) permanently empty.
  useEffect(() => {
    // queueMicrotask, not a direct dispatch: every listener (index.page.js)
    // is invoked synchronously by dispatchEvent, and several call back into
    // flushSync-wrapped bridges either
    // directly or via a fetch
    // continuation that can resolve fast enough to still be "inside"
    // React's own effect-flush for this commit. flushSync reentrant with
    // an in-progress render throws "flushSync was called from inside a
    // lifecycle method" (confirmed via this exact warning in CI) - queuing
    // a fresh microtask guarantees this commit (including its own effect
    // flush) has fully finished before any listener runs, exactly as that
    // warning's own message suggests ("...scheduler task or micro task").
    // A plain setTimeout also works in a real browser, but jsdom
    // integration tests that assert immediately after an awaited user
    // interaction (no explicit wait) only drain the microtask queue, not
    // macrotasks, and would see pre-restore state.
    queueMicrotask(() => window.dispatchEvent(new CustomEvent('viewprs:react-ready')));
  }, []);

  return (
    <>
      {/* Phase H.20 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
          cluster 6): RowFilterSelectionProvider/AuthorThreadResolutionSelectionProvider/
          ChangeFilterActorSelectionProvider/FilterStateProvider used to wrap
          from here (same reasoning as the comment that used to sit at this
          spot: cross-portal sharing between MultiSelectListPortals and
          PrTableApp/ReviewThreadsSection, sibling portals not an
          ancestor/descendant pair). They now wrap <AppRoot/> itself instead,
          from mountAppRoot() below - closing window.getFormBody required
          useRunScript/useAckLabelActions/useQuickCheckActions (called from
          AppRoot's own body) to reach useFilterState()/useRowFilterSelection()
          directly, which needs AppRoot to be a genuine descendant of all 4,
          the same "component can't be descendant of what it renders"
          constraint Phase G.3 already ran into moving these same 3
          selection Providers the first time (that move was to wrap
          PrDataProvider/FilterStateProvider, not AppRoot - this is the
          same constraint one level further out), and Phase G's own
          PrActivityQueueProvider move/Phase G.1's TabStateProvider
          widening both ran into separately - see state/useFormBody.jsx.
          PrDataProvider itself stays here (cluster 6
          doesn't move it), so it's now FilterStateProvider's *descendant*
          instead of its ancestor - confirmed inert (neither reads the
          other's Context) but a genuine reversal worth calling out, since
          every move before this one only ever added a new ancestor above
          an existing one. */}
        {/* RepoLabelsProvider wraps everything below for the same reason
            PrActivityQueueProvider does: ApplyLabelSelect's own portal
            (inside the filter-field portals further down) and PrTableApp's
            PrActionsCell (inside the prTable portal) are siblings, not an
            ancestor/descendant pair, that both need the same available-
            labels list - see RepoLabelsContext.jsx's own comment. */}
        <RepoLabelsProvider>
        {/* Phase 7 (see REACT_MIGRATION_PLAN.md): AuthorInsightsDraftsProvider
            wraps everything below for the same cross-portal-sharing reason
            RepoLabelsProvider does - AuthorInsightsCommentsSection (inside
            one of the 6 separate per-portal AuthorInsightsProvider
            instances further down) needs this state to persist across
            every one of those remounts (author/tab switches), and nothing
            about it is specific to any single portal. */}
        <AuthorInsightsDraftsProvider>
        {/* Window-bridge elimination Phase 7.4: computes the auto-render-
            blocking state from the drafts above and NotesDirtyProvider
            (wrapping AppRoot) - replaces index.page.js's
            recomputeDirtyPrSectionsFields. */}
        <AutoRenderBlockingSync />
        {/* Phase 7 (see REACT_MIGRATION_PLAN.md, "live filtering" follow-up):
            JobEventsProvider widened from "just the drawer portal" (its own
            prior comment here predicted this) to wrap everything
            RowFilterSelectionProvider does - useAppliedFilterSummary.jsx
            (consumed inside the prTable portal below AND by the
            appliedFilterSummary portal further down) needs useJobEvents()'s
            schedulerSummary too, and those are sibling portals relative to
            the drawer, not an ancestor/descendant pair - same
            cross-portal-sharing reason every other Provider at this level
            is already this wide. */}
        <JobEventsProvider>
        {/* Phase G (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
            PrActivityQueueProvider used to wrap just the drawer's
            bulk-queue section and PrTableApp below - it now wraps <AppRoot />
            itself instead (mountAppRoot, above), so useAckLabelActions()
            (called from this component's own body) can reach it via
            usePrActivityQueue() directly. The drawer/PrTableApp portals
            below still resolve to that same (now outer) Provider - no
            change for them. */}
            {containers.activityDrawer &&
              createPortal(
                <ActivityDrawer
                  backfillBadges={backfillBadges.badges}
                  backfillDetailsText={backfillDetailsText}
                  requestActivityBadges={requestActivityBadges}
                  recentRequestActivity={recentRequestActivity}
                  onBumpDispatcherEntry={(repo, taskType) =>
                    activityDrawerActions.handleDispatcherBump(repo, taskType)
                  }
                  onResetCircuitBreaker={() => activityDrawerActions.handleResetCircuitBreaker()}
                />,
                containers.activityDrawer,
                'activity-drawer',
              )}

          <PrTablePortal container={containers.prSections} />

        {containers.filterFields.portals}

        <FilterOptionsProvider>
          <MultiSelectListPortals containers={containers} />
        </FilterOptionsProvider>

        <AppliedFilterSummaryLive
          appliedFilterSummaryContainer={containers.appliedFilterSummary}
          dataMetaContainer={containers.dataMeta}
        />

        <TableFilterChipsLive container={containers.tableFilterChips} />

        {containers.errorSnackbar && createPortal(<Snackbar />, containers.errorSnackbar, 'error-snackbar')}

        {/* Phase G.1 (see REACT_MIGRATION_PLAN.md, "Full migration
            roadmap"): widened to also wrap AutoRenderBlockedLinks.jsx's
            portal (further down, inside JobEventsProvider) - its own
            useNavigateToPrInTable.jsx/useNavigateToAuthorInsights.jsx
            hooks call useTabState() directly now, which silently resolved
            to this Context's no-op default (not the real Provider) when
            that portal sat outside this boundary, same "a sibling portal
            needs to be a real descendant, not just visually adjacent"
            class of bug Phase G's own PrActivityQueueProvider move fixed.
            Caught by a real end-to-end test, not jsdom - this Provider is
            cheap/pure state, so widening its scope costs nothing.
            Phase H.21 (see REACT_MIGRATION_PLAN.md, "Remaining-effort
            audit", cluster 3): <TabStateProvider> itself moved from here
            to wrapping <AppRoot/> at mountAppRoot() below, for the same
            reason - AppRoot's own body calls useHasTabPanelBeenVisible()
            5 times (hasReviewStatsBeenVisible etc.), which silently
            resolved to this Context's no-op default too, since AppRoot's
            body isn't a descendant of a Provider nested inside its own
            returned JSX (the exact "component can't be descendant of what
            it renders" constraint Phase H.20 already ran into for
            FilterStateProvider/the 3 selection Providers) - caught by a
            real Playwright regression (Author Insights content never
            appearing after H.21's useIsTabPanelVisible rewrite), not
            jsdom (every jsdom test happens to wrap its own Probe in a
            real Provider directly, side-stepping this). */}
          {containers.tabPrData &&
            createPortal(
              <DataTabButton tabKey="pr-data" label="PR data" panelId="tab-panel-pr-data" />,
              containers.tabPrData,
              'tab-pr-data',
            )}
          {containers.tabReviewStats &&
            createPortal(
              <DataTabButton tabKey="review-stats" label="Review statistics" panelId="tab-panel-review-stats" />,
              containers.tabReviewStats,
              'tab-review-stats',
            )}
          {containers.tabAuthorInsights &&
            createPortal(
              <DataTabButton tabKey="author-insights" label="Author Insights" panelId="tab-panel-author-insights" />,
              containers.tabAuthorInsights,
              'tab-author-insights',
            )}
          {containers.tabStatus &&
            createPortal(
              <ManagementTabButton tabKey="status" label="Activity" panelId="tab-panel-status" />,
              containers.tabStatus,
              'tab-status',
            )}
          {containers.tabScript &&
            createPortal(
              <ManagementTabButton tabKey="script" label="Run & Filter" panelId="tab-panel-script" />,
              containers.tabScript,
              'tab-script',
            )}
          {containers.tabBackfill &&
            createPortal(
              <ManagementTabButton tabKey="backfill" label="Backfill" panelId="tab-panel-backfill" />,
              containers.tabBackfill,
              'tab-backfill',
            )}
          {containers.tabActionLog &&
            createPortal(
              <ManagementTabButton tabKey="action-log" label="Action Log" panelId="tab-panel-action-log" />,
              containers.tabActionLog,
              'tab-action-log',
            )}
          {containers.tabActorNameCache &&
            createPortal(
              <ManagementTabButton tabKey="actor-name-cache" label="Actor Names" panelId="tab-panel-actor-name-cache" />,
              containers.tabActorNameCache,
              'tab-actor-name-cache',
            )}
          {containers.tabExport &&
            createPortal(
              <ManagementTabButton tabKey="export" label="Export" panelId="tab-panel-export" />,
              containers.tabExport,
              'tab-export',
            )}

        {containers.autoRenderBlockedStatus &&
            createPortal(
              <AutoRenderBlockedStatusText />,
              containers.autoRenderBlockedStatus,
              'auto-render-blocked-status',
            )}
          {containers.autoRenderBlockedApplyBtn &&
            createPortal(
              <AutoRenderBlockedApplyButton />,
              containers.autoRenderBlockedApplyBtn,
              'auto-render-blocked-apply-btn',
            )}

        {containers.triggerAutoRunBtn &&
          createPortal(
            <TriggerAutoRunButton onTrigger={() => triggerAutoRun()} />,
            containers.triggerAutoRunBtn,
            'trigger-auto-run-btn',
          )}

        {containers.runScriptBtn &&
          createPortal(
            <RunScriptActionButton
              id="run-script-btn"
              className="primary-run-btn"
              label="Run script"
              onClick={() => {
                persistRunScriptOptions();
                runScript();
              }}
            />,
            containers.runScriptBtn,
            'run-script-btn',
          )}

        {containers.ackOnlyBtn &&
          createPortal(
            <RunScriptActionButton
              id="ack-only-btn"
              label="Apply ack only"
              onClick={() => ackLabelActions.handleAckOnly()}
            />,
            containers.ackOnlyBtn,
            'ack-only-btn',
          )}

        {containers.clearOnlyBtn &&
          createPortal(
            <RunScriptActionButton
              id="clear-only-btn"
              label="Apply clear only"
              onClick={() => ackLabelActions.handleClearOnly()}
            />,
            containers.clearOnlyBtn,
            'clear-only-btn',
          )}

        {containers.applyLabelBtn &&
          createPortal(
            <RunScriptActionButton
              id="apply-label-btn"
              label="Apply label"
              onClick={() => ackLabelActions.handleApplyLabelClick()}
            />,
            containers.applyLabelBtn,
            'apply-label-btn',
          )}

        <RefreshLabelsButtonLive container={containers.refreshLabelsBtn} />

        {containers.quickCheckBtn &&
          createPortal(
            <QuickCheckButton onCheck={() => quickCheckActions.handleQuickCheck()} />,
            containers.quickCheckBtn,
            'quick-check-btn',
          )}

        {containers.quickCheckAllBtn &&
          createPortal(
            <QuickCheckAllButton onCheck={() => quickCheckActions.handleQuickCheckAll()} />,
            containers.quickCheckAllBtn,
            'quick-check-all-btn',
          )}

        {hasReviewStatsBeenVisible && containers.reviewStatsControls &&
          createPortal(
            <ReviewStatsProvider>
              <Suspense fallback={null}>
                <ReviewStatsControls />
              </Suspense>
            </ReviewStatsProvider>,
            containers.reviewStatsControls,
            'review-stats-controls',
          )}

        {hasReviewStatsBeenVisible && containers.reviewStatsContent &&
          createPortal(
            <ReviewStatsProvider>
              <Suspense fallback={null}>
                <ReviewStatsContent />
              </Suspense>
            </ReviewStatsProvider>,
            containers.reviewStatsContent,
            'review-stats-content',
          )}

        {hasAuthorInsightsBeenVisible && containers.authorInsightsSelector &&
          createPortal(
            <AuthorInsightsProvider>
              <Suspense fallback={null}>
                <AuthorInsightsSelector />
              </Suspense>
            </AuthorInsightsProvider>,
            containers.authorInsightsSelector,
            'author-insights-selector',
          )}

        {hasAuthorInsightsBeenVisible && containers.authorInsightsCreatedPrs &&
          createPortal(
            <AuthorInsightsProvider>
              <Suspense fallback={null}>
                <AuthorCreatedPrsSection />
              </Suspense>
            </AuthorInsightsProvider>,
            containers.authorInsightsCreatedPrs,
            'author-insights-created-prs',
          )}

        {hasAuthorInsightsBeenVisible && containers.authorInsightsHeader &&
          createPortal(
            <AuthorInsightsProvider>
              <Suspense fallback={null}>
                <AuthorInsightsHeader />
              </Suspense>
            </AuthorInsightsProvider>,
            containers.authorInsightsHeader,
            'author-insights-header',
          )}

        {hasAuthorInsightsBeenVisible && containers.authorInsightsNotes &&
          createPortal(
            <AuthorInsightsProvider>
              <Suspense fallback={null}>
                <AuthorInsightsNotesSection />
              </Suspense>
            </AuthorInsightsProvider>,
            containers.authorInsightsNotes,
            'author-insights-notes',
          )}

        {hasAuthorInsightsBeenVisible && containers.authorInsightsComments &&
          createPortal(
            <AuthorInsightsProvider>
              <Suspense fallback={null}>
                <AuthorInsightsCommentsSection />
              </Suspense>
            </AuthorInsightsProvider>,
            containers.authorInsightsComments,
            'author-insights-comments',
          )}

        {containers.backfillBadges &&
          createPortal(
            <BackfillBadges badges={backfillBadges.badges} />,
            containers.backfillBadges,
            'backfill-badges',
          )}

        {containers.backfillControls &&
          createPortal(
            <BackfillControls
              buttonState={backfillButtonState}
              onStart={() => backfillActions.handleBackfillAction('start')}
              onStop={() => backfillActions.handleBackfillAction('stop')}
              onRefreshStatus={() => backfillActions.refreshBackfillStatus()}
            />,
            containers.backfillControls,
            'backfill-controls',
          )}

        {containers.outputText && createPortal(outputText, containers.outputText, 'output-text')}

        {containers.backfillDetails &&
          createPortal(backfillDetailsText, containers.backfillDetails, 'backfill-details')}

        {containers.backfillLogControls &&
          createPortal(
            // Phase G.4 (see REACT_MIGRATION_PLAN.md, "Full migration
            // roadmap"): BackfillLogControls now also owns the #backfill-log
            // content portal itself (logText/logContainer below), not just
            // the checkbox/button - it needs both to sync scroll position
            // via a ref instead of the old window.autoScrollBackfillLogToBottom
            // DOM-query bridge.
            <BackfillLogControls
              refreshLogDisabled={backfillButtonState.refreshLogDisabled}
              onRefreshLog={() => backfillActions.refreshBackfillLogTail()}
              logText={backfillLogText}
              logUpdateTick={backfillLogUpdateTick}
              logContainer={containers.backfillLog}
            />,
            containers.backfillLogControls,
            'backfill-log-controls',
          )}

        {hasActionLogBeenVisible && containers.actionLog &&
          createPortal(
            <Suspense fallback={null}>
              <ActionLogSection />
            </Suspense>,
            containers.actionLog,
            'action-log',
          )}

        {hasActorNamesBeenVisible && containers.actorNames &&
          createPortal(
            <Suspense fallback={null}>
              <ActorNamesTab />
            </Suspense>,
            containers.actorNames,
            'actor-names',
          )}

        {hasExportBeenVisible && containers.export &&
          createPortal(
            <Suspense fallback={null}>
              <ExportTab />
            </Suspense>,
            containers.export,
            'export',
          )}

        {containers.applyLabelSelect &&
          createPortal(
            <ApplyLabelSelect />,
            containers.applyLabelSelect,
            'apply-label-select',
          )}

        {containers.autoRenderBlockedLinks &&
          createPortal(
            <AuthorInsightsProvider>
              <AutoRenderBlockedLinksLive container={containers.autoRenderBlockedLinks} />
            </AuthorInsightsProvider>,
            containers.autoRenderBlockedLinks,
            'auto-render-blocked-links',
          )}

        {containers.mergedRequestMoreAction &&
          createPortal(
            <MergedRequestMoreActionLive />,
            containers.mergedRequestMoreAction,
            'merged-request-more-action',
          )}
        </JobEventsProvider>
        </AuthorInsightsDraftsProvider>
      </RepoLabelsProvider>
    </>
  );
}

/**
 * Mounts <AppRoot /> once, into a hidden-but-attached anchor node (not a
 * detached one - see buildFilterStateFieldPortals' former doc comment on
 * mountFilterStateProvider for why attached-but-hidden matters for native
 * event delegation). Called from the bootstrap block below.
 */
function mountAppRoot() {
  const anchor = document.createElement('div');
  anchor.hidden = true;
  document.body.appendChild(anchor);
  // Phase G (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
  // PrActivityQueueProvider wraps <AppRoot /> from here, outside its own
  // returned JSX - AppRoot's own body calls useAckLabelActions() directly
  // (a plain function call, not a descendant element), so a Provider
  // nested *inside* AppRoot's returned tree can never be reached by
  // AppRoot itself (a component can't be a descendant of something it
  // renders). Wrapping from the root-mount call instead makes AppRoot a
  // genuine Context descendant, so useAckLabelActions() can call
  // usePrActivityQueue() directly. The old inner <PrActivityQueueProvider>
  // (wrapping just the drawer/PrTableApp portals) is gone - removed below,
  // its children now resolve to this single outer Provider instead.
  //
  // Phase H.8 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
  // StatusTextProvider wraps from here too, same reasoning -
  // useRunScript/useBackfillActions/useAckLabelActions/useSinglePrUpdate
  // need to reach it via useStatusText() directly instead of the
  // window.updateReactStatusText/setStatusMessage bridges.
  //
  // Phase H.14 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
  // cluster 4): BackfillStatusProvider wraps from here too, inside
  // StatusTextProvider (it needs useStatusText() itself, for the
  // announce-on-change path) and outside AppRoot (BackfillLogControls.jsx,
  // a descendant of AppRoot's own returned JSX, reads it via
  // useBackfillStatus() - see that component's own comment).
  //
  // Phase H.20 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
  // cluster 6): RowFilterSelectionProvider/AuthorThreadResolutionSelectionProvider/
  // ChangeFilterActorSelectionProvider/FilterStateProvider wrap from here
  // too now (outermost - none of the 4 need useStatusText()/
  // usePrActivityQueue(), confirmed by reading each file, so nesting order
  // relative to the 3 existing Providers is arbitrary; kept in the same
  // relative order they were in inside AppRoot's own JSX before this
  // phase). Closing window.getFormBody needed useRunScript/
  // useAckLabelActions/useQuickCheckActions (called from AppRoot's own
  // body) to reach useFilterState()/useRowFilterSelection() directly - see
  // state/useFormBody.jsx and this function's own initialValues argument
  // below, now computed once here via buildFilterStateInitialValues()
  // instead of threaded through AppRoot's own containers state.
  //
  // Phase H.21 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
  // cluster 3): TabStateProvider wraps from here too now (innermost - it
  // needs none of the other 6 Contexts), same reason as every Provider
  // above it on this list - AppRoot's own body calls
  // useHasTabPanelBeenVisible() 5 times (hasReviewStatsBeenVisible etc.),
  // which needs a genuine Provider ancestor to resolve useTabState() to
  // anything other than this Context's no-op default.
  //
  // Phase H.22 (same cluster): <TabPanelVisibilitySync/> mounted as
  // AppRoot's own sibling, inside <TabStateProvider> - a plain sibling,
  // not a wrapper, since it owns the 9 tab panels' `hidden` attribute via
  // a DOM write in its own effects, not by being read from Context by
  // anything inside AppRoot's tree. Replaces `window.activateDataTab`/
  // `window.activateManagementTab` (both deleted, along with
  // `pr-data-tabs.helpers.js`/`pr-management-tabs.helpers.js` outright)
  // as those panels' sole remaining writer.
  //
  // Sixth follow-up (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit"):
  // SnackbarProvider wraps from here too now (innermost - it needs none of
  // the other 7 Contexts, same reasoning TabStateProvider's own comment
  // gives), so useQuickCheckActions/useAckLabelActions/useRunScript/
  // useBackfillActions/useTriggerAutoRun/useRowCheckboxActions/
  // useSinglePrUpdate/useActivityDrawerActions (called from AppRoot's own
  // body or a descendant) and PrDataProvider.jsx (wrapping AppRoot's own
  // returned JSX from inside, so also a genuine descendant of this) can all
  // reach useSnackbar() directly instead of window.showErrorNotification/
  // showWarningNotification/hideErrorNotification.
  //
  // Window-bridge elimination Phase 3c: OutputTextProvider wraps from here too
  // (inside StatusTextProvider, like it; neither depends on the other).
  //
  // Window-bridge elimination Phase 2 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
  // AutoRenderBlockingProvider and PrDataProvider wrap from here too now
  // (AutoRenderBlockingProvider outside PrDataProvider, so PrDataProvider
  // can read it), same reasoning as every Provider above - AppRoot's own
  // body (useRunScript/useSinglePrUpdate/useAckLabelActions/
  // useRowCheckboxActions/useRequestMoreMerged) can now call usePrData()/
  // useAutoRenderBlocking() directly in Phase 3, instead of reaching their
  // window.* bridges. <PrDataPolling /> moved with PrDataProvider, as
  // AppRoot's sibling instead of a child of the Provider AppRoot rendered.
  // Neither Provider reads anything AppRoot's own JSX used to render
  // between them: both only need StatusText/Snackbar, already outer.
  //
  // Window-bridge elimination Phase 7.3: RequestActivityProvider wraps from here
  // too, above BackfillStatusProvider/AutoRenderBlockingProvider/PrDataProvider -
  // all three call renderRequestActivity, and the first two used to reach it
  // through window.* because it lived in PrDataProvider, below them. It needs no
  // other Context. loadOnMount runs the startup scheduler-status load.
  ReactDOM.createRoot(anchor).render(
    <RowFilterSelectionProvider>
      <AuthorThreadResolutionSelectionProvider>
        <ChangeFilterActorSelectionProvider>
          <FilterStateProvider initialValues={buildFilterStateInitialValues()}>
            <StatusTextProvider>
              <OutputTextProvider>
                <RequestActivityProvider loadOnMount>
                  <BackfillStatusProvider>
                    <PrActivityQueueProvider>
                      <TabStateProvider>
                        <SnackbarProvider>
                          <AutoRenderBlockingProvider>
                            <PrDataProvider
                              initialPayload={{}}
                              initialSelectedRepo=""
                              initialStatsViewState={DEFAULT_STATS_VIEW_STATE}
                              loadOnMount
                            >
                              <TabPanelVisibilitySync />
                              <NotesDirtyProvider>
                                <AppRoot />
                              </NotesDirtyProvider>
                              <PrDataPolling dataPollMs={readDataPollMsOverride(window.location.search)} />
                            </PrDataProvider>
                          </AutoRenderBlockingProvider>
                        </SnackbarProvider>
                      </TabStateProvider>
                    </PrActivityQueueProvider>
                  </BackfillStatusProvider>
                </RequestActivityProvider>
              </OutputTextProvider>
            </StatusTextProvider>
          </FilterStateProvider>
        </ChangeFilterActorSelectionProvider>
      </AuthorThreadResolutionSelectionProvider>
    </RowFilterSelectionProvider>,
  );
}

if (typeof window !== 'undefined') {
  mountAppRoot();
  // 'viewprs:react-ready' is now dispatched from inside AppRoot's own
  // useEffect, once every bridge AppRoot installs is actually assigned - see
  // that effect's comment for why dispatching it here (immediately after
  // .render(), which only schedules the initial commit) was a race.
}
