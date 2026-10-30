import { createContext, useCallback, useContext, useRef, useSyncExternalStore } from 'react';
import type { FilterValues, FilterValuesStore } from './filterValuesStore';

/**
 * The form's field values (scope, PR numbers, the "Any"
 * filters, run options, attention rules...), owned by FilterStateProvider,
 * which also restores and saves them as user defaults.
 *
 * `setValue` intentionally requires the caller to know its own field's key
 * (no magic) - each field component owns exactly one key.
 */
export interface FilterStateValue {
  values: FilterValues;
  setValue: (key: string, value: unknown) => void;
  // The saved repo override once a restore has applied it (null before),
  // so RepoLabelsProvider can fetch that repo's labels.
  restoredRepoOverride: string | null;
  // Saves the Run Script options (repo, limits, jobs, PR numbers...) to the
  // user defaults.
  persistRunScriptOptions: () => Promise<void>;
}

export const FilterStateContext = createContext<FilterStateValue | null>(null);

export function useFilterState(): FilterStateValue {
  const context = useContext(FilterStateContext);
  if (!context) {
    throw new Error('useFilterState() must be called within a <FilterStateProvider>');
  }
  return context;
}

export interface FilterFieldActions {
  getFieldValue: (key: string) => unknown;
  setFieldValue: (key: string, value: unknown) => void;
}

/**
 * Per-field access to FilterStateProvider's values, for components that mount
 * many times (e.g. once per table row) and so can't afford `useFilterState()`'s
 * whole-object subscription - see filterValuesStore.ts for why.
 *
 * Its value is `{ store, actions }`, both of which keep one identity for the
 * Provider's lifetime, so subscribing to this Context never re-renders
 * anything; re-renders come only from the per-key `useSyncExternalStore`
 * subscription in useFilterFieldValue.
 *
 * Unwrapped (no Provider) it is `null` and the hooks below are inert (value
 * `undefined`, no-op writes) - the same safe default every other Context here has.
 */
export interface FilterFieldStoreValue {
  store: FilterValuesStore;
  actions: FilterFieldActions;
}

export const FilterFieldStoreContext = createContext<FilterFieldStoreValue | null>(null);

const identity = <T,>(value: T): T => value;

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
export function useFilterFieldValue<S = unknown>(
  key: string,
  select: (raw: unknown) => S = identity as (raw: unknown) => S,
): S {
  const context = useContext(FilterFieldStoreContext);
  const store = context?.store;
  const cacheRef = useRef<{ raw: unknown; select: (raw: unknown) => S; selected: S } | null>(null);
  const subscribe = useCallback(
    (listener: () => void) => (store ? store.subscribe(key, listener) : () => {}),
    [store, key],
  );
  const getSnapshot = (): S => {
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

const INERT_FIELD_ACTIONS: FilterFieldActions = { getFieldValue: () => undefined, setFieldValue: () => {} };

/**
 * Stable read/write functions for any field, for event handlers.
 * `getFieldValue` reads the store, which a `setFieldValue` updates
 * synchronously - so two writes in a row each see the previous one's result.
 */
export function useFilterFieldActions(): FilterFieldActions {
  const context = useContext(FilterFieldStoreContext);
  return context?.actions || INERT_FIELD_ACTIONS;
}
