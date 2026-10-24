/**
 * A tiny external store holding FilterStateProvider's field values, with
 * per-key subscriptions - the shape `useSyncExternalStore` wants (and what
 * Zustand/Jotai build on internally).
 *
 * Why it exists: `FilterStateContext`'s `value` is one object covering 25+
 * independent fields whose `values` gets a new reference on every single-field
 * change, and `useFilterState()` has no selector - so a component that mounts
 * once per table row (PrSelectionCell) and subscribed through it would
 * re-render every row on every keystroke in ANY filter field. Here a
 * subscriber is notified only
 * when ITS key changes, and `useFilterFieldValue` additionally takes a
 * selector, so a row only re-renders when its own derived value does.
 *
 * Plain module, no React: constructed once per FilterStateProvider instance
 * (never module-global - two Providers, e.g. in tests, must not share state).
 * Updates are immutable (a new `values` object per change), so `getAll()` is a
 * valid snapshot and a stale reference is never mutated under a reader.
 */
// The Run & Filter form's field values, keyed by FilterStateProvider's
// Context keys (see pr-ui-option-persistence.helpers.ts's
// FILTER_STATE_FIELD_MAP). Fields typed code reads are listed; the rest
// are covered by the index signature until their readers are typed.
export interface FilterValues {
  // Run Script options
  repo?: string;
  prNumbersInput?: string;
  limit?: string;
  mergedLimit?: string;
  jobs?: string;
  openMode?: string;
  ackChanged?: boolean;
  showReason?: boolean;
  quiet?: boolean;
  // Row filters
  scopeMode?: string;
  filterPrNumbers?: string;
  alwaysShowInReview?: boolean;
  filterCustomComments?: string;
  filterOtherNotes?: string;
  filterPrDifficulty?: string;
  filterRallyStories?: string;
  filterRallyLinks?: string;
  filterAnalysisOfPr?: string;
  // "Advanced visibility and attention rules"
  attentionNoActivityMode?: string;
  attentionIncludePendingComments?: boolean;
  attentionIgnoreMergeOnlyCommits?: boolean;
  attentionIncludeClosedMerged?: boolean;
  attentionIncludeDraftChanged?: boolean;
  attentionIncludeDraftNoActivity?: boolean;
  [key: string]: unknown;
}

type Listener = () => void;

export interface FilterValuesStore {
  getAll: () => FilterValues;
  getSnapshot: (key: string) => unknown;
  setValue: (key: string, value: unknown) => boolean;
  setMany: (patch: Partial<FilterValues> | null | undefined) => boolean;
  subscribe: (key: string, listener: Listener) => () => void;
}

export function createFilterValuesStore(initialValues: FilterValues = {}): FilterValuesStore {
  let values = initialValues;
  const listenersByKey = new Map<string, Set<Listener>>();

  const notify = (keys: string[]) => {
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

    getSnapshot: (key: string) => values[key],

    // Returns true if anything changed (so callers can skip redundant work).
    setValue(key: string, value: unknown) {
      if (Object.is(values[key], value)) {
        return false;
      }
      values = { ...values, [key]: value };
      notify([key]);
      return true;
    },

    // One immutable update for several keys; notifies each changed key once.
    setMany(patch: Partial<FilterValues> | null | undefined) {
      const changedKeys = Object.keys(patch || {}).filter((key) => !Object.is(values[key], patch?.[key]));
      if (changedKeys.length === 0) {
        return false;
      }
      values = { ...values, ...patch };
      notify(changedKeys);
      return true;
    },

    subscribe(key: string, listener: Listener) {
      let listeners = listenersByKey.get(key);
      if (!listeners) {
        listeners = new Set();
        listenersByKey.set(key, listeners);
      }
      listeners.add(listener);
      const keyListeners = listeners;
      return () => {
        keyListeners.delete(listener);
        if (keyListeners.size === 0) {
          listenersByKey.delete(key);
        }
      };
    },
  };
}
