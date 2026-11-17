import type { PrActivityEvent, PrData, PrReview } from "../types/pr-data.ts";

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

// Your Acks of the PR as activity events, newest first (as the feed is):
// each time in its Ack history (ackHistoryByRepo) and the current Ack
// (ackByRepo) - an Ack from before there was a history is only there. The
// current one is marked (state "current"); the others were taken back by a
// later Ack or cleared by a change since, and still show that you looked.
export const buildAckEvents = (history: readonly string[] | null | undefined, currentAck: string, viewerLogin: string): PrActivityEvent[] => {
  const current = String(currentAck || "").trim();
  const times = Array.from(new Set([...(history || []), current].map((time) => String(time || "").trim())))
    .filter((time) => Number.isFinite(parseTime(time)))
    .sort((a, b) => parseTime(b) - parseTime(a));
  return times.map((time) => ({
    sourceId: `ack-${time}`,
    occurredAt: time,
    date: time.slice(0, 10),
    actor: viewerLogin,
    type: "ack",
    channel: "system",
    state: time === current ? "current" : "",
  }));
};

// When you last Ack'd the PR: the latest of its Ack history and current
// Ack. Empty when it never was.
export const getLastAckedAt = (history: readonly string[] | null | undefined, currentAck: string): string =>
  String(buildAckEvents(history, currentAck, "")[0]?.occurredAt || "");

// The commits new since the viewer last looked though dated before it:
// pushed after it (the row's commitsAfterReview). Not once an Ack later than the row's baseline is
// when they last looked: that saw these commits too.
export const newCommitOidsFor = (pr: PrData, lastLookedAt: string): string[] =>
  lastLookedAt && lastLookedAt === String(pr?.baseline || "").trim() && Array.isArray(pr?.commitsAfterReview)
    ? pr.commitsAfterReview
    : [];

// Whether an event is new since the viewer last looked: after then, or one
// of the new commits dated before it. Nothing is without a last-looked time.
const isNewSince = (lastLookedAt: string, newCommitOids: readonly string[] = []) => {
  const lastLooked = parseTime(lastLookedAt);
  const oids = new Set(newCommitOids);
  return (event: PrActivityEvent): boolean =>
    Number.isFinite(lastLooked) &&
    (parseTime(event?.occurredAt) > lastLooked || (activityKindOf(event) === "commit" && oids.has(String(event?.sourceId || ""))));
};

// Of the events new since the viewer last looked: a commit new though
// dated before then - one of newCommitOids, after the commit their latest
// review was on. Shown by its date, so it's tagged to say why it's new
// ("Not in your last review").
export const isNotInReview = (event: PrActivityEvent, lastLookedAt: string): boolean =>
  activityKindOf(event) === "commit" && !(parseTime(event?.occurredAt) > parseTime(lastLookedAt));

// What's new since the viewer last looked, for the row's change tooltip
// and summary: the new events, newest first, and how many of each kind. A
// commit with several authors is one event per author in the feed, but one
// commit here; the empty review GitHub wraps an inline comment in isn't a
// review here.
export interface SinceLastLooked {
  events: PrActivityEvent[];
  commits: number;
  reviews: number;
  comments: number;
  // Logins by each reviewer's newest verdict, newest first.
  changesRequestedBy: string[];
  approvedBy: string[];
  merged: boolean;
  closed: boolean;
}

export const summarizeSinceLastLooked = (
  events: readonly PrActivityEvent[],
  { lastLookedAt, newCommitOids }: { lastLookedAt: string; newCommitOids?: readonly string[] },
): SinceLastLooked => {
  const isNew = isNewSince(lastLookedAt, newCommitOids);
  const newEvents = events.filter((event) => event?.type !== "ack" && isNew(event));
  const commitIds = new Set<string>();
  // Each reviewer's newest verdict (the events are newest first).
  const verdicts = new Map<string, "approved" | "changes">();
  let commits = 0;
  let reviews = 0;
  let comments = 0;
  newEvents.forEach((event) => {
    const kind = activityKindOf(event);
    if (kind === "commit") {
      const id = String(event?.sourceId || "");
      if (!id || !commitIds.has(id)) commits += 1;
      if (id) commitIds.add(id);
    } else if (kind === "review") {
      const state = String(event?.state || "").toUpperCase();
      // GitHub wraps each inline comment or thread reply in an empty
      // COMMENTED review: the comment is counted, not that.
      if (state === "COMMENTED" && !String(event?.body || "").trim()) return;
      reviews += 1;
      const actor = String(event?.actor || "").trim();
      const verdict = event?.type === "approval" || state === "APPROVED" ? "approved" : state === "CHANGES_REQUESTED" ? "changes" : null;
      if (actor && verdict && !verdicts.has(actor)) verdicts.set(actor, verdict);
    } else if (kind === "comment") {
      comments += 1;
    }
  });
  const withVerdict = (verdict: "approved" | "changes") =>
    Array.from(verdicts.entries()).flatMap(([actor, value]) => (value === verdict ? [actor] : []));
  return {
    events: newEvents,
    commits,
    reviews,
    comments,
    changesRequestedBy: withVerdict("changes"),
    approvedBy: withVerdict("approved"),
    merged: newEvents.some((event) => event?.type === "merged"),
    closed: newEvents.some((event) => event?.type === "closed"),
  };
};

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;
const listNames = (logins: readonly string[], nameOf: (login: string) => string) => logins.map(nameOf).join(", ");

