import type { PrCommit, PrData, PrEntry } from "../types/pr-data.ts";
import { getMergeCommitMatcher, type MergeCommitRules } from "./pr-merge-commit-rules.helpers.ts";

// The "Needs attention" rules (configured under "Advanced visibility and
// attention rules"): whether a PR's change or lack of activity should flag
// it, per section, plus the "you've interacted with it" check.

// The attention options from user defaults (NeedsAttentionProvider maps
// the form fields onto these).
export interface AttentionConfig {
  ignoreMergeOnlyCommits?: boolean;
  // What counts as a merge commit (defaults to DEFAULT_MERGE_COMMIT_RULES).
  mergeCommitRules?: MergeCommitRules;
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
  // How many, for the reason's wording; optional.
  pendingCommentCount?: number;
  config?: AttentionConfig;
}

// What each change-reason token from check-open-pr-updates.sh's
// build_reasons means. An unknown token is shown as it is.
const CHANGE_REASON_TEXT: Record<string, string> = {
  "unanswered-thread": "Unanswered review threads",
  "thread-reply": "New replies in review threads",
  comment: "New comments",
  review: "New reviews",
  commit: "New commits",
  "ack-cleared": "Ack was cleared",
};

const NO_ACTIVITY_TEXT: Record<string, string> = {
  "assigned-only": "No recent activity on a PR assigned to you",
  "reviewer-only": "No recent activity on a PR you're reviewing",
};

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

  const shouldTreatChangedAsAttention = (row: PrData = {}, config: AttentionConfig = {}): boolean => {
    if (!isChangedStatus(row?.status)) return false;
    if (!config?.ignoreMergeOnlyCommits) return true;

    const tokens = parseChangedReasonTokens(row);
    if (tokens.length === 0) return true;
    if (tokens.some((token) => token !== "commit")) return true;

    const isMergeCommit = getMergeCommitMatcher(config?.mergeCommitRules);
    return (asArray(row?.commits) as PrCommit[]).some((commit) => !isMergeCommit(commit));
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

  // Whether this section counts a change / a lack of activity at all:
  // always for open PRs, by setting for closed/merged and drafts, never
  // for any other section key.
  const sectionCountsChanges = (sectionKey: string, config: AttentionConfig): boolean =>
    sectionKey === "open" ||
    ((sectionKey === "merged" || sectionKey === "closed") && Boolean(config.includeClosedMerged)) ||
    (sectionKey === "draft" && Boolean(config.includeDraftChanged));
  const sectionCountsNoActivity = (sectionKey: string, config: AttentionConfig): boolean =>
    sectionKey === "open" ||
    ((sectionKey === "merged" || sectionKey === "closed") && Boolean(config.includeClosedMerged)) ||
    (sectionKey === "draft" && Boolean(config.includeDraftNoActivity));

  // Same modes as shouldTreatNoActivityAsAttention: any value other than
  // "all", "none", "assigned-only" and "reviewer-only" means "mine-only".
  const describeNoActivity = (config: AttentionConfig): string => {
    const mode = String(config?.noActivityMode || "all")
      .trim()
      .toLowerCase();
    if (mode === "all") return "No recent activity";
    return NO_ACTIVITY_TEXT[mode] ?? "No recent activity on a PR assigned to you or that you're reviewing";
  };

  const describeChange = (row: PrData): string[] => {
    const tokens = parseChangedReasonTokens(row);
    if (tokens.length === 0) return ["Changed since your last ack"];
    return tokens.map((token) => CHANGE_REASON_TEXT[token] ?? `Changed: ${token}`);
  };

  // Why a PR needs attention, in words (the attention icon's tooltip, the
  // row summary). Empty when it doesn't: this is the one definition, and
  // shouldShowNeedsAttention is "has any reason".
  const getNeedsAttentionReasons = ({
    row = {},
    sectionKey = "",
    hasPendingComments = false,
    pendingCommentCount,
    config = {},
  }: ShouldShowNeedsAttentionInput): string[] => {
    const reasons: string[] = [];

    if (hasPendingComments && config.includePendingComments) {
      reasons.push(
        pendingCommentCount && pendingCommentCount > 0
          ? `${pendingCommentCount} unsubmitted pending comment${pendingCommentCount === 1 ? "" : "s"}`
          : "Unsubmitted pending comments",
      );
    }

    if (sectionCountsChanges(sectionKey, config) && shouldTreatChangedAsAttention(row, config)) {
      reasons.push(...describeChange(row));
    }

    if (sectionCountsNoActivity(sectionKey, config) && shouldTreatNoActivityAsAttention(row, config)) {
      reasons.push(describeNoActivity(config));
    }

    return reasons;
  };

  const shouldShowNeedsAttention = (input: ShouldShowNeedsAttentionInput): boolean =>
    getNeedsAttentionReasons(input).length > 0;

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
    shouldTreatChangedAsAttention,
    shouldTreatNoActivityAsAttention,
    getNeedsAttentionReasons,
    shouldShowNeedsAttention,
    entryNeedsAttention,
    entryHasYourLastActivity,
  };
};

export { createPrNeedsAttentionHelpers };
