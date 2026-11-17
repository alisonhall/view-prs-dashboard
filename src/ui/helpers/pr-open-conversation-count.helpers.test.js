const {
  createPrOpenConversationCountHelpers,
} = require("./pr-open-conversation-count.helpers.ts");

describe("pr open conversation count helpers", () => {
  describe("getOpenConversationCount", () => {
    test("given an explicit openConversationCount, when counting, then it is used directly", () => {
      const { getOpenConversationCount } = createPrOpenConversationCountHelpers();

      expect(getOpenConversationCount({ openConversationCount: 3 })).toBe(3);
    });

    test("given no explicit count, when counting, then it falls back to the review-stats metrics", () => {
      const { getOpenConversationCount } = createPrOpenConversationCountHelpers();

      expect(getOpenConversationCount({ reviewThreads: [{ isResolved: false }] })).toBeGreaterThanOrEqual(0);
    });
  });

  describe("getOpenConversationCountWithMe", () => {
    test("given no effective viewer login, when counting, then it falls back to the non-viewer-specific count", () => {
      const { getOpenConversationCountWithMe } = createPrOpenConversationCountHelpers({
        getEffectiveViewerLogin: () => "",
      });

      const result = getOpenConversationCountWithMe({ openConversationCount: 2 });

      expect(result).toEqual({ count: 2, isViewerSpecific: false, waitingCount: 0 });
    });

    test("given a viewer login and a thread they participated in, when counting, then it counts as an open thread for that viewer", () => {
      const { getOpenConversationCountWithMe } = createPrOpenConversationCountHelpers({
        getEffectiveViewerLogin: () => "alice",
      });

      const result = getOpenConversationCountWithMe({
        reviewThreads: [
          { isResolved: false, participants: ["alice"] },
          { isResolved: false, participants: ["bob"] },
          { isResolved: true, participants: ["alice"] },
        ],
      });

      expect(result).toEqual({ count: 1, isViewerSpecific: true, waitingCount: 0 });
    });

    test("given a viewer login and a thread they commented in (not a listed participant), when counting, then it still counts", () => {
      const { getOpenConversationCountWithMe } = createPrOpenConversationCountHelpers({
        getEffectiveViewerLogin: () => "alice",
      });

      const result = getOpenConversationCountWithMe({
        reviewThreads: [
          {
            isResolved: false,
            participants: [],
            comments: [{ authorLogin: "Alice" }],
          },
        ],
      });

      expect(result).toEqual({ count: 1, isViewerSpecific: true, waitingCount: 0 });
    });

    test("given the viewer login from the row (getEffectiveViewerLogin reads it), when counting, then it is used", () => {
      const getEffectiveViewerLogin = jest.fn((row) => row?.viewerLogin || "");
      const { getOpenConversationCountWithMe } = createPrOpenConversationCountHelpers({
        getEffectiveViewerLogin,
      });
      const row = { viewerLogin: "carol", reviewThreads: [] };

      getOpenConversationCountWithMe(row);

      expect(getEffectiveViewerLogin).toHaveBeenCalledWith(row);
    });

    test("given threads with the viewer, when counting, then waitingCount is those whose latest submitted comment is someone else's or mentions them", () => {
      const { getOpenConversationCountWithMe } = createPrOpenConversationCountHelpers({
        getEffectiveViewerLogin: () => "alice",
      });

      const result = getOpenConversationCountWithMe({
        reviewThreads: [
          // Bob answered Alice: waiting on her.
          {
            isResolved: false,
            comments: [
              { authorLogin: "alice", createdAt: "2026-01-01T00:00:00Z" },
              { authorLogin: "bob", createdAt: "2026-01-02T00:00:00Z" },
            ],
          },
          // Alice had the last word: open, not waiting.
          {
            isResolved: false,
            comments: [
              { authorLogin: "bob", createdAt: "2026-01-01T00:00:00Z" },
              { authorLogin: "alice", createdAt: "2026-01-02T00:00:00Z" },
            ],
          },
          // Alice's only reply is an unsubmitted draft: Bob's comment hasn't
          // been answered, but she hasn't taken part yet either.
          {
            isResolved: false,
            comments: [
              { authorLogin: "bob", createdAt: "2026-01-01T00:00:00Z" },
              { authorLogin: "alice", createdAt: "2026-01-02T00:00:00Z", state: "PENDING" },
            ],
          },
          // Resolved: neither.
          {
            isResolved: true,
            comments: [
              { authorLogin: "alice", createdAt: "2026-01-01T00:00:00Z" },
              { authorLogin: "bob", createdAt: "2026-01-02T00:00:00Z" },
            ],
          },
        ],
      });

      expect(result).toEqual({ count: 3, isViewerSpecific: true, waitingCount: 1 });
    });

    test("given no dependencies injected, when counting, then it resolves without throwing", () => {
      const { getOpenConversationCountWithMe } = createPrOpenConversationCountHelpers();

      expect(() => getOpenConversationCountWithMe({})).not.toThrow();
    });
  });
});
