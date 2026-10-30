const {
  DEFAULT_MERGE_COMMIT_RULES,
  formatRuleLines,
  getMergeCommitMatcher,
  isValidHeadlinePattern,
  parseRuleLines,
} = require("./pr-merge-commit-rules.helpers.ts");

const commit = (messageHeadline, logins = ["alice"]) => ({
  messageHeadline,
  authors: logins.map((login) => ({ login })),
});

describe("pr merge commit rules helpers", () => {
  describe("the default rules", () => {
    const isMergeCommit = getMergeCommitMatcher(DEFAULT_MERGE_COMMIT_RULES);

    test.each([
      ["Merge branch 'main' into feature", true],
      ["merge pull request #12 from a/b", true],
      ["  Merge remote-tracking branch 'origin/x'", true],
      ["Merged the docs", false],
      ["feat: Merge support", false],
    ])("given the headline %j, when matched, then it is a merge commit: %s", (headline, expected) => {
      expect(isMergeCommit(commit(headline))).toBe(expected);
    });

    test("given no rules object, when matching, then the default rules apply", () => {
      expect(getMergeCommitMatcher(undefined)(commit("Merge x"))).toBe(true);
      expect(getMergeCommitMatcher(null)(commit("feat: x"))).toBe(false);
    });
  });

  test("given custom headline patterns, when matching, then they replace the default (case-insensitive)", () => {
    const isMergeCommit = getMergeCommitMatcher({ headlinePatterns: ["^sync "], logins: [] });

    expect(isMergeCommit(commit("Sync upstream"))).toBe(true);
    expect(isMergeCommit(commit("Merge branch 'main'"))).toBe(false);
  });

  test("given an invalid headline pattern, when matching, then it is skipped and the valid ones still apply", () => {
    const isMergeCommit = getMergeCommitMatcher({ headlinePatterns: ["(", "^Merge\\b"], logins: [] });

    expect(isMergeCommit(commit("Merge branch 'main'"))).toBe(true);
    expect(isMergeCommit(commit("("))).toBe(false);
  });

  test("given merge logins, when matching, then a commit counts only when every author is listed (any case)", () => {
    const isMergeCommit = getMergeCommitMatcher({ headlinePatterns: [], logins: ["Dependabot[bot]"] });

    expect(isMergeCommit(commit("chore(deps): bump x", ["dependabot[bot]"]))).toBe(true);
    expect(isMergeCommit(commit("chore(deps): bump y", ["dependabot[bot]", "alice"]))).toBe(false);
    expect(isMergeCommit(commit("feat: x", []))).toBe(false);
  });

  test("given the same rules object, when asked twice, then the compiled matcher is reused", () => {
    const rules = { headlinePatterns: ["^x"], logins: [] };

    expect(getMergeCommitMatcher(rules)).toBe(getMergeCommitMatcher(rules));
  });

  test("parseRuleLines and formatRuleLines convert between the editor text and the lists", () => {
    expect(parseRuleLines("  ^Merge\\b \n\n dependabot[bot]\n")).toEqual(["^Merge\\b", "dependabot[bot]"]);
    expect(parseRuleLines(undefined)).toEqual([]);
    expect(formatRuleLines(["a", "b"])).toBe("a\nb");
  });

  test("isValidHeadlinePattern tells valid regular expressions from invalid ones", () => {
    expect(isValidHeadlinePattern("^Merge\\b")).toBe(true);
    expect(isValidHeadlinePattern("(")).toBe(false);
  });
});
