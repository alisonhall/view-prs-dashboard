// The drawers' fields bound to FilterStateContext keys
// (UI_REDESIGN_PLAN.md, phase 9b). The script reads them when "Run script"
// is clicked (useFormBody); FilterStateProvider saves them.

export interface SettingsTextField {
  id: string;
  name: string;
  key: string;
  label: string;
  type: 'text' | 'number';
  placeholder: string;
  defaultValue: string;
  // What it does, under it (its description).
  hint?: string;
}

export interface SettingsCheckboxField {
  id: string;
  name: string;
  key: string;
  label: string;
  defaultValue: boolean;
  // What it does, under it (its description).
  hint?: string;
}

// Run & check: the PR numbers to run on. PrSelectionCell's row checkboxes
// write into the same key.
export const PR_NUMBERS_FIELD: SettingsTextField = {
  id: 'pr-numbers',
  name: 'prNumbers',
  key: 'prNumbersInput',
  label: 'PR number(s) (comma-separated)',
  type: 'text',
  placeholder: '912,921',
  defaultValue: '',
};

// Run & check's options for Run script: rarely changed.
export const SCRIPT_TEXT_FIELDS: readonly SettingsTextField[] = [
  {
    id: 'repo',
    name: 'repo',
    key: 'repo',
    label: 'Repo (owner/name)',
    type: 'text',
    placeholder: 'owner/repo',
    defaultValue: '',
    hint: "The repo Run script fetches PRs from. Empty: the server's VIEW_PRS_REPO.",
  },
  {
    id: 'limit',
    name: 'limit',
    key: 'limit',
    label: 'Open PR limit',
    type: 'number',
    placeholder: '200',
    defaultValue: '',
    hint: 'The most open PRs one run fetches. Empty: 200.',
  },
  {
    id: 'merged-limit',
    name: 'mergedLimit',
    key: 'mergedLimit',
    label: 'Merged PR limit',
    type: 'number',
    // Not a number: empty isn't a count, but the latest 7 days with any.
    placeholder: 'Last 7 days',
    defaultValue: '',
    hint: 'How many of the latest merged PRs a run fetches, and how many closed ones. Empty: those merged (or closed) on the 7 most recent days that had any.',
  },
  {
    id: 'jobs',
    name: 'jobs',
    key: 'jobs',
    label: 'Parallel jobs',
    type: 'number',
    placeholder: '6',
    defaultValue: '',
    hint: "How many PRs' details are fetched at once. Empty: 6. More is faster, but more likely to meet GitHub's limit on requests at once.",
  },
];

export const SCRIPT_CHECKBOX_FIELDS: readonly SettingsCheckboxField[] = [
  {
    id: 'ack-changed',
    name: 'ackChanged',
    key: 'ackChanged',
    label: 'Ack all CHANGED non-draft PRs from this run',
    defaultValue: false,
    hint: 'After the run, acks each open, non-draft PR it found CHANGED, as its Ack button would: it goes back to NO_CHANGE until there is new activity.',
  },
  {
    id: 'show-reason',
    name: 'showReason',
    key: 'showReason',
    label: 'Show CHANGED reason in status',
    defaultValue: true,
    hint: "In the run's output (Latest request output), what changed is shown beside each CHANGED status, as in CHANGED(commit).",
  },
  {
    id: 'quiet',
    name: 'quiet',
    key: 'quiet',
    label: 'Quiet mode (hide run metadata header)',
    defaultValue: false,
    hint: "Leaves the summary of the run's options (repo, limits, open mode) out of the top of its output.",
  },
];

