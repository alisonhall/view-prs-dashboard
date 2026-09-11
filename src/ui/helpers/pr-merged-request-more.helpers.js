(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsMergedRequestMoreHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrMergedRequestMoreHelpers = ({
    handleRequestMoreMerged,
    getIsRequestMoreMergedPending,
    documentRef,
  } = {}) => {
    const handleRequestMoreMergedSafe =
      typeof handleRequestMoreMerged === "function"
        ? handleRequestMoreMerged
        : () => {};
    const getIsRequestMoreMergedPendingSafe =
      typeof getIsRequestMoreMergedPending === "function"
        ? getIsRequestMoreMergedPending
        : () => false;

    const getDocument = () =>
      documentRef || (typeof document !== "undefined" ? document : null);

    const appendMergedRequestMoreAction = (
      host,
      { isVisible = false, repo = "" } = {},
    ) => {
      // `host` may be a persistent element (e.g. a static sibling of the
      // React-rendered table) rather than one rebuilt from scratch every
      // render, so visibility must be set explicitly rather than inferred
      // from whether a child was ever appended.
      if (host && typeof host === "object" && "hidden" in host) {
        host.hidden = !isVisible;
      }

      if (!isVisible || !host) {
        return;
      }

      const doc = getDocument();
      if (!doc || typeof doc.createElement !== "function") {
        return;
      }

      const actionHost = doc.createElement("div");
      actionHost.className = "merged-request-more-action";

      const button = doc.createElement("button");
      button.type = "button";
      button.id = "merged-request-more-btn";
      button.textContent = "Request more";
      button.disabled = Boolean(getIsRequestMoreMergedPendingSafe());

      const status = doc.createElement("span");
      status.id = "merged-request-more-status";
      status.className = "merged-request-more-status";
      status.textContent = getIsRequestMoreMergedPendingSafe()
        ? "Request in progress..."
        : "";

      button.addEventListener("click", () => {
        void handleRequestMoreMergedSafe(repo);
      });

      actionHost.appendChild(button);
      actionHost.appendChild(status);
      host.appendChild(actionHost);
    };

    return {
      appendMergedRequestMoreAction,
    };
  };

  return {
    createPrMergedRequestMoreHelpers,
  };
});
