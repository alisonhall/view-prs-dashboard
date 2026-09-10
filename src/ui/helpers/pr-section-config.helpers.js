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

      // A PR that is a member of a smart group is already rendered as a row
      // at the top of the page. It still counts toward its lifecycle
      // section's "Attention: N" badge (that count is a separate, older
      // feature - see "section headings show needs-attention counts by PR
      // group"), but it must not ALSO be rendered as a second, independent
      // <tr> in the lifecycle section: two rows for the same PR would carry
      // duplicate text/links/checkboxes with no way to distinguish them,
      // and their checkbox/selection state would drift out of sync with
      // each other. `renderRows` (rendered rows) is the deduplicated subset
      // actually passed to the table builder; `rows` (used for counting)
      // stays the full, unfiltered set.
      const smartGroupMemberKeys = new Set();
      Object.values(smartGroups || {}).forEach((groupData) => {
        (Array.isArray(groupData?.rows) ? groupData.rows : []).forEach((entry) => {
          const key = String(entry?.data?.number ?? entry?.prNumber ?? "");
          if (key) smartGroupMemberKeys.add(key);
        });
      });
      const excludeSmartGroupMembers = (rows) =>
        smartGroupMemberKeys.size === 0
          ? rows
          : rows.filter((entry) => {
              const key = String(entry?.data?.number ?? entry?.prNumber ?? "");
              return !key || !smartGroupMemberKeys.has(key);
            });

      // Build lifecycle sections (mutually exclusive)
      const lifecycleSections = [
        {
          title: "Open PRs",
          rows: grouped?.open || [],
          renderRows: excludeSmartGroupMembers(grouped?.open || []),
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
          renderRows: excludeSmartGroupMembers(grouped?.draft || []),
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
          renderRows: excludeSmartGroupMembers(grouped?.closed || []),
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
          renderRows: excludeSmartGroupMembers(grouped?.merged || []),
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
