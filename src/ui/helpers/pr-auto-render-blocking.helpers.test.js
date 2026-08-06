/** @jest-environment jsdom */

const {
  createPrAutoRenderBlockingHelpers,
} = require("./pr-auto-render-blocking.helpers.js");

describe("auto render blocking helpers", () => {
  const createHelpers = () =>
    createPrAutoRenderBlockingHelpers({
      normalizePrNumber: (value) => {
        const normalized = String(value || "").trim();
        return /^\d+$/.test(normalized) ? normalized : "";
      },
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

  test("given mixed PR identifiers, when formatting blocking label, then valid PR numbers are sorted deduplicated and limited", () => {
    const { formatBlockingPrNumbersLabel } = createHelpers();

    expect(formatBlockingPrNumbersLabel(["20", "5", "20", "bad"]))
      .toBe("Blocking PRs: #5, #20");
    expect(formatBlockingPrNumbersLabel(["1", "2", "3", "4"], 2)).toBe(
      "Blocking PRs: #1, #2 (+2 more)",
    );
    expect(formatBlockingPrNumbersLabel([])).toBe("");
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
