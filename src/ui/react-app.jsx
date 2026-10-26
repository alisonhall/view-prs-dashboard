/**
 * React App Entry Point for view-prs
 *
 * Phase 1: Hybrid React Table Migration
 * - Mounts React only for PR table rendering
 * - Keeps vanilla JS for filters, controls, and other tabs
 * - Provides bridge between vanilla JS and React
 */

import { Suspense, lazy, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { createPortal } from 'react-dom';
import { PrTableApp } from './components/PrTableApp';
import { MergedRequestMoreAction } from './components/MergedRequestMoreAction';
import { DataViewHeaderPortals } from './components/filter-bar/DataViewHeaderPortals';
import { ListSelectionSeeding } from './state/useListSelectionSeeding';
import { useMergedRequestMoreActionOptions } from './state/useMergedRequestMoreActionOptions';
import { useRequestMoreMerged } from './state/useRequestMoreMerged';
import { Snackbar } from './components/Snackbar';
import { SnackbarProvider } from './components/SnackbarProvider';
import { SettingsDrawer } from './components/settings/SettingsDrawer';
import { buildFilterStateInitialValues } from './state/filterStateInitialValues';
import { SettingsDrawerProvider } from './state/SettingsDrawerContext';
import { PrDataPolling, readDataPollMsOverride } from './components/PrDataPolling';
import { useQuickCheckActions } from './state/useQuickCheckActions';
import { PrDataProvider } from './state/PrDataProvider';
import { usePrData } from './state/PrDataContext';
import { FilterStateProvider } from './state/FilterStateProvider';
import { PrTableUiStateProvider } from './state/PrTableUiStateProvider';
import { NeedsAttentionProvider } from './components/NeedsAttentionProvider';
import { TabStateProvider } from './components/TabStateProvider';
import { TabPanelVisibilitySync } from './components/TabPanelVisibilitySync';
import { AutoRenderBlockingProvider } from './components/AutoRenderBlockingProvider';
import { AutoRenderBlockingSync } from './components/AutoRenderBlockingSync';
import { useMultiSelectDropdownClosing } from './state/useMultiSelectDropdownClosing';
import { installCredentialFieldErrorFilters } from './helpers/credential-field-error-filter.helpers.ts';
import { AppHeader } from './components/shell/AppHeader';
import { AutoUpdatePausedBanner } from './components/shell/AutoUpdatePausedBanner';
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
import { BackfillStatusProvider } from './components/BackfillStatusProvider';
import { RepoLabelsProvider } from './components/RepoLabelsProvider';
import { AuthorInsightsDraftsProvider } from './components/AuthorInsightsDraftsProvider';
import { RowFilterSelectionProvider } from './state/RowFilterSelectionProvider';
import { AuthorThreadResolutionSelectionProvider } from './state/AuthorThreadResolutionSelectionProvider';
import { ChangeFilterActorSelectionProvider } from './state/ChangeFilterActorSelectionProvider';
import { useHasTabPanelBeenVisible } from './state/useIsTabPanelVisible';

/**
 * Deferred-items follow-up, item 5 (see REACT_MIGRATION_PLAN.md):
 * code-splitting for the 2 views that are never visible on initial load
 * (Review Stats, Author Insights - `hidden` by default in index.html, see
 * <AppRoot /> below; the Settings drawer splits its own lazy sections). `React.lazy()` needs a default export; each of these
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
 * `getUiOptionDefaults()` (helpers/pr-ui-option-persistence.helpers.ts)
 * uses - there's no vanilla fallback markup left to read a "currently
 * showing" value from, since React is the only thing that ever renders
 * into these containers now. FilterStateProvider's own mount effect (a
 * real async fetch) still overwrites these with any saved overrides once
 * it resolves - a plain `setValues` call from inside that effect (it runs
 * in the Provider's own lifecycle, so no flushSync is needed).
 */
// Phase H.20 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
// cluster 6): mountAppRoot() computes FilterStateProvider's initialValues
// once, with no DOM dependency (state/filterStateInitialValues.ts) - needed
// since FilterStateProvider wraps <AppRoot/> at mountAppRoot()'s own
// render() call (closing window.getFormBody - see useFormBody.tsx).

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
  return {
    reviewStatsControls: document.getElementById('stats-controls-root'),
    reviewStatsContent: document.getElementById('stats-content-root'),
    authorInsightsSelector: document.getElementById('author-insights-selector-root'),
    authorInsightsCreatedPrs: document.getElementById('author-insights-created-prs-root'),
    authorInsightsHeader: document.getElementById('author-insights-header-root'),
    authorInsightsNotes: document.getElementById('author-insights-notes-root'),
    authorInsightsComments: document.getElementById('author-insights-content-root'),
    dataMeta: document.getElementById('data-meta'),
    filterBar: document.getElementById('filter-bar-root'),
    errorSnackbar: document.getElementById('error-snackbar-root'),
    mergedRequestMoreAction: document.getElementById('merged-request-more-action'),
    appHeader: document.getElementById('app-header-root'),
    appBanner: document.getElementById('app-banner-root'),
    settingsDrawer: document.getElementById('settings-drawer-root'),
    prSections: document.getElementById('pr-sections'),
  };
}

