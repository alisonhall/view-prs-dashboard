import { Suspense, lazy, type ReactNode } from 'react';
import { usePrData } from '../../state/PrDataContext';
import { type TabPanelId, useHasTabPanelBeenVisible, useIsTabPanelVisible } from '../../state/useIsTabPanelVisible';
import { useMergedRequestMoreActionOptions } from '../../state/useMergedRequestMoreActionOptions';
import { useMultiSelectDropdownClosing } from '../../state/useMultiSelectDropdownClosing';
import { useQuickCheckActions } from '../../state/useQuickCheckActions';
import { useRequestMoreMerged } from '../../state/useRequestMoreMerged';
import { AuthorInsightsProvider } from '../AuthorInsightsProvider';
import { MergedRequestMoreAction } from '../MergedRequestMoreAction';
import { NeedsAttentionProvider } from '../NeedsAttentionProvider';
import { PrInsightsDisplayProvider } from '../PrInsightsDisplayProvider';
import { PrTableApp } from '../PrTableApp';
import { ReviewConversationsUiStateProvider } from '../ReviewConversationsUiStateProvider';
import { ReviewStatsProvider } from '../ReviewStatsProvider';
import { Snackbar } from '../Snackbar';
import { DataViewHeader } from '../filter-bar/DataViewHeader';
import { SettingsDrawer } from '../settings/SettingsDrawer';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { AppHeader } from './AppHeader';
import { AutoUpdatePausedBanner } from './AutoUpdatePausedBanner';
import { ErrorNotice } from './ErrorNotice';

// The Review stats and Authors views aren't visible on load, so their code
// loads the first time each is shown (the Settings drawer splits its own
// sections). LazyView gates them on useHasTabPanelBeenVisible, not
// useIsTabPanelVisible: once shown they stay mounted, since several hold
// local UI state (the stats sort, the selected author's drafts) a remount
// would reset.
const ReviewStatsControls = lazy(() =>
  import('../ReviewStatsControls').then((m) => ({ default: m.ReviewStatsControls })),
);
const ReviewStatsContent = lazy(() =>
  import('../ReviewStatsContent').then((m) => ({ default: m.ReviewStatsContent })),
);
const AuthorInsightsSelector = lazy(() =>
  import('../AuthorInsightsSelector').then((m) => ({ default: m.AuthorInsightsSelector })),
);
const AuthorInsightsHeader = lazy(() =>
  import('../AuthorInsightsHeader').then((m) => ({ default: m.AuthorInsightsHeader })),
);
const AuthorInsightsCommentsSection = lazy(() =>
  import('../AuthorInsightsCommentsSection').then((m) => ({ default: m.AuthorInsightsCommentsSection })),
);
const AuthorInsightsNotesSection = lazy(() =>
  import('../AuthorInsightsNotesSection').then((m) => ({ default: m.AuthorInsightsNotesSection })),
);
const AuthorCreatedPrsSection = lazy(() =>
  import('../AuthorCreatedPrsSection').then((m) => ({ default: m.AuthorCreatedPrsSection })),
);

// Its own component so only it follows the filter state (useQuickCheckActions
// reads the form body).
function AppHeaderLive() {
  const quickCheckActions = useQuickCheckActions();
  return <AppHeader onQuickCheckAll={() => quickCheckActions.handleQuickCheckAll()} />;
}

// One view, hidden unless its tab is selected. Its own component so a tab
// switch re-renders only the panels, not what's in them. A view that
// throws (or whose code fails to load) shows a notice in its place; the
// header and the other views carry on.
function TabPanel({ id, labelledBy, children }: { id: TabPanelId; labelledBy: string; children: ReactNode }) {
  const isVisible = useIsTabPanelVisible(id);
  return (
    <section id={id} className="data-tab-panel" role="tabpanel" aria-labelledby={labelledBy} hidden={!isVisible}>
      <ErrorBoundary fallback={(error) => <ErrorNotice title="This view couldn't be shown." error={error} />}>
        {children}
      </ErrorBoundary>
    </section>
  );
}

// Review stats and Authors: nothing until the view is first shown, then
// its parts (and their code) load together and stay mounted.
function LazyView({ id, children }: { id: TabPanelId; children: ReactNode }) {
  const hasBeenVisible = useHasTabPanelBeenVisible(id);
  if (!hasBeenVisible) return null;
  return <Suspense fallback={null}>{children}</Suspense>;
}

