/** @jest-environment jsdom */

const {
  createPrAuthorInsightsDraftsHelpers,
} = require("./pr-author-insights-drafts.helpers.js");

describe("author insights drafts helpers", () => {
  const createHelpers = (overrides = {}) => {
    const authorInsightsState = {
      manualCommentsByAuthorLogin: {},
      manualCommentDraftByAuthorLogin: {},
      manualCommentEditDraftByAuthorLogin: {},
    };
    const {
      authorInsightsState: overrideAuthorInsightsState = {},
      ...otherOverrides
    } = overrides;

    return createPrAuthorInsightsDraftsHelpers({
      normalizeActorLogin: (value) => String(value || "").trim().toLowerCase(),
      ...otherOverrides,
      authorInsightsState: {
        ...authorInsightsState,
        ...overrideAuthorInsightsState,
      },
    });
  };

  test("given unsupported sentiment values, when normalizing sentiment, then neutral fallback is returned", () => {
    const { normalizeAuthorInsightsSentiment } = createHelpers();

    expect(normalizeAuthorInsightsSentiment("positive")).toBe("positive");
    expect(normalizeAuthorInsightsSentiment(" NEGATIVE ")).toBe("negative");
    expect(normalizeAuthorInsightsSentiment("unknown")).toBe("neutral");
  });

  test("given a composer draft update, when updating and resetting draft, then values persist and return to defaults", () => {
    const {
      getAuthorInsightsComposerDraft,
      updateAuthorInsightsComposerDraft,
      resetAuthorInsightsComposerDraft,
      isAuthorInsightsComposerDraftDirty,
    } = createHelpers();

    const initial = getAuthorInsightsComposerDraft("Alice");
    expect(initial).toEqual({ note: "", sentiment: "neutral" });
    expect(isAuthorInsightsComposerDraftDirty(initial)).toBe(false);

    const updated = updateAuthorInsightsComposerDraft("Alice", {
      note: "Needs follow-up",
      sentiment: "positive",
    });
    expect(updated).toEqual({ note: "Needs follow-up", sentiment: "positive" });
    expect(isAuthorInsightsComposerDraftDirty(updated)).toBe(true);

    resetAuthorInsightsComposerDraft("Alice");
    expect(getAuthorInsightsComposerDraft("Alice")).toEqual({
      note: "",
      sentiment: "neutral",
    });
  });

  test("given saved comments and edit draft changes, when computing edit draft state, then dirty comparison behaves as expected", () => {
    const {
      getAuthorInsightsEditDraft,
      updateAuthorInsightsEditDraft,
      resetAuthorInsightsEditDraft,
      isAuthorInsightsEditDraftDirty,
      getAuthorManualCommentsForLogin,
    } = createHelpers({
      authorInsightsState: {
        manualCommentsByAuthorLogin: {
          alice: [{ id: "c1", note: "Old", sentiment: "neutral" }],
        },
      },
    });

    expect(getAuthorManualCommentsForLogin("alice")).toHaveLength(1);

    const baseline = getAuthorInsightsEditDraft("alice", {
      id: "c1",
      note: "Old",
      sentiment: "neutral",
    });
    expect(baseline).toEqual({ note: "Old", sentiment: "neutral", isEditing: false });
    expect(
      isAuthorInsightsEditDraftDirty(
        { note: "Old", sentiment: "neutral" },
        baseline,
      ),
    ).toBe(false);

    const updated = updateAuthorInsightsEditDraft("alice", "c1", {
      note: "New",
      isEditing: true,
    });
    expect(updated).toEqual({ note: "New", sentiment: "neutral", isEditing: true });
    expect(
      isAuthorInsightsEditDraftDirty(
        { note: "Old", sentiment: "neutral" },
        updated,
      ),
    ).toBe(true);

    resetAuthorInsightsEditDraft("alice", "c1");
    const reset = getAuthorInsightsEditDraft("alice", {
      id: "c1",
      note: "Old",
      sentiment: "neutral",
    });
    expect(reset).toEqual({ note: "Old", sentiment: "neutral", isEditing: false });
  });
});
