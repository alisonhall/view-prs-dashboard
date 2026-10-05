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
import { ContextRunScriptTextInput } from './components/ContextRunScriptTextInput';
import { OpenModeSelect } from './components/OpenModeSelect';
import { MultiSelectListPortals, MULTI_SELECT_LIST_ID_PREFIXES } from './components/MultiSelectListPortals';
import { FilterOptionSelect } from './components/FilterOptionSelect';
import { IgnoreCommitPatternsTextarea } from './components/IgnoreCommitPatternsTextarea';
import { ApplyLabelSelect } from './components/ApplyLabelSelect';
import { AutoRenderBlockedLinks } from './components/AutoRenderBlockedLinks';
import { MergedRequestMoreAction } from './components/MergedRequestMoreAction';
import { BackfillBadges } from './components/BackfillBadges';
import { AppliedFilterSummary } from './components/AppliedFilterSummary';
import { Snackbar } from './components/Snackbar';
import { TriggerAutoRunButton } from './components/TriggerAutoRunButton';
import { QuickCheckButton } from './components/QuickCheckButton';
import { QuickCheckAllButton } from './components/QuickCheckAllButton';
import { PrDataPolling } from './components/PrDataPolling';
import { PrDataProvider } from './state/PrDataProvider';
import { FilterStateProvider } from './state/FilterStateProvider';
import { NeedsAttentionProvider } from './components/NeedsAttentionProvider';
import { NotesDirtyProvider } from './components/NotesDirtyProvider';
import { PrInsightsDisplayProvider } from './components/PrInsightsDisplayProvider';
import { ReviewConversationsUiStateProvider } from './components/ReviewConversationsUiStateProvider';
import { ReviewStatsProvider } from './components/ReviewStatsProvider';
import { AuthorInsightsProvider } from './components/AuthorInsightsProvider';
import { FilterOptionsProvider } from './components/FilterOptionsProvider';
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
  { id: 'repo', name: 'repo', key: 'repo', type: 'text', placeholder: 'owner/repo', defaultValue: '' },
  { id: 'limit', name: 'limit', key: 'limit', type: 'number', placeholder: '200', defaultValue: '' },
  { id: 'merged-limit', name: 'mergedLimit', key: 'mergedLimit', type: 'number', placeholder: '15', defaultValue: '' },
  { id: 'jobs', name: 'jobs', key: 'jobs', type: 'number', placeholder: '6', defaultValue: '' },
];

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

  return { initialValues, portals };
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
    schedulerBadges: document.getElementById('scheduler-badges'),
    requestActivityBadges: document.getElementById('request-activity-badges'),
    statusText: document.getElementById('status'),
    requestActivityDetails: document.getElementById('request-activity-details'),
    schedulerDetails: document.getElementById('scheduler-details'),
    outputText: document.getElementById('output'),
    backfillDetails: document.getElementById('backfill-details'),
    backfillLog: document.getElementById('backfill-log'),
    dataMeta: document.getElementById('data-meta'),
    appliedFilterSummary: document.getElementById('management-filter-summary-root'),
    errorSnackbar: document.getElementById('error-snackbar-root'),
    triggerAutoRunBtn: document.getElementById('trigger-auto-run-btn-root'),
    quickCheckBtn: document.getElementById('quick-check-btn-root'),
    quickCheckAllBtn: document.getElementById('quick-check-all-btn-root'),
    actionLog: document.getElementById('action-log-container'),
    actorNames: document.getElementById('actor-names-root'),
    export: document.getElementById('export-container'),
    applyLabelSelect: document.getElementById('apply-label-select-root'),
    autoRenderBlockedLinks: document.getElementById('auto-render-blocked-pr-links'),
    mergedRequestMoreAction: document.getElementById('merged-request-more-action'),
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
 * PrTableApp is the one consumer that doesn't mount eagerly (index.page.js
 * calls window.mountReactPrTable(container, props) lazily, once PR data
 * first loads) - `prTable` state starts null and the portal only renders
 * once that bridge call has actually happened.
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

