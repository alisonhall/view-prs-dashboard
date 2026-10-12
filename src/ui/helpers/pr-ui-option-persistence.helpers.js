// Phase E (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"): moved
// out of index.page.js verbatim - these 4 pieces have no DOM dependency
// (pure data + 2 fetch calls), so they're trivially portable to wherever
// persist/restore logic ends up living (FilterStateProvider.jsx).
export const { createPrUiOptionPersistenceHelpers } = (() => {
  const createPrUiOptionPersistenceHelpers = ({ fetch: fetchFn } = {}) => {
    const getUiOptionDefaults = () => ({
      repo: "",
      limit: "",
      "merged-limit": "",
      jobs: "",
      "pr-numbers": "",
      "open-mode": "none",
      "ack-changed": false,
      "show-reason": true,
      quiet: false,
      "scope-mode": "all",
      "filter-pr-numbers": "",
      label: "",
      "exclude-label": "",
      author: [],
      assigned: [],
      approver: [],
      "always-show-in-review": false,
      "attention-no-activity-mode": "all",
      "attention-include-pending-comments": true,
      "attention-ignore-merge-only-commits": false,
      "attention-include-closed-merged": true,
      "attention-include-draft-changed": true,
      "attention-include-draft-no-activity": false,
      "attention-author-thread-resolution-mode": "allow-all",
      "attention-author-thread-resolution-allow": [],
      "attention-author-thread-resolution-deny": [],
      "change-filter-use-builtin-merge-pattern": true,
      "filter-custom-comments": "",
      "filter-other-notes": "",
      "filter-pr-difficulty": "",
      "filter-rally-stories": "",
      "filter-rally-links": "",
      "filter-analysis-of-pr": "",
    });

    // Single source of truth mapping a DOM field id (the shape
    // /view-prs/user-defaults stores overrides under) to its
    // FilterStateProvider Context key - same map index.page.js's
    // FILTER_STATE_FIELD_MAP used to be, moved here since both the
    // restore effect and the persist callbacks (FilterStateProvider.jsx)
    // need it.
    const FILTER_STATE_FIELD_MAP = {
      "scope-mode": "scopeMode",
      "always-show-in-review": "alwaysShowInReview",
      "attention-no-activity-mode": "attentionNoActivityMode",
      "attention-include-pending-comments": "attentionIncludePendingComments",
      "attention-ignore-merge-only-commits": "attentionIgnoreMergeOnlyCommits",
      "attention-include-closed-merged": "attentionIncludeClosedMerged",
      "attention-include-draft-changed": "attentionIncludeDraftChanged",
      "attention-include-draft-no-activity": "attentionIncludeDraftNoActivity",
      repo: "repo",
      limit: "limit",
      "merged-limit": "mergedLimit",
      jobs: "jobs",
      "pr-numbers": "prNumbersInput",
      "open-mode": "openMode",
      "ack-changed": "ackChanged",
      "show-reason": "showReason",
      quiet: "quiet",
      "filter-pr-numbers": "filterPrNumbers",
      "attention-author-thread-resolution-mode": "attentionAuthorThreadResolutionMode",
      "change-filter-use-builtin-merge-pattern": "changeFilterUseBuiltinMergePattern",
      "change-filter-ignore-commit-patterns": "changeFilterIgnoreCommitPatterns",
      "filter-custom-comments": "filterCustomComments",
      "filter-other-notes": "filterOtherNotes",
      "filter-pr-difficulty": "filterPrDifficulty",
      "filter-rally-stories": "filterRallyStories",
      "filter-rally-links": "filterRallyLinks",
      "filter-analysis-of-pr": "filterAnalysisOfPr",
    };

    const readUiSessionOverrides = async () => {
      try {
        const response = await fetchFn("/view-prs/user-defaults");
        if (!response.ok) return {};
        const result = await response.json();
        const parsed = result?.overrides;
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
      } catch (_error) {
        return {};
      }
    };

    const writeUiSessionOverrides = async (overrides, { preserveEmptyArrayKeys = [] } = {}) => {
      const preserveSet = new Set(
        Array.isArray(preserveEmptyArrayKeys) ? preserveEmptyArrayKeys : [],
      );
      const entries = Object.entries(overrides || {}).filter(([key, value]) => {
        if (Array.isArray(value)) {
          return value.length > 0 || preserveSet.has(String(key));
        }
        return value !== undefined;
      });

      const data = Object.fromEntries(entries);

      try {
        await fetchFn("/view-prs/user-defaults", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
      } catch (_error) {
        // Best effort only.
      }
    };

    return {
      getUiOptionDefaults,
      FILTER_STATE_FIELD_MAP,
      readUiSessionOverrides,
      writeUiSessionOverrides,
    };
  };

  return {
    createPrUiOptionPersistenceHelpers,
  };
})();
