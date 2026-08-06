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
      prSectionOpenState,
      lastCheckedAt = "",
      actorsMapFromPayload = {},
    } = {}) => [
      {
        title: "Open PRs",
        rows: grouped?.open || [],
        dateHeader: "YOUR LAST ACTIVITY",
        dateResolver: (row) => row.baseline,
        sectionKey: "open",
        lastCheckedAt,
        actorsMapFromPayload,
        isOpen: resolvePrSectionOpenStateSafe(prSectionOpenState, "open", true),
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
      },
      {
        title: "Latest Merged PRs",
        rows: grouped?.merged || [],
        dateHeader: "MERGED AT",
        dateResolver: (row) => row.mergedAt,
        sectionKey: "merged",
        lastCheckedAt,
        actorsMapFromPayload,
        isOpen: resolvePrSectionOpenStateSafe(prSectionOpenState, "merged", true),
      },
    ];

    return {
      buildPrSectionConfigs,
    };
  };

  return {
    createPrSectionConfigHelpers,
  };
});
