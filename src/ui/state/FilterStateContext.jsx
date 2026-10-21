import { createContext, useCallback, useContext, useRef, useSyncExternalStore } from 'react';

/**
 * Phase 6 (see REACT_MIGRATION_PLAN.md): shared filter-field state for the
 * fields migrated off the vanilla DOM-is-the-source-of-truth pattern.
 * Slice 1 covers just `scopeMode`/`alwaysShowInReview` - later slices add
 * more keys to `values`, they don't restructure this context's shape.
 *
 * `setValue` intentionally requires the caller to know its own field's key
 * (no magic) - each migrated field component owns exactly one key.
 */
export const FilterStateContext = createContext(null);

export function useFilterState() {
  const context = useContext(FilterStateContext);
  if (!context) {
    throw new Error('useFilterState() must be called within a <FilterStateProvider>');
  }
  return context;
}

/**
 * Window-bridge elimination Phase 5 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
 * per-field access to FilterStateProvider's values, for components that mount
 * many times (e.g. once per table row) and so can't afford `useFilterState()`'s
 * whole-object subscription - see filterValuesStore.jsx for why.
 *
 * Its value is `{ store, actions }`, both of which keep one identity for the
 * Provider's lifetime, so subscribing to this Context never re-renders
 * anything; re-renders come only from the per-key `useSyncExternalStore`
 * subscription in useFilterFieldValue.
 *
 * Unwrapped (no Provider) it is `null` and the hooks below are inert (value
 * `undefined`, no-op writes) - the same safe default every other Context here has.
 */
export const FilterFieldStoreContext = createContext(null);

const identity = (value) => value;

/**
 * Subscribes to ONE field, optionally through a selector, and re-renders only
 * when the selected value changes (compared with Object.is). Pass a selector
 * that returns a primitive - e.g. `(input) => parse(input).includes(prNumber)`
 * - so a row re-renders when *its own* answer flips, not whenever the field's
 * raw string does. `select` need not be stable: it is read each render.
 *
 * `useSyncExternalStore` calls getSnapshot several times per render and
 * requires the same result each time the store hasn't changed - a selector
 * that builds a new array/object on every call (`raw.split(',')`) would
 * otherwise loop forever ("Maximum update depth exceeded"). So the selected
 * value is cached per (raw value, selector): repeated reads within a render
 * return the identical result, and `select` runs once per render or store
 * change, not once per snapshot read. A selector returning a fresh object
 * still re-renders on every raw change (and on every re-render with a new
 * inline selector) - prefer primitives, or a `useCallback`'d selector.
 */
export function useFilterFieldValue(key, select = identity) {
  const context = useContext(FilterFieldStoreContext);
  const store = context?.store;
  const cacheRef = useRef(null);
  const subscribe = useCallback(
    (listener) => (store ? store.subscribe(key, listener) : () => {}),
    [store, key],
  );
  const getSnapshot = () => {
    const raw = store ? store.getSnapshot(key) : undefined;
    const cached = cacheRef.current;
    if (cached && cached.select === select && Object.is(cached.raw, raw)) {
      return cached.selected;
    }
    const selected = select(raw);
    cacheRef.current = { raw, select, selected };
    return selected;
  };
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

const INERT_FIELD_ACTIONS = { getFieldValue: () => undefined, setFieldValue: () => {} };

/**
 * Stable read/write functions for any field, for event handlers.
 * `getFieldValue` reads the store, which a `setFieldValue` updates
 * synchronously - so two writes in a row each see the previous one's result.
 */
export function useFilterFieldActions() {
  const context = useContext(FilterFieldStoreContext);
  return context?.actions || INERT_FIELD_ACTIONS;
}
