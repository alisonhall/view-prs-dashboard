import { Suspense, useRef, type ReactNode } from 'react';
import { IconButton } from '../ui/Button';
import { Tabs } from '../ui/Tabs';
import { useFocusTrap } from '../../state/useFocusTrap';
import { useMediaQuery } from '../../state/useMediaQuery';
import {
  useHasSettingsSectionBeenVisible,
  useOpenDrawer,
  useSettingsDrawer,
  type DrawerKind,
  type SettingsSectionId,
} from '../../state/SettingsDrawerContext';

export interface DrawerSection {
  id: SettingsSectionId;
  label: string;
  // The nav's heading over this section and the ones after it in the same
  // group.
  group?: string;
  render: () => ReactNode;
}

// Mounts a section's content once the section has been opened, then keeps
// it mounted (so it keeps its state).
export function OnceOpened({ section, children }: { section: SettingsSectionId; children: ReactNode }) {
  const hasBeenVisible = useHasSettingsSectionBeenVisible(section);
  return hasBeenVisible ? <Suspense fallback={null}>{children}</Suspense> : null;
}

// Narrow windows put the sections in a row across the top
// (styles/settings.css), so they move with ←/→ there.
export const SETTINGS_NAV_ROW_QUERY = '(max-width: 640px)';

/**
 * One of the app header's drawers (SettingsDrawer, ToolsDrawer;
 * UI_REDESIGN_PLAN.md, phase 9b): a modal panel from the right, with its
 * sections in a nav down the left (↑/↓ move between them; a row across
 * the top, with ←/→, in narrow windows) and the chosen one beside it.
 * Esc, the close button or the backdrop closes it; focus stays inside
 * while it's open and goes back to what opened it.
 *
 * Always mounted, hidden while closed: every section's fields keep their
 * ids in the page (useAckLabelActions reads the label to apply,
 * PrDataProvider the status text), and a closed section keeps its state.
 */
export function Drawer({ kind, title, sections }: { kind: DrawerKind; title: string; sections: ReadonlyArray<DrawerSection> }) {
  const { section, close, setSection } = useSettingsDrawer();
  const isOpen = useOpenDrawer() === kind;
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, isOpen, close);
  const navInRow = useMediaQuery(SETTINGS_NAV_ROW_QUERY);
  const ids = (id: string) => ({ tab: `${kind}-tab-${id}`, panel: `${kind}-panel-${id}` });
  const titleId = `${kind}-title`;

  return (
    <div className="settings-overlay" hidden={!isOpen}>
      <div className="settings-backdrop" aria-hidden="true" onClick={close} />
      <div ref={dialogRef} className="settings-drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="settings-header">
          <h2 id={titleId} className="settings-title">
            {title}
          </h2>
          <IconButton icon="close" label={`Close ${title.toLowerCase()}`} tooltipPlacement="bottom" onClick={close} />
        </div>
        <div className="settings-body">
          <div className="settings-nav">
            <Tabs
              label={`${title} sections`}
              idPrefix={kind}
              orientation={navInRow ? 'horizontal' : 'vertical'}
              tabs={sections.map(({ id, label, group }) => ({ id, label, group }))}
              selectedId={section}
              onSelect={(id) => setSection(id as SettingsSectionId)}
              idsFor={ids}
            />
          </div>
          {sections.map(({ id, render }) => (
            <section
              key={id}
              id={ids(id).panel}
              className="settings-panel"
              role="tabpanel"
              aria-labelledby={ids(id).tab}
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
