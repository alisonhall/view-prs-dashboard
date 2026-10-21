/**
 * Window-bridge elimination Phase 5 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
 * a tiny external store holding FilterStateProvider's field values, with
 * per-key subscriptions - the shape `useSyncExternalStore` wants (and what
 * Zustand/Jotai build on internally).
 *
 * Why it exists: `FilterStateContext`'s `value` is one object covering 25+
 * independent fields whose `values` gets a new reference on every single-field
 * change, and `useFilterState()` has no selector - so a component that mounts
 * once per table row (PrSelectionCell) and subscribed through it would
 * re-render every row on every keystroke in ANY filter field. That is why it
 * used to reach this state through `window.getFilterStateValues()`/
 * `setFilterStateValue()`, non-reactively. Here a subscriber is notified only
 * when ITS key changes, and `useFilterFieldValue` additionally takes a
 * selector, so a row only re-renders when its own derived value does.
 *
 * Plain module, no React: constructed once per FilterStateProvider instance
 * (never module-global - two Providers, e.g. in tests, must not share state).
 * Updates are immutable (a new `values` object per change), so `getAll()` is a
 * valid snapshot and a stale reference is never mutated under a reader.
 */
export function createFilterValuesStore(initialValues = {}) {
  let values = initialValues;
  const listenersByKey = new Map();

  const notify = (keys) => {
    keys.forEach((key) => {
      const listeners = listenersByKey.get(key);
      if (listeners) {
        // Copy: a listener may unsubscribe (or subscribe) while we iterate.
        Array.from(listeners).forEach((listener) => listener());
      }
    });
  };

  return {
    getAll: () => values,

    getSnapshot: (key) => values[key],

    // Returns true if anything changed (so callers can skip redundant work).
    setValue(key, value) {
      if (Object.is(values[key], value)) {
        return false;
      }
      values = { ...values, [key]: value };
      notify([key]);
      return true;
    },

    // One immutable update for several keys; notifies each changed key once.
    setMany(patch) {
      const changedKeys = Object.keys(patch || {}).filter((key) => !Object.is(values[key], patch[key]));
      if (changedKeys.length === 0) {
        return false;
      }
      values = { ...values, ...patch };
      notify(changedKeys);
      return true;
    },

    subscribe(key, listener) {
      let listeners = listenersByKey.get(key);
      if (!listeners) {
        listeners = new Set();
        listenersByKey.set(key, listeners);
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          listenersByKey.delete(key);
        }
      };
    },
  };
}
