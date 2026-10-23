import type { PrData } from "../types/pr-data.ts";

// ReviewThreadsSection's per-PR view settings: the key they're remembered
// under (the PR URL, else "repo#number") and their defaults.
export type ConversationFilterMode = "all" | "unresolved" | "resolved";

export interface ReviewConversationsUiState {
  conversationFilterMode: ConversationFilterMode;
  showSummaryCards: boolean;
}

const CONVERSATION_FILTER_MODES: readonly string[] = ["all", "unresolved", "resolved"];

const createPrReviewConversationsUiStateHelpers = () => {
  const getReviewConversationsStateKey = (row: (PrData & { repo?: string }) | null | undefined): string => {
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

  const normalizeReviewConversationsUiState = (
    saved: { conversationFilterMode?: unknown; showSummaryCards?: unknown } | null | undefined,
  ): ReviewConversationsUiState => {
    const mode = String(saved?.conversationFilterMode || "")
      .trim()
      .toLowerCase();

    return {
      conversationFilterMode: CONVERSATION_FILTER_MODES.includes(mode)
        ? (mode as ConversationFilterMode)
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

export { createPrReviewConversationsUiStateHelpers };
