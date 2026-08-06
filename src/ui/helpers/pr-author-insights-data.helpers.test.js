/**
 * Author Insights Data Helpers Contract Tests
 * 
 * Validates that data and API helpers work correctly.
 */

const {
  createPrAuthorInsightsDataHelpers,
} = require("./pr-author-insights-data.helpers.js");

describe("pr author insights data helpers", () => {
  const createDependencies = (overrides = {}) => ({
    normalizeActorLogin: (login) => String(login || "").toLowerCase().trim(),
    fetchFn: jest.fn(),
    ...overrides,
  });

  const createAuthorInsightsState = () => ({
    latestRows: null,
    latestActorsMap: null,
    selectedAuthorLogin: "",
    manualCommentsByAuthorLogin: {},
    manualCommentsLoadingByAuthorLogin: {},
    manualCommentsErrorByAuthorLogin: {},
  });

  describe("AUTHOR_COMMENT_SENTIMENT_OPTIONS", () => {
    test("given data helpers, when accessing sentiment options, then options available", () => {
      const helpers = createPrAuthorInsightsDataHelpers(createDependencies());

      expect(helpers.AUTHOR_COMMENT_SENTIMENT_OPTIONS).toEqual([
        { value: "positive", label: "Positive" },
        { value: "negative", label: "Negative" },
        { value: "neutral", label: "Neutral" },
      ]);
    });
  });

  describe("getAuthorManualCommentsForLogin", () => {
    test("given author with comments, when getting comments, then returns comments array", () => {
      const helpers = createPrAuthorInsightsDataHelpers(createDependencies());
      const state = createAuthorInsightsState();
      state.manualCommentsByAuthorLogin["user1"] = [
        { id: "1", note: "Comment 1" },
      ];

      const comments = helpers.getAuthorManualCommentsForLogin("user1", state);

      expect(comments).toHaveLength(1);
      expect(comments[0].note).toBe("Comment 1");
    });

    test("given author without comments, when getting comments, then returns empty array", () => {
      const helpers = createPrAuthorInsightsDataHelpers(createDependencies());
      const state = createAuthorInsightsState();

      const comments = helpers.getAuthorManualCommentsForLogin("user2", state);

      expect(comments).toEqual([]);
    });

    test("given empty author login, when getting comments, then returns empty array", () => {
      const helpers = createPrAuthorInsightsDataHelpers(createDependencies());
      const state = createAuthorInsightsState();

      const comments = helpers.getAuthorManualCommentsForLogin("", state);

      expect(comments).toEqual([]);
    });
  });

  describe("loadAuthorManualComments", () => {
    test("given successful API call, when loading comments, then state updated with comments", async () => {
      const mockComments = [{ id: "1", note: "Test comment" }];
      const fetchFn = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, comments: mockComments }),
      });
      const helpers = createPrAuthorInsightsDataHelpers(
        createDependencies({ fetchFn }),
      );
      const state = createAuthorInsightsState();

      await helpers.loadAuthorManualComments("user1", state);

      expect(state.manualCommentsByAuthorLogin["user1"]).toEqual(mockComments);
      expect(state.manualCommentsLoadingByAuthorLogin["user1"]).toBe(false);
      expect(state.manualCommentsErrorByAuthorLogin["user1"]).toBe("");
    });

    test("given failed API call, when loading comments, then state updated with error", async () => {
      const fetchFn = jest.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ ok: false, error: "Failed to load" }),
      });
      const helpers = createPrAuthorInsightsDataHelpers(
        createDependencies({ fetchFn }),
      );
      const state = createAuthorInsightsState();

      await helpers.loadAuthorManualComments("user1", state);

      expect(state.manualCommentsByAuthorLogin["user1"]).toEqual([]);
      expect(state.manualCommentsErrorByAuthorLogin["user1"]).toBe(
        "Failed to load",
      );
    });

    test("given network error, when loading comments, then state updated with error message", async () => {
      const fetchFn = jest.fn().mockRejectedValue(new Error("Network error"));
      const helpers = createPrAuthorInsightsDataHelpers(
        createDependencies({ fetchFn }),
      );
      const state = createAuthorInsightsState();

      await helpers.loadAuthorManualComments("user1", state);

      expect(state.manualCommentsErrorByAuthorLogin["user1"]).toBe(
        "Network error",
      );
    });

    test("given already loading, when loading comments, then skips loading", async () => {
      const fetchFn = jest.fn();
      const helpers = createPrAuthorInsightsDataHelpers(
        createDependencies({ fetchFn }),
      );
      const state = createAuthorInsightsState();
      state.manualCommentsLoadingByAuthorLogin["user1"] = true;

      await helpers.loadAuthorManualComments("user1", state);

      expect(fetchFn).not.toHaveBeenCalled();
    });

    test("given comments already loaded, when loading comments, then skips loading", async () => {
      const fetchFn = jest.fn();
      const helpers = createPrAuthorInsightsDataHelpers(
        createDependencies({ fetchFn }),
      );
      const state = createAuthorInsightsState();
      state.manualCommentsByAuthorLogin["user1"] = [];

      await helpers.loadAuthorManualComments("user1", state);

      expect(fetchFn).not.toHaveBeenCalled();
    });

    test("given onComplete callback, when loading completes, then callback invoked", async () => {
      const fetchFn = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, comments: [] }),
      });
      const onComplete = jest.fn();
      const helpers = createPrAuthorInsightsDataHelpers(
        createDependencies({ fetchFn }),
      );
      const state = createAuthorInsightsState();

      await helpers.loadAuthorManualComments("user1", state, onComplete);

      expect(onComplete).toHaveBeenCalled();
    });
  });

  describe("saveAuthorManualComment", () => {
    test("given valid comment data, when saving, then postJson called with correct params", async () => {
      const postJson = jest.fn().mockResolvedValue({
        response: { ok: true },
        result: { ok: true, comments: [] },
      });
      const helpers = createPrAuthorInsightsDataHelpers(createDependencies());

      const result = await helpers.saveAuthorManualComment({
        authorLogin: "user1",
        note: "Test note",
        sentiment: "positive",
        postJson,
      });

      expect(postJson).toHaveBeenCalledWith("/view-prs/author-comments", {
        authorLogin: "user1",
        note: "Test note",
        sentiment: "positive",
      });
      expect(result.response.ok).toBe(true);
    });
  });

  describe("updateAuthorManualComment", () => {
    test("given valid update data, when updating, then fetchFn called with PUT", async () => {
      const fetchFn = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, comments: [] }),
      });
      const helpers = createPrAuthorInsightsDataHelpers(
        createDependencies({ fetchFn }),
      );

      const result = await helpers.updateAuthorManualComment({
        authorLogin: "user1",
        id: "comment-1",
        note: "Updated note",
        sentiment: "negative",
      });

      expect(fetchFn).toHaveBeenCalledWith("/view-prs/author-comments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorLogin: "user1",
          id: "comment-1",
          note: "Updated note",
          sentiment: "negative",
        }),
      });
      expect(result.response.ok).toBe(true);
    });
  });
});
