import type { PrActivityEvent } from "../types/pr-data.ts";

// The detail pane's Activity tab (UI_REDESIGN_PLAN.md, phase 5), from the
// activity feed (pr-activity-events.helpers.ts' buildActivityEvents, newest
// first): the "Since I last looked" / "All" scope, the event-type filter,
// grouping by day, runs of one person's commits collapsed into one item,
// and where "since I last looked" begins.

export type ActivityKind = "commit" | "review" | "comment" | "event";
export const ACTIVITY_KINDS: readonly ActivityKind[] = ["commit", "review", "comment", "event"];

export type ActivityScope = "since" | "all";

// Commits; reviews and approvals; comments (top-level and in threads); and
// the PR's own events (opened, merged, closed).
export const activityKindOf = (event: PrActivityEvent | null | undefined): ActivityKind => {
  const type = String(event?.type || "");
  const channel = String(event?.channel || "");
  if (type === "commit" || channel === "commit") return "commit";
  if (type === "approval" || type === "review" || channel === "review") return "review";
  if (type === "comment" || channel === "thread" || channel === "top-level") return "comment";
  return "event";
};

const parseTime = (value: unknown): number => {
  const parsed = Date.parse(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

// When the viewer last looked at the PR: their last activity on it (the
// data's `baseline`) or their last Ack, whichever is later
// (UI_REDESIGN_PLAN.md, decision 1). Empty when neither is known.
export const getLastLookedAt = (baseline: unknown, ackedAt: unknown): string => {
  const candidates = [baseline, ackedAt]
    .map((value) => String(value ?? "").trim())
    .filter((value) => Number.isFinite(parseTime(value)));
  if (!candidates.length) return "";
  return candidates.reduce((latest, value) => (parseTime(value) > parseTime(latest) ? value : latest));
};

export type FeedItem =
  | { kind: "event"; event: PrActivityEvent }
  // Two or more commits in a row (newest first) by one person on one day.
  | { kind: "commits"; actor: string; events: PrActivityEvent[] }
  // In the "All" scope: everything after this is from before the viewer
  // last looked.
  | { kind: "marker"; at: string };

export interface FeedDay {
  // YYYY-MM-DD in the given time zone; "" for events without a valid time.
  key: string;
  items: FeedItem[];
}

export interface ActivityFeed {
  days: FeedDay[];
  totalCount: number;
  sinceCount: number;
  // Per kind, in the current scope (what each type chip would show).
  kindCounts: Record<ActivityKind, number>;
  shownCount: number;
  // In the "Since I last looked" scope: the older events it leaves out, of
  // the chosen types (what "All" would add).
  earlierCount: number;
}

export interface ActivityFeedOptions {
  scope: ActivityScope;
  lastLookedAt: string;
  kinds: readonly ActivityKind[];
  // Days are calendar days here; the browser's own zone when omitted.
  timeZone?: string;
}

// Each formatter is made once, per locale and options: the tab re-renders
// on every clock tick and poll, and a busy PR has hundreds of events.
const formatters = new Map<string, Intl.DateTimeFormat>();
const cachedFormatter = (locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat => {
  const cacheKey = `${locale}|${JSON.stringify(options)}`;
  let formatter = formatters.get(cacheKey);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    formatters.set(cacheKey, formatter);
  }
  return formatter;
};

export const dayKeyOf = (value: unknown, timeZone?: string): string => {
  const time = parseTime(value);
  if (!Number.isFinite(time)) return "";
  // en-CA formats a date as YYYY-MM-DD.
  return cachedFormatter("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(time);
};

// An event's time of day ("3:05 PM"); empty for a missing or invalid time.
export const formatTimeOfDay = (value: unknown, timeZone?: string): string => {
  const time = parseTime(value);
  if (!Number.isFinite(time)) return "";
  return cachedFormatter("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(time);
};

export const buildActivityFeed = (events: readonly PrActivityEvent[], options: ActivityFeedOptions): ActivityFeed => {
  const lastLooked = parseTime(options.lastLookedAt);
  const hasLastLooked = Number.isFinite(lastLooked);
  const isSince = (event: PrActivityEvent) => hasLastLooked && parseTime(event?.occurredAt) > lastLooked;
  const sinceCount = events.filter(isSince).length;
  const sinceScope = options.scope === "since" && hasLastLooked;
  const scoped = sinceScope ? events.filter(isSince) : events.slice();

  const kindCounts: Record<ActivityKind, number> = { commit: 0, review: 0, comment: 0, event: 0 };
  scoped.forEach((event) => {
    kindCounts[activityKindOf(event)] += 1;
  });
  const shown = scoped.filter((event) => options.kinds.includes(activityKindOf(event)));

  const days: FeedDay[] = [];
  let markerPlaced = false;
  shown.forEach((event) => {
    const key = dayKeyOf(event?.occurredAt, options.timeZone);
    let day = days[days.length - 1];
    if (!day || day.key !== key) {
      day = { key, items: [] };
      days.push(day);
    }
    if (!sinceScope && hasLastLooked && !markerPlaced && !isSince(event)) {
      day.items.push({ kind: "marker", at: options.lastLookedAt });
      markerPlaced = true;
    }

    const previous = day.items[day.items.length - 1];
    const actor = String(event?.actor || "");
    if (activityKindOf(event) === "commit" && previous) {
      if (previous.kind === "commits" && previous.actor === actor) {
        previous.events.push(event);
        return;
      }
      if (previous.kind === "event" && activityKindOf(previous.event) === "commit" && String(previous.event?.actor || "") === actor) {
        day.items[day.items.length - 1] = { kind: "commits", actor, events: [previous.event, event] };
        return;
      }
    }
    day.items.push({ kind: "event", event });
  });

  return {
    days,
    totalCount: events.length,
    sinceCount,
    kindCounts,
    shownCount: shown.length,
    earlierCount: sinceScope
      ? events.filter((event) => !isSince(event) && options.kinds.includes(activityKindOf(event))).length
      : 0,
  };
};

const dayFormatter = (options: Intl.DateTimeFormatOptions) => cachedFormatter("en-US", { ...options, timeZone: "UTC" });

// A day heading: "Today", "Yesterday", else "Tue · Oct 22" (with the year
// when it isn't this year's). `key` is a dayKeyOf day.
export const describeDay = (key: string, nowMs: number, timeZone?: string): string => {
  const match = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "Unknown date";
  const today = dayKeyOf(new Date(nowMs).toISOString(), timeZone);
  // The calendar day before today's, not "24 hours ago": across a daylight
  // saving change a day is 23 or 25 hours long.
  const [todayYear = 0, todayMonth = 1, todayDay = 1] = today.split("-").map(Number);
  const yesterday = new Date(Date.UTC(todayYear, todayMonth - 1, todayDay - 1)).toISOString().slice(0, 10);
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  const date = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const weekday = dayFormatter({ weekday: "short" }).format(date);
  const sameYear = today.slice(0, 4) === match[1];
  const monthDay = dayFormatter(sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" }).format(date);
  return `${weekday} · ${monthDay}`;
};
