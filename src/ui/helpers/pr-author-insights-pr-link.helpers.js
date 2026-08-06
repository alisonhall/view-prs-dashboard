/**
 * PR Link and Navigation Helpers for Author Insights
 * 
 * Provides helpers for creating PR links and navigating to PR rows in the main table.
 * UMD pattern for browser + Jest compatibility.
 */

(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsPrAuthorInsightsPrLinkHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrAuthorInsightsPrLinkHelpers = ({
    DEFAULT_REPO = "",
    activateDataTab,
    collectNodesByTag,
  } = {}) => {
    /**
     * Creates a PR link element with external GitHub link and table navigation button.
     * 
     * @param {Object} entry - PR entry object
     * @returns {HTMLElement} Container with external link and table navigation button
     */
    const createAuthorInsightsPrLink = (entry) => {
      const row = entry?.data || {};
      const prNumber = String(row.number || entry?.prNumber || "").trim();

      const container = document.createElement("div");
      container.style.display = "flex";
      container.style.gap = "8px";
      container.style.alignItems = "center";

      // External GitHub link
      const externalLink = document.createElement("a");
      externalLink.className = "author-insights-link";
      externalLink.href =
        row.url ||
        `https://github.com/${entry?.repo || DEFAULT_REPO}/pull/${prNumber}`;
      externalLink.target = "_blank";
      externalLink.rel = "noopener noreferrer";
      externalLink.textContent = `#${prNumber} ${String(row.title || row.titleDisplay || "").trim()}`;
      externalLink.title = "Open PR on GitHub";
      container.appendChild(externalLink);

      // Table navigation button
      const tableLink = document.createElement("button");
      tableLink.textContent = "View in table";
      tableLink.className = "author-insights-table-link";
      tableLink.title = "Navigate to PR data tab and scroll to this PR";
      tableLink.onclick = () => {
        navigateToPrInTable(prNumber, { activateDataTab, collectNodesByTag });
      };
      container.appendChild(tableLink);

      return container;
    };

    /**
     * Navigates to a PR row in the main data table.
     * 
     * @param {string} prNumber - PR number to navigate to
     * @param {Object} deps - Navigation dependencies
     */
    const navigateToPrInTable = (prNumber, { activateDataTab, collectNodesByTag }) => {
      if (!activateDataTab || !collectNodesByTag) {
        console.warn("Navigation dependencies not provided");
        return;
      }

      activateDataTab("pr-data");
      setTimeout(() => {
        const prLinks = collectNodesByTag(document.body, "a")
          .filter((link) => link.className === "pr-link")
          .filter((link) => link.textContent.trim() === `#${prNumber}`);

        if (prLinks.length > 0) {
          const prLink = prLinks[0];
          prLink.scrollIntoView({ behavior: "smooth", block: "center" });
          prLink.focus();

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
      createAuthorInsightsPrLink,
      navigateToPrInTable,
    };
  };

  return {
    createPrAuthorInsightsPrLinkHelpers,
  };
});
