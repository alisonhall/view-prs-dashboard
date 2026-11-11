/** @jest-environment jsdom */

const {
  createPrAutoRenderBlockingHelpers,
} = require("./pr-auto-render-blocking.helpers.ts");
const { createPrAutoRenderUnsavedHelpers } = require("./pr-auto-render-unsaved.helpers.ts");

describe("auto render blocking helpers", () => {
  const createHelpers = () =>
    createPrAutoRenderBlockingHelpers({
      normalizePrKey: createPrAutoRenderUnsavedHelpers().normalizePrKey,
      normalizeActorLogin: (value) => String(value || "").trim().toLowerCase(),
      isAuthorInsightsComposerDraftDirty: (draft = {}) =>
        Boolean(String(draft.note || "").trim()) ||
        String(draft.sentiment || "neutral").trim().toLowerCase() !== "neutral",
      getAuthorManualCommentsForLogin: (authorLogin) => {
        const key = String(authorLogin || "").trim().toLowerCase();
        if (key === "alice") {
          return [{ id: "c1", note: "Old", sentiment: "neutral" }];
        }
        return [];
      },
      isAuthorInsightsEditDraftDirty: (saved, draft) =>
        String(saved?.note || "") !== String(draft?.note || "") ||
        String(saved?.sentiment || "neutral") !==
          String(draft?.sentiment || "neutral"),
      getAuthorInsightsDisplayName: (authorLogin) =>
        ({ alice: "Alice A", bob: "Bob B", zed: "Zed Z" }[
          String(authorLogin || "").trim().toLowerCase()
        ] || String(authorLogin || "")),
    });

  test("given mixed PR identifiers, when formatting blocking label, then valid PR keys are sorted deduplicated and limited", () => {
    const { formatBlockingPrKeysLabel } = createHelpers();

    expect(formatBlockingPrKeysLabel(["acme/api#20", "acme/api#5", "acme/api#20", "bad", "7"]))
      .toBe("Blocking PRs: acme/api#5, acme/api#20");
    expect(formatBlockingPrKeysLabel(["a/b#1", "a/b#2", "a/b#3", "a/b#4"], 2)).toBe(
      "Blocking PRs: a/b#1, a/b#2 (+2 more)",
    );
    expect(formatBlockingPrKeysLabel([])).toBe("");
  });

  test("given composer and edit drafts, when collecting blocking author logins, then only dirty authors are returned in display-name order", () => {
    const { getBlockingAuthorInsightsLogins } = createHelpers();

    const result = getBlockingAuthorInsightsLogins({
      manualCommentDraftByAuthorLogin: {
        bob: { note: "", sentiment: "neutral" },
        zed: { note: "needs review", sentiment: "neutral" },
      },
      manualCommentEditDraftByAuthorLogin: {
        alice: {
          c1: { note: "Updated", sentiment: "neutral", isEditing: true },
        },
        bob: {
          c2: { note: "x", sentiment: "positive", isEditing: true },
        },
      },
    });

    expect(result).toEqual(["alice", "zed"]);
  });
});
