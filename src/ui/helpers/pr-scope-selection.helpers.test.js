/** @jest-environment jsdom */

const { createPrScopeSelectionHelpers } = require("./pr-scope-selection.helpers.ts");

const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
const ids = (list) => list.map((entry) => entry.id);

describe("the filter bar's \"only\" checkboxes (narrowRows)", () => {
  const { narrowRows } = createPrScopeSelectionHelpers({
    entryNeedsAttention: (entry, attentionConfig) => entry.id !== 2 && attentionConfig.marker === "rules",
    entryHasThreadsToCheck: (entry) => entry.id !== 1,
  });

  test("neither checked: every row", () => {
    expect(narrowRows({ rows })).toBe(rows);
  });

  test("Only PRs that need attention: by the attention rules given", () => {
    expect(ids(narrowRows({ rows, onlyNeedsAttention: true, attentionConfig: { marker: "rules" } }))).toEqual([1, 3]);
  });

  test("Resolved for you to check: PRs with conversations to check", () => {
    expect(ids(narrowRows({ rows, onlyThreadsToCheck: true }))).toEqual([2, 3]);
  });

  test("Open conversations with me, and Waiting on me: by the checks given, all of those checked", () => {
    const { narrowRows: conversations } = createPrScopeSelectionHelpers({
      entryHasOpenConversationsWithMe: (entry) => entry.id !== 3,
      entryHasConversationWaitingOnMe: (entry) => entry.id === 2,
      entryHasThreadsToCheck: (entry) => entry.id !== 2,
    });
    expect(ids(conversations({ rows, onlyOpenConversationsWithMe: true }))).toEqual([1, 2]);
    expect(ids(conversations({ rows, onlyWaitingOnMe: true }))).toEqual([2]);
    expect(ids(conversations({ rows, onlyOpenConversationsWithMe: true, onlyThreadsToCheck: true }))).toEqual([1]);
  });

  test("both: the PRs that are both", () => {
    expect(ids(narrowRows({ rows, onlyNeedsAttention: true, onlyThreadsToCheck: true, attentionConfig: { marker: "rules" } }))).toEqual([3]);
  });

  test("PRs picked by number show whatever the checkboxes say", () => {
    expect(narrowRows({ rows, picksPrs: true, onlyNeedsAttention: true, onlyThreadsToCheck: true })).toBe(rows);
  });

  test("so do PRs marked In review, with \"Always show PRs in review\"", () => {
    const { narrowRows: withInReview } = createPrScopeSelectionHelpers({
      entryNeedsAttention: (entry) => entry.id === 1,
      isInReviewEnabled: (row) => row.inReview === true,
    });
    const inReviewRows = [{ id: 1 }, { id: 2, data: { inReview: true } }, { id: 3 }];
    expect(ids(withInReview({ rows: inReviewRows, onlyNeedsAttention: true, alwaysShowInReview: true }))).toEqual([1, 2]);
    expect(ids(withInReview({ rows: inReviewRows, onlyNeedsAttention: true }))).toEqual([1]);
  });

  test("without the checks given, nothing passes a checked box; no rows, none", () => {
    const { narrowRows: bare } = createPrScopeSelectionHelpers();
    expect(bare({ rows, onlyNeedsAttention: true })).toEqual([]);
    expect(bare({ rows: null })).toEqual([]);
  });
});
