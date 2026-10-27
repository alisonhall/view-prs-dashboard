const {
  createPrReviewConversationsUiStateHelpers,
} = require("./pr-review-conversations-ui-state.helpers.ts");

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
    test.each(["unresolved", "waiting", "all"])("given the saved mode %s, when normalizing, then it passes through", (mode) => {
      const { normalizeReviewConversationsUiState } = createPrReviewConversationsUiStateHelpers();

      expect(normalizeReviewConversationsUiState({ conversationFilterMode: mode })).toEqual({ conversationFilterMode: mode });
    });

    test("given an invalid or missing mode (including the old 'resolved'), when normalizing, then it defaults to unresolved", () => {
      const { normalizeReviewConversationsUiState } = createPrReviewConversationsUiStateHelpers();

      expect(normalizeReviewConversationsUiState({ conversationFilterMode: "bogus" }).conversationFilterMode).toBe(
        "unresolved",
      );
      expect(normalizeReviewConversationsUiState({ conversationFilterMode: "resolved" }).conversationFilterMode).toBe(
        "unresolved",
      );
      expect(normalizeReviewConversationsUiState({}).conversationFilterMode).toBe("unresolved");
      expect(normalizeReviewConversationsUiState(null)).toEqual({ conversationFilterMode: "unresolved" });
    });
  });
});
