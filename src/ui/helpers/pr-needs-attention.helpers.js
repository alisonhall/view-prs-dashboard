// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsNeedsAttentionHelpers fallback.
export const { createPrNeedsAttentionHelpers } = (() => {
  const createPrNeedsAttentionHelpers = ({
    asArray = (value) => (Array.isArray(value) ? value : []),
    isChangedStatus = (status) => String(status || "").startsWith("CHANGED"),
    getEffectiveViewerLogin = () => "",
    collectAssignedUsers = () => [],
    collectRequestedReviewers = () => [],
    countPendingThreadComments = () => 0,
  } = {}) => {
    const parseChangedReasonTokens = (row = {}) => {
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

    const isMergeCommitHeadline = (messageHeadline = "") =>
      /^Merge\b/i.test(String(messageHeadline || "").trim());

    const shouldTreatChangedAsAttention = (row = {}, config = {}) => {
      if (!isChangedStatus(row?.status)) return false;
      if (!config?.ignoreMergeOnlyCommits) return true;

      const tokens = parseChangedReasonTokens(row);
      if (tokens.length === 0) return true;
      if (tokens.some((token) => token !== "commit")) return true;

      return asArray(row?.commits).some(
        (commit) => !isMergeCommitHeadline(commit?.messageHeadline),
      );
    };

    const shouldTreatNoActivityAsAttention = (row = {}, config = {}) => {
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
    }) => {
      const changedAttention = shouldTreatChangedAsAttention(row, config);
      const noActivityAttention = shouldTreatNoActivityAsAttention(row, config);

      if (hasPendingComments && config.includePendingComments) {
        return true;
      }

      if (sectionKey === "open") {
        return changedAttention || noActivityAttention;
      }

      if (sectionKey === "merged" || sectionKey === "closed") {
        return (
          config.includeClosedMerged && (changedAttention || noActivityAttention)
        );
      }

      if (sectionKey === "draft") {
        return (
          (config.includeDraftChanged && changedAttention) ||
          (config.includeDraftNoActivity && noActivityAttention)
        );
      }

      return false;
    };

    const entryNeedsAttention = (entry = {}, config = {}) => {
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

    const entryHasYourLastActivity = (entry = {}) => {
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

  return {
    createPrNeedsAttentionHelpers,
  };
})();