// That, in words: "2 commits", "1 review (changes requested by Sam)",
// "3 comments", "Merged". Empty when nothing's new.
export const describeSinceLastLooked = (since: SinceLastLooked, nameOf: (login: string) => string = (login) => login): string[] => {
  const verdicts = [
    since.approvedBy.length ? `approved by ${listNames(since.approvedBy, nameOf)}` : "",
    since.changesRequestedBy.length ? `changes requested by ${listNames(since.changesRequestedBy, nameOf)}` : "",
  ].filter(Boolean);
  return [
    since.commits ? plural(since.commits, "commit") : "",
    since.reviews ? `${plural(since.reviews, "review")}${verdicts.length ? ` (${verdicts.join("; ")})` : ""}` : "",
    since.comments ? plural(since.comments, "comment") : "",
    since.merged ? "Merged" : since.closed ? "Closed" : "",
  ].filter(Boolean);
};

// A time said briefly from now: "at 3:05 PM" today, else "on Nov 2" (with
// the year when it isn't this year's). Empty for an invalid time.
export const formatWhenShort = (value: unknown, nowMs: number, timeZone?: string): string => {
  const key = dayKeyOf(value, timeZone);
  if (!key) return "";
  const today = dayKeyOf(new Date(nowMs).toISOString(), timeZone);
  if (key === today) return `at ${formatTimeOfDay(value, timeZone)}`;
  const options: Intl.DateTimeFormatOptions =
    key.slice(0, 4) === today.slice(0, 4) ? { month: "short", day: "numeric", timeZone } : { month: "short", day: "numeric", year: "numeric", timeZone };
  return `on ${cachedFormatter("en-US", options).format(parseTime(value))}`;
};

// "since you acked on Nov 2", or "since your last activity at 3:05 PM":
// whichever of your Ack and your last activity is when you last looked.
export const describeLastLooked = (
  { lastLookedAt, lastAckedAt }: { lastLookedAt: string; lastAckedAt: string },
  nowMs: number,
  timeZone?: string,
): string => {
  const when = formatWhenShort(lastLookedAt, nowMs, timeZone);
  if (!when) return "";
  return lastAckedAt && lastAckedAt === lastLookedAt ? `since you acked ${when}` : `since your last activity ${when}`;
};

// Who's requesting changes now: reviewers whose latest approving, change-
// requesting or dismissed review requested changes (a comment-only review
// leaves their verdict as it was). Logins, newest first.
export const findChangesRequestedBy = (reviews: readonly PrReview[] | null | undefined): string[] => {
  const latest = new Map<string, { state: string; at: number }>();
  (Array.isArray(reviews) ? reviews : []).forEach((review) => {
    const login = String(review?.authorLogin || "").trim();
    const state = String(review?.state || "").toUpperCase();
    const at = parseTime(review?.submittedAt);
    if (!login || !["APPROVED", "CHANGES_REQUESTED", "DISMISSED"].includes(state) || !Number.isFinite(at)) return;
    const previous = latest.get(login);
    if (!previous || at >= previous.at) latest.set(login, { state, at });
  });
  return Array.from(latest.entries())
    .filter(([, verdict]) => verdict.state === "CHANGES_REQUESTED")
    .sort((a, b) => b[1].at - a[1].at)
    .map(([login]) => login);
};

// The feed's events with your Acks among them, newest first.
export const withAckEvents = (events: readonly PrActivityEvent[], ackEvents: readonly PrActivityEvent[]): PrActivityEvent[] =>
  ackEvents.length
    ? [...events, ...ackEvents].sort((a, b) => String(b?.occurredAt || "").localeCompare(String(a?.occurredAt || "")))
    : events.slice();

// `notInReview`: new commits dated before the viewer last looked
// (isNotInReview).
export type FeedItem =
  | { kind: "event"; event: PrActivityEvent; notInReview?: boolean }
  // Two or more commits in a row (newest first) by one person on one day,
  // all tagged notInReview or none.
  | { kind: "commits"; actor: string; events: PrActivityEvent[]; notInReview?: boolean }
  // In the "All" scope: everything after this is from before the viewer
  // last looked, but for commits tagged notInReview.
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
  // Commits new since the viewer last looked though dated before it:
  // pushed after it (the row's commitsAfterReview).
  newCommitOids?: readonly string[];
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
  const hasLastLooked = Number.isFinite(parseTime(options.lastLookedAt));
  const isSince = isNewSince(options.lastLookedAt, options.newCommitOids);
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
    const notInReview = isSince(event) && isNotInReview(event, options.lastLookedAt);
    const tag = notInReview ? { notInReview } : {};
    if (activityKindOf(event) === "commit" && previous && previous.kind !== "marker" && Boolean(previous.notInReview) === notInReview) {
      if (previous.kind === "commits" && previous.actor === actor) {
        previous.events.push(event);
        return;
      }
      if (previous.kind === "event" && activityKindOf(previous.event) === "commit" && String(previous.event?.actor || "") === actor) {
        day.items[day.items.length - 1] = { kind: "commits", actor, events: [previous.event, event], ...tag };
        return;
      }
    }
    day.items.push({ kind: "event", event, ...tag });
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
