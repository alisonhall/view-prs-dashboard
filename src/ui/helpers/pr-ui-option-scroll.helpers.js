// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsUiOptionScrollHelpers fallback.
export const { createPrUiOptionScrollHelpers } = (() => {
  const createPrUiOptionScrollHelpers = ({
    getOptionalElementById,
    persistViewFilterOptions,
    shouldAutoScrollBackfillLogByState,
    getBackfillScrollTop,
    getIsBackfillRunning,
  } = {}) => {
    const getOptionalElementByIdSafe =
      typeof getOptionalElementById === "function"
        ? getOptionalElementById
        : () => null;
    const persistViewFilterOptionsSafe =
      typeof persistViewFilterOptions === "function"
        ? persistViewFilterOptions
        : async () => {};
    const shouldAutoScrollBackfillLogByStateSafe =
      typeof shouldAutoScrollBackfillLogByState === "function"
        ? shouldAutoScrollBackfillLogByState
        : ({ autoScrollEnabled = false, isBackfillRunning = false } = {}) =>
            autoScrollEnabled && isBackfillRunning;
    const getBackfillScrollTopSafe =
      typeof getBackfillScrollTop === "function"
        ? getBackfillScrollTop
        : ({ currentScrollTop }) => currentScrollTop;
    const getIsBackfillRunningSafe =
      typeof getIsBackfillRunning === "function"
        ? getIsBackfillRunning
        : () => false;

    // Two rapid "change" events (e.g. a test or user flipping scope-mode
    // twice quickly) must not fire two overlapping persist calls: each one
    // is a non-atomic GET-merge-PUT against user-defaults.json
    // (persistViewFilterOptions, state/FilterStateProvider.jsx), so
    // overlapping calls can lose an update if the earlier PUT's write
    // lands after the later one's. Debouncing (same 150ms pattern as
    // debouncedApplyFilters, index.page.js) collapses them into a single
    // trailing call instead. Phase E (see REACT_MIGRATION_PLAN.md, "Full
    // migration roadmap"): used to call persistUiOptionOverrides(["scope-mode"]),
    // persisting just that one field - FilterStateProvider's
    // persistViewFilterOptions persists the whole view-filter set instead
    // (no per-field subsetting any more), which is harmless here since
    // every other field in that set already persists on its own change,
    // not as a side effect of this debounce.
    let scopeModePersistDebounceTimer = null;
    const debouncedPersistScopeMode = () => {
      if (scopeModePersistDebounceTimer) {
        clearTimeout(scopeModePersistDebounceTimer);
      }
      scopeModePersistDebounceTimer = setTimeout(() => {
        void persistViewFilterOptionsSafe();
      }, 150);
    };

    const registerUiOptionPersistenceHandlers = () => {
      // Delegated on the form (a stable ancestor never replaced by React),
      // not attached directly to #scope-mode: that element may be a
      // React-owned field (see ScopeFilterSelect.jsx / Phase 2 in
      // REACT_MIGRATION_PLAN.md), and ReactDOM.createRoot().render()
      // creates a fresh DOM node when it mounts - any listener already
      // attached to the pre-mount static/fallback node would otherwise be
      // silently orphaned rather than firing on the field React now owns.
      // The native "change" event still bubbles up to the form either way.
      const form = getOptionalElementByIdSafe("run-script-form");
      if (form) {
        form.addEventListener("change", (event) => {
          if (event.target?.id === "scope-mode") {
            debouncedPersistScopeMode();
          }
        });
      }
    };

    const shouldAutoScrollBackfillLog = () => {
      const checkbox = getOptionalElementByIdSafe("backfill-log-autoscroll");
      return shouldAutoScrollBackfillLogByStateSafe({
        autoScrollEnabled: Boolean(checkbox?.checked),
        isBackfillRunning: Boolean(getIsBackfillRunningSafe()),
      });
    };

    const autoScrollBackfillLogToBottom = () => {
      const node = getOptionalElementByIdSafe("backfill-log");
      if (!node) {
        return;
      }

      node.scrollTop = getBackfillScrollTopSafe({
        scrollHeight: node.scrollHeight,
        currentScrollTop: node.scrollTop,
        shouldAutoScroll: shouldAutoScrollBackfillLog(),
      });
    };

    return {
      registerUiOptionPersistenceHandlers,
      shouldAutoScrollBackfillLog,
      autoScrollBackfillLogToBottom,
    };
  };

  return {
    createPrUiOptionScrollHelpers,
  };
})();
