const {
  createPrReviewConversationsUiStateHelpers,
} = require("./pr-review-conversations-ui-state.helpers.js");

describe("pr review conversations ui state helpers", () => {
  describe("getReviewConversationsStateKey", () => {
    test("given a row with a url, when deriving the key, then the url is used", () => {
      const { getReviewConversationsStateKey } = createPrReviewConversationsUiStateHelpers();

      expect(getReviewConversationsStateKey({ url: "https://github.com/o/r/pull/1" })).toBe(
        "https://github.com/o/r/pull/1",
      );
    });

    test("given a row with no url but a repo and number, when deriving the key, then repo#number is used", () => {
      const { getReviewConversationsStateKey } = createPrReviewConversationsUiStateHelpers();

      expect(getReviewConversationsStateKey({ repo: "o/r", number: "5" })).toBe("o/r#5");
    });

    test("given a row with no url, repo, or number, when deriving the key, then an empty string is returned", () => {
      const { getReviewConversationsStateKey } = createPrReviewConversationsUiStateHelpers();

      expect(getReviewConversationsStateKey({})).toBe("");
      expect(getReviewConversationsStateKey()).toBe("");
    });
  });

  describe("normalizeReviewConversationsUiState", () => {
    test("given a valid saved mode and boolean, when normalizing, then both pass through", () => {
      const { normalizeReviewConversationsUiState } = createPrReviewConversationsUiStateHelpers();

      expect(normalizeReviewConversationsUiState({ conversationFilterMode: "resolved", showSummaryCards: false })).toEqual({
        conversationFilterMode: "resolved",
        showSummaryCards: false,
      });
    });

    test("given an invalid or missing mode, when normalizing, then it defaults to unresolved", () => {
      const { normalizeReviewConversationsUiState } = createPrReviewConversationsUiStateHelpers();

      expect(normalizeReviewConversationsUiState({ conversationFilterMode: "bogus" }).conversationFilterMode).toBe(
        "unresolved",
      );
      expect(normalizeReviewConversationsUiState({}).conversationFilterMode).toBe("unresolved");
      expect(normalizeReviewConversationsUiState(null).conversationFilterMode).toBe("unresolved");
    });

    test("given a non-boolean showSummaryCards, when normalizing, then it defaults to true", () => {
      const { normalizeReviewConversationsUiState } = createPrReviewConversationsUiStateHelpers();

      expect(normalizeReviewConversationsUiState({ showSummaryCards: "nope" }).showSummaryCards).toBe(true);
      expect(normalizeReviewConversationsUiState({}).showSummaryCards).toBe(true);
    });

    test("given no saved state at all, when normalizing, then the full default shape is returned", () => {
      const { normalizeReviewConversationsUiState } = createPrReviewConversationsUiStateHelpers();

      expect(normalizeReviewConversationsUiState(null)).toEqual({
        conversationFilterMode: "unresolved",
        showSummaryCards: true,
      });
    });
  });
});
