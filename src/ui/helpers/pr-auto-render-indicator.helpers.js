(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsAutoRenderIndicatorHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrAutoRenderIndicatorHelpers = ({
    getAuthorInsightsDisplayName,
  } = {}) => {
    const getAuthorInsightsDisplayNameSafe =
      typeof getAuthorInsightsDisplayName === "function"
        ? getAuthorInsightsDisplayName
        : (authorLogin) => String(authorLogin || "").trim();

    const buildAutoRenderBlockedStatusText = ({
      dirtyFieldCount = 0,
      unsavedNotesCount = 0,
      blockingAuthorInsightsCount = 0,
    } = {}) => {
      const parts = [];
      if (Number(dirtyFieldCount) > 0) {
        parts.push(
          `${dirtyFieldCount} unsaved field${dirtyFieldCount === 1 ? "" : "s"}`,
        );
      }
      if (Number(unsavedNotesCount) > 0) {
        parts.push(
          `${unsavedNotesCount} note section${unsavedNotesCount === 1 ? "" : "s"} unsaved`,
        );
      }
      if (Number(blockingAuthorInsightsCount) > 0) {
        parts.push(
          `${blockingAuthorInsightsCount} author insight draft${blockingAuthorInsightsCount === 1 ? "" : "s"} unsaved`,
        );
      }
      return parts.length > 0
        ? `Auto updates are paused until changes are saved. ${parts.join(" | ")}`
        : "Auto updates are paused until changes are saved.";
    };

    const buildAutoRenderBlockedLinksAriaLabel = ({
      blockingPrLabel = "",
      blockingAuthorInsightsLogins = [],
    } = {}) => {
      const prLabel = String(blockingPrLabel || "").trim();
      if (prLabel) {
        return prLabel;
      }

      const logins = Array.isArray(blockingAuthorInsightsLogins)
        ? blockingAuthorInsightsLogins
        : [];
      if (logins.length === 0) {
        return "";
      }

      const displayNames = logins.map((authorLogin) =>
        getAuthorInsightsDisplayNameSafe(authorLogin),
      );
      return `Blocking author drafts: ${displayNames.join(", ")}`;
    };

    return {
      buildAutoRenderBlockedStatusText,
      buildAutoRenderBlockedLinksAriaLabel,
    };
  };

  return {
    createPrAutoRenderIndicatorHelpers,
  };
});
