// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsPrManagementTabsHelpers fallback.
export const { createPrManagementTabsHelpers } = (() => {
  const createPrManagementTabsHelpers = ({
    getOptionalElementById,
    loadActionLog,
    loadActorNameCache,
    onBackfillTabActivated,
  }) => {
    // Phase A, slice 2 (see REACT_MIGRATION_PLAN.md, "Full migration
    // roadmap"): extracted out of initManagementTabs (previously a nested
    // closure, capturing its element references once at that call) into
    // its own top-level function that re-queries elements on every call -
    // matching pr-data-tabs.helpers.js's activateDataTab shape exactly,
    // which is what lets TabStateProvider.jsx call this directly without
    // initManagementTabs ever having run. Behavior-preserving: the same
    // elements existed either way, this just re-reads them per call
    // instead of once.
    const activateTab = (key) => {
      const statusTab = getOptionalElementById("tab-status");
      const scriptTab = getOptionalElementById("tab-script");
      const backfillTab = getOptionalElementById("tab-backfill");
      const actionLogTab = getOptionalElementById("tab-action-log");
      const actorNameCacheTab = getOptionalElementById("tab-actor-name-cache");
      const exportTab = getOptionalElementById("tab-export");
      const statusPanel = getOptionalElementById("tab-panel-status");
      const scriptPanel = getOptionalElementById("tab-panel-script");
      const backfillPanel = getOptionalElementById("tab-panel-backfill");
      const actionLogPanel = getOptionalElementById("tab-panel-action-log");
      const actorNameCachePanel = getOptionalElementById(
        "tab-panel-actor-name-cache",
      );
      const exportPanel = getOptionalElementById("tab-panel-export");

      // Phase A, slice 2 (see REACT_MIGRATION_PLAN.md, "Full migration
      // roadmap"): only the 3 required PANELS are still required - the
      // button elements themselves are React-owned now
      // (ManagementTabButton.jsx), so every button mutation below is
      // conditionally guarded the same way the 3 "optional" tabs already
      // were. In the real app the buttons always exist by the time
      // anything calls this (React has mounted); this relaxation matters
      // for contexts that exercise the real panel-switching/side-effect
      // behavior without mounting react-app.jsx at all (e.g.
      // index.html.test.js, via window.activateManagementTab).
      if (!statusPanel || !scriptPanel || !backfillPanel) {
        return;
      }

      const showStatus = key === "status";
      const showScript = key === "script";
      const showBackfill = key === "backfill";
      const showActionLog = key === "action-log";
      const showActorNameCache = key === "actor-name-cache";
      const showExport = key === "export";

      if (statusTab) {
        statusTab.className = showStatus
          ? "management-tab-button is-active"
          : "management-tab-button";
      }
      if (scriptTab) {
        scriptTab.className = showScript
          ? "management-tab-button is-active"
          : "management-tab-button";
      }
      if (backfillTab) {
        backfillTab.className = showBackfill
          ? "management-tab-button is-active"
          : "management-tab-button";
      }
      if (actionLogTab) {
        actionLogTab.className = showActionLog
          ? "management-tab-button is-active"
          : "management-tab-button";
      }
      if (actorNameCacheTab) {
        actorNameCacheTab.className = showActorNameCache
          ? "management-tab-button is-active"
          : "management-tab-button";
      }
      if (exportTab) {
        exportTab.className = showExport
          ? "management-tab-button is-active"
          : "management-tab-button";
      }

      if (statusTab) {
        statusTab.setAttribute("aria-selected", showStatus ? "true" : "false");
      }
      if (scriptTab) {
        scriptTab.setAttribute("aria-selected", showScript ? "true" : "false");
      }
      if (backfillTab) {
        backfillTab.setAttribute(
          "aria-selected",
          showBackfill ? "true" : "false",
        );
      }
      if (actionLogTab) {
        actionLogTab.setAttribute(
          "aria-selected",
          showActionLog ? "true" : "false",
        );
      }
      if (actorNameCacheTab) {
        actorNameCacheTab.setAttribute(
          "aria-selected",
          showActorNameCache ? "true" : "false",
        );
      }
      if (exportTab) {
        exportTab.setAttribute("aria-selected", showExport ? "true" : "false");
      }

      statusPanel.hidden = !showStatus;
      scriptPanel.hidden = !showScript;
      backfillPanel.hidden = !showBackfill;
      if (actionLogPanel) {
        actionLogPanel.hidden = !showActionLog;
      }
      if (actorNameCachePanel) {
        actorNameCachePanel.hidden = !showActorNameCache;
      }
      if (exportPanel) {
        exportPanel.hidden = !showExport;
      }

      if (showActionLog) {
        void loadActionLog();
      }
      if (showActorNameCache && typeof loadActorNameCache === "function") {
        void loadActorNameCache();
      }
      if (showBackfill && typeof onBackfillTabActivated === "function") {
        onBackfillTabActivated();
      }
    };

    const initManagementTabs = () => {
      const statusTab = getOptionalElementById("tab-status");
      const scriptTab = getOptionalElementById("tab-script");
      const backfillTab = getOptionalElementById("tab-backfill");
      const actionLogTab = getOptionalElementById("tab-action-log");
      const actorNameCacheTab = getOptionalElementById("tab-actor-name-cache");
      const exportTab = getOptionalElementById("tab-export");
      const statusPanel = getOptionalElementById("tab-panel-status");
      const scriptPanel = getOptionalElementById("tab-panel-script");
      const backfillPanel = getOptionalElementById("tab-panel-backfill");

      if (
        !statusTab ||
        !scriptTab ||
        !backfillTab ||
        !statusPanel ||
        !scriptPanel ||
        !backfillPanel
      ) {
        return;
      }

      statusTab.onclick = () => activateTab("status");
      scriptTab.onclick = () => activateTab("script");
      backfillTab.onclick = () => activateTab("backfill");
      if (actionLogTab) {
        actionLogTab.onclick = () => activateTab("action-log");
      }
      if (actorNameCacheTab) {
        actorNameCacheTab.onclick = () => activateTab("actor-name-cache");
      }
      if (exportTab) {
        exportTab.onclick = () => activateTab("export");
      }
      activateTab("status");
    };

    return {
      activateTab,
      initManagementTabs,
    };
  };

  return {
    createPrManagementTabsHelpers,
  };
})();
