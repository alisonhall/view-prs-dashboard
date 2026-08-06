(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsPrManagementTabsHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrManagementTabsHelpers = ({
    getOptionalElementById,
    loadActionLog,
    loadActorNameCache,
  }) => {
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
      const actionLogPanel = getOptionalElementById("tab-panel-action-log");
      const actorNameCachePanel = getOptionalElementById(
        "tab-panel-actor-name-cache",
      );
      const exportPanel = getOptionalElementById("tab-panel-export");

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

      const activateTab = (key) => {
        const showStatus = key === "status";
        const showScript = key === "script";
        const showBackfill = key === "backfill";
        const showActionLog = key === "action-log";
        const showActorNameCache = key === "actor-name-cache";
        const showExport = key === "export";

        statusTab.className = showStatus
          ? "management-tab-button is-active"
          : "management-tab-button";
        scriptTab.className = showScript
          ? "management-tab-button is-active"
          : "management-tab-button";
        backfillTab.className = showBackfill
          ? "management-tab-button is-active"
          : "management-tab-button";
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

        statusTab.setAttribute("aria-selected", showStatus ? "true" : "false");
        scriptTab.setAttribute("aria-selected", showScript ? "true" : "false");
        backfillTab.setAttribute(
          "aria-selected",
          showBackfill ? "true" : "false",
        );
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
      };

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
      initManagementTabs,
    };
  };

  return {
    createPrManagementTabsHelpers,
  };
});
