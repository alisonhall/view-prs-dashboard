import { lazy } from 'react';
import { BackfillSection } from './BackfillSection';
import { Drawer, OnceOpened, type DrawerSection } from './Drawer';
import { RunCheckSection } from './RunCheckSection';

// Loaded the first time their section is opened (each its own chunk).
const ActionLogSection = lazy(() => import('./ActionLogSection').then((m) => ({ default: m.ActionLogSection })));
const ExportSection = lazy(() => import('./ExportSection').then((m) => ({ default: m.ExportSection })));

// The sections, in the nav's order. Backfill is mounted from the start: it
// loads the backfill status at page load (the activity popover shows it too).
const SECTIONS: ReadonlyArray<DrawerSection> = [
  { id: 'run', label: 'Run & check', render: () => <RunCheckSection /> },
  { id: 'backfill', label: 'Backfill', render: () => <BackfillSection /> },
  {
    id: 'export',
    label: 'Export',
    render: () => (
      <OnceOpened section="export">
        <ExportSection />
      </OnceOpened>
    ),
  },
  {
    id: 'action-log',
    label: 'Action log',
    render: () => (
      <OnceOpened section="action-log">
        <ActionLogSection />
      </OnceOpened>
    ),
  },
];

/**
 * The Tools drawer, opened from the app header: things to do or look at,
 * not choices kept - running the script and the quick checks (Run &
 * check, with the script's options), the backfill, exporting rows, and the
 * Action log. Export and the Action log mount the first time they're
 * opened.
 */
export function ToolsDrawer() {
  return <Drawer kind="tools" title="Tools" sections={SECTIONS} />;
}
