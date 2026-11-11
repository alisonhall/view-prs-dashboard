// The Review stats table's Columns menu: which columns show. Reviewer
// always shows; the least used start hidden. Saved in user-defaults.json
// under REVIEW_STATS_COLUMNS_OVERRIDE_KEY, keeping only what differs from
// the defaults: { "threadComments": true, "prCount": false }. A browser
// copy (REVIEW_STATS_COLUMNS_STORAGE_KEY) lets the table draw with them
// straight away, before user-defaults.json has been read.

import { REVIEW_STATS_COLUMN_EXPLANATIONS as EXPLAINED } from './review-stats-explanations.helpers.ts';

export interface ReviewStatsColumnEntry {
  key: string;
  label: string;
  defaultShown: boolean;
  // How it's counted: its heading's tooltip.
  explanation: string;
}

// Every column after Reviewer, in the table's order.
export const REVIEW_STATS_COLUMN_CATALOG: ReadonlyArray<ReviewStatsColumnEntry> = [
  { key: 'comments', label: 'Comments', defaultShown: true, explanation: EXPLAINED.comments },
  { key: 'threadComments', label: 'Thread comments', defaultShown: false, explanation: EXPLAINED.threadComments },
  { key: 'reviews', label: 'Reviews', defaultShown: true, explanation: EXPLAINED.reviews },
  { key: 'approvals', label: 'Approvals', defaultShown: true, explanation: EXPLAINED.approvals },
  { key: 'riskyApprovals', label: 'Risky approvals', defaultShown: true, explanation: EXPLAINED.riskyApprovals },
  { key: 'highRiskApprovals', label: 'High-risk approvals', defaultShown: true, explanation: EXPLAINED.highRiskApprovals },
  { key: 'usefulnessSignals', label: 'Useful comment signals', defaultShown: true, explanation: EXPLAINED.usefulnessSignals },
  {
    key: 'commentsFollowedByAuthorCommit',
    label: 'Comments → author commit',
    defaultShown: true,
    explanation: EXPLAINED.commentsFollowedByAuthorCommit,
  },
  {
    key: 'resolvedThreadComments',
    label: 'Resolved thread comments',
    defaultShown: false,
    explanation: EXPLAINED.resolvedThreadComments,
  },
  { key: 'prCount', label: 'PRs touched', defaultShown: true, explanation: EXPLAINED.prCount },
  { key: 'sources', label: 'Sources', defaultShown: false, explanation: EXPLAINED.sources },
];

export const REVIEW_STATS_COLUMNS_OVERRIDE_KEY = 'reviewStatsColumns';
export const REVIEW_STATS_COLUMNS_STORAGE_KEY = 'view-prs:review-stats-columns';

// Column key -> shown, only where it differs from the default.
export type ReviewStatsColumnChoices = Record<string, boolean>;

// Keeps known columns only, booleans only, and only what differs from the
// defaults - so a saved file with stray or stale values still reads.
export const normalizeReviewStatsColumnChoices = (value: unknown): ReviewStatsColumnChoices => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: ReviewStatsColumnChoices = {};
  REVIEW_STATS_COLUMN_CATALOG.forEach(({ key, defaultShown }) => {
    const shown = (value as Record<string, unknown>)[key];
    if (typeof shown === 'boolean' && shown !== defaultShown) result[key] = shown;
  });
  return result;
};

export const isReviewStatsColumnShown = (choices: ReviewStatsColumnChoices, key: string): boolean =>
  choices[key] ?? REVIEW_STATS_COLUMN_CATALOG.find((entry) => entry.key === key)?.defaultShown ?? false;

export const withReviewStatsColumnShown = (
  choices: ReviewStatsColumnChoices,
  key: string,
  shown: boolean,
): ReviewStatsColumnChoices => normalizeReviewStatsColumnChoices({ ...choices, [key]: shown });

// Storage can throw (blocked site data) or be missing, and the copy can be
// malformed; then there's no copy.
export const readStoredReviewStatsColumnChoices = (): ReviewStatsColumnChoices | null => {
  try {
    const value = window.localStorage.getItem(REVIEW_STATS_COLUMNS_STORAGE_KEY);
    return value === null ? null : normalizeReviewStatsColumnChoices(JSON.parse(value));
  } catch (_error) {
    return null;
  }
};

export const storeReviewStatsColumnChoices = (choices: ReviewStatsColumnChoices) => {
  try {
    window.localStorage.setItem(REVIEW_STATS_COLUMNS_STORAGE_KEY, JSON.stringify(choices));
  } catch (_error) {
    // Only the first draw uses the copy; user-defaults.json keeps the choices.
  }
};