// The PR table, once PrDataProvider has rendered its first payload. Its own
// component so only it (not the whole shell) follows the PR-data Context.
function PrTable() {
  const { hasRenderedPrData } = usePrData();
  if (!hasRenderedPrData) return null;
  return (
    <NeedsAttentionProvider>
      <PrInsightsDisplayProvider>
        <ReviewConversationsUiStateProvider>
          <PrTableApp />
        </ReviewConversationsUiStateProvider>
      </PrInsightsDisplayProvider>
    </NeedsAttentionProvider>
  );
}

// key={repo}: its pending and status messages are about one repo's request,
// so a repo change starts it afresh.
function MergedRequestMoreActionLive() {
  const { isVisible, repo } = useMergedRequestMoreActionOptions();
  const requestMoreMerged = useRequestMoreMerged();
  return <MergedRequestMoreAction key={repo} isVisible={isVisible} repo={repo} onRequestMore={requestMoreMerged} />;
}

/**
 * The page: the snackbar, the app header and the auto-update-paused banner,
 * the three views (the header's tabs choose which shows), and the Settings
 * drawer. Mount inside the app's Providers (react-app.tsx), including
 * FilterOptionsProvider, SettingsDrawerProvider and TabStateProvider.
 *
 * It reads no Context itself (the parts that do are their own components),
 * so it renders once and the elements below keep their identity: a tab
 * switch or a filter edit doesn't re-render the PR table. Review stats and
 * Authors each have one Provider for all their parts (they used to be
 * separate portals, each with its own).
 */
export function AppShell() {
  // Outside clicks close the filter dropdowns.
  useMultiSelectDropdownClosing();

  return (
    <>
      {/* Snackbar renders the whole #error-snackbar element. */}
      <div id="error-snackbar-root">
        <Snackbar />
      </div>
      <div id="app-header-root">
        <AppHeaderLive />
      </div>
      {/* Its own element at the top level, so it can stay stuck to the top
          of the window while you scroll (styles/shell.css). */}
      <div id="app-banner-root" className="app-banner-root">
        <AuthorInsightsProvider>
          <AutoUpdatePausedBanner />
        </AuthorInsightsProvider>
      </div>

      <div className="data-tabs" id="data-tabs">
        <TabPanel id="tab-panel-pr-data" labelledBy="tab-pr-data">
          <DataViewHeader />
          <div id="pr-sections" role="region" aria-label="Pull requests">
            <PrTable />
          </div>
          <div id="merged-request-more-action" className="merged-request-more-action">
            <MergedRequestMoreActionLive />
          </div>
        </TabPanel>

        <TabPanel id="tab-panel-review-stats" labelledBy="tab-review-stats">
          <LazyView id="tab-panel-review-stats">
            <ReviewStatsProvider>
              <div id="pr-stats" className="stats-panel">
                <div id="stats-controls-root" role="group" aria-label="Review statistics controls">
                  <ReviewStatsControls />
                </div>
                <div id="stats-content-root" role="region" aria-label="Review statistics">
                  <ReviewStatsContent />
                </div>
              </div>
            </ReviewStatsProvider>
          </LazyView>
        </TabPanel>

        <TabPanel id="tab-panel-author-insights" labelledBy="tab-author-insights">
          <LazyView id="tab-panel-author-insights">
            {/* The selected author's data; AuthorInsightsDraftsProvider,
                above the shell, keeps unsaved comments. */}
            <AuthorInsightsProvider>
              <div id="author-insights" className="author-insights-panel">
                <div id="author-insights-selector-root">
                  <AuthorInsightsSelector />
                </div>
                <div id="author-insights-header-root" role="region" aria-label="Selected author">
                  <AuthorInsightsHeader />
                </div>
                <div id="author-insights-content-root" role="region" aria-label="Author comments">
                  <AuthorInsightsCommentsSection />
                </div>
                <div id="author-insights-notes-root" role="region" aria-label="Author's PR notes">
                  <AuthorInsightsNotesSection />
                </div>
                <div id="author-insights-created-prs-root" role="region" aria-label="Author's created PRs">
                  <AuthorCreatedPrsSection />
                </div>
              </div>
            </AuthorInsightsProvider>
          </LazyView>
        </TabPanel>
      </div>

      <div id="settings-drawer-root">
        <SettingsDrawer />
      </div>
    </>
  );
}
