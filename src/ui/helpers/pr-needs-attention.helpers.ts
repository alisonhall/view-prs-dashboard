import type { PrData, PrEntry } from "../types/pr-data.ts";

// The "Needs attention" rules (configured under "Advanced visibility and
// attention rules"): whether a PR's change or lack of activity should flag
// it, per section, plus the "you've interacted with it" check.

// The attention options from user defaults (NeedsAttentionProvider maps
// the form fields onto these).
export interface AttentionConfig {
  ignoreMergeOnlyCommits?: boolean;
  noActivityMode?: string;
  includePendingComments?: boolean;
  includeClosedMerged?: boolean;
  includeDraftChanged?: boolean;
  includeDraftNoActivity?: boolean;
}

interface LoginRecord {
  login?: string;
}

export interface PrNeedsAttentionDeps {
  asArray?: (value: unknown) => unknown[];
  isChangedStatus?: (status: unknown) => boolean;
  getEffectiveViewerLogin?: (row: PrData) => string;
  collectAssignedUsers?: (row: PrData) => LoginRecord[];
  collectRequestedReviewers?: (row: PrData) => LoginRecord[];
  countPendingThreadComments?: (row: PrData) => number;
}

export interface ShouldShowNeedsAttentionInput {
  row?: PrData;
  sectionKey?: string;
  hasPendingComments?: boolean;
  config?: AttentionConfig;
}

const createPrNeedsAttentionHelpers = ({
  asArray = (value: unknown) => (Array.isArray(value) ? value : []),
  isChangedStatus = (status: unknown) => String(status || "").startsWith("CHANGED"),
  getEffectiveViewerLogin = () => "",
  collectAssignedUsers = () => [],
  collectRequestedReviewers = () => [],
  countPendingThreadComments = () => 0,
}: PrNeedsAttentionDeps = {}) => {
  const parseChangedReasonTokens = (row: PrData = {}): string[] => {
    const reason = String(row?.reason || "").trim();
    if (reason && reason !== "-") {
      return reason
        .split("|")
        .map((token) =>
          String(token || "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean);
    }

    const status = String(row?.status || "").trim();
    const statusReasonMatch = status.match(/^CHANGED\(([^)]+)\)/i);
    if (!statusReasonMatch || !statusReasonMatch[1]) return [];
    return String(statusReasonMatch[1])
      .split(/[|,]/)
      .map((token) =>
        String(token || "")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean);
  };

  const isMergeCommitHeadline = (messageHeadline: unknown = ""): boolean =>
    /^Merge\b/i.test(String(messageHeadline || "").trim());

  const shouldTreatChangedAsAttention = (row: PrData = {}, config: AttentionConfig = {}): boolean => {
    if (!isChangedStatus(row?.status)) return false;
    if (!config?.ignoreMergeOnlyCommits) return true;

    const tokens = parseChangedReasonTokens(row);
    if (tokens.length === 0) return true;
    if (tokens.some((token) => token !== "commit")) return true;

    return (asArray(row?.commits) as { messageHeadline?: string }[]).some(
      (commit) => !isMergeCommitHeadline(commit?.messageHeadline),
    );
  };

  const shouldTreatNoActivityAsAttention = (row: PrData = {}, config: AttentionConfig = {}): boolean => {
    if (String(row?.status || "") !== "NO_ACTIVITY") return false;

    const mode = String(config?.noActivityMode || "all")
      .trim()
      .toLowerCase();
    if (mode === "none") return false;
    if (mode === "all") return true;

    const viewerLogin = getEffectiveViewerLogin(row);
    if (!viewerLogin) return false;

    const isAssignedToMe = () =>
      collectAssignedUsers(row).some(
        (person) =>
          String(person?.login || "")
            .trim()
            .toLowerCase() === viewerLogin,
      );
    const isReviewerMe = () =>
      collectRequestedReviewers(row).some(
        (person) =>
          String(person?.login || "")
            .trim()
            .toLowerCase() === viewerLogin,
      );

    if (mode === "assigned-only") return isAssignedToMe();
    if (mode === "reviewer-only") return isReviewerMe();

    // "mine-only" (and any other/legacy value): either assigned to me or
    // I'm a requested reviewer.
    return isAssignedToMe() || isReviewerMe();
  };

  const shouldShowNeedsAttention = ({
    row = {},
    sectionKey = "",
    hasPendingComments = false,
    config = {},
  }: ShouldShowNeedsAttentionInput): boolean => {
    const changedAttention = shouldTreatChangedAsAttention(row, config);
    const noActivityAttention = shouldTreatNoActivityAsAttention(row, config);

    if (hasPendingComments && config.includePendingComments) {
      return true;
    }

    if (sectionKey === "open") {
      return changedAttention || noActivityAttention;
    }

    if (sectionKey === "merged" || sectionKey === "closed") {
      return Boolean(
        config.includeClosedMerged && (changedAttention || noActivityAttention),
      );
    }

    if (sectionKey === "draft") {
      return Boolean(
        (config.includeDraftChanged && changedAttention) ||
          (config.includeDraftNoActivity && noActivityAttention),
      );
    }

    return false;
  };

  const entryNeedsAttention = (entry: PrEntry = {}, config: AttentionConfig = {}): boolean => {
    const row = entry?.data || {};

    const sectionKey = String(entry?.section || "")
      .trim()
      .toLowerCase();
    const hasPendingComments = countPendingThreadComments(row) > 0;

    return shouldShowNeedsAttention({
      row,
      sectionKey,
      hasPendingComments,
      config,
    });
  };

  const entryHasYourLastActivity = (entry: PrEntry = {}): boolean => {
    const row = entry?.data || {};
    const baseline = String(row?.baseline || "").trim();
    return Boolean(baseline && baseline !== "-");
  };

  return {
    parseChangedReasonTokens,
    isMergeCommitHeadline,
    shouldTreatChangedAsAttention,
    shouldTreatNoActivityAsAttention,
    shouldShowNeedsAttention,
    entryNeedsAttention,
    entryHasYourLastActivity,
  };
};

export { createPrNeedsAttentionHelpers };
