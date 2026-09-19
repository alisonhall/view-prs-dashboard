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
              dateHeader: "LAST ACTIVITY",
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

      // Lifecycle sections intentionally do NOT deduplicate against smart
      // group membership: per the documented "non-exclusive membership"
      // design (README.md, "Smart group features"), a PR shown in a smart
      // group above (Flagged, In Review, Needs Attention, Open PRs I'm
      // Involved In) is ALSO rendered as its own row here - each instance
      // tracks independent per-section state (see PrRow's compositeKey,
      // `${sectionKey}:${prNumber}`, for "More Insights", and
      // syncSelectionCheckboxesWithInput()/getPrFlags for keeping
      // selection/flag/ack state consistent across every instance of the
      // same PR).
      const lifecycleSections = [
        {
          title: "Open PRs",
          rows: grouped?.open || [],
          dateHeader: "LAST ACTIVITY",
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
          dateHeader: "LAST ACTIVITY",
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
          dateResolver: (row) => row.baseline,
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
          dateResolver: (row) => row.baseline,
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
