(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsAutoRenderIndicatorLinksHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrAutoRenderIndicatorLinksHelpers = ({
    buildAutoRenderBlockedLinksAriaLabel,
  } = {}) => {
    const buildAutoRenderBlockedLinksAriaLabelSafe =
      typeof buildAutoRenderBlockedLinksAriaLabel === "function"
        ? buildAutoRenderBlockedLinksAriaLabel
        : ({ blockingPrLabel = "" }) => String(blockingPrLabel || "");

    // The button list itself is real JSX now (components/AutoRenderBlockedLinks.jsx,
    // via window.updateReactAutoRenderBlockedLinks) - linksHost is a static
    // element (a React portal target, not React-owned itself), so its own
    // hidden/aria-label attributes still have to be toggled here.
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

      linksHost.hidden = prNumbers.length === 0 && authorLogins.length === 0;
      linksHost.setAttribute(
        "aria-label",
        buildAutoRenderBlockedLinksAriaLabelSafe({
          blockingPrLabel,
          blockingAuthorInsightsLogins: authorLogins,
        }),
      );

      if (typeof window !== "undefined") {
        window.updateReactAutoRenderBlockedLinks?.(prNumbers, authorLogins);
      }
    };

    return {
      renderAutoRenderBlockedLinks,
    };
  };

  return {
    createPrAutoRenderIndicatorLinksHelpers,
  };
});
