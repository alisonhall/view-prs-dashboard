import type { PrData, PrEntry } from "../types/pr-data.ts";
import { createPrUiRenderUtilsHelpers } from "./pr-ui-render-utils.helpers.ts";
import { createPrFormattingHelpers } from "./pr-formatting.helpers.ts";
import { getManualNotesFieldSummary, getManualNotesSummary } from "./pr-manual-notes-summary.helpers.ts";
import { getViewedFilesState } from "./pr-viewed-files-state.helpers.ts";

// What each of a PR row's signal slots shows (UI_REDESIGN_PLAN.md: an icon
// in a fixed slot, with its full value on hover/focus): an icon name, a
// tone, and the tooltip text. Icon names match components/ui/Icon.tsx; a
// signal with nothing to show is null, which leaves its slot empty.

const { parseMarkerState } = createPrUiRenderUtilsHelpers();
const { formatIsoDatetime } = createPrFormattingHelpers();

export type SignalTone = "success" | "danger" | "attention" | "pending" | "muted";

export interface SignalView<Icon extends string = string> {
  icon: Icon;
  tone: SignalTone;
  // The tooltip; may have several lines.
  label: string;
}

// The CHK / MRG state: the field, else the marker in titleDisplay
// ("[CHK:PASS][MRG:YES]"), else "-".
const readState = (field: unknown, pr: PrData, marker: "CHK" | "MRG"): string => {
  const value = String(field || "").trim().toUpperCase();
  return value || parseMarkerState(pr?.titleDisplay, marker);
};

export type ChecksIcon = "checksPass" | "checksFail" | "checksPending" | "checksSkipped";

// check-open-pr-updates.sh's check_state: PASS, FAIL, RUN, SKIP, or NA (no
// checks). No checks, or no data, leaves the slot empty.
export const describeChecks = (pr: PrData = {}): SignalView<ChecksIcon> | null => {
  const state = readState(pr?.checkState, pr, "CHK");
  if (state === "PASS") return { icon: "checksPass", tone: "success", label: "Checks: PASS\nAll checks passed" };
  if (state === "FAIL") return { icon: "checksFail", tone: "danger", label: "Checks: FAIL\nAt least one check failed" };
  if (state === "RUN") return { icon: "checksPending", tone: "pending", label: "Checks: RUN\nChecks are still running" };
  if (state === "SKIP") return { icon: "checksSkipped", tone: "muted", label: "Checks: SKIP\nChecks were skipped" };
  return null;
};

export type MergeableIcon = "merge" | "mergeConflict" | "mergeUnknown";

// GitHub's `mergeable` field as the script stores it: YES (no conflicts),
// NO (conflicts), UNK (not computed yet), or GitHub's own value.
export const describeMergeable = (pr: PrData = {}): SignalView<MergeableIcon> | null => {
  const state = readState(pr?.mergeState, pr, "MRG");
  if (state === "-") return null;
  if (state === "YES") return { icon: "merge", tone: "success", label: "Mergeable: YES\nNo conflicts" };
  if (state === "NO") return { icon: "mergeConflict", tone: "attention", label: "Mergeable: NO\nHas conflicts" };
  if (state === "UNK") return { icon: "mergeUnknown", tone: "muted", label: "Mergeable: UNK\nGitHub hasn't computed it yet" };
  return { icon: "mergeUnknown", tone: "muted", label: `Mergeable: ${state}` };
};

export interface ViewedFilesView {
  text: string;
  tone: SignalTone;
  label: string;
}

// "3/4", green once every file is viewed. Null when the PR has no changed
// files recorded.
export const describeViewedFiles = (pr: PrData = {}): ViewedFilesView | null => {
  const state = getViewedFilesState(pr);
  if (state.changedFilesCount <= 0) return null;
  const all = state.isComplete;
  return {
    text: `${state.viewedFilesCount}/${state.changedFilesCount}`,
    tone: all ? "success" : "muted",
    label: all
      ? `Viewed files: all ${state.changedFilesCount}`
      : `Viewed files: ${state.viewedFilesCount} of ${state.changedFilesCount}`,
  };
};

// The notes icon's tooltip, listing the fields that have content; null
// when there are no notes.
export const describeNotes = (entry: PrEntry = {}, pr: PrData = {}): string | null => {
  const fields = getManualNotesFieldSummary(entry, pr);
  const { commentsCount } = getManualNotesSummary(entry, pr);
  const parts: string[] = [];
  if (fields.hasCustomComments) parts.push(`${commentsCount} comment${commentsCount === 1 ? "" : "s"}`);
  if (fields.hasOtherNotes) parts.push("other notes");
  if (fields.hasDifficulty) parts.push(fields.difficultyLevelText ? `difficulty ${fields.difficultyLevelText}` : "difficulty");
  if (fields.hasStories) parts.push("stories");
  if (fields.hasAnalysisOfPr) parts.push("analysis of PR");
  return parts.length ? `Notes: ${parts.join(" · ")}` : null;
};

const toCount = (value: unknown): number => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

export interface SizeView {
  additions: string;
  deletions: string;
  label: string;
}

// "+38 −12", with the files count in the tooltip. Null when the PR has no
// line counts recorded.
export const describeSize = (pr: PrData = {}): SizeView | null => {
  const hasCounts = pr?.additions !== undefined || pr?.deletions !== undefined;
  if (!hasCounts) return null;
  const additions = toCount(pr.additions);
  const deletions = toCount(pr.deletions);
  const files = toCount(pr.changedFilesCount);
  const filesText = files ? `${files} file${files === 1 ? "" : "s"} changed\n` : "";
  return {
    additions: `+${additions}`,
    deletions: `−${deletions}`,
    label: `${filesText}+${additions} additions, −${deletions} deletions`,
  };
};

const parseTimestamp = (value: unknown): number => {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "-") return Number.NaN;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

// A short relative age: "now", "5m", "3h", "12d". Empty for a missing or
// invalid time.
export const formatShortAge = (value: unknown, nowMs: number = Date.now()): string => {
  const timestamp = parseTimestamp(value);
  if (!Number.isFinite(timestamp)) return "";
  const minutes = Math.floor(Math.max(0, nowMs - timestamp) / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

export interface ActivityView {
  text: string;
  label: string;
}

// The Activity column: how long since the PR's last activity (merged,
// closed, or last commit, as the old date column showed), with both that
// time and the viewer's last activity in the tooltip.
export const describeActivity = (pr: PrData = {}, nowMs: number = Date.now()): ActivityView => {
  const time = pr?.mergedAt || pr?.closedAt || pr?.sourceUpdatedAt || "";
  const kind = pr?.mergedAt ? "Merged" : pr?.closedAt ? "Closed" : "Last commit";
  const viewerTime = String(pr?.baseline || "").trim();
  const viewerLine = viewerTime && viewerTime !== "-" ? formatIsoDatetime(viewerTime) : "–";
  return {
    text: formatShortAge(time, nowMs) || "–",
    label: `${kind}: ${time ? formatIsoDatetime(time) : "–"}\nYour last activity: ${viewerLine}`,
  };
};
