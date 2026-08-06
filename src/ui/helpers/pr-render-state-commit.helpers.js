(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsRenderStateCommitHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
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
      };
    };

    return {
      deriveCommittedRenderState,
    };
  };

  return {
    createPrRenderStateCommitHelpers,
  };
});
