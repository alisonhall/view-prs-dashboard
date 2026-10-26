import { useMemo } from 'react';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Tabs } from '../ui/Tabs';
import { usePrData } from '../../state/PrDataContext';
import { NowProvider, useNow } from '../../state/NowContext';
import { useSettingsDrawer } from '../../state/SettingsDrawerContext';
import { INITIAL_STATUS_TEXT, useStatusText } from '../../state/StatusTextContext';
import { useTabState, type DataTabKey } from '../../state/TabStateContext';
import { describeLastUpdate, describeRepos } from '../../helpers/pr-app-header.helpers.ts';
import { QuickCheckAllButton, type QuickCheckAllButtonProps } from './QuickCheckAllButton';

// The views, as tabs over the page's existing panels (#tab-panel-*, which
// TabPanelVisibilitySync shows and hides).
const VIEWS: ReadonlyArray<{ id: DataTabKey; label: string }> = [
  { id: 'pr-data', label: 'Pull requests' },
  { id: 'review-stats', label: 'Review stats' },
  { id: 'author-insights', label: 'Authors' },
];
const viewIds = (id: string) => ({ tab: `tab-${id}`, panel: `tab-panel-${id}` });

// The latest action's result or progress (StatusTextContext: a row's Ack, a
// run, a backfill...), its first line; all of it on hover, and in the
// Settings drawer's Run & check. Nothing until something has reported. A
// polite live region, in the page from the start so it's announced.
function LatestStatus() {
  const { statusText } = useStatusText();
  const text = statusText === INITIAL_STATUS_TEXT ? '' : statusText.trim();
  const firstLine = text.split('\n')[0] ?? '';
  return (
    <p className="app-header-message" role="status" aria-live="polite" title={text || undefined}>
      {firstLine}
    </p>
  );
}

// "Updated 5m ago", moving once a minute; the exact time on hover.
function LastUpdatePill({ updatedAt, loaded }: { updatedAt: unknown; loaded: boolean }) {
  const now = useNow();
  if (!loaded) return <span className="app-header-status">Loading…</span>;
  const { label, title, isStale } = describeLastUpdate(updatedAt, now);
  return (
    <span className="app-header-status" data-tone={isStale ? 'attention' : undefined} title={title || undefined}>
      <span className="app-header-status-dot" aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * The app header (UI_REDESIGN_PLAN.md, phase 9a): the app's name and the
 * repos the table shows rows from (one by name, else how many - the list on
 * hover), the view tabs (Pull requests / Review stats / Authors,
 * TabStateContext's data tab), the latest action's status, when the data
 * was last updated, and the
 * refresh (Quick check all), and the Settings drawer's button. The auto-update-paused banner has its own
 * root under it (AutoUpdatePausedBanner).
 */
export interface AppHeaderProps {
  onQuickCheckAll: QuickCheckAllButtonProps['onCheck'];
}

export function AppHeader({ onQuickCheckAll }: AppHeaderProps) {
  const { payload, selectedRepo } = usePrData();
  const { activeDataTab, setActiveDataTab } = useTabState();
  const settings = useSettingsDrawer();
  const repos = useMemo(
    () => describeRepos(Object.values(payload?.byPrNumber || {}), selectedRepo || String(payload?.lastRun?.repo || '')),
    [payload, selectedRepo],
  );

  return (
    <header className="app-header">
        <div className="app-header-brand">
          <h1 className="app-header-title">View PR Updates</h1>
          {repos.label && (
            <span className="app-header-repo" title={repos.title || undefined}>
              <Icon name="pr" size={14} />
              {repos.label}
            </span>
          )}
        </div>
        <Tabs
          label="Views"
          idPrefix="view"
          tabs={VIEWS.map(({ id, label }) => ({ id, label }))}
          selectedId={activeDataTab}
          onSelect={(id) => setActiveDataTab(id as DataTabKey)}
          idsFor={viewIds}
        />
        <div className="app-header-actions">
          <LatestStatus />
          <NowProvider>
            <LastUpdatePill updatedAt={payload?.lastRun?.updatedAt} loaded={Boolean(payload?.ok)} />
          </NowProvider>
          <QuickCheckAllButton onCheck={onQuickCheckAll} />
          <Button icon="sliders" aria-haspopup="dialog" aria-expanded={settings.isOpen} onClick={() => settings.open()}>
            Settings
          </Button>
          <a className="app-header-link" href="./README.md">
            README
          </a>
        </div>
    </header>
  );
}
