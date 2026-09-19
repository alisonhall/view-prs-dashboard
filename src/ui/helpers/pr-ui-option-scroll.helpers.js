(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsUiOptionScrollHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrUiOptionScrollHelpers = ({
    getOptionalElementById,
    persistUiOptionOverrides,
    shouldAutoScrollBackfillLogByState,
    getBackfillScrollTop,
    getIsBackfillRunning,
  } = {}) => {
    const getOptionalElementByIdSafe =
      typeof getOptionalElementById === "function"
        ? getOptionalElementById
        : () => null;
    const persistUiOptionOverridesSafe =
      typeof persistUiOptionOverrides === "function"
        ? persistUiOptionOverrides
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
            void persistUiOptionOverridesSafe(["scope-mode"]);
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
});