function AppRoot() {
  const [containers] = useState(computeStaticContainers);

  // Deferred-items follow-up, item 5 (see REACT_MIGRATION_PLAN.md): drives
  // which lazy-loaded tab chunks below have been requested yet.
  const hasReviewStatsBeenVisible = useHasTabPanelBeenVisible('tab-panel-review-stats');
  const hasAuthorInsightsBeenVisible = useHasTabPanelBeenVisible('tab-panel-author-insights');
  const hasActionLogBeenVisible = useHasTabPanelBeenVisible('tab-panel-action-log');
  const hasExportBeenVisible = useHasTabPanelBeenVisible('tab-panel-export');
  const hasActorNamesBeenVisible = useHasTabPanelBeenVisible('tab-panel-actor-name-cache');

  const [prTable, setPrTable] = useState(null);
  const [filterSummary, setFilterSummary] = useState({ summaryText: '', filterChips: [] });
  const [backfillBadges, setBackfillBadges] = useState({ badges: [] });
  const [schedulerBadges, setSchedulerBadges] = useState({ badges: [] });
  const [requestActivityBadges, setRequestActivityBadges] = useState({ badges: [] });
  const [applyLabelOptions, setApplyLabelOptions] = useState({ labels: [] });
  const [autoRenderBlockedLinks, setAutoRenderBlockedLinks] = useState({ prNumbers: [], authorLogins: [] });
  const [mergedRequestMoreAction, setMergedRequestMoreAction] = useState({ isVisible: false, repo: '' });

  // Deferred-items follow-up (full vanilla-to-React sweep, see
  // REACT_MIGRATION_PLAN.md): the 7 remaining vanilla `.textContent =`
  // status/log panels, converted following the exact same shape as the
  // badge rows above (a bridge registered via useEffect, a plain-string
  // portal into the existing static `<pre>` - no dedicated component
  // needed since none of these render anything but text). Initial values
  // match each `<pre>`'s original static index.html text, so there's no
  // flash of empty content before the first bridge call.
  const [statusText, setStatusText] = useState('Not run');
  const [requestActivityDetailsText, setRequestActivityDetailsText] = useState('Monitoring request activity...');
  const [schedulerDetailsText, setSchedulerDetailsText] = useState('Loading scheduler status...');
  const [outputText, setOutputText] = useState('Run the script to see output');
  const [backfillDetailsText, setBackfillDetailsText] = useState('Loading backfill status...');
  const [backfillLogText, setBackfillLogText] = useState('Loading backfill log...');
  const [dataMetaText, setDataMetaText] = useState('Loading...');

  useEffect(() => {
    window.mountReactPrTable = (containerElement, props) => {
      if (!containerElement) {
        console.error('[React Migration] Cannot mount: container element not found');
        return null;
      }
      setPrTable({
        container: containerElement,
        onCheckboxChange: props?.onCheckboxChange,
        onAckAction: props?.onAckAction,
        onApplyLabel: props?.onApplyLabel,
      });
      // Seed the initial payload through the same path every later update
      // uses (window.updateReactPrTable, owned by <PrDataProvider />, which
      // is always mounted below - see its own file) rather than threading
      // initialPayload/selectedRepo/visiblePrNumbers through this function
      // as a second, parallel way to get data in.
      window.updateReactPrTable?.(props?.initialPayload, props?.selectedRepo, props?.visiblePrNumbers);
      return { unmount: () => setPrTable(null) };
    };
    return () => {
      delete window.mountReactPrTable;
    };
  }, []);

  useEffect(() => {
    window.renderReactFilterSummary = (summaryText, filterChips) => {
      if (!containers.appliedFilterSummary) {
        return false;
      }
      setFilterSummary({ summaryText, filterChips });
      return true;
    };
    return () => {
      delete window.renderReactFilterSummary;
    };
  }, [containers]);

  useEffect(() => {
    window.updateReactBackfillBadges = (badges) => {
      setBackfillBadges({ badges });
      return true;
    };
    return () => {
      delete window.updateReactBackfillBadges;
    };
  }, []);

  useEffect(() => {
    window.updateReactSchedulerBadges = (badges) => {
      setSchedulerBadges({ badges });
      return true;
    };
    return () => {
      delete window.updateReactSchedulerBadges;
    };
  }, []);

  useEffect(() => {
    window.updateReactRequestActivityBadges = (badges) => {
      setRequestActivityBadges({ badges });
      return true;
    };
    return () => {
      delete window.updateReactRequestActivityBadges;
    };
  }, []);

  useEffect(() => {
    window.updateReactApplyLabelOptions = (labels) => {
      setApplyLabelOptions({ labels });
      return true;
    };
    return () => {
      delete window.updateReactApplyLabelOptions;
    };
  }, []);

  useEffect(() => {
    window.updateReactAutoRenderBlockedLinks = (prNumbers, authorLogins) => {
      setAutoRenderBlockedLinks({ prNumbers, authorLogins });
      return true;
    };
    return () => {
      delete window.updateReactAutoRenderBlockedLinks;
    };
  }, []);

  useEffect(() => {
    window.updateReactMergedRequestMoreAction = (isVisible, repo) => {
      setMergedRequestMoreAction({ isVisible, repo });
      return true;
    };
    return () => {
      delete window.updateReactMergedRequestMoreAction;
    };
  }, []);

  useEffect(() => {
    window.updateReactStatusText = (text) => {
      setStatusText(text);
      return true;
    };
    return () => {
      delete window.updateReactStatusText;
    };
  }, []);

  useEffect(() => {
    window.updateReactRequestActivityDetailsText = (text) => {
      setRequestActivityDetailsText(text);
      return true;
    };
    return () => {
      delete window.updateReactRequestActivityDetailsText;
    };
  }, []);

  useEffect(() => {
    window.updateReactSchedulerDetailsText = (text) => {
      setSchedulerDetailsText(text);
      return true;
    };
    return () => {
      delete window.updateReactSchedulerDetailsText;
    };
  }, []);

  useEffect(() => {
    window.updateReactOutputText = (text) => {
      setOutputText(text);
      return true;
    };
    return () => {
      delete window.updateReactOutputText;
    };
  }, []);

  useEffect(() => {
    window.updateReactBackfillDetailsText = (text) => {
      setBackfillDetailsText(text);
      return true;
    };
    return () => {
      delete window.updateReactBackfillDetailsText;
    };
  }, []);

  useEffect(() => {
    window.updateReactBackfillLogText = (text) => {
      setBackfillLogText(text);
      return true;
    };
    return () => {
      delete window.updateReactBackfillLogText;
    };
  }, []);

  useEffect(() => {
    window.updateReactDataMetaText = (text) => {
      setDataMetaText(text);
      return true;
    };
    return () => {
      delete window.updateReactDataMetaText;
    };
  }, []);

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
    // flushSync-wrapped bridges (window.setFilterStateValue) either
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
    <PrDataProvider
      initialPayload={{}}
      initialSelectedRepo=""
      initialVisiblePrNumbers={null}
      initialStatsViewState={DEFAULT_STATS_VIEW_STATE}
    >
      <FilterStateProvider initialValues={containers.filterFields.initialValues}>
        {containers.filterFields.portals}

        {prTable &&
          createPortal(
            <NeedsAttentionProvider>
              <NotesDirtyProvider>
                <PrInsightsDisplayProvider>
                  <ReviewConversationsUiStateProvider>
                    <PrTableApp
                      onCheckboxChange={prTable.onCheckboxChange}
                      onAckAction={prTable.onAckAction}
                      onApplyLabel={prTable.onApplyLabel}
                    />
                  </ReviewConversationsUiStateProvider>
                </PrInsightsDisplayProvider>
              </NotesDirtyProvider>
            </NeedsAttentionProvider>,
            prTable.container,
            'pr-table',
          )}

        <FilterOptionsProvider>
          <MultiSelectListPortals containers={containers} />
        </FilterOptionsProvider>

        {containers.appliedFilterSummary &&
          createPortal(
            <AppliedFilterSummary
              summaryText={filterSummary.summaryText}
              filterChips={filterSummary.filterChips}
            />,
            containers.appliedFilterSummary,
            'applied-filter-summary',
          )}

        {containers.errorSnackbar && createPortal(<Snackbar />, containers.errorSnackbar, 'error-snackbar')}

        {containers.triggerAutoRunBtn &&
          createPortal(
            <TriggerAutoRunButton onTrigger={() => window.handleTriggerAutoRun?.()} />,
            containers.triggerAutoRunBtn,
            'trigger-auto-run-btn',
          )}

        {containers.quickCheckBtn &&
          createPortal(
            <QuickCheckButton onCheck={() => window.handleQuickCheck?.()} />,
            containers.quickCheckBtn,
            'quick-check-btn',
          )}

        {containers.quickCheckAllBtn &&
          createPortal(
            <QuickCheckAllButton onCheck={() => window.handleQuickCheckAll?.()} />,
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
                <AuthorInsightsSelector onChange={(login) => window.selectAuthorInsightsAuthor?.(login)} />
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

        {containers.schedulerBadges &&
          createPortal(
            <BackfillBadges badges={schedulerBadges.badges} />,
            containers.schedulerBadges,
            'scheduler-badges',
          )}

        {containers.requestActivityBadges &&
          createPortal(
            <BackfillBadges badges={requestActivityBadges.badges} />,
            containers.requestActivityBadges,
            'request-activity-badges',
          )}

        {containers.statusText && createPortal(statusText, containers.statusText, 'status-text')}

        {containers.requestActivityDetails &&
          createPortal(requestActivityDetailsText, containers.requestActivityDetails, 'request-activity-details')}

        {containers.schedulerDetails &&
          createPortal(schedulerDetailsText, containers.schedulerDetails, 'scheduler-details')}

        {containers.outputText && createPortal(outputText, containers.outputText, 'output-text')}

        {containers.backfillDetails &&
          createPortal(backfillDetailsText, containers.backfillDetails, 'backfill-details')}

        {containers.backfillLog &&
          createPortal(backfillLogText, containers.backfillLog, 'backfill-log')}

        {containers.dataMeta && createPortal(dataMetaText, containers.dataMeta, 'data-meta')}

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
            <ApplyLabelSelect labels={applyLabelOptions.labels} />,
            containers.applyLabelSelect,
            'apply-label-select',
          )}

        {containers.autoRenderBlockedLinks &&
          createPortal(
            <AuthorInsightsProvider>
              <AutoRenderBlockedLinks
                prNumbers={autoRenderBlockedLinks.prNumbers}
                authorLogins={autoRenderBlockedLinks.authorLogins}
              />
            </AuthorInsightsProvider>,
            containers.autoRenderBlockedLinks,
            'auto-render-blocked-links',
          )}

        {containers.mergedRequestMoreAction &&
          createPortal(
            // key={repo}: remounts (resetting local pending/status state)
            // whenever the target repo actually changes - see
            // MergedRequestMoreAction.jsx's own doc comment for the stale-
            // state bug this fixes. Not keyed on isVisible too: if a
            // request is still in flight when this hides and reshows for
            // the *same* repo, showing whatever it resolved to in the
            // meantime is correct, not stale.
            <MergedRequestMoreAction
              key={mergedRequestMoreAction.repo}
              isVisible={mergedRequestMoreAction.isVisible}
              repo={mergedRequestMoreAction.repo}
            />,
            containers.mergedRequestMoreAction,
            'merged-request-more-action',
          )}
      </FilterStateProvider>
      <PrDataPolling />
    </PrDataProvider>
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
  ReactDOM.createRoot(anchor).render(<AppRoot />);
}

if (typeof window !== 'undefined') {
  mountAppRoot();
  // 'viewprs:react-ready' is now dispatched from inside AppRoot's own
  // useEffect, once window.mountReactPrTable is actually assigned - see
  // that effect's comment for why dispatching it here (immediately after
  // .render(), which only schedules the initial commit) was a race.
}
