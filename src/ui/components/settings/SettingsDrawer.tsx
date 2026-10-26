import { lazy, Suspense, useRef, type ReactNode } from 'react';
import { IconButton } from '../ui/Button';
import { Tabs } from '../ui/Tabs';
import { useFocusTrap } from '../../state/useFocusTrap';
import { useMediaQuery } from '../../state/useMediaQuery';
import { useHasSettingsSectionBeenVisible, useSettingsDrawer, type SettingsSectionId } from '../../state/SettingsDrawerContext';
import { AttentionRulesSection } from './AttentionRulesSection';
import { BackfillSection } from './BackfillSection';
import { ChangeDetectionSection } from './ChangeDetectionSection';
import { MergeCommitsSection } from './MergeCommitsSection';
import { RunCheckSection } from './RunCheckSection';
import { ScriptOptionsSection } from './ScriptOptionsSection';

// Loaded the first time their section is opened (each its own chunk).
const ActionLogSection = lazy(() => import('./ActionLogSection').then((m) => ({ default: m.ActionLogSection })));
const ActorNamesSection = lazy(() => import('./ActorNamesSection').then((m) => ({ default: m.ActorNamesSection })));
const ExportSection = lazy(() => import('./ExportSection').then((m) => ({ default: m.ExportSection })));

// Mounts a section's content once the section has been opened, then keeps
// it mounted (so it keeps its state).
function OnceOpened({ section, children }: { section: SettingsSectionId; children: ReactNode }) {
  const hasBeenVisible = useHasSettingsSectionBeenVisible(section);
  return hasBeenVisible ? <Suspense fallback={null}>{children}</Suspense> : null;
}

// The sections, in the nav's order. Backfill is mounted from the start: it
// loads the backfill status at page load (the activity popover shows it too).
const SECTIONS: ReadonlyArray<{ id: SettingsSectionId; label: string; render: () => ReactNode }> = [
  { id: 'run', label: 'Run & check', render: () => <RunCheckSection /> },
  { id: 'attention', label: 'Attention rules', render: () => <AttentionRulesSection /> },
  { id: 'merge-commits', label: 'Merge commits', render: () => <MergeCommitsSection /> },
  { id: 'change-detection', label: 'Change detection', render: () => <ChangeDetectionSection /> },
  { id: 'script-options', label: 'Script options', render: () => <ScriptOptionsSection /> },
  { id: 'backfill', label: 'Backfill', render: () => <BackfillSection /> },
  {
    id: 'action-log',
    label: 'Action log',
    render: () => (
      <OnceOpened section="action-log">
        <ActionLogSection />
      </OnceOpened>
    ),
  },
  {
    id: 'actor-names',
    label: 'Actor names',
    render: () => (
      <OnceOpened section="actor-names">
        <ActorNamesSection />
      </OnceOpened>
    ),
  },
  {
    id: 'export',
    label: 'Export',
    render: () => (
      <OnceOpened section="export">
        <ExportSection />
      </OnceOpened>
    ),
  },
];
const sectionIds = (id: string) => ({ tab: `settings-tab-${id}`, panel: `settings-panel-${id}` });

// Narrow windows put the sections in a row across the top
// (styles/settings.css), so they move with ←/→ there.
export const SETTINGS_NAV_ROW_QUERY = '(max-width: 640px)';

/**
 * The Settings drawer (UI_REDESIGN_PLAN.md, phase 9b), opened from the app
 * header: a modal panel from the right, with its sections in a nav down
 * the left (↑/↓ move between them; a row across the top, with ←/→, in
 * narrow windows) and the chosen one beside it. Esc, the
 * close button or the backdrop closes it; focus stays inside while it's
 * open and goes back to what opened it.
 *
 * Always mounted, hidden while closed: every section's fields keep their
 * ids in the page (useAckLabelActions reads the label to apply,
 * PrDataProvider the status text), and a closed section keeps its state.
 * Action log, Actor names and Export mount the first time they're opened.
 */
export function SettingsDrawer() {
  const { isOpen, section, close, setSection } = useSettingsDrawer();
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, isOpen, close);
  const navInRow = useMediaQuery(SETTINGS_NAV_ROW_QUERY);

  return (
    <div className="settings-overlay" hidden={!isOpen}>
      <div className="settings-backdrop" aria-hidden="true" onClick={close} />
      <div ref={dialogRef} className="settings-drawer" role="dialog" aria-modal="true" aria-labelledby="settings-title" tabIndex={-1}>
        <div className="settings-header">
          <h2 id="settings-title" className="settings-title">
            Settings
          </h2>
          <IconButton icon="close" label="Close settings" tooltipPlacement="bottom" onClick={close} />
        </div>
        <div className="settings-body">
          <div className="settings-nav">
            <Tabs
              label="Settings sections"
              idPrefix="settings"
              orientation={navInRow ? 'horizontal' : 'vertical'}
              tabs={SECTIONS.map(({ id, label }) => ({ id, label }))}
              selectedId={section}
              onSelect={(id) => setSection(id as SettingsSectionId)}
              idsFor={sectionIds}
            />
          </div>
          {SECTIONS.map(({ id, render }) => (
            <section
              key={id}
              id={sectionIds(id).panel}
              className="settings-panel"
              role="tabpanel"
              aria-labelledby={sectionIds(id).tab}
              hidden={id !== section}
            >
              {render()}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
