// Phase 7 (see REACT_MIGRATION_PLAN.md): pure extraction of index.page.js's
// former getReviewConversationsStateKey body, plus the defaulting logic
// that used to live inline in readReviewConversationsUiState, into a
// DI-factory module - so ReviewThreadsSection.jsx can compute the same
// state key and apply the same defaults without a window.* bridge.
// Byte-for-byte-logic-preserving move, genuinely zero-dependency.
export const { createPrReviewConversationsUiStateHelpers } = (() => {
  const createPrReviewConversationsUiStateHelpers = () => {
    const getReviewConversationsStateKey = (row) => {
      const urlKey = String(row?.url || "").trim();
      if (urlKey) {
        return urlKey;
      }

      const repoKey = String(row?.repo || "").trim();
      const prNumberKey = String(row?.number || "").trim();
      if (!repoKey && !prNumberKey) {
        return "";
      }

      return `${repoKey}#${prNumberKey}`;
    };

    const normalizeReviewConversationsUiState = (saved) => {
      const mode = String(saved?.conversationFilterMode || "")
        .trim()
        .toLowerCase();

      return {
        conversationFilterMode: ["all", "unresolved", "resolved"].includes(mode)
          ? mode
          : "unresolved",
        showSummaryCards:
          typeof saved?.showSummaryCards === "boolean" ? saved.showSummaryCards : true,
      };
    };

    return {
      getReviewConversationsStateKey,
      normalizeReviewConversationsUiState,
    };
  };

  return {
    createPrReviewConversationsUiStateHelpers,
  };
})();
