import type { PrData, PrEntry } from "../types/pr-data.ts";
import type { GroupedPrSections } from "./pr-section-grouping.helpers.ts";

// The PR table's section list (PrTableApp): the smart groups first, then
// the four lifecycle sections, each with its title, rows, date column and
// open/closed state.
export interface SmartGroupData {
  title?: string;
  icon?: string;
  rows?: PrEntry[];
  defaultOpen?: boolean;
}

export interface PrSectionConfig {
  title: string;
  icon?: string;
  rows: PrEntry[];
  dateHeader: string;
  dateResolver: (row: PrData & { baseline?: string }) => string | undefined;
  sectionKey: string;
  lastCheckedAt: string;
  actorsMapFromPayload: Record<string, unknown>;
  isOpen: boolean;
  isSmartGroup: boolean;
}

export interface PrSectionConfigDeps {
  resolvePrSectionOpenState?: (openState: unknown, sectionKey: string, fallbackOpen: boolean) => boolean;
}

export interface BuildPrSectionConfigsInput {
  grouped?: Partial<GroupedPrSections<PrEntry>> | null;
  smartGroups?: Record<string, SmartGroupData> | null;
  prSectionOpenState?: unknown;
  lastCheckedAt?: string;
  actorsMapFromPayload?: Record<string, unknown>;
}

const baselineOf = (row: PrData & { baseline?: string }) => row.baseline;

const createPrSectionConfigHelpers = ({ resolvePrSectionOpenState }: PrSectionConfigDeps = {}) => {
  const resolvePrSectionOpenStateSafe =
    typeof resolvePrSectionOpenState === "function"
      ? resolvePrSectionOpenState
      : (_openState: unknown, _sectionKey: string, fallbackOpen: boolean) => Boolean(fallbackOpen);

  const buildPrSectionConfigs = ({
    grouped,
    smartGroups = null,
    prSectionOpenState,
    lastCheckedAt = "",
    actorsMapFromPayload = {},
  }: BuildPrSectionConfigsInput = {}): PrSectionConfig[] => {
    // Build smart group sections (non-exclusive, appear above lifecycle sections)
    const smartGroupSections: PrSectionConfig[] =
      smartGroups && typeof smartGroups === "object"
        ? Object.entries(smartGroups).map(([groupKey, groupData]) => ({
            title: String(groupData?.title || ""),
            icon: String(groupData?.icon || ""),
            rows: Array.isArray(groupData?.rows) ? groupData.rows : [],
            dateHeader: "LAST ACTIVITY",
            dateResolver: baselineOf,
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
    // built by pr-row-keys.js's buildExpandedInsightsKey, for "More
    // Insights"), while state shared by every instance of the same PR
    // stays consistent because each reads one source: selection from the
    // "PR number(s)" field (PrSelectionCell, via FilterStateProvider) and
    // flags/ack from PrTableApp's getPrFlags.
    const lifecycleSections: PrSectionConfig[] = [
      {
        title: "Open PRs",
        rows: grouped?.open || [],
        dateHeader: "LAST ACTIVITY",
        dateResolver: baselineOf,
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
        dateResolver: baselineOf,
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
        dateResolver: baselineOf,
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
        dateResolver: baselineOf,
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

export { createPrSectionConfigHelpers };