/**
 * Track C, slice C2d (post-Phase-6 follow-up, see REACT_MIGRATION_PLAN.md):
 * the single React root for the whole app. Every piece that used to be its
 * own independent `ReactDOM.createRoot()` (PrTableApp, the form's
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

  // Phase H.9 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
  // QuickCheckAllButton (the app header's) used to call
  // window.handleQuickCheckAll directly - it now calls this hook's
  // returned function instead. (The activity popover, in the header, calls
  // its own actions hook.)
  const quickCheckActions = useQuickCheckActions();

  // Deferred-items follow-up, item 5 (see REACT_MIGRATION_PLAN.md): drives
  // which lazy-loaded tab chunks below have been requested yet.
  const hasReviewStatsBeenVisible = useHasTabPanelBeenVisible('tab-panel-review-stats');
  const hasAuthorInsightsBeenVisible = useHasTabPanelBeenVisible('tab-panel-author-insights');

  // Window-bridge elimination Phase 7 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
  // window.mountReactPrTable is gone. index.page.js's renderPrData called it on
  // the first data render; PrDataProvider renders the data itself now, and
  // <PrTablePortal /> (below) mounts the table once it has.

  // Phase 7 (see REACT_MIGRATION_PLAN.md, "live filtering" follow-up):
  // window.renderReactFilterSummary (the push bridge this useEffect used
  // to register) is gone - <DataViewHeaderPortals> now derives the
  // summary text itself, reactively, via useAppliedFilterSummary().
  // Phase H.12 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
  // the vanilla call site that used to try calling this now-nonexistent
  // bridge (pr-render-apply.helpers.js's applyRenderResults, and its
  // window.updateReactDataMetaText sibling there) is deleted outright too
  // - both were confirmed dead in production (no installer anywhere in
  // this file), left wired only because index.html.test.js's own test
  // harness faked them (fixed below, see installReactFilterPanelMountBridges's
  // own comment there).

  // Window-bridge elimination Phase 7.4: window.updateReactAutoRenderBlockedLinks
  // (and the state it set here) is gone - the app header's
  // AutoUpdatePausedBanner reads the blocking lists from
  // AutoRenderBlockingProvider.

  // Window-bridge elimination Phase 7.5: the 'viewprs:react-ready' event this
  // component used to dispatch from its last effect is gone. It told
  // index.page.js (deleted) that AppRoot's bridges and portaled inputs
  // existed; its last listener re-ran the credential hints, which the inputs
  // now render themselves (NON_CREDENTIAL_INPUT_PROPS). See git history for
  // the load-order races it guarded against.
  //
  // Also from index.page.js: outside clicks close the filter dropdowns.
  useMultiSelectDropdownClosing();

  return (
    <SettingsDrawerProvider>
      {/* Phase H.20 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
          cluster 6): RowFilterSelectionProvider/AuthorThreadResolutionSelectionProvider/
          ChangeFilterActorSelectionProvider/FilterStateProvider used to wrap
          from here (same reasoning as the comment that used to sit at this
          spot: cross-portal sharing between the multi-select lists and
          PrTableApp/ReviewThreadsSection (now PrConversationsTab), sibling portals not an
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
          widening both ran into separately - see state/useFormBody.tsx.
          PrDataProvider itself stays here (cluster 6
          doesn't move it), so it's now FilterStateProvider's *descendant*
          instead of its ancestor - confirmed inert (neither reads the
          other's Context) but a genuine reversal worth calling out, since
          every move before this one only ever added a new ancestor above
          an existing one. */}
        {/* RepoLabelsProvider wraps everything below for the same reason
            PrActivityQueueProvider does: the Settings drawer's label to
            apply (its portal further down) and PrTableApp's PrActionsCell
            (inside the prTable portal) are siblings, not an
            ancestor/descendant pair, that both need the same available-
            labels list - see RepoLabelsContext.tsx's own comment. */}
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
            JobEventsProvider widened from "just the activity drawer's
            portal" (the header's activity popover since UI redesign phase
            9c) to wrap everything
            RowFilterSelectionProvider does - useAppliedFilterSummary.tsx
            (consumed by DataViewHeaderPortals further down, for the
            filter bar and the PR data summary) needs useJobEvents()'s
            schedulerSummary too, and those are sibling portals relative to
            the header, not an ancestor/descendant pair - same
            cross-portal-sharing reason every other Provider at this level
            is already this wide. */}
        <JobEventsProvider>
        {/* Phase G (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
            PrActivityQueueProvider used to wrap just the drawer's
            bulk-queue section and PrTableApp below - it now wraps <AppRoot />
            itself instead (mountAppRoot, above), so useAckLabelActions()
            (called from this component's own body) can reach it via
            usePrActivityQueue() directly. The activity popover (in the
            header's portal) and PrTableApp resolve to that same (now
            outer) Provider. */}
          <PrTablePortal container={containers.prSections} />

        <FilterOptionsProvider>
          {/* Every multi-select list's selection (the filter bar's and the
              Settings drawer's), kept in step with its options. */}
          <ListSelectionSeeding />
          {/* The filter bar and the PR data summary above the table. */}
          <DataViewHeaderPortals filterBarContainer={containers.filterBar} dataMetaContainer={containers.dataMeta} />
          {/* UI redesign phase 9b: the Settings drawer (opened from the app
              header). Inside FilterOptionsProvider (its actor lists) and
              RepoLabelsProvider (Run & check reloads labels). */}
          {containers.settingsDrawer && createPortal(<SettingsDrawer />, containers.settingsDrawer, 'settings-drawer')}
        </FilterOptionsProvider>

        {containers.errorSnackbar && createPortal(<Snackbar />, containers.errorSnackbar, 'error-snackbar')}











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



        {/* UI redesign phase 9a: the app header (view tabs, last update,
            Quick check all) and, under it, the auto-update-paused banner. */}
        {containers.appHeader &&
          createPortal(
            <AppHeader onQuickCheckAll={() => quickCheckActions.handleQuickCheckAll()} />,
            containers.appHeader,
            'app-header',
          )}
        {containers.appBanner &&
          createPortal(
            <AuthorInsightsProvider>
              <AutoUpdatePausedBanner />
            </AuthorInsightsProvider>,
            containers.appBanner,
            'app-banner',
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
    </SettingsDrawerProvider>
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
  // announce-on-change path) and outside AppRoot (the Settings drawer's
  // BackfillSection, a descendant of AppRoot's own returned JSX, reads it
  // via useBackfillStatus()).
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
  // state/useFormBody.tsx and this function's own initialValues argument
  // below, now computed once here via buildFilterStateInitialValues()
  // instead of threaded through AppRoot's own containers state.
  //
  // Phase H.21 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
  // cluster 3): TabStateProvider wraps from here too now (innermost - it
  // needs none of the other 6 Contexts), same reason as every Provider
  // above it on this list - AppRoot's own body calls
  // useHasTabPanelBeenVisible() (hasReviewStatsBeenVisible etc.),
  // which needs a genuine Provider ancestor to resolve useTabState() to
  // anything other than this Context's no-op default.
  //
  // Phase H.22 (same cluster): <TabPanelVisibilitySync/> mounted as
  // AppRoot's own sibling, inside <TabStateProvider> - a plain sibling,
  // not a wrapper, since it owns the view panels' `hidden` attribute via
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
  // body or a descendant) and PrDataProvider.tsx (wrapping AppRoot's own
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
                                <PrTableUiStateProvider>
                                  <AppRoot />
                                </PrTableUiStateProvider>
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
  // Window-bridge elimination Phase 7.5: installed here, before mounting -
  // index.page.js (deleted) installed them at its module load, just before
  // this module ran.
  installCredentialFieldErrorFilters(window);
  mountAppRoot();
}
