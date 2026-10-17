// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsRenderApplyHelpers fallback.
export const { createPrRenderApplyHelpers } = (() => {
  const createPrRenderApplyHelpers = ({
    renderAuthorInsights,
    computePrDataFingerprint,
    computePrDataManifest,
    getOptionalElementById,
  } = {}) => {
    const renderAuthorInsightsSafe =
      typeof renderAuthorInsights === "function" ? renderAuthorInsights : () => {};
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
    // renderAuthorInsightsIfVisible below, without needing its own separate
    // "what are the current rows" derivation (which would risk drifting
    // from what the shared pipeline computed). Review Stats no longer
    // needs an equivalent: ReviewStatsContent (react-app.jsx) recomputes
    // its own stats straight from PrDataContext's payload on every render,
    // so there's nothing left to "catch up" on tab activation - see Track C
    // (REACT_MIGRATION_PLAN.md) for why renderStatsView/
    // renderStatsViewIfVisible were deleted rather than kept for this.
    let latestAllStoredRows = [];
    let latestActorsMap = {};

    const renderAuthorInsightsIfVisible = () => {
      if (isTabPanelVisible("tab-panel-author-insights")) {
        renderAuthorInsightsSafe(latestAllStoredRows, latestActorsMap);
      }
    };

    // Phase 7 (see REACT_MIGRATION_PLAN.md, "a real fast path for
    // fresh-payload renders"): for a caller with a direct, authoritative
    // fresh payload that never goes through applyRenderResults (the only
    // other place latestAllStoredRows/latestActorsMap get updated) -
    // without this, renderAuthorInsightsIfVisible would render from
    // whatever stale rows/actorsMap the full pipeline last left behind,
    // silently missing the fresh payload. Same allEntries derivation
    // (Object.values(payload.byPrNumber)) pr-render-context.helpers.js's
    // captureRenderContext uses, so this stays a real cache update, not
    // just a one-off render - a later tab switch's own catch-up render
    // (renderAuthorInsightsIfVisible, triggered via onTabActivated) sees
    // the same fresh data too.
    const applyFreshAuthorInsightsIfVisible = (payload) => {
      latestAllStoredRows = Object.values(payload?.byPrNumber || {});
      latestActorsMap = payload?.actorsMap || {};
      renderAuthorInsightsIfVisible();
    };

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
      const actorsMap = payload?.actorsMap || {};

      // Phase 5 (see REACT_MIGRATION_PLAN.md, "Performance Validation"):
      // this used to run in full on every single render regardless of
      // which data tab the user is actually looking at - a real,
      // measured cost with no benefit when the tab is hidden. Skipped here
      // when hidden; whichever tab just became visible gets a fresh render
      // triggered directly from its tab-click handler (index.page.js, via
      // renderAuthorInsightsIfVisible below), not tracked as "dirty" here -
      // simpler and correct, since tab clicks are infrequent and
      // user-initiated, not part of the hot polling/render path this gate
      // is optimizing.
      latestAllStoredRows = allStoredRows;
      latestActorsMap = actorsMap;
      renderAuthorInsightsIfVisible();

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
      renderAuthorInsightsIfVisible,
      applyFreshAuthorInsightsIfVisible,
    };
  };

  return {
    createPrRenderApplyHelpers,
  };
})();
