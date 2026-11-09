import { lazy } from 'react';
import { AppearanceSection } from './AppearanceSection';
import { AttentionRulesSection } from './AttentionRulesSection';
import { ChangeDetectionSection } from './ChangeDetectionSection';
import { Drawer, OnceOpened, type DrawerSection } from './Drawer';
import { MergeCommitsSection } from './MergeCommitsSection';
import { SourcesSection } from './SourcesSection';

export { SETTINGS_NAV_ROW_QUERY } from './Drawer';

// Loaded the first time their section is opened (each its own chunk).
const BackgroundUpdatesSection = lazy(() =>
  import('./BackgroundUpdatesSection').then((m) => ({ default: m.BackgroundUpdatesSection })),
);
const ActorNamesSection = lazy(() => import('./ActorNamesSection').then((m) => ({ default: m.ActorNamesSection })));

// The sections, in the nav's order, under what they're for: which PRs are
// followed and how often, how a PR's activity is judged, and how the page
// looks.
const SECTIONS: ReadonlyArray<DrawerSection> = [
  { id: 'sources', label: 'Sources', group: 'PRs followed', render: () => <SourcesSection /> },
  {
    id: 'background-updates',
    label: 'Background updates',
    group: 'PRs followed',
    render: () => (
      <OnceOpened section="background-updates">
        <BackgroundUpdatesSection />
      </OnceOpened>
    ),
  },
  { id: 'attention', label: 'Attention rules', group: 'Rules', render: () => <AttentionRulesSection /> },
  { id: 'change-detection', label: 'Change detection', group: 'Rules', render: () => <ChangeDetectionSection /> },
  { id: 'merge-commits', label: 'Merge commits', group: 'Rules', render: () => <MergeCommitsSection /> },
  {
    id: 'actor-names',
    label: 'Actor names',
    group: 'Rules',
    render: () => (
      <OnceOpened section="actor-names">
        <ActorNamesSection />
      </OnceOpened>
    ),
  },
  { id: 'appearance', label: 'Appearance', group: 'Display', render: () => <AppearanceSection /> },
];

/**
 * The Settings drawer, opened from the app header: choices kept until
 * they're changed - which PRs are followed (Sources, Background updates),
 * the rules a PR's activity is judged by, and how the page looks. Things
 * to do are in the Tools drawer (ToolsDrawer). Background updates and
 * Actor names mount the first time they're opened.
 */
export function SettingsDrawer() {
  return <Drawer kind="settings" title="Settings" sections={SECTIONS} />;
}
