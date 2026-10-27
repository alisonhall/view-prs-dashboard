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
import { AppHeader } from './AppHeader';
import { AutoUpdatePausedBanner } from './AutoUpdatePausedBanner';

// The Review stats and Authors views aren't visible on load, so their code
// loads the first time each is shown (the Settings drawer splits its own
// sections). StatsPart and AuthorPart gate them on useHasTabPanelBeenVisible,
// not useIsTabPanelVisible: once shown they stay mounted, since several hold
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
// switch re-renders only the panels, not what's in them.
function TabPanel({ id, labelledBy, children }: { id: TabPanelId; labelledBy: string; children: ReactNode }) {
  const isVisible = useIsTabPanelVisible(id);
  return (
    <section id={id} className="data-tab-panel" role="tabpanel" aria-labelledby={labelledBy} hidden={!isVisible}>
      {children}
    </section>
  );
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

// Each part of the Authors view has its own AuthorInsightsProvider (the
// selected author's data); AuthorInsightsDraftsProvider, above the shell,
// keeps unsaved comments across them.
function AuthorPart({ children }: { children: ReactNode }) {
  const hasBeenVisible = useHasTabPanelBeenVisible('tab-panel-author-insights');
  if (!hasBeenVisible) return null;
  return (
    <AuthorInsightsProvider>
      <Suspense fallback={null}>{children}</Suspense>
    </AuthorInsightsProvider>
  );
}

function StatsPart({ children }: { children: ReactNode }) {
  const hasBeenVisible = useHasTabPanelBeenVisible('tab-panel-review-stats');
  if (!hasBeenVisible) return null;
  return (
    <ReviewStatsProvider>
      <Suspense fallback={null}>{children}</Suspense>
    </ReviewStatsProvider>
  );
}

/**
 * The page: the snackbar, the app header and the auto-update-paused banner,
 * the three views (the header's tabs choose which shows), and the Settings
 * drawer. Mount inside the app's Providers (react-app.tsx), including
 * FilterOptionsProvider, SettingsDrawerProvider and TabStateProvider.
 *
 * It reads no Context itself (the parts that do are their own components),
 * so it renders once and the elements below keep their identity: a tab
 * switch or a filter edit doesn't re-render the PR table.
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
          <div id="pr-stats" className="stats-panel">
            <div id="stats-controls-root" role="group" aria-label="Review statistics controls">
              <StatsPart>
                <ReviewStatsControls />
              </StatsPart>
            </div>
            <div id="stats-content-root" role="region" aria-label="Review statistics">
              <StatsPart>
                <ReviewStatsContent />
              </StatsPart>
            </div>
          </div>
        </TabPanel>

        <TabPanel id="tab-panel-author-insights" labelledBy="tab-author-insights">
          <div id="author-insights" className="author-insights-panel">
            <div id="author-insights-selector-root">
              <AuthorPart>
                <AuthorInsightsSelector />
              </AuthorPart>
            </div>
            <div id="author-insights-header-root" role="region" aria-label="Selected author">
              <AuthorPart>
                <AuthorInsightsHeader />
              </AuthorPart>
            </div>
            <div id="author-insights-content-root" role="region" aria-label="Author comments">
              <AuthorPart>
                <AuthorInsightsCommentsSection />
              </AuthorPart>
            </div>
            <div id="author-insights-notes-root" role="region" aria-label="Author's PR notes">
              <AuthorPart>
                <AuthorInsightsNotesSection />
              </AuthorPart>
            </div>
            <div id="author-insights-created-prs-root" role="region" aria-label="Author's created PRs">
              <AuthorPart>
                <AuthorCreatedPrsSection />
              </AuthorPart>
            </div>
          </div>
        </TabPanel>
      </div>

      <div id="settings-drawer-root">
        <SettingsDrawer />
      </div>
    </>
  );
}
