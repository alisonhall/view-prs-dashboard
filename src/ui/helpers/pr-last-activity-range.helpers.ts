// The filter bar's "Last activity" date range: from and to are date
// inputs' values ("2026-11-03"), either one empty for no limit on that
// side. Both days count in full, in this browser's time zone. A PR's last
// activity is getPrLastActivityTime's (author-picker.helpers.ts): the
// latest of its GitHub update, merge and close times - GitHub's update time
// moves with any activity (a comment, review, push, label).

import { getPrLastActivityTime } from "./author-picker.helpers.ts";
import type { PrEntry } from "../types/pr-data.ts";

const DATE_INPUT = /^(\d{4})-(\d{2})-(\d{2})$/;

// The start of that day here, in ms, or null for an empty or impossible
// date ("2026-02-30").
export const parseDateInputValue = (value: unknown): number | null => {
  const match = DATE_INPUT.exec(String(value ?? "").trim());
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  const date = new Date(year, month, day);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
  return date.getTime();
};

// The range in ms, from the start of `from` to the end of `to` (the start
// of the next day, less 1ms - right on a daylight-saving change too); null
// where there's no limit.
export const lastActivityRangeBounds = (from: unknown, to: unknown): { fromMs: number | null; toMs: number | null } => {
  const fromMs = parseDateInputValue(from);
  const toStart = parseDateInputValue(to);
  if (toStart === null) return { fromMs, toMs: null };
  const toDate = new Date(toStart);
  return { fromMs, toMs: new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate() + 1).getTime() - 1 };
};

// A start after the end: no PR can match (the filter bar says so).
export const isLastActivityRangeReversed = (from: unknown, to: unknown): boolean => {
  const { fromMs, toMs } = lastActivityRangeBounds(from, to);
  return fromMs !== null && toMs !== null && fromMs > toMs;
};

// Whether the PR's last activity is in the range. Any PR is, with no
// limits; one with no activity time isn't, with any.
export const isInLastActivityRange = (entry: PrEntry | null | undefined, from: unknown, to: unknown): boolean => {
  const { fromMs, toMs } = lastActivityRangeBounds(from, to);
  if (fromMs === null && toMs === null) return true;
  const time = getPrLastActivityTime(entry);
  if (!Number.isFinite(time)) return false;
  return (fromMs === null || time >= fromMs) && (toMs === null || time <= toMs);
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const formatDay = (ms: number): string => {
  const date = new Date(ms);
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
};

// The chip's words: "Last activity: Nov 1, 2026 – Nov 10, 2026", "Last
// activity: from Nov 1, 2026", "Last activity: until Nov 10, 2026"; "" with
// no limits.
export const describeLastActivityRange = (from: unknown, to: unknown): string => {
  const fromMs = parseDateInputValue(from);
  const toMs = parseDateInputValue(to);
  if (fromMs !== null && toMs !== null) return `Last activity: ${formatDay(fromMs)} – ${formatDay(toMs)}`;
  if (fromMs !== null) return `Last activity: from ${formatDay(fromMs)}`;
  if (toMs !== null) return `Last activity: until ${formatDay(toMs)}`;
  return "";
};
