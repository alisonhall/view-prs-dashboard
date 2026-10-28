import type { PrEntry, PrFlagsByRepo } from "../types/pr-data.ts";

// Smart groups: accordion sections a PR can appear in alongside its
// lifecycle section (Flagged, In Review, Needs Attention, the viewer's own
// open and draft PRs, those assigned to them, those requesting their
// review, Open PRs I'm Involved In), each defined by a predicate over the
// entry.

export interface PrSmartGroupsDeps {
  hasNeedsAttentionFlag?: (entry: PrEntry) => boolean;
  hasUserInteraction?: (entry: PrEntry) => boolean;
  // The viewer's login for a PR ("" when unknown), and how logins are
  // compared (aliases resolved; trimmed and lowercased without it).
  getViewerLogin?: (entry: PrEntry) => string;
  normalizeLogin?: (login: unknown) => string;
  getAssigneeLogins?: (entry: PrEntry) => string[];
  getRequestedReviewerLogins?: (entry: PrEntry) => string[];
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
  getViewerLogin = () => "",
  normalizeLogin = (login) => String(login ?? "").trim().toLowerCase(),
  getAssigneeLogins = () => [],
  getRequestedReviewerLogins = () => [],
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

  // The viewer's open and draft PRs only: these sections are for what's
  // still in progress.
  const isOpenOrDraft = (entry: PrEntry): boolean => ["open", "draft"].includes(String(entry?.section || "").toLowerCase());
  const loginKey = (login: unknown): string => String(normalizeLogin(login) || "").trim().toLowerCase();
  const viewerKey = (entry: PrEntry): string => loginKey(getViewerLogin(entry));
  const isAuthoredByViewer = (entry: PrEntry, viewer: string): boolean => loginKey(entry?.data?.authorLogin) === viewer;

  const isMyOpenPr = (entry: PrEntry): boolean => {
    const viewer = viewerKey(entry);
    return Boolean(viewer) && isOpenOrDraft(entry) && isAuthoredByViewer(entry, viewer);
  };

  const isAssignedToMe = (entry: PrEntry): boolean => {
    const viewer = viewerKey(entry);
    return Boolean(viewer) && isOpenOrDraft(entry) && getAssigneeLogins(entry).some((login) => loginKey(login) === viewer);
  };

  // Someone else's PR whose review is currently requested from the viewer
  // (GitHub drops the request once they submit a review).
  const isReviewRequestedFromMe = (entry: PrEntry): boolean => {
    const viewer = viewerKey(entry);
    return (
      Boolean(viewer) &&
      isOpenOrDraft(entry) &&
      !isAuthoredByViewer(entry, viewer) &&
      getRequestedReviewerLogins(entry).some((login) => loginKey(login) === viewer)
    );
  };

  // The groups, in display order, with their membership predicates.
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
      groupKey: "mine",
      title: "My Open & Draft PRs",
      icon: "🙋",
      predicate: (entry) => isMyOpenPr(entry),
      defaultOpen: true,
    },
    {
      groupKey: "assigned-to-me",
      title: "Assigned to Me",
      icon: "📌",
      predicate: (entry) => isAssignedToMe(entry),
      defaultOpen: true,
    },
    {
      groupKey: "review-requested",
      title: "Me as Reviewer",
      icon: "🔍",
      predicate: (entry) => isReviewRequestedFromMe(entry),
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
    isMyOpenPr,
    isAssignedToMe,
    isReviewRequestedFromMe,
    buildSmartGroupConfigs,
    applySmartGroups,
  };
};

export { createPrSmartGroupsHelpers };
