(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsSmartGroupsHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  /**
   * Factory for creating smart group helpers.
   * Smart groups allow PRs to appear in multiple accordion sections based on
   * flags, status, and metadata (unlike lifecycle sections which are mutually exclusive).
   *
   * @param {Object} deps - Dependencies
   * @param {Function} deps.hasNeedsAttentionFlag - Check if PR needs attention
   * @param {Function} deps.hasUserInteraction - Check if user has interacted with PR
   * @returns {Object} Helper functions for smart groups
   */
  const createPrSmartGroupsHelpers = ({
    hasNeedsAttentionFlag,
    hasUserInteraction,
  } = {}) => {
    // Safe wrappers for dependency injection
    const hasNeedsAttentionFlagSafe =
      typeof hasNeedsAttentionFlag === "function"
        ? hasNeedsAttentionFlag
        : () => false;

    const hasUserInteractionSafe =
      typeof hasUserInteraction === "function" ? hasUserInteraction : () => false;

    /**
     * Check if a PR is flagged.
     *
     * @param {Object} entry - PR entry
     * @param {Object} flaggedByRepo - Flagged PRs by repo
     * @param {string} repo - Current repo
     * @returns {boolean} True if PR is flagged
     */
    const isFlagged = (entry, flaggedByRepo = {}, repo = "") => {
      const prNumber = String(entry?.data?.number || entry?.prNumber || "");
      const repoKey = String(repo || entry?.repo || "");
      const flaggedSet = flaggedByRepo?.[repoKey] || {};
      return Boolean(flaggedSet[prNumber]);
    };

    /**
     * Check if a PR is in review.
     *
     * @param {Object} entry - PR entry
     * @param {Object} inReviewByRepo - In-review PRs by repo
     * @param {string} repo - Current repo
     * @returns {boolean} True if PR is in review
     */
    const isInReview = (entry, inReviewByRepo = {}, repo = "") => {
      const prNumber = String(entry?.data?.number || entry?.prNumber || "");
      const repoKey = String(repo || entry?.repo || "");
      const inReviewSet = inReviewByRepo?.[repoKey] || {};
      return Boolean(inReviewSet[prNumber]);
    };

    /**
     * Check if a PR needs attention.
     *
     * @param {Object} entry - PR entry
     * @returns {boolean} True if PR needs attention
     */
    const needsAttention = (entry) => {
      return hasNeedsAttentionFlagSafe(entry);
    };

    /**
     * Check if user has interacted with a PR.
     *
     * @param {Object} entry - PR entry
     * @returns {boolean} True if user has interacted
     */
    const hasInteraction = (entry) => {
      return hasUserInteractionSafe(entry);
    };

    /**
     * Build smart group configurations with predicates.
     * These configs define which PRs belong in each smart group.
     *
     * @param {Object} params - Parameters
     * @param {Object} params.flaggedByRepo - Flagged PRs by repo
     * @param {Object} params.inReviewByRepo - In-review PRs by repo
     * @param {string} params.repo - Current repo key
     * @returns {Array} Array of smart group configs
     */
    const buildSmartGroupConfigs = ({
      flaggedByRepo = {},
      inReviewByRepo = {},
      repo = "",
    } = {}) => [
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

    /**
     * Apply smart group filters to PR rows.
     * Returns grouped PRs where each group contains matching rows.
     *
     * @param {Array} allRows - All PR rows
     * @param {Array} smartGroupConfigs - Smart group configurations
     * @returns {Object} Smart groups with filtered rows
     */
    const applySmartGroups = (allRows, smartGroupConfigs) => {
      const safeRows = Array.isArray(allRows) ? allRows : [];
      const safeConfigs = Array.isArray(smartGroupConfigs) ? smartGroupConfigs : [];

      const result = {};

      safeConfigs.forEach((config) => {
        if (!config || typeof config.predicate !== "function") {
          return;
        }

        const matchingRows = safeRows.filter((entry) => {
          try {
            return config.predicate(entry);
          } catch (_err) {
            return false;
          }
        });

        result[config.groupKey] = {
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

  return {
    createPrSmartGroupsHelpers,
  };
});
