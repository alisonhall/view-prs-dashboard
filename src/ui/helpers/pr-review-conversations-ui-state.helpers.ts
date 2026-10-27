import type { PrData } from "../types/pr-data.ts";
import type { ConversationFilter } from "./pr-review-threads.helpers.ts";

// The Conversations tab's per-PR view setting: the key it's remembered
// under (the PR URL, else "repo#number") and its default.
export type ConversationFilterMode = ConversationFilter;

export interface ReviewConversationsUiState {
  conversationFilterMode: ConversationFilterMode;
}

const CONVERSATION_FILTER_MODES: readonly string[] = ["unresolved", "waiting", "all"];

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

  // Unresolved unless a known mode was saved.
  const normalizeReviewConversationsUiState = (
    saved: { conversationFilterMode?: unknown } | null | undefined,
  ): ReviewConversationsUiState => {
    const mode = String(saved?.conversationFilterMode || "")
      .trim()
      .toLowerCase();

    return {
      conversationFilterMode: CONVERSATION_FILTER_MODES.includes(mode)
        ? (mode as ConversationFilterMode)
        : "unresolved",
    };
  };

  return {
    getReviewConversationsStateKey,
    normalizeReviewConversationsUiState,
  };
};

export { createPrReviewConversationsUiStateHelpers };
