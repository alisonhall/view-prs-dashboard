(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsSectionConfigHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrSectionConfigHelpers = ({ resolvePrSectionOpenState } = {}) => {
    const resolvePrSectionOpenStateSafe =
      typeof resolvePrSectionOpenState === "function"
        ? resolvePrSectionOpenState
        : (_openState, _sectionKey, fallbackOpen) => Boolean(fallbackOpen);

    const buildPrSectionConfigs = ({
      grouped,
      smartGroups = null,
      prSectionOpenState,
      lastCheckedAt = "",
      actorsMapFromPayload = {},
    } = {}) => {
      // Build smart group sections (non-exclusive, appear above lifecycle sections)
      const smartGroupSections =
        smartGroups && typeof smartGroups === "object"
          ? Object.entries(smartGroups).map(([groupKey, groupData]) => ({
              title: String(groupData?.title || ""),
              icon: String(groupData?.icon || ""),
              rows: Array.isArray(groupData?.rows) ? groupData.rows : [],
              dateHeader: "YOUR LAST ACTIVITY",
              dateResolver: (row) => row.baseline,
              sectionKey: groupKey,
              lastCheckedAt,
              actorsMapFromPayload,
              isOpen: resolvePrSectionOpenStateSafe(
                prSectionOpenState,
                groupKey,
                Boolean(groupData?.defaultOpen),
              ),
              isSmartGroup: true,
            }))
          : [];

      // Build lifecycle sections (mutually exclusive)
      const lifecycleSections = [
        {
          title: "Open PRs",
          rows: grouped?.open || [],
          dateHeader: "YOUR LAST ACTIVITY",
          dateResolver: (row) => row.baseline,
          sectionKey: "open",
          lastCheckedAt,
          actorsMapFromPayload,
          isOpen: resolvePrSectionOpenStateSafe(prSectionOpenState, "open", false),
          isSmartGroup: false,
        },
        {
          title: "Draft PRs",
          rows: grouped?.draft || [],
          dateHeader: "YOUR LAST ACTIVITY",
          dateResolver: (row) => row.baseline,
          sectionKey: "draft",
          lastCheckedAt,
          actorsMapFromPayload,
          isOpen: resolvePrSectionOpenStateSafe(prSectionOpenState, "draft", false),
          isSmartGroup: false,
        },
        {
          title: "Closed PRs",
          rows: grouped?.closed || [],
          dateHeader: "CLOSED AT",
          dateResolver: (row) => row.closedAt,
          sectionKey: "closed",
          lastCheckedAt,
          actorsMapFromPayload,
          isOpen: resolvePrSectionOpenStateSafe(prSectionOpenState, "closed", false),
          isSmartGroup: false,
        },
        {
          title: "Latest Merged PRs",
          rows: grouped?.merged || [],
          dateHeader: "MERGED AT",
          dateResolver: (row) => row.mergedAt,
          sectionKey: "merged",
          lastCheckedAt,
          actorsMapFromPayload,
          isOpen: resolvePrSectionOpenStateSafe(prSectionOpenState, "merged", false),
          isSmartGroup: false,
        },
      ];

      // Return smart groups first, then lifecycle sections
      return [...smartGroupSections, ...lifecycleSections];
    };

    return {
      buildPrSectionConfigs,
    };
  };

  return {
    createPrSectionConfigHelpers,
  };
});