// Attention rules: which PRs count as needing attention.
export const ATTENTION_CHECKBOX_FIELDS: readonly SettingsCheckboxField[] = [
  {
    id: 'attention-include-pending-comments',
    name: 'attentionIncludePendingComments',
    key: 'attentionIncludePendingComments',
    label: 'Mark PRs with my pending (unsubmitted) comments',
    defaultValue: true,
    hint: "A PR where you've started a review and left comments you haven't submitted yet.",
  },
  {
    id: 'attention-ignore-merge-only-commits',
    name: 'attentionIgnoreMergeOnlyCommits',
    key: 'attentionIgnoreMergeOnlyCommits',
    label: 'Exclude merge-only commit activity from CHANGED attention',
    defaultValue: false,
    hint: "A PR CHANGED only by commits, every one of them a merge commit (Settings › Merge commits), doesn't need attention.",
  },
  {
    id: 'attention-include-closed-merged',
    name: 'attentionIncludeClosedMerged',
    key: 'attentionIncludeClosedMerged',
    label: 'Include closed/merged sections in attention logic',
    defaultValue: true,
    hint: 'Merged and closed PRs can need attention too, when CHANGED or NO_ACTIVITY, by the same rules as open ones.',
  },
  {
    id: 'attention-include-draft-changed',
    name: 'attentionIncludeDraftChanged',
    key: 'attentionIncludeDraftChanged',
    label: 'Mark CHANGED draft PRs as attention',
    defaultValue: true,
    hint: 'Draft PRs need attention when CHANGED, as open ones do.',
  },
  {
    id: 'attention-include-draft-no-activity',
    name: 'attentionIncludeDraftNoActivity',
    key: 'attentionIncludeDraftNoActivity',
    label: 'Apply NO_ACTIVITY attention rules to draft PRs',
    defaultValue: false,
    hint: 'Draft PRs need attention when NO_ACTIVITY, as NO_ACTIVITY handling says.',
  },
];

// A multi-select list (MultiSelectDropdown) and where its selection lives:
// `optionsKey` into FilterOptionsContext, and the key a saved restore
// leaves its selection under until the options load
// (pr-pending-multi-select-selections.helpers.ts).
export interface SettingsList<L extends string = string> {
  listId: L;
  label: string;
  idPrefix: string;
  optionsKey:
    | 'authorThreadResolutionAllowOptions'
    | 'authorThreadResolutionDenyOptions'
    | 'changeFilterIgnoreCommentAuthorsOptions'
    | 'changeFilterIgnoreReviewAuthorsOptions';
  pendingKey: string;
}

// Attention rules: whose threads the PR author may (allow-only) or may not
// (deny-only) resolve. AuthorThreadResolutionSelectionContext.
export const THREAD_RESOLUTION_ALLOW_LIST: SettingsList<'attention-author-thread-resolution-allow-list'> = {
  listId: 'attention-author-thread-resolution-allow-list',
  label: 'Allow PR authors to resolve threads started by',
  idPrefix: 'attention-author-thread-resolution-allow',
  optionsKey: 'authorThreadResolutionAllowOptions',
  pendingKey: 'pendingAuthorThreadResolutionAllowSelections',
};
export const THREAD_RESOLUTION_DENY_LIST: SettingsList<'attention-author-thread-resolution-deny-list'> = {
  listId: 'attention-author-thread-resolution-deny-list',
  label: 'Do not allow PR authors to resolve threads started by',
  idPrefix: 'attention-author-thread-resolution-deny',
  optionsKey: 'authorThreadResolutionDenyOptions',
  pendingKey: 'pendingAuthorThreadResolutionDenySelections',
};

// Change detection: authors whose comments or reviews don't mark a PR
// CHANGED. ChangeFilterActorSelectionContext.
export const IGNORE_COMMENT_AUTHORS_LIST: SettingsList<'change-filter-ignore-comment-authors-list'> = {
  listId: 'change-filter-ignore-comment-authors-list',
  label: 'Ignore comments from these authors (GitHub logins)',
  idPrefix: 'change-filter-ignore-comment-authors',
  optionsKey: 'changeFilterIgnoreCommentAuthorsOptions',
  pendingKey: 'pendingChangeFilterIgnoreCommentAuthors',
};
export const IGNORE_REVIEW_AUTHORS_LIST: SettingsList<'change-filter-ignore-review-authors-list'> = {
  listId: 'change-filter-ignore-review-authors-list',
  label: 'Ignore reviews from these authors (GitHub logins)',
  idPrefix: 'change-filter-ignore-review-authors',
  optionsKey: 'changeFilterIgnoreReviewAuthorsOptions',
  pendingKey: 'pendingChangeFilterIgnoreReviewAuthors',
};
