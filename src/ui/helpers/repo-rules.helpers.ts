// Per-repo rules: a repo's own versions of some of Settings › Rules, kept in
// user-defaults.json under `repoRules`, keyed by repo ("owner/repo",
// matched whatever its case). Each group is overridden whole or not at all:
// a repo without a group uses the all-repos rules for it.
//
//   repoRules: {
//     "acme/api": {
//       attention: { noActivityMode, includePendingComments, ignoreMergeOnlyCommits,
//                    includeClosedMerged, includeDraftChanged, includeDraftNoActivity },
//       threadResolution: { mode, allow: [person ids], deny: [person ids] },
//       mergeCommitHeadlinePatterns: ["^Merge\\b", ...],
//       ignoreCommitPatterns: ["^docs:", ...],
//     }
//   }
//
// check-open-pr-updates.sh reads the two pattern lists for the repo it runs
// on (load_change_filter_config); the page uses the rest (attention, the
// Conversations tab's thread policy) per PR, by its repo. The lists of people
// to ignore and the merge-commit logins stay for every repo: someone who
// never appears in a repo makes no difference there.

export type RuleGroupId = 'attention' | 'threadResolution' | 'mergeCommitHeadlinePatterns' | 'ignoreCommitPatterns';

export interface AttentionRules {
  noActivityMode: string;
  includePendingComments: boolean;
  ignoreMergeOnlyCommits: boolean;
  includeClosedMerged: boolean;
  includeDraftChanged: boolean;
  includeDraftNoActivity: boolean;
}

export interface ThreadResolutionRules {
  mode: string;
  allow: string[];
  deny: string[];
}

export interface RepoRules {
  attention?: AttentionRules;
  threadResolution?: ThreadResolutionRules;
  mergeCommitHeadlinePatterns?: string[];
  ignoreCommitPatterns?: string[];
}

export type RepoRulesByRepo = Record<string, RepoRules>;

export const RULE_GROUP_IDS: readonly RuleGroupId[] = [
  'attention',
  'threadResolution',
  'mergeCommitHeadlinePatterns',
  'ignoreCommitPatterns',
];

// The FilterStateContext keys each group's controls edit, and which group a
// key is in (useRuleField).
export const ATTENTION_RULE_KEYS: Record<keyof AttentionRules, string> = {
  noActivityMode: 'attentionNoActivityMode',
  includePendingComments: 'attentionIncludePendingComments',
  ignoreMergeOnlyCommits: 'attentionIgnoreMergeOnlyCommits',
  includeClosedMerged: 'attentionIncludeClosedMerged',
  includeDraftChanged: 'attentionIncludeDraftChanged',
  includeDraftNoActivity: 'attentionIncludeDraftNoActivity',
};
export const THREAD_RESOLUTION_MODE_KEY = 'attentionAuthorThreadResolutionMode';
export const MERGE_HEADLINE_PATTERNS_KEY = 'mergeCommitHeadlinePatterns';
export const IGNORE_COMMIT_PATTERNS_KEY = 'changeFilterIgnoreCommitPatterns';

