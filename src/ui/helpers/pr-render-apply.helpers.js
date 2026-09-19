(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsRenderApplyHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrRenderApplyHelpers = ({
    renderManagementFilterSummary,
    renderAuthorInsights,
    renderStatsView,
    clearElementContents,
    buildMergedRequestMoreActionOptions,
    appendMergedRequestMoreAction,
    computePrDataFingerprint,
    computePrDataManifest,
    getOptionalElementById,
  } = {}) => {
    const renderManagementFilterSummarySafe =
      typeof renderManagementFilterSummary === "function"
        ? renderManagementFilterSummary
        : () => {};
    const renderAuthorInsightsSafe =
      typeof renderAuthorInsights === "function" ? renderAuthorInsights : () => {};
    const renderStatsViewSafe =
      typeof renderStatsView === "function" ? renderStatsView : () => {};
    const clearElementContentsSafe =
      typeof clearElementContents === "function" ? clearElementContents : () => {};
    const buildMergedRequestMoreActionOptionsSafe =
      typeof buildMergedRequestMoreActionOptions === "function"
        ? buildMergedRequestMoreActionOptions
        : () => ({});
    const appendMergedRequestMoreActionSafe =
      typeof appendMergedRequestMoreAction === "function"
        ? appendMergedRequestMoreAction
        : () => {};
    const computePrDataFingerprintSafe =
      typeof computePrDataFingerprint === "function"
        ? computePrDataFingerprint
        : () => "";
    const computePrDataManifestSafe =
      typeof computePrDataManifest === "function" ? computePrDataManifest : () => ({});
    const getOptionalElementByIdSafe =
      typeof getOptionalElementById === "function" ? getOptionalElementById : () => null;

    // Phase 5 (see REACT_MIGRATION_PLAN.md, "Performance Validation"):
    // both panels default to visible (no `#tab-panel-xxx` element = jsdom
    // unit tests using a bare fixture, or a real page where the panel
    // hasn't rendered yet) so this only ever *skips* work once a real,
    // genuinely-hidden panel is confirmed - never silently drops a render
    // for tests/environments that don't set this markup up.
    const isTabPanelVisible = (panelId) => {
      const panel = getOptionalElementByIdSafe(panelId);
      return !panel || !panel.hidden;
    };

    // The most recent (allStoredRows, actorsMap) applyRenderResults was
    // called with - kept so a tab that was hidden during the last render
    // can catch up with the same data once activated, via
    // renderAuthorInsightsIfVisible/renderStatsViewIfVisible below, without
    // needing its own separate "what are the current rows" derivation
    // (which would risk drifting from what the shared pipeline computed).
    let latestAllStoredRows = [];
    let latestActorsMap = {};

    const renderAuthorInsightsIfVisible = () => {
      if (isTabPanelVisible("tab-panel-author-insights")) {
        renderAuthorInsightsSafe(latestAllStoredRows, latestActorsMap);
      }
    };
    const renderStatsViewIfVisible = () => {
      if (isTabPanelVisible("tab-panel-review-stats")) {
        renderStatsViewSafe(latestAllStoredRows, latestActorsMap);
      }
    };

    const applyRenderResults = ({
      payload,
      allStoredRows,
      filteredRows,
      sectionsHost,
      meta,
      appliedSummaryText,
      filterChips,
      selectedScope,
      repoFilter,
      latestSelectedRepo,
    } = {}) => {
      const actorsMap = payload?.actorsMap || {};
      if (meta && typeof meta === "object") {
        meta.textContent = appliedSummaryText || "";
      }

      renderManagementFilterSummarySafe({
        summaryText: appliedSummaryText,
        filterChips,
      });
      // Phase 5 (see REACT_MIGRATION_PLAN.md, "Performance Validation"):
      // these two used to run in full on every single render regardless of
      // which data tab the user is actually looking at - a real,
      // measured cost with no benefit when the tab is hidden. Skipped here
      // when hidden; whichever tab just became visible gets a fresh render
      // triggered directly from its tab-click handler (index.page.js, via
      // renderAuthorInsightsIfVisible/renderStatsViewIfVisible below), not
      // tracked as "dirty" here - simpler and correct, since tab clicks
      // are infrequent and user-initiated, not part of the hot
      // polling/render path this gate is optimizing.
      latestAllStoredRows = allStoredRows;
      latestActorsMap = actorsMap;
      renderAuthorInsightsIfVisible();
      renderStatsViewIfVisible();

      // Phase 6 (see REACT_MIGRATION_PLAN.md): sectionsHost (#pr-sections)
      // is now exclusively React-owned (smart groups, lifecycle sections,
      // progress indicators, insights expand/collapse state) - the vanilla
      // DOM-building steps that used to run here (behind a skipTableRender
      // gate, for when React hadn't mounted yet or genuinely failed to)
      // have been removed entirely. renderPrData (index.page.js) no longer
      // builds a vanilla table in either case: it runs nothing but these
      // side effects during the ordinary React-not-mounted-yet race
      // (relying on `viewprs:react-ready` to trigger a real render once
      // React mounts), and shows a minimal error message instead of a
      // vanilla table on a genuine React mount failure.

      // The "Request more" merged-PRs button lives in its own static host
      // element (a sibling of sectionsHost in index.html), not inside
      // sectionsHost itself - unlike the table markup that used to live
      // here, React never owns it, so this always runs.
      const mergedRequestMoreHost =
        (typeof sectionsHost?.parentElement?.querySelector === "function" &&
          sectionsHost.parentElement.querySelector("#merged-request-more-action")) ||
        null;
      clearElementContentsSafe(mergedRequestMoreHost);
      appendMergedRequestMoreActionSafe(
        mergedRequestMoreHost,
        buildMergedRequestMoreActionOptionsSafe({
          selectedScope,
          repoFilter,
          lastRunRepo: payload?.lastRun?.repo || "",
          latestSelectedRepo,
        }),
      );

      return {
        pendingAutoRenderPayload: null,
        lastRenderedPrFingerprint: computePrDataFingerprintSafe(payload),
        latestPrManifest: payload?.dataManifest || computePrDataManifestSafe(payload),
        // Surfaced so callers (the React rendering path) can restrict what
        // they render to the same filtered set this pipeline just computed.
        filteredRows: Array.isArray(filteredRows) ? filteredRows : allStoredRows,
      };
    };

    return {
      applyRenderResults,
      renderAuthorInsightsIfVisible,
      renderStatsViewIfVisible,
    };
  };

  return {
    createPrRenderApplyHelpers,
  };
});
