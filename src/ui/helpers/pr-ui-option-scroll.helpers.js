// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsUiOptionScrollHelpers fallback.
export const { createPrUiOptionScrollHelpers } = (() => {
  const createPrUiOptionScrollHelpers = ({
    getOptionalElementById,
    shouldAutoScrollBackfillLogByState,
    getBackfillScrollTop,
    getIsBackfillRunning,
  } = {}) => {
    const getOptionalElementByIdSafe =
      typeof getOptionalElementById === "function"
        ? getOptionalElementById
        : () => null;
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
      shouldAutoScrollBackfillLog,
      autoScrollBackfillLogToBottom,
    };
  };

  return {
    createPrUiOptionScrollHelpers,
  };
})();