export const groupOfRuleKey = (key: string): RuleGroupId | null => {
  if (Object.values(ATTENTION_RULE_KEYS).includes(key)) return 'attention';
  if (key === THREAD_RESOLUTION_MODE_KEY) return 'threadResolution';
  if (key === MERGE_HEADLINE_PATTERNS_KEY) return 'mergeCommitHeadlinePatterns';
  if (key === IGNORE_COMMIT_PATTERNS_KEY) return 'ignoreCommitPatterns';
  return null;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((item) => String(item ?? '').trim()).filter(Boolean) : [];

const THREAD_MODES = ['allow-all', 'allow-only', 'deny-only'];

// The stored rules, cleaned: each repo's groups as saved (a malformed group
// dropped, so the repo uses the all-repos rules for it), repos without any
// group left out.
export const normalizeRepoRules = (value: unknown): RepoRulesByRepo => {
  if (!isObject(value)) return {};
  const result: RepoRulesByRepo = {};
  Object.entries(value).forEach(([rawRepo, rawRules]) => {
    const repo = rawRepo.trim();
    if (!repo || !isObject(rawRules)) return;
    const rules: RepoRules = {};
    const attention = rawRules.attention;
    if (isObject(attention)) {
      rules.attention = {
        noActivityMode: String(attention.noActivityMode || 'all'),
        includePendingComments: attention.includePendingComments !== false,
        ignoreMergeOnlyCommits: attention.ignoreMergeOnlyCommits === true,
        includeClosedMerged: attention.includeClosedMerged !== false,
        includeDraftChanged: attention.includeDraftChanged !== false,
        includeDraftNoActivity: attention.includeDraftNoActivity === true,
      };
    }
    const thread = rawRules.threadResolution;
    if (isObject(thread)) {
      const mode = String(thread.mode || '');
      rules.threadResolution = {
        mode: THREAD_MODES.includes(mode) ? mode : 'allow-all',
        allow: stringList(thread.allow),
        deny: stringList(thread.deny),
      };
    }
    // An emptied list is kept: "no headline is a merge" / "ignore no commits".
    if (Array.isArray(rawRules.mergeCommitHeadlinePatterns)) {
      rules.mergeCommitHeadlinePatterns = stringList(rawRules.mergeCommitHeadlinePatterns);
    }
    if (Array.isArray(rawRules.ignoreCommitPatterns)) {
      rules.ignoreCommitPatterns = stringList(rawRules.ignoreCommitPatterns);
    }
    if (Object.keys(rules).length > 0) result[repo] = rules;
  });
  return result;
};

// The repo's key in `byRepo` as stored (its case), or "" when it has none.
export const repoRulesKey = (byRepo: RepoRulesByRepo | null | undefined, repo: unknown): string => {
  const wanted = String(repo ?? '').trim().toLowerCase();
  if (!wanted || !byRepo) return '';
  return Object.keys(byRepo).find((key) => key.toLowerCase() === wanted) || '';
};

// The repo's own rules (none: {}).
export const repoRulesFor = (byRepo: RepoRulesByRepo | null | undefined, repo: unknown): RepoRules => {
  const key = repoRulesKey(byRepo, repo);
  return (key && byRepo?.[key]) || {};
};

// The rules with the repo's group set (`group` given) or removed (undefined),
// a repo with no group left dropped.
export const withRepoRuleGroup = <G extends RuleGroupId>(
  byRepo: RepoRulesByRepo | null | undefined,
  repo: string,
  group: G,
  value: RepoRules[G] | undefined,
): RepoRulesByRepo => {
  const next: RepoRulesByRepo = { ...(byRepo || {}) };
  const key = repoRulesKey(next, repo) || repo.trim();
  const rules: RepoRules = { ...(next[key] || {}) };
  if (value === undefined) delete rules[group];
  else rules[group] = value;
  if (Object.keys(rules).length > 0) next[key] = rules;
  else delete next[key];
  return next;
};

// The repos with any rules of their own, by name.
export const reposWithRules = (byRepo: RepoRulesByRepo | null | undefined): string[] =>
  Object.keys(byRepo || {}).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

const lines = (text: unknown): string[] =>
  String(text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

// A group's value from the all-repos rules (FilterStateContext values, the
// thread lists' picks): what an override starts as.
export const ruleGroupFromValues = (
  group: RuleGroupId,
  values: Record<string, unknown>,
  threadPicks: { allow: Iterable<string>; deny: Iterable<string> },
): RepoRules[RuleGroupId] => {
  if (group === 'attention') {
    return {
      noActivityMode: String(values[ATTENTION_RULE_KEYS.noActivityMode] ?? 'all'),
      includePendingComments: values[ATTENTION_RULE_KEYS.includePendingComments] !== false,
      ignoreMergeOnlyCommits: values[ATTENTION_RULE_KEYS.ignoreMergeOnlyCommits] === true,
      includeClosedMerged: values[ATTENTION_RULE_KEYS.includeClosedMerged] !== false,
      includeDraftChanged: values[ATTENTION_RULE_KEYS.includeDraftChanged] !== false,
      includeDraftNoActivity: values[ATTENTION_RULE_KEYS.includeDraftNoActivity] === true,
    };
  }
  if (group === 'threadResolution') {
    return {
      mode: String(values[THREAD_RESOLUTION_MODE_KEY] ?? 'allow-all'),
      allow: Array.from(threadPicks.allow),
      deny: Array.from(threadPicks.deny),
    };
  }
  if (group === 'mergeCommitHeadlinePatterns') return lines(values[MERGE_HEADLINE_PATTERNS_KEY] ?? '^Merge\\b');
  return lines(values[IGNORE_COMMIT_PATTERNS_KEY]);
};

// One control's value in a repo's override (the control's FilterStateContext
// key): the patterns as the textarea shows them, one per line.
export const ruleFieldFromGroup = (rules: RepoRules, key: string): unknown => {
  const attentionField = (Object.keys(ATTENTION_RULE_KEYS) as (keyof AttentionRules)[]).find(
    (field) => ATTENTION_RULE_KEYS[field] === key,
  );
  if (attentionField) return rules.attention?.[attentionField];
  if (key === THREAD_RESOLUTION_MODE_KEY) return rules.threadResolution?.mode;
  if (key === MERGE_HEADLINE_PATTERNS_KEY) return (rules.mergeCommitHeadlinePatterns || []).join('\n');
  if (key === IGNORE_COMMIT_PATTERNS_KEY) return (rules.ignoreCommitPatterns || []).join('\n');
  return undefined;
};

// A repo's override with one control's value changed. Patterns are kept as
// typed while editing (a line being written can be blank) and trimmed when
// the rules are saved or used.
export const withRuleField = (rules: RepoRules, key: string, value: unknown): RepoRules => {
  const attentionField = (Object.keys(ATTENTION_RULE_KEYS) as (keyof AttentionRules)[]).find(
    (field) => ATTENTION_RULE_KEYS[field] === key,
  );
  if (attentionField && rules.attention) {
    return { ...rules, attention: { ...rules.attention, [attentionField]: value } as AttentionRules };
  }
  if (key === THREAD_RESOLUTION_MODE_KEY && rules.threadResolution) {
    return { ...rules, threadResolution: { ...rules.threadResolution, mode: String(value ?? 'allow-all') } };
  }
  if (key === MERGE_HEADLINE_PATTERNS_KEY) return { ...rules, mergeCommitHeadlinePatterns: String(value ?? '').split('\n') };
  if (key === IGNORE_COMMIT_PATTERNS_KEY) return { ...rules, ignoreCommitPatterns: String(value ?? '').split('\n') };
  return rules;
};
