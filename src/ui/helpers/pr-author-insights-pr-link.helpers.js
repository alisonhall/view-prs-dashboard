/**
 * PR Link and Navigation Helpers for Author Insights
 * 
 * Provides helpers for navigating to PR rows in the main table. The
 * DOM-building link element helper that used to live here was ported to
 * AuthorInsightsPrLink.jsx.
 * UMD pattern for browser + Jest compatibility.
 */

(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsAuthorInsightsPrLinkHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrAuthorInsightsPrLinkHelpers = ({
    isReactTableMounted,
  } = {}) => {
    const isReactTableMountedSafe =
      typeof isReactTableMounted === "function" ? isReactTableMounted : () => false;

    /**
     * Navigates to a PR row in the main data table.
     *
     * @param {string} prNumber - PR number to navigate to
     * @param {string} repo - Repo the PR belongs to (PR numbers are only
     *   unique within a repo - other repos' PRs can render in the same
     *   table now, see PrTableApp's entriesForRepo, so without this a
     *   coincidentally-matching number in another repo could be the one
     *   that actually gets expanded/scrolled to). Optional for backward
     *   compatibility with callers that don't have it yet (falls back to
     *   number-only matching, same as before).
     * @param {Object} deps - Navigation dependencies
     */
    const navigateToPrInTable = (prNumber, repo, { activateDataTab, collectNodesByTag }) => {
      if (!activateDataTab || !collectNodesByTag) {
        console.warn("Navigation dependencies not provided");
        return;
      }

      activateDataTab("pr-data");

      const reactMounted = isReactTableMountedSafe();
      if (reactMounted && typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
        // React owns the insights row's expand/collapse state (PrTableApp's
        // expandedInsights) - dispatch and let its own listener update that
        // state, then scroll below once React's had a chance to render the
        // now-expanded row. Directly mutating `.hidden`/textContent on a
        // React-rendered node, like the vanilla branch below does, would
        // leave the toggle button claiming "expanded" while the insights
        // content never actually renders.
        window.dispatchEvent(
          new CustomEvent("pr-navigate-to-insights", { detail: { prNumber, repo } }),
        );
      }

      setTimeout(() => {
        const prLinks = collectNodesByTag(document.body, "a")
          .filter((link) => link.className === "pr-link")
          .filter((link) => link.textContent.trim() === `#${prNumber}`)
          .filter(
            (link) => !repo || link.closest(".pr-number-cell")?.getAttribute("data-repo") === repo,
          );

        if (prLinks.length > 0) {
          const prLink = prLinks[0];
          prLink.scrollIntoView({ behavior: "smooth", block: "center" });
          prLink.focus();

          if (reactMounted) {
            return;
          }

          const prRow = prLink.closest("tr");
          if (prRow) {
            const nextRow = prRow.nextElementSibling;
            if (nextRow && nextRow.querySelector(".insights-row-cell")) {
              nextRow.hidden = false;
              const toggleButton = prRow.querySelector(".row-insights-toggle");
              if (toggleButton) {
                toggleButton.textContent = "Hide insights";
                toggleButton.setAttribute("aria-expanded", "true");
              }
            }
          }
        }
      }, 0);
    };

    return {
      navigateToPrInTable,
    };
  };

  return {
    createPrAuthorInsightsPrLinkHelpers,
  };
});
