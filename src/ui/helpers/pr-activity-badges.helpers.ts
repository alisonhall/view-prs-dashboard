// The activity drawer's request-activity badges (RequestActivityProvider
// builds them; ActivityDrawer shows them through BackfillBadges): "No
// request in progress", or a running count plus one badge per active
// request with its elapsed time and severity class.
export interface ActivityBadge {
  text: string;
  className: string;
}

export interface ActiveRequestEntry {
  label: string;
  elapsedMs?: number | null;
}

export interface PrActivityBadgesDeps {
  withElapsedSuffix?: (label: string, elapsedMs?: number | null) => string;
  getRequestActivitySeverityClass?: (elapsedMs?: number | null) => string;
}

export interface RequestActivityBadgesInput {
  activeEntries?: ActiveRequestEntry[];
  isAutoRunInProgress?: boolean;
  autoRunElapsedMs?: number | null;
}

const createPrActivityBadgesHelpers = ({
  withElapsedSuffix,
  getRequestActivitySeverityClass,
}: PrActivityBadgesDeps = {}) => {
  const withElapsedSuffixSafe =
    typeof withElapsedSuffix === "function" ? withElapsedSuffix : (label: string) => label;
  const getRequestActivitySeverityClassSafe =
    typeof getRequestActivitySeverityClass === "function"
      ? getRequestActivitySeverityClass
      : () => "";

  const getRequestActivityBadges = ({
    activeEntries = [],
    isAutoRunInProgress = false,
    autoRunElapsedMs = null,
  }: RequestActivityBadgesInput = {}): ActivityBadge[] => {
    const totalActive = activeEntries.length + (isAutoRunInProgress ? 1 : 0);

    if (totalActive === 0) {
      return [{ text: "No request in progress", className: "scheduler-badge-idle" }];
    }

    const badges: ActivityBadge[] = [
      {
        text: `${totalActive} request${totalActive === 1 ? "" : "s"} in progress`,
        className: "scheduler-badge-running",
      },
    ];

    if (isAutoRunInProgress) {
      badges.push({
        text: withElapsedSuffixSafe("Auto run", autoRunElapsedMs),
        className: `scheduler-badge-running ${getRequestActivitySeverityClassSafe(autoRunElapsedMs)}`,
      });
    }

    activeEntries.forEach((entry) => {
      badges.push({
        text: withElapsedSuffixSafe(entry.label, entry.elapsedMs),
        className: `scheduler-badge-running ${getRequestActivitySeverityClassSafe(entry.elapsedMs)}`,
      });
    });

    return badges;
  };

  return {
    getRequestActivityBadges,
  };
};

export { createPrActivityBadgesHelpers };
