import { createPrFormattingHelpers } from "./pr-formatting.helpers.ts";

// The app header's status pill (UI_REDESIGN_PLAN.md, phase 9a): how long
// ago the PR data was last updated (the last script run), with the exact
// time for its tooltip.

const { formatIsoDatetime } = createPrFormattingHelpers();

export interface LastUpdate {
  label: string;
  // The exact time, for the tooltip ("" when unknown).
  title: string;
  // Older than a day: the pill says so with its tone.
  isStale: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export const describeLastUpdate = (updatedAt: unknown, nowMs: number = Date.now()): LastUpdate => {
  const raw = String(updatedAt ?? "").trim();
  const updatedMs = raw && raw !== "-" ? Date.parse(raw) : Number.NaN;
  if (!Number.isFinite(updatedMs)) {
    return { label: "Not updated yet", title: "", isStale: false };
  }
  const elapsedMs = Math.max(0, nowMs - updatedMs);
  const minutes = Math.floor(elapsedMs / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const ago = minutes < 1 ? "just now" : minutes < 60 ? `${minutes}m ago` : hours < 24 ? `${hours}h ago` : `${days}d ago`;
  return { label: `Updated ${ago}`, title: `Last updated ${formatIsoDatetime(raw)}`, isStale: elapsedMs >= DAY_MS };
};

export interface ReposShown {
  // One repo's name, or "3 repos"; "" when nothing names one.
  label: string;
  // Every repo, for the tooltip when there's more than one.
  title: string;
}

// The repos the table shows rows from: every stored row's, which can span
// repos (the table and Quick check all cover them all). With no rows yet,
// the repo being run (`fallbackRepo`).
export const describeRepos = (entries: ReadonlyArray<{ repo?: string }>, fallbackRepo = ""): ReposShown => {
  const repos = Array.from(new Set(entries.map((entry) => String(entry?.repo || "").trim()).filter(Boolean))).sort();
  if (repos.length > 1) return { label: `${repos.length} repos`, title: repos.join(", ") };
  return { label: repos[0] ?? fallbackRepo.trim(), title: "" };
};
