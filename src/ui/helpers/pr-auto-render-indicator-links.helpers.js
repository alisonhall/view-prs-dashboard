(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsAutoRenderIndicatorLinksHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrAutoRenderIndicatorLinksHelpers = ({
    clearElementContents,
    getAuthorInsightsDisplayName,
    navigateToPrInTable,
    navigateToAuthorInsights,
    buildAutoRenderBlockedLinksAriaLabel,
    documentRef,
  } = {}) => {
    const clearElementContentsSafe =
      typeof clearElementContents === "function" ? clearElementContents : () => {};
    const getAuthorInsightsDisplayNameSafe =
      typeof getAuthorInsightsDisplayName === "function"
        ? getAuthorInsightsDisplayName
        : (authorLogin) => String(authorLogin || "").trim();
    const navigateToPrInTableSafe =
      typeof navigateToPrInTable === "function" ? navigateToPrInTable : () => {};
    const navigateToAuthorInsightsSafe =
      typeof navigateToAuthorInsights === "function"
        ? navigateToAuthorInsights
        : () => {};
    const buildAutoRenderBlockedLinksAriaLabelSafe =
      typeof buildAutoRenderBlockedLinksAriaLabel === "function"
        ? buildAutoRenderBlockedLinksAriaLabel
        : ({ blockingPrLabel = "" }) => String(blockingPrLabel || "");
    const doc = documentRef || (typeof document !== "undefined" ? document : null);

    const renderAutoRenderBlockedLinks = ({
      linksHost,
      blockingPrNumbers = [],
      blockingAuthorInsightsLogins = [],
      blockingPrLabel = "",
    } = {}) => {
      if (!linksHost) {
        return;
      }

      const prNumbers = Array.isArray(blockingPrNumbers)
        ? blockingPrNumbers
        : [];
      const authorLogins = Array.isArray(blockingAuthorInsightsLogins)
        ? blockingAuthorInsightsLogins
        : [];

      clearElementContentsSafe(linksHost);
      linksHost.hidden = prNumbers.length === 0 && authorLogins.length === 0;

      prNumbers.forEach((prNumber) => {
        const button = doc.createElement("button");
        button.type = "button";
        button.className = "auto-render-blocked-pr-link";
        button.textContent = `#${prNumber}`;
        button.title = `Jump to PR #${prNumber} unsaved changes`;
        button.onclick = () => {
          navigateToPrInTableSafe(prNumber, { focusUnsaved: true });
        };
        linksHost.appendChild(button);
      });

      authorLogins.forEach((authorLogin) => {
        const authorDisplayName = getAuthorInsightsDisplayNameSafe(authorLogin);
        const button = doc.createElement("button");
        button.type = "button";
        button.className = "auto-render-blocked-pr-link";
        button.textContent = `Author: ${authorDisplayName}`;
        button.title = `Jump to unsaved Author Insights draft for ${authorDisplayName}`;
        button.onclick = () => {
          navigateToAuthorInsightsSafe(authorLogin, { focusUnsaved: true });
        };
        linksHost.appendChild(button);
      });

      linksHost.setAttribute(
        "aria-label",
        buildAutoRenderBlockedLinksAriaLabelSafe({
          blockingPrLabel,
          blockingAuthorInsightsLogins: authorLogins,
        }),
      );
    };

    return {
      renderAutoRenderBlockedLinks,
    };
  };

  return {
    createPrAutoRenderIndicatorLinksHelpers,
  };
});
