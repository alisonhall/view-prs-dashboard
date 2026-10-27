// The 9 multi-select filter lists' "pending selections": values restored
// from user defaults before the lists' checkboxes exist.
// FilterStateProvider writes them on restore; ListSelectionSeeding reads
// them to seed each list's checked state, then clears them.
//
// A write isn't React state, so it doesn't re-render anything by itself,
// and the restore can land after ListSelectionSeeding has mounted.
// subscribeToPendingMultiSelectSelections lets ListSelectionSeeding
// re-seed on every write instead of guessing when one happened.
//
// The store and listeners live on `window`, not module scope, so a writer
// and a reader loaded as separate instances of this module still share
// them (index.html.test.js calls jest.resetModules() between tests while
// keeping components imported once at the top).
const STORE_KEY = "viewPrsPendingMultiSelectSelections";
const LISTENERS_KEY = "viewPrsPendingMultiSelectSelectionsListeners";

type PendingStore = Record<string, unknown>;
type Listener = () => void;

interface PendingSelectionsWindow {
  [STORE_KEY]?: PendingStore;
  [LISTENERS_KEY]?: Set<Listener>;
}

const getWindow = (): PendingSelectionsWindow | null =>
  typeof window === "undefined" ? null : (window as unknown as PendingSelectionsWindow);

const getStore = (): PendingStore => {
  const win = getWindow();
  if (!win) return {};
  win[STORE_KEY] = win[STORE_KEY] || {};
  return win[STORE_KEY];
};

const getListeners = (): Set<Listener> => {
  const win = getWindow();
  if (!win) return new Set();
  win[LISTENERS_KEY] = win[LISTENERS_KEY] || new Set();
  return win[LISTENERS_KEY];
};

export const getPendingMultiSelectSelection = (key: string): unknown => getStore()[key];

export const setPendingMultiSelectSelection = (key: string, value: unknown): void => {
  getStore()[key] = value;
  getListeners().forEach((listener) => listener());
};

export const subscribeToPendingMultiSelectSelections = (listener: Listener): (() => boolean | void) => {
  if (typeof listener !== "function") return () => {};
  const listeners = getListeners();
  listeners.add(listener);
  return () => listeners.delete(listener);
};
