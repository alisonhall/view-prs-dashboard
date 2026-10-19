// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsRenderApplyHelpers fallback.
export const { createPrRenderApplyHelpers } = (() => {
  const createPrRenderApplyHelpers = ({
    computePrDataFingerprint,
    computePrDataManifest,
  } = {}) => {
    const computePrDataFingerprintSafe =
      typeof computePrDataFingerprint === "function"
        ? computePrDataFingerprint
        : () => "";
    const computePrDataManifestSafe =
      typeof computePrDataManifest === "function" ? computePrDataManifest : () => ({});
    // Phase H.17 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
    // cluster 2): getOptionalElementById (no longer taken as a DI param
    // either, now unused) / isTabPanelVisible, the
    // latestAllStoredRows/latestActorsMap cache, and
    // renderAuthorInsightsIfVisible/applyFreshAuthorInsightsIfVisible are
    // all deleted - their sole purpose was re-invoking renderAuthorInsights
    // (pr-author-insights.component.js, deleted outright this phase) once
    // the Author Insights tab's data changed or became visible.
    // AuthorInsightsSelector.jsx now derives rows/actorsMap straight from
    // PrDataContext's own payload and validates/writes selectedAuthorLogin
    // itself, reactively, on every render - no separate cache or
    // visibility-gated catch-up render needed, matching how Review Stats'
    // own renderStatsView/renderStatsViewIfVisible were already retired
    // for the same reason (see Track C, REACT_MIGRATION_PLAN.md).

    // Deferred-items follow-up (full vanilla-to-React sweep, see
    // REACT_MIGRATION_PLAN.md): #data-meta and the "Applied filters: ..."
    // summary/chips are React-owned now in the real app
    // (AppliedFilterSummaryLive, deriving both live from Context) - the
    // caller-supplied `meta`/`appliedSummaryText`/`filterChips` are
    // deliberately not used for rendering here anymore; `meta` (the DOM
    // element itself) and `appliedSummaryText`/`filterChips` are still
    // computed and passed through by deriveRenderApplyInputs/
    // deriveRenderFinalizedState/the orchestrator unchanged, not worth a
    // wider refactor just to drop them from that whole chain.
    //
    // Phase H.12 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
    // window.updateReactDataMetaText/window.renderReactFilterSummary (via
    // the now-deleted renderManagementFilterSummary DI param) used to be
    // called here too - both confirmed dead in production (no installer
    // anywhere in react-app.jsx; AppliedFilterSummaryLive replaced both
    // already, per the comment above) and deleted outright.
    // index.html.test.js's own integration-test harness used to be the
    // only real reader of either (via its own wireTextBridge stubs) -
    // fixed by mounting the real AppliedFilterSummaryLive there instead of
    // faking these 2 bridges, same as every other phase's harness fallout.
    const applyRenderResults = ({
      payload,
      allStoredRows,
      filteredRows,
    } = {}) => {
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

      // The "Request more" merged-PRs button is real JSX now
      // (components/MergedRequestMoreAction.jsx, mounted into its own
      // static #merged-request-more-action host - a sibling of #pr-sections
      // in index.html, not inside it), and MergedRequestMoreActionLive
      // derives its isVisible/repo options live from Context (Phase 7,
      // "live filtering" follow-up) - this pipeline no longer needs to
      // compute or push them itself.

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
    };
  };

  return {
    createPrRenderApplyHelpers,
  };
})();
