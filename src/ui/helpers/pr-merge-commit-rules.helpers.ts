import type { PrCommit } from "../types/pr-data.ts";

// What counts as a merge commit (merging a branch into the PR's branch, or
// automated commits), shared by the "Exclude merge-only commit activity"
// attention rule and the Author cell's commit authors; check-open-pr-updates.sh
// applies the same rules (from user-defaults.json's mergeCommitRules) when
// deciding whether new commits mark a PR CHANGED.
//
// A commit is a merge when its headline matches one of headlinePatterns
// (regular expressions, case-insensitive), or when it has author logins
// and every one of them is in logins (e.g. bots).
export interface MergeCommitRules {
  headlinePatterns: string[];
  logins: string[];
}

export const DEFAULT_MERGE_COMMIT_RULES: MergeCommitRules = {
  headlinePatterns: ["^Merge\\b"],
  logins: [],
};

// The rules editor's one-entry-per-line text as a list (blank lines dropped).
export const parseRuleLines = (text: unknown): string[] =>
  String(text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

export const formatRuleLines = (lines: string[] | null | undefined): string =>
  (Array.isArray(lines) ? lines : []).join("\n");

// Whether a pattern line is a valid regular expression (an invalid one is
// skipped when matching).
export const isValidHeadlinePattern = (pattern: string): boolean => {
  try {
    new RegExp(pattern, "i");
    return true;
  } catch (_error) {
    return false;
  }
};

export type MergeCommitMatcher = (commit: Pick<PrCommit, "messageHeadline" | "authors"> | null | undefined) => boolean;

const createMergeCommitMatcher = (rules: MergeCommitRules): MergeCommitMatcher => {
  const patterns = rules.headlinePatterns
    .filter(isValidHeadlinePattern)
    .map((pattern) => new RegExp(pattern, "i"));
  const logins = new Set(rules.logins.map((login) => login.trim().toLowerCase()).filter(Boolean));

  return (commit) => {
    const headline = String(commit?.messageHeadline || "").trim();
    if (patterns.some((pattern) => pattern.test(headline))) {
      return true;
    }
    const authorLogins = (Array.isArray(commit?.authors) ? commit.authors : [])
      .map((author) => String(author?.login || "").trim().toLowerCase())
      .filter(Boolean);
    return logins.size > 0 && authorLogins.length > 0 && authorLogins.every((login) => logins.has(login));
  };
};

// One compiled matcher per rules object (callers pass the same object for
// as long as the rules don't change, e.g. NeedsAttentionProvider's
// attentionConfig.mergeCommitRules).
const matcherCache = new WeakMap<MergeCommitRules, MergeCommitMatcher>();
const defaultMatcher = createMergeCommitMatcher(DEFAULT_MERGE_COMMIT_RULES);

export const getMergeCommitMatcher = (rules: MergeCommitRules | null | undefined): MergeCommitMatcher => {
  if (!rules) {
    return defaultMatcher;
  }
  let matcher = matcherCache.get(rules);
  if (!matcher) {
    matcher = createMergeCommitMatcher(rules);
    matcherCache.set(rules, matcher);
  }
  return matcher;
};
