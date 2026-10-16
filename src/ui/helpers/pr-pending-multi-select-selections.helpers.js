// Phase 7, sub-phase 7.4 (see REACT_MIGRATION_PLAN.md): the 9 multi-select
// lists' "pending selections" (a restore-time seed, read once before any
// checkbox exists yet) are written by index.page.js's restoreUiOptionOverrides
// and read by react-app.jsx's MultiSelectListPortals.jsx - two separate ES
// modules with no shared closure scope, unlike when this same state lived
// in a single module-scope variable back when the reader (the vanilla
// populateXOptions functions) still lived in index.page.js itself.
//
// Deliberately NOT routed through FilterStateProvider's generic
// window.getFilterStateValues/window.setFilterStateValue bridge: that
// bridge's mere existence changes every OTHER migrated field's restore
// behavior too (index.page.js's setFilterStateOverrideForFieldId skips a
// field's DOM-mutation fallback the moment window.setFilterStateValue is
// assigned, regardless of which key is being written) - these 9 keys need
// a channel of their own that doesn't carry that side effect, so a plain,
// always-available window-level store is used instead.
//
// A write here doesn't, by itself, cause React to re-render anything (it's
// a plain object mutation, not state) - restoreUiOptionOverrides can run
// well after MultiSelectListPortals.jsx's initial mount, with no
// guaranteed subsequent payload/option change to "piggyback" a re-seed on
// (confirmed by a real, reproducing integration-test failure during this
// sub-phase: restored change-filter selections never appeared without
// this). subscribeToPendingMultiSelectSelections lets
// MultiSelectListPortals.jsx register for a notification on every write,
// so it can re-seed on demand instead of guessing when one might have
// happened. Both the store and the listener registry live on `window`
// (not module scope) since index.page.js and MultiSelectListPortals.jsx
// can end up as separate module instances of this same file (e.g. in
// index.html.test.js, which re-requires index.page.js - and therefore
// every helper it imports - fresh for every test via jest.resetModules(),
// while components imported once at the top of that test file keep their
// original, never-reset instance).
const STORE_KEY = "viewPrsPendingMultiSelectSelections";
const LISTENERS_KEY = "viewPrsPendingMultiSelectSelectionsListeners";

const getStore = () => {
  if (typeof window === "undefined") return {};
  window[STORE_KEY] = window[STORE_KEY] || {};
  return window[STORE_KEY];
};

const getListeners = () => {
  if (typeof window === "undefined") return new Set();
  window[LISTENERS_KEY] = window[LISTENERS_KEY] || new Set();
  return window[LISTENERS_KEY];
};

export const getPendingMultiSelectSelection = (key) => getStore()[key];

export const setPendingMultiSelectSelection = (key, value) => {
  getStore()[key] = value;
  getListeners().forEach((listener) => listener());
};

export const subscribeToPendingMultiSelectSelections = (listener) => {
  if (typeof listener !== "function") return () => {};
  const listeners = getListeners();
  listeners.add(listener);
  return () => listeners.delete(listener);
};
