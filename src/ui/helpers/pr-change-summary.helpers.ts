import type { PrData } from "../types/pr-data.ts";
import { describeLastLooked, describeSinceLastLooked, type SinceLastLooked } from "./pr-activity-feed.helpers.ts";
import { CHANGED_FALLBACK_TEXT, describeChangeReasons, describeChangeReasonsBesides } from "./pr-needs-attention.helpers.ts";

// What changed on a PR since you last looked, in words: the row's change
// dot's tooltip and the summary's "Why it's here".

export interface ChangeSummaryInput {
  row: PrData;
  lastLookedAt: string;
  lastAckedAt: string;
  since: SinceLastLooked;
  nowMs: number;
  nameOf?: (login: string) => string;
  timeZone?: string;
}

export interface ChangeSummary {
  // "since you acked on Nov 2"; "" without a last-looked time.
  when: string;
  // "2 commits · 1 review (changes requested by Sam)"; "" when nothing new
  // is in the feed.
  counts: string;
  // The change reasons the counts don't say; every reason without counts.
  others: string[];
}

export const summarizeChange = ({ row, lastLookedAt, lastAckedAt, since, nowMs, nameOf, timeZone }: ChangeSummaryInput): ChangeSummary => {
  const parts = describeSinceLastLooked(since, nameOf);
  return {
    when: describeLastLooked({ lastLookedAt, lastAckedAt }, nowMs, timeZone),
    counts: parts.join(" · "),
    others: parts.length ? describeChangeReasonsBesides(row, since) : describeChangeReasons(row),
  };
};

// The change dot's tooltip: "Changed since you acked on Nov 2", the counts,
// then any other reasons, one per line.
export const describeChangeTooltip = (change: ChangeSummary): string[] => [
  change.when ? `Changed ${change.when}` : CHANGED_FALLBACK_TEXT,
  ...(change.counts ? [change.counts] : []),
  ...change.others,
];

// The needs-attention reasons with the change's reasons ("New commits",
// "New reviews") made one counted line where the first was: "Since you
// acked on Nov 2: 2 commits · 1 review". Reasons the counts don't say stay.
// As they were when nothing new could be counted, or the change isn't
// among them (its section doesn't count changes).
export const withCountedChange = (reasons: readonly string[], row: PrData, change: ChangeSummary): string[] => {
  const changeTexts = new Set([...describeChangeReasons(row), CHANGED_FALLBACK_TEXT]);
  const first = reasons.findIndex((reason) => changeTexts.has(reason));
  if (first < 0 || !change.counts) return reasons.slice();
  const kept = new Set(change.others);
  // Counts are only there with a last-looked time, so `when` is too.
  const when = `${change.when.charAt(0).toUpperCase()}${change.when.slice(1)}`;
  return reasons.flatMap((reason, index) => {
    const keep = !changeTexts.has(reason) || kept.has(reason);
    if (index === first) return [`${when}: ${change.counts}`, ...(keep ? [reason] : [])];
    return keep ? [reason] : [];
  });
};
