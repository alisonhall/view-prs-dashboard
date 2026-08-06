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
      const scopeMode = getOptionalElementByIdSafe("scope-mode");
      if (scopeMode) {
        scopeMode.addEventListener("change", () => {
          void persistUiOptionOverridesSafe(["scope-mode"]);
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
