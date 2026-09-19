/**
 * React App Entry Point for view-prs
 *
 * Phase 1: Hybrid React Table Migration
 * - Mounts React only for PR table rendering
 * - Keeps vanilla JS for filters, controls, and other tabs
 * - Provides bridge between vanilla JS and React
 */

import React, { useEffect, useState } from 'react';
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
import { ActionLogSection } from './components/ActionLogSection';
import { ExportTab } from './components/ExportTab';
import { ApplyLabelSelect } from './components/ApplyLabelSelect';
import { ActorNamesTab } from './components/ActorNamesTab';
import { BackfillBadges } from './components/BackfillBadges';
import { AppliedFilterSummary } from './components/AppliedFilterSummary';
import { PrDataPolling } from './components/PrDataPolling';
import { PrDataProvider } from './state/PrDataProvider';
import { FilterStateProvider } from './state/FilterStateProvider';

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
  Object.keys(MULTI_SELECT_LIST_ID_PREFIXES).forEach((listId) => {
    multiSelect[listId] = document.getElementById(listId);
  });

  return {
    filterFields: buildFilterStateFieldPortals(),
    multiSelect,
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
    appliedFilterSummary: document.getElementById('management-filter-summary-root'),
    actionLog: document.getElementById('action-log-container'),
    actorNames: document.getElementById('actor-names-root'),
    export: document.getElementById('export-container'),
    applyLabelSelect: document.getElementById('apply-label-select-root'),
    reviewStatsControlsInitialState:
      typeof window.getStatsViewState === 'function'
        ? window.getStatsViewState()
        : { sortBy: 'riskyApprovals', filterMode: 'all', topN: 12, minComments: 0, startDate: '', endDate: '' },
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
function AppRoot() {
  const [containers] = useState(computeStaticContainers);

  const [prTable, setPrTable] = useState(null);
  const [multiSelectStates, setMultiSelectStates] = useState({});
  const [filterSummary, setFilterSummary] = useState({ summaryText: '', filterChips: [] });
  const [reviewStatsContent, setReviewStatsContent] = useState({ stats: null, rows: [], actorsMap: {} });
  const [authorInsightsSelector, setAuthorInsightsSelector] = useState({ options: [], selectedLogin: '', renderKey: 0 });
  const [authorInsightsCreatedPrs, setAuthorInsightsCreatedPrs] = useState({ rows: [], selectedAuthorLogin: '' });
  const [authorInsightsHeader, setAuthorInsightsHeader] = useState({ selectedAuthorName: '' });
  const [authorInsightsNotes, setAuthorInsightsNotes] = useState({ rows: [], selectedAuthor: null, actorsMap: {} });
  const [authorInsightsComments, setAuthorInsightsComments] = useState({ rows: [], selectedAuthor: null, actorsMap: {} });
  const [backfillBadges, setBackfillBadges] = useState({ badges: [] });
  const [schedulerBadges, setSchedulerBadges] = useState({ badges: [] });
  const [requestActivityBadges, setRequestActivityBadges] = useState({ badges: [] });
  const [applyLabelOptions, setApplyLabelOptions] = useState({ labels: [] });

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
    window.renderReactMultiSelectList = (listId, options) => {
      const container = containers.multiSelect[listId];
      const idPrefix = MULTI_SELECT_LIST_ID_PREFIXES[listId];
      if (!container || !idPrefix) {
        return false;
      }
      // flushSync: see MultiSelectCheckboxList's own callers historically -
      // a same-tick DOM read right after this call (e.g.
      // getSelectedMultiSelectValues) must see the just-committed state,
      // not a pre-commit stale one.
      flushSync(() => {
        setMultiSelectStates((previous) => ({
          ...previous,
          [listId]: { options, renderKey: (previous[listId]?.renderKey || 0) + 1 },
        }));
      });
      return true;
    };
    return () => {
      delete window.renderReactMultiSelectList;
    };
  }, [containers]);

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
    window.updateReviewStatsContent = (stats, rows, actorsMap) => {
      setReviewStatsContent({ stats, rows, actorsMap });
    };
    return () => {
      delete window.updateReviewStatsContent;
    };
  }, []);

  useEffect(() => {
    window.updateAuthorInsightsSelector = (options, selectedLogin) => {
      setAuthorInsightsSelector((previous) => ({ options, selectedLogin, renderKey: previous.renderKey + 1 }));
      return true;
    };
    return () => {
      delete window.updateAuthorInsightsSelector;
    };
  }, []);

  useEffect(() => {
    window.updateAuthorInsightsCreatedPrs = (rows, selectedAuthorLogin) => {
      setAuthorInsightsCreatedPrs({ rows, selectedAuthorLogin });
      return true;
    };
    return () => {
      delete window.updateAuthorInsightsCreatedPrs;
    };
  }, []);

  useEffect(() => {
    window.updateAuthorInsightsHeader = (selectedAuthorName) => {
      setAuthorInsightsHeader({ selectedAuthorName });
      return true;
    };
    return () => {
      delete window.updateAuthorInsightsHeader;
    };
  }, []);

  useEffect(() => {
    window.updateAuthorInsightsNotes = (rows, selectedAuthor, actorsMap) => {
      setAuthorInsightsNotes({ rows, selectedAuthor, actorsMap });
      return true;
    };
    return () => {
      delete window.updateAuthorInsightsNotes;
    };
  }, []);

  useEffect(() => {
    window.updateAuthorInsightsComments = (rows, selectedAuthor, actorsMap) => {
      setAuthorInsightsComments({ rows, selectedAuthor, actorsMap });
      return true;
    };
    return () => {
      delete window.updateAuthorInsightsComments;
    };
  }, []);

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
    window.dispatchEvent(new CustomEvent('viewprs:react-ready'));
  }, []);

  return (
    <PrDataProvider initialPayload={{}} initialSelectedRepo="" initialVisiblePrNumbers={null}>
      <FilterStateProvider initialValues={containers.filterFields.initialValues}>
        {containers.filterFields.portals}

        {prTable &&
          createPortal(
            <PrTableApp
              onCheckboxChange={prTable.onCheckboxChange}
              onAckAction={prTable.onAckAction}
              onApplyLabel={prTable.onApplyLabel}
            />,
            prTable.container,
            'pr-table',
          )}

        {Object.entries(containers.multiSelect).map(([listId, container]) => {
          if (!container) {
            return null;
          }
          const state = multiSelectStates[listId];
          return createPortal(
            // key includes renderKey (bumped on every populate call, see
            // window.renderReactMultiSelectList above) so this remounts on
            // every populate, matching MultiSelectCheckboxList's own doc
            // comment - its `checked` state is seeded once from `options`
            // via a lazy useState initializer, not kept in sync with
            // subsequent prop updates, since the caller (populateXOptions
            // in pr-filter-panel.helpers.js) already does its own
            // checked/unchecked diffing before calling in. A static
            // `key={listId}` (the bug this fixes) meant every populate
            // after the very first silently no-op'd on the checked state:
            // confirmed via a reload repro where a persisted "enhancement"
            // label selection rendered into the DOM with checked: true
            // (traced through populateIncludeLabelOptions and
            // window.renderReactMultiSelectList) yet the actual checkbox
            // stayed unchecked, because this component was never told to
            // re-run its initializer.
            <MultiSelectCheckboxList
              key={`${listId}-${state?.renderKey ?? 0}`}
              options={state?.options || []}
              idPrefix={MULTI_SELECT_LIST_ID_PREFIXES[listId]}
            />,
            container,
            listId,
          );
        })}

        {containers.appliedFilterSummary &&
          createPortal(
            <AppliedFilterSummary
              summaryText={filterSummary.summaryText}
              filterChips={filterSummary.filterChips}
            />,
            containers.appliedFilterSummary,
            'applied-filter-summary',
          )}

        {containers.reviewStatsControls &&
          createPortal(
            <ReviewStatsControls
              initialState={containers.reviewStatsControlsInitialState}
              onChange={(patch) => window.updateStatsViewStateAndRerender?.(patch)}
            />,
            containers.reviewStatsControls,
            'review-stats-controls',
          )}

        {containers.reviewStatsContent &&
          createPortal(
            <ReviewStatsContent
              stats={reviewStatsContent.stats}
              rows={reviewStatsContent.rows}
              actorsMap={reviewStatsContent.actorsMap}
            />,
            containers.reviewStatsContent,
            'review-stats-content',
          )}

        {containers.authorInsightsSelector &&
          createPortal(
            <AuthorInsightsSelector
              key={authorInsightsSelector.renderKey}
              options={authorInsightsSelector.options}
              selectedLogin={authorInsightsSelector.selectedLogin}
              onChange={(login) => window.selectAuthorInsightsAuthor?.(login)}
            />,
            containers.authorInsightsSelector,
            'author-insights-selector',
          )}

        {containers.authorInsightsCreatedPrs &&
          createPortal(
            <AuthorCreatedPrsSection
              rows={authorInsightsCreatedPrs.rows}
              selectedAuthorLogin={authorInsightsCreatedPrs.selectedAuthorLogin}
            />,
            containers.authorInsightsCreatedPrs,
            'author-insights-created-prs',
          )}

        {containers.authorInsightsHeader &&
          createPortal(
            <AuthorInsightsHeader selectedAuthorName={authorInsightsHeader.selectedAuthorName} />,
            containers.authorInsightsHeader,
            'author-insights-header',
          )}

        {containers.authorInsightsNotes &&
          createPortal(
            <AuthorInsightsNotesSection
              rows={authorInsightsNotes.rows}
              selectedAuthor={authorInsightsNotes.selectedAuthor}
              actorsMap={authorInsightsNotes.actorsMap}
            />,
            containers.authorInsightsNotes,
            'author-insights-notes',
          )}

        {containers.authorInsightsComments &&
          createPortal(
            <AuthorInsightsCommentsSection
              rows={authorInsightsComments.rows}
              selectedAuthor={authorInsightsComments.selectedAuthor}
              actorsMap={authorInsightsComments.actorsMap}
            />,
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

        {containers.actionLog &&
          createPortal(<ActionLogSection />, containers.actionLog, 'action-log')}

        {containers.actorNames &&
          createPortal(<ActorNamesTab />, containers.actorNames, 'actor-names')}

        {containers.export &&
          createPortal(<ExportTab />, containers.export, 'export')}

        {containers.applyLabelSelect &&
          createPortal(
            <ApplyLabelSelect labels={applyLabelOptions.labels} />,
            containers.applyLabelSelect,
            'apply-label-select',
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
