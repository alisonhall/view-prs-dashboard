// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsRenderStateCommitHelpers fallback.
export const { createPrRenderStateCommitHelpers } = (() => {
  const createPrRenderStateCommitHelpers = () => {
    const deriveCommittedRenderState = ({ nextRenderState } = {}) => {
      const safeState =
        nextRenderState && typeof nextRenderState === "object"
          ? nextRenderState
          : {};

      return {
        pendingAutoRenderPayload:
          Object.prototype.hasOwnProperty.call(
            safeState,
            "pendingAutoRenderPayload",
          )
            ? safeState.pendingAutoRenderPayload
            : null,
        lastRenderedPrFingerprint:
          typeof safeState.lastRenderedPrFingerprint === "string"
            ? safeState.lastRenderedPrFingerprint
            : "",
        latestPrManifest:
          safeState.latestPrManifest && typeof safeState.latestPrManifest === "object"
            ? safeState.latestPrManifest
            : {},
        filteredRows: Array.isArray(safeState.filteredRows)
          ? safeState.filteredRows
          : [],
      };
    };

    return {
      deriveCommittedRenderState,
    };
  };

  return {
    createPrRenderStateCommitHelpers,
  };
})();
