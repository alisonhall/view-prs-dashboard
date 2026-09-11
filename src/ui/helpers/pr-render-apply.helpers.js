(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsRenderApplyHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrRenderApplyHelpers = ({
    renderManagementFilterSummary,
    renderExportFieldCatalog,
    renderAuthorInsights,
    renderStatsView,
    clearElementContents,
    buildPrSectionConfigs,
    buildSmartGroupConfigs,
    applySmartGroups,
    appendPrSections,
    buildMergedRequestMoreActionOptions,
    appendMergedRequestMoreAction,
    restoreInsightsViewState,
    applyActivePrProgressIndicators,
    recomputeDirtyPrSectionsFields,
    computePrDataFingerprint,
    computePrDataManifest,
  } = {}) => {
    const renderManagementFilterSummarySafe =
      typeof renderManagementFilterSummary === "function"
        ? renderManagementFilterSummary
        : () => {};
    const renderExportFieldCatalogSafe =
      typeof renderExportFieldCatalog === "function"
        ? renderExportFieldCatalog
        : () => {};
    const renderAuthorInsightsSafe =
      typeof renderAuthorInsights === "function" ? renderAuthorInsights : () => {};
    const renderStatsViewSafe =
      typeof renderStatsView === "function" ? renderStatsView : () => {};
    const clearElementContentsSafe =
      typeof clearElementContents === "function" ? clearElementContents : () => {};
    const buildPrSectionConfigsSafe =
      typeof buildPrSectionConfigs === "function" ? buildPrSectionConfigs : () => [];
    const buildSmartGroupConfigsSafe =
      typeof buildSmartGroupConfigs === "function" ? buildSmartGroupConfigs : () => [];
    const applySmartGroupsSafe =
      typeof applySmartGroups === "function" ? applySmartGroups : () => ({});
    const appendPrSectionsSafe =
      typeof appendPrSections === "function" ? appendPrSections : () => {};
    const buildMergedRequestMoreActionOptionsSafe =
      typeof buildMergedRequestMoreActionOptions === "function"
        ? buildMergedRequestMoreActionOptions
        : () => ({});
    const appendMergedRequestMoreActionSafe =
      typeof appendMergedRequestMoreAction === "function"
        ? appendMergedRequestMoreAction
        : () => {};
    const restoreInsightsViewStateSafe =
      typeof restoreInsightsViewState === "function"
        ? restoreInsightsViewState
        : () => {};
    const applyActivePrProgressIndicatorsSafe =
      typeof applyActivePrProgressIndicators === "function"
        ? applyActivePrProgressIndicators
        : () => {};
    const recomputeDirtyPrSectionsFieldsSafe =
      typeof recomputeDirtyPrSectionsFields === "function"
        ? recomputeDirtyPrSectionsFields
        : () => {};
    const computePrDataFingerprintSafe =
      typeof computePrDataFingerprint === "function"
        ? computePrDataFingerprint
        : () => "";
    const computePrDataManifestSafe =
      typeof computePrDataManifest === "function" ? computePrDataManifest : () => ({});

    const applyRenderResults = ({
      payload,
      allStoredRows,
      filteredRows,
      sectionsHost,
      meta,
      appliedSummaryText,
      filterChips,
      grouped,
      prSectionOpenState,
      lastSuccessfulRenderedCheckAt,
      selectedScope,
      repoFilter,
      latestSelectedRepo,
      insightsViewState,
      latestSchedulerState,
      skipTableRender,
    } = {}) => {
      const actorsMap = payload?.actorsMap || {};
      if (meta && typeof meta === "object") {
        meta.textContent = appliedSummaryText || "";
      }

      renderManagementFilterSummarySafe({
        summaryText: appliedSummaryText,
        filterChips,
      });
      renderExportFieldCatalogSafe(payload);

      renderAuthorInsightsSafe(allStoredRows, actorsMap);
      renderStatsViewSafe(allStoredRows, actorsMap);

      // When the React table is handling rendering, it owns sectionsHost
      // (smart groups, lifecycle sections, progress indicators, insights
      // expand/collapse state) entirely - the vanilla DOM-building steps
      // below would just be immediately clobbered by (or fight with)
      // React's own render, so skip them and only apply the side effects
      // above, which both rendering paths need regardless of which one
      // owns the table markup.
      if (!skipTableRender) {
        clearElementContentsSafe(sectionsHost);

        // Build smart groups from the currently filtered rows (not
        // allStoredRows) so smart groups honor the same scope/local filters
        // (PR number, labels, authors, etc.) as the lifecycle sections below
        // them, instead of always showing every stored PR regardless of the
        // active filter.
        const smartGroupConfigs = buildSmartGroupConfigsSafe({
          flaggedByRepo: payload?.flaggedByRepo || {},
          inReviewByRepo: payload?.inReviewByRepo || {},
          repo: latestSelectedRepo || "",
        });

        const smartGroups = applySmartGroupsSafe(
          Array.isArray(filteredRows) ? filteredRows : allStoredRows,
          smartGroupConfigs,
        );

        appendPrSectionsSafe(
          sectionsHost,
          buildPrSectionConfigsSafe({
            grouped,
            smartGroups,
            prSectionOpenState,
            lastCheckedAt: lastSuccessfulRenderedCheckAt,
            actorsMapFromPayload: actorsMap,
          }),
        );

        restoreInsightsViewStateSafe(sectionsHost, insightsViewState);
        applyActivePrProgressIndicatorsSafe(
          latestSchedulerState?.activePrNumbers || [],
        );
        recomputeDirtyPrSectionsFieldsSafe();
      }

      // The "Request more" merged-PRs button lives in its own static host
      // element (a sibling of sectionsHost in index.html), not inside
      // sectionsHost itself - unlike the table markup above, React never
      // owns it, so this can (and must) always run regardless of
      // skipTableRender. Without this, "Request more" was simply absent
      // whenever React was rendering the table.
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
        // they render to the same filtered set the vanilla pipeline just
        // computed - see skipTableRender above.
        filteredRows: Array.isArray(filteredRows) ? filteredRows : allStoredRows,
      };
    };

    return {
      applyRenderResults,
    };
  };

  return {
    createPrRenderApplyHelpers,
  };
});
