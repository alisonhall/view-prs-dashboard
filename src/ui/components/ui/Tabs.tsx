import { useRef, type KeyboardEvent, type ReactNode } from 'react';

/**
 * Tab list following the WAI-ARIA tabs pattern, for the detail pane's
 * Overview / Activity / Conversations / Notes. Only the selected tab is in
 * the Tab order; arrow keys, Home and End move between tabs and select
 * them. Render the selected tab's content in a <TabPanel> with the same
 * `idPrefix`. Only the selected panel exists, so only the selected tab
 * has `aria-controls` (pointing at a missing element is an error).
 */
export interface TabItem {
  id: string;
  label: string;
  // Count or state after the label ("41", "6 open", "unsaved").
  badge?: string;
  badgeTone?: 'default' | 'attention';
}

export interface TabsProps {
  label: string;
  idPrefix: string;
  tabs: TabItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  // The ids each tab and its panel get, when not idPrefix's (the app
  // header's view tabs keep the page's existing panel ids).
  idsFor?: (id: string) => { tab: string; panel: string };
  // Vertical lists (the Settings drawer's nav) move with ↑/↓.
  orientation?: 'horizontal' | 'vertical';
}

export const getTabId = (idPrefix: string, id: string) => `${idPrefix}-tab-${id}`;
export const getTabPanelId = (idPrefix: string, id: string) => `${idPrefix}-panel-${id}`;

export function Tabs({ label, idPrefix, tabs, selectedId, onSelect, idsFor, orientation = 'horizontal' }: TabsProps) {
  const ids = (id: string) => idsFor?.(id) ?? { tab: getTabId(idPrefix, id), panel: getTabPanelId(idPrefix, id) };
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  const moveTo = (index: number) => {
    const target = tabs[(index + tabs.length) % tabs.length];
    if (!target) return;
    onSelect(target.id);
    tabRefs.current.get(target.id)?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent, index: number) => {
    const [next, previous] = orientation === 'vertical' ? ['ArrowDown', 'ArrowUp'] : ['ArrowRight', 'ArrowLeft'];
    const moves: Record<string, number> = {
      [next]: index + 1,
      [previous]: index - 1,
      Home: 0,
      End: tabs.length - 1,
    };
    const target = moves[event.key];
    if (target === undefined) return;
    event.preventDefault();
    moveTo(target);
  };

  return (
    <div role="tablist" aria-label={label} aria-orientation={orientation} className="ui-tab-list" data-orientation={orientation}>
      {tabs.map((tab, index) => {
        const selected = tab.id === selectedId;
        return (
          <button
            key={tab.id}
            ref={(node) => {
              if (node) tabRefs.current.set(tab.id, node);
              else tabRefs.current.delete(tab.id);
            }}
            type="button"
            role="tab"
            id={ids(tab.id).tab}
            aria-selected={selected}
            aria-controls={selected ? ids(tab.id).panel : undefined}
            tabIndex={selected ? 0 : -1}
            className="ui-tab"
            onClick={() => onSelect(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {tab.label}
            {tab.badge && (
              <span className="ui-tab-badge" data-tone={tab.badgeTone === 'attention' ? 'attention' : undefined}>
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export interface TabPanelProps {
  idPrefix: string;
  tabId: string;
  children: ReactNode;
  className?: string;
}

export function TabPanel({ idPrefix, tabId, children, className }: TabPanelProps) {
  return (
    <div
      role="tabpanel"
      id={getTabPanelId(idPrefix, tabId)}
      aria-labelledby={getTabId(idPrefix, tabId)}
      tabIndex={0}
      className={className}
    >
      {children}
    </div>
  );
}
