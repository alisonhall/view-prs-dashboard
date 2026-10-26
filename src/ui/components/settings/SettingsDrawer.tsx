import { useRef, type ReactNode } from 'react';
import { IconButton } from '../ui/Button';
import { Tabs } from '../ui/Tabs';
import { useFocusTrap } from '../../state/useFocusTrap';
import { useMediaQuery } from '../../state/useMediaQuery';
import { useSettingsDrawer, type SettingsSectionId } from '../../state/SettingsDrawerContext';
import { RunCheckSection } from './RunCheckSection';
import { ScriptOptionsSection } from './ScriptOptionsSection';

// The sections, in the nav's order. UI_REDESIGN_PLAN.md phase 9b moves the
// rest in (Attention rules, Merge commits, Change detection, Backfill,
// Action log, Actor names, Export).
const SECTIONS: ReadonlyArray<{ id: SettingsSectionId; label: string; render: () => ReactNode }> = [
  { id: 'run', label: 'Run & check', render: () => <RunCheckSection /> },
  { id: 'script-options', label: 'Script options', render: () => <ScriptOptionsSection /> },
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
