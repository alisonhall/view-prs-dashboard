/**
 * The app's entry point: installs the credential-field error filters, then
 * renders the Providers and <AppShell /> (the whole page) into #app-root.
 */

import ReactDOM from 'react-dom/client';
import { AppShell } from './components/shell/AppShell';
import { ErrorNotice } from './components/shell/ErrorNotice';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { ListSelectionSeeding } from './state/useListSelectionSeeding';
import { SnackbarProvider } from './components/SnackbarProvider';
import { buildFilterStateInitialValues } from './state/filterStateInitialValues';
import { SettingsDrawerProvider } from './state/SettingsDrawerContext';
import { PrDataPolling, readDataPollMsOverride } from './components/PrDataPolling';
import { PrDataProvider } from './state/PrDataProvider';
import { FilterStateProvider } from './state/FilterStateProvider';
import { PrTableUiStateProvider } from './state/PrTableUiStateProvider';
import { TabStateProvider } from './components/TabStateProvider';
import { AutoRenderBlockingProvider } from './components/AutoRenderBlockingProvider';
import { AutoRenderBlockingSync } from './components/AutoRenderBlockingSync';
import { installCredentialFieldErrorFilters } from './helpers/credential-field-error-filter.helpers.ts';
import { NotesDirtyProvider } from './components/NotesDirtyProvider';
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
import { ThemeProvider } from './state/ThemeProvider';
import type { ReviewStatsViewState } from './state/PrDataContext';

// The Review stats date range starts 3 months back from today (a
// <input type="date"> value); PrDataProvider's statsViewState owns it.
const getDefaultStatsStartDate = () => {
  const now = new Date();
  const shifted = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, now.getUTCDate()));
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const DEFAULT_STATS_VIEW_STATE: ReviewStatsViewState = {
  sortBy: 'riskyApprovals',
  filterMode: 'all',
  topN: 12,
  minComments: 0,
  startDate: getDefaultStatsStartDate(),
  endDate: '',
};

/**
 * Renders the app into #app-root. The Providers' order matters where one
 * reads another:
 * - FilterStateProvider sits inside the 3 selection Providers, so its saved
 *   overrides resolve the same selections the lists write into.
 * - StatusTextProvider is outside the Providers that report status
 *   (RequestActivityProvider, BackfillStatusProvider, PrDataProvider...).
 * - RequestActivityProvider is above BackfillStatusProvider,
 *   AutoRenderBlockingProvider and PrDataProvider, which all report request
 *   activity to it; loadOnMount runs the startup scheduler-status load.
 * - AutoRenderBlockingProvider is outside PrDataProvider, which holds back
 *   new data while it says something is unsaved; AutoRenderBlockingSync
 *   works that out from NotesDirtyProvider and AuthorInsightsDraftsProvider.
 * - ThemeProvider only needs to cover <AppShell /> (Settings › Appearance is
 *   in its drawer); index.html sets the theme before anything renders.
 * - The rest sit above <AppShell /> because components across the page
 *   read them (the header, the drawer and the table all reach the activity
 *   queue, the labels and the job events).
 *
 * An error the views' own boundaries don't catch (in a Provider, the
 * header or the drawer) shows a notice with Reload instead of a blank page.
 */
function mountApp(container: HTMLElement) {
  ReactDOM.createRoot(container).render(
    <ErrorBoundary fallback={(error) => <ErrorNotice title="Something went wrong, so the page can't be shown." error={error} />}>
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
                                <NotesDirtyProvider>
                                  <PrTableUiStateProvider>
                                    <SettingsDrawerProvider>
                                      <RepoLabelsProvider>
                                        <AuthorInsightsDraftsProvider>
                                          <AutoRenderBlockingSync />
                                          <JobEventsProvider>
                                            <FilterOptionsProvider>
                                              {/* Every multi-select list's selection (the filter
                                                  bar's and the Settings drawer's), kept in step
                                                  with its options. */}
                                              <ListSelectionSeeding />
                                              <ThemeProvider>
                                                <AppShell />
                                              </ThemeProvider>
                                            </FilterOptionsProvider>
                                          </JobEventsProvider>
                                        </AuthorInsightsDraftsProvider>
                                      </RepoLabelsProvider>
                                    </SettingsDrawerProvider>
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
      </RowFilterSelectionProvider>
    </ErrorBoundary>,
  );
}

if (typeof window !== 'undefined') {
  // Before mounting, so the first render's errors are filtered too.
  installCredentialFieldErrorFilters(window);
  const container = document.getElementById('app-root');
  if (container) mountApp(container);
}
