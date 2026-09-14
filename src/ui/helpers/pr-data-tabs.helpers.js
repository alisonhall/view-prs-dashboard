(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsPrDataTabsHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrDataTabsHelpers = ({ getOptionalElementById, onTabActivated }) => {
    const onTabActivatedSafe =
      typeof onTabActivated === "function" ? onTabActivated : () => {};

    const activateDataTab = (key) => {
      const prDataTab = getOptionalElementById("tab-pr-data");
      const reviewStatsTab = getOptionalElementById("tab-review-stats");
      const authorInsightsTab = getOptionalElementById("tab-author-insights");
      const prDataPanel = getOptionalElementById("tab-panel-pr-data");
      const reviewStatsPanel = getOptionalElementById("tab-panel-review-stats");
      const authorInsightsPanel = getOptionalElementById(
        "tab-panel-author-insights",
      );

      if (
        !prDataTab ||
        !reviewStatsTab ||
        !authorInsightsTab ||
        !prDataPanel ||
        !reviewStatsPanel ||
        !authorInsightsPanel
      ) {
        return;
      }

      const showPrData = key === "pr-data";
      const showReviewStats = key === "review-stats";
      const showAuthorInsights = key === "author-insights";

      prDataTab.className = showPrData
        ? "data-tab-button is-active"
        : "data-tab-button";
      reviewStatsTab.className = showReviewStats
        ? "data-tab-button is-active"
        : "data-tab-button";
      authorInsightsTab.className = showAuthorInsights
        ? "data-tab-button is-active"
        : "data-tab-button";

      prDataTab.setAttribute("aria-selected", showPrData ? "true" : "false");
      reviewStatsTab.setAttribute(
        "aria-selected",
        showReviewStats ? "true" : "false",
      );
      authorInsightsTab.setAttribute(
        "aria-selected",
        showAuthorInsights ? "true" : "false",
      );

      prDataPanel.hidden = !showPrData;
      reviewStatsPanel.hidden = !showReviewStats;
      authorInsightsPanel.hidden = !showAuthorInsights;

      // Phase 5 (see REACT_MIGRATION_PLAN.md, "Performance Validation"):
      // the shared render pipeline now skips rebuilding a hidden tab's
      // content on every data render - whichever tab just became visible
      // here needs a catch-up render with the latest data, in case it was
      // skipped while hidden.
      onTabActivatedSafe(key);
    };

    const initDataTabs = () => {
      const prDataTab = getOptionalElementById("tab-pr-data");
      const reviewStatsTab = getOptionalElementById("tab-review-stats");
      const authorInsightsTab = getOptionalElementById("tab-author-insights");

      if (!prDataTab || !reviewStatsTab || !authorInsightsTab) {
        return;
      }

      prDataTab.onclick = () => activateDataTab("pr-data");
      reviewStatsTab.onclick = () => activateDataTab("review-stats");
      authorInsightsTab.onclick = () => activateDataTab("author-insights");
      activateDataTab("pr-data");
    };

    return {
      activateDataTab,
      initDataTabs,
    };
  };

  return {
    createPrDataTabsHelpers,
  };
});
