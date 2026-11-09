import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * The app header's two drawers (UI_REDESIGN_PLAN.md, phase 9b): Tools,
 * for things to do or look at (Run & check, Backfill, Export, the Action
 * log), and Settings, for choices kept until changed. At most one is open;
 * `section` is the one it shows, and each section belongs to one drawer
 * (drawerOf). The header's buttons open a drawer at its last section
 * (`open('tools')`, `open('settings')`); anything can open one at a
 * section (`open('appearance')`).
 *
 * Unwrapped, both are closed and opening does nothing.
 */
export type ToolsSectionId = 'run' | 'backfill' | 'export' | 'action-log';
export type SettingsSectionId =
  | ToolsSectionId
  | 'sources'
  | 'background-updates'
  | 'attention'
  | 'change-detection'
  | 'merge-commits'
  | 'actor-names'
  | 'appearance';

export type DrawerKind = 'settings' | 'tools';

const TOOLS_SECTIONS: ReadonlySet<string> = new Set<ToolsSectionId>(['run', 'backfill', 'export', 'action-log']);

export const drawerOf = (section: SettingsSectionId): DrawerKind => (TOOLS_SECTIONS.has(section) ? 'tools' : 'settings');

// Each drawer's first section, where it opens until another is chosen.
const FIRST_SECTIONS: Record<DrawerKind, SettingsSectionId> = { settings: 'sources', tools: 'run' };

// An Action log entry to show: one of a kind, logged nearest a time (a
// Just finished item's). `requestedAt` tells two requests for the same
// entry apart.
export interface ActionLogFocus {
  kind: string;
  atMs: number;
  requestedAt: number;
}

// A repo for Background updates to show (Sources' "Timing…"), told apart
// by `requestedAt` as ActionLogFocus is.
export interface BackgroundUpdatesFocus {
  repo: string;
  requestedAt: number;
}

export interface SettingsDrawerValue {
  isOpen: boolean;
  section: SettingsSectionId;
  // A drawer at its last section (Settings when none is given), or the
  // drawer a section is in, at that section.
  open: (target?: SettingsSectionId | DrawerKind) => void;
  close: () => void;
  setSection: (section: SettingsSectionId) => void;
  actionLogFocus: ActionLogFocus | null;
  // Opens the Action log at that entry.
  openActionLogAt: (focus: { kind: string; atMs: number }) => void;
  backgroundUpdatesFocus: BackgroundUpdatesFocus | null;
  // Opens Background updates at that repo's settings.
  openBackgroundUpdatesAt: (repo: string) => void;
}

const noop = () => {};

export const SettingsDrawerContext = createContext<SettingsDrawerValue>({
  isOpen: false,
  section: 'run',
  open: noop,
  close: noop,
  setSection: noop,
  actionLogFocus: null,
  openActionLogAt: noop,
  backgroundUpdatesFocus: null,
  openBackgroundUpdatesAt: noop,
});

export function useSettingsDrawer(): SettingsDrawerValue {
  return useContext(SettingsDrawerContext);
}

/** Which drawer is open, if one is. */
export function useOpenDrawer(): DrawerKind | null {
  const { isOpen, section } = useSettingsDrawer();
  return isOpen ? drawerOf(section) : null;
}

export function SettingsDrawerProvider({
  children,
  initialOpen = false,
  initialSection = 'run',
}: {
  children?: ReactNode;
  initialOpen?: boolean;
  initialSection?: SettingsSectionId;
}) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [section, setShownSection] = useState<SettingsSectionId>(initialSection);
  const [lastSections, setLastSections] = useState<Record<DrawerKind, SettingsSectionId>>(() => ({
    ...FIRST_SECTIONS,
    [drawerOf(initialSection)]: initialSection,
  }));
  const setSection = useCallback((next: SettingsSectionId) => {
    setShownSection(next);
    setLastSections((previous) => ({ ...previous, [drawerOf(next)]: next }));
  }, []);
  const open = useCallback(
    (target: SettingsSectionId | DrawerKind = 'settings') => {
      setSection(target === 'settings' || target === 'tools' ? lastSections[target] : target);
      setIsOpen(true);
    },
    [lastSections, setSection],
  );
  const close = useCallback(() => setIsOpen(false), []);
  const [actionLogFocus, setActionLogFocus] = useState<ActionLogFocus | null>(null);
  const openActionLogAt = useCallback(
    (focus: { kind: string; atMs: number }) => {
      setActionLogFocus({ ...focus, requestedAt: Date.now() });
      open('action-log');
    },
    [open],
  );
  const [backgroundUpdatesFocus, setBackgroundUpdatesFocus] = useState<BackgroundUpdatesFocus | null>(null);
  const openBackgroundUpdatesAt = useCallback(
    (repo: string) => {
      setBackgroundUpdatesFocus({ repo, requestedAt: Date.now() });
      open('background-updates');
    },
    [open],
  );
  const value = useMemo(
    () => ({
      isOpen,
      section,
      open,
      close,
      setSection,
      actionLogFocus,
      openActionLogAt,
      backgroundUpdatesFocus,
      openBackgroundUpdatesAt,
    }),
    [isOpen, section, open, close, setSection, actionLogFocus, openActionLogAt, backgroundUpdatesFocus, openBackgroundUpdatesAt],
  );
  return <SettingsDrawerContext.Provider value={value}>{children}</SettingsDrawerContext.Provider>;
}

/** Whether this section is on screen: the drawer is open at it. */
export function useIsSettingsSectionVisible(section: SettingsSectionId): boolean {
  const { isOpen, section: shown } = useSettingsDrawer();
  return isOpen && shown === section;
}

/**
 * Whether this section has ever been on screen - true from its first
 * showing on, so a section whose content loads only when first opened
 * (Action log, Actor names, Export: lazy chunks) then stays mounted and
 * keeps its state.
 */
export function useHasSettingsSectionBeenVisible(section: SettingsSectionId): boolean {
  const isVisible = useIsSettingsSectionVisible(section);
  const [hasBeenVisible, setHasBeenVisible] = useState(isVisible);
  useEffect(() => {
    if (isVisible) setHasBeenVisible(true);
  }, [isVisible]);
  return hasBeenVisible || isVisible;
}
