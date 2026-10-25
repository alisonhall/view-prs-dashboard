import type { PrEntry, PrFlagsByRepo } from "../types/pr-data.ts";

// Smart groups: accordion sections a PR can appear in alongside its
// lifecycle section (Flagged, In Review, Needs Attention, Open PRs I'm
// Involved In), each defined by a predicate over the entry.

export interface PrSmartGroupsDeps {
  hasNeedsAttentionFlag?: (entry: PrEntry) => boolean;
  hasUserInteraction?: (entry: PrEntry) => boolean;
}

export interface SmartGroupConfig {
  groupKey: string;
  title: string;
  icon: string;
  predicate: (entry: PrEntry) => boolean;
  defaultOpen: boolean;
}

export interface SmartGroup<E extends PrEntry> {
  title: string;
  icon: string;
  rows: E[];
  count: number;
  defaultOpen: boolean;
}

const createPrSmartGroupsHelpers = ({
  hasNeedsAttentionFlag,
  hasUserInteraction,
}: PrSmartGroupsDeps = {}) => {
  const hasNeedsAttentionFlagSafe =
    typeof hasNeedsAttentionFlag === "function"
      ? hasNeedsAttentionFlag
      : () => false;

  const hasUserInteractionSafe =
    typeof hasUserInteraction === "function" ? hasUserInteraction : () => false;

  const isFlagged = (entry: PrEntry, flaggedByRepo: PrFlagsByRepo = {}, repo: string = ""): boolean => {
    const prNumber = String(entry?.data?.number || entry?.prNumber || "");
    const repoKey = String(repo || entry?.repo || "");
    const flaggedSet = flaggedByRepo?.[repoKey] || {};
    return Boolean(flaggedSet[prNumber]);
  };

  const isInReview = (entry: PrEntry, inReviewByRepo: PrFlagsByRepo = {}, repo: string = ""): boolean => {
    const prNumber = String(entry?.data?.number || entry?.prNumber || "");
    const repoKey = String(repo || entry?.repo || "");
    const inReviewSet = inReviewByRepo?.[repoKey] || {};
    return Boolean(inReviewSet[prNumber]);
  };

  const needsAttention = (entry: PrEntry): boolean => hasNeedsAttentionFlagSafe(entry);

  const hasInteraction = (entry: PrEntry): boolean => hasUserInteractionSafe(entry);

  // The four groups, in display order, with their membership predicates.
  const buildSmartGroupConfigs = ({
    flaggedByRepo = {},
    inReviewByRepo = {},
    repo = "",
  }: {
    flaggedByRepo?: PrFlagsByRepo;
    inReviewByRepo?: PrFlagsByRepo;
    repo?: string;
  } = {}): SmartGroupConfig[] => [
    {
      groupKey: "flagged",
      title: "Flagged",
      icon: "🚩",
      predicate: (entry) => isFlagged(entry, flaggedByRepo, repo),
      defaultOpen: false,
    },
    {
      groupKey: "in-review",
      title: "In Review",
      icon: "👁️",
      predicate: (entry) => isInReview(entry, inReviewByRepo, repo),
      defaultOpen: true,
    },
    {
      groupKey: "needs-attention",
      title: "Needs Attention",
      icon: "⚠️",
      predicate: (entry) => needsAttention(entry),
      defaultOpen: true,
    },
    {
      groupKey: "interacted",
      title: "Open PRs I'm Involved In",
      icon: "💬",
      predicate: (entry) => hasInteraction(entry),
      defaultOpen: false,
    },
  ];

  // Each group's matching rows, keyed by groupKey. A predicate that throws
  // just leaves that row out.
  const applySmartGroups = <E extends PrEntry>(
    allRows: E[] | null | undefined,
    smartGroupConfigs: Array<Partial<SmartGroupConfig> | null | undefined> | null | undefined,
  ): Record<string, SmartGroup<E>> => {
    const safeRows = Array.isArray(allRows) ? allRows : [];
    const safeConfigs = Array.isArray(smartGroupConfigs) ? smartGroupConfigs : [];

    const result: Record<string, SmartGroup<E>> = {};

    safeConfigs.forEach((config) => {
      const predicate = config?.predicate;
      if (!config || typeof predicate !== "function") {
        return;
      }

      const matchingRows = safeRows.filter((entry) => {
        try {
          return predicate(entry);
        } catch (_err) {
          return false;
        }
      });

      result[String(config.groupKey)] = {
        title: config.title || "",
        icon: config.icon || "",
        rows: matchingRows,
        count: matchingRows.length,
        defaultOpen: Boolean(config.defaultOpen),
      };
    });

    return result;
  };

  return {
    isFlagged,
    isInReview,
    needsAttention,
    hasInteraction,
    buildSmartGroupConfigs,
    applySmartGroups,
  };
};

export { createPrSmartGroupsHelpers };
