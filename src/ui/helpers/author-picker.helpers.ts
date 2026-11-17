import type { PrEntry } from "../types/pr-data.ts";
import type { GetPreferredActorKey } from "./pr-actor-identity.helpers.ts";
import type { AuthorOption } from "./pr-author-insights-display.helpers.ts";
import { parseSortableTime } from "./pr-sortable-time.helpers.ts";

// The Authors view's picker and header (and the filter bar's Authors list): when each author's PRs were last
// updated (by anyone: GitHub's updatedAt, or a merge or close), how many
// are open and merged, and the picker's order - authors with a recently
// updated PR first, newest first, then everyone else as
// buildAuthorInsightsEntries sorts them (by name).

// A PR of theirs updated in this many days: under "Recent PRs".
export const RECENTLY_ACTIVE_DAYS = 30;

export interface AuthorActivity {
  // The latest time on any of their PRs, or -Infinity with none.
  lastActiveAt: number;
  open: number;
  merged: number;
  closed: number;
}

export type AuthorPrState = "open" | "merged" | "closed";

// Merged or closed as getAuthorInsightsCreatedPrStatus decides; open
// otherwise.
export const getAuthorPrState = (entry: PrEntry | null | undefined): AuthorPrState => {
  if (String(entry?.data?.mergedAt || "").trim()) return "merged";
  if (
    String(entry?.data?.closedAt || "").trim() ||
    String(entry?.section || "").trim().toLowerCase() === "closed"
  ) {
    return "closed";
  }
  return "open";
};

// The latest of the PR's GitHub update, merge and close times.
export const getPrLastActivityTime = (entry: PrEntry | null | undefined): number => {
  const data = entry?.data || {};
  return Math.max(
    ...[data.sourceUpdatedAt, data.mergedAt, data.closedAt].map(parseSortableTime),
  );
};

// Each PR author's activity, keyed by their preferred login (as the
// picker's options are).
export const summarizeAuthorActivity = (
  rows: Iterable<PrEntry>,
  getPreferredActorKey: GetPreferredActorKey,
): Map<string, AuthorActivity> => {
  const byLogin = new Map<string, AuthorActivity>();
  for (const entry of rows) {
    const login = String(getPreferredActorKey(entry?.data?.authorLogin, entry?.data?.author) || "").trim();
    if (!login) continue;
    const activity = byLogin.get(login) || { lastActiveAt: Number.NEGATIVE_INFINITY, open: 0, merged: 0, closed: 0 };
    activity.lastActiveAt = Math.max(activity.lastActiveAt, getPrLastActivityTime(entry));
    activity[getAuthorPrState(entry)] += 1;
    byLogin.set(login, activity);
  }
  return byLogin;
};

// The options split in two: those with a PR updated in the last RECENTLY_ACTIVE_DAYS,
// newest first, and the rest in the order given.
export const groupAuthorOptionsByActivity = <T extends Pick<AuthorOption, "login">>(
  options: ReadonlyArray<T>,
  activityByLogin: ReadonlyMap<string, Pick<AuthorActivity, "lastActiveAt">>,
  now: number,
): { recent: T[]; others: T[] } => {
  const since = now - RECENTLY_ACTIVE_DAYS * 24 * 60 * 60 * 1000;
  const lastActiveAt = (option: T) =>
    activityByLogin.get(option.login)?.lastActiveAt ?? Number.NEGATIVE_INFINITY;
  const recent = options
    .filter((option) => lastActiveAt(option) >= since)
    .sort((a, b) => lastActiveAt(b) - lastActiveAt(a));
  const others = options.filter((option) => lastActiveAt(option) < since);
  return { recent, others };
};
