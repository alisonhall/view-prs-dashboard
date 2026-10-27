import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * The Settings drawer (UI_REDESIGN_PLAN.md, phase 9b): whether it's open,
 * and which of its sections shows. The app header's Settings button opens
 * it; anything can open it at a section (`open('run')`).
 *
 * Unwrapped, it's closed and opening does nothing.
 */
export type SettingsSectionId =
  | 'run'
  | 'attention'
  | 'merge-commits'
  | 'change-detection'
  | 'script-options'
  | 'backfill'
  | 'action-log'
  | 'actor-names'
  | 'export'
  | 'appearance';

export interface SettingsDrawerValue {
  isOpen: boolean;
  section: SettingsSectionId;
  open: (section?: SettingsSectionId) => void;
  close: () => void;
  setSection: (section: SettingsSectionId) => void;
}

const noop = () => {};

export const SettingsDrawerContext = createContext<SettingsDrawerValue>({
  isOpen: false,
  section: 'run',
  open: noop,
  close: noop,
  setSection: noop,
});

export function useSettingsDrawer(): SettingsDrawerValue {
  return useContext(SettingsDrawerContext);
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
  const [section, setSection] = useState<SettingsSectionId>(initialSection);
  const open = useCallback((next?: SettingsSectionId) => {
    if (next) setSection(next);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);
  const value = useMemo(() => ({ isOpen, section, open, close, setSection }), [isOpen, section, open, close]);
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
