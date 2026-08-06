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

      clearElementContentsSafe(sectionsHost);

      appendPrSectionsSafe(
        sectionsHost,
        buildPrSectionConfigsSafe({
          grouped,
          prSectionOpenState,
          lastCheckedAt: lastSuccessfulRenderedCheckAt,
          actorsMapFromPayload: actorsMap,
        }),
      );

      appendMergedRequestMoreActionSafe(
        sectionsHost,
        buildMergedRequestMoreActionOptionsSafe({
          selectedScope,
          repoFilter,
          lastRunRepo: payload?.lastRun?.repo || "",
          latestSelectedRepo,
        }),
      );

      restoreInsightsViewStateSafe(sectionsHost, insightsViewState);
      applyActivePrProgressIndicatorsSafe(
        latestSchedulerState?.activePrNumbers || [],
      );
      recomputeDirtyPrSectionsFieldsSafe();

      return {
        pendingAutoRenderPayload: null,
        lastRenderedPrFingerprint: computePrDataFingerprintSafe(payload),
        latestPrManifest: payload?.dataManifest || computePrDataManifestSafe(payload),
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
