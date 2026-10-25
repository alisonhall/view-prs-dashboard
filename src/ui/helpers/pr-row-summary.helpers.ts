import type { PrData, ReviewThread } from "../types/pr-data.ts";
import { asArray } from "./pr-as-array.helpers.ts";
import { parseSortableTime } from "./pr-sortable-time.helpers.ts";
import { describeChecks, describeMergeable } from "./pr-row-signals.helpers.ts";
import { getViewedFilesState } from "./pr-viewed-files-state.helpers.ts";

// What a row's inline summary (PrRowSummary, UI_REDESIGN_PLAN.md phase 3)
// shows besides the attention reasons and the activity feed: a one-line
// status, and the open review threads to list.

const CHECKS_TEXT: Record<string, string> = {
  checksPass: "Checks pass",
  checksFail: "Checks failing",
  checksPending: "Checks running",
  checksSkipped: "Checks skipped",
};

const MERGEABLE_TEXT: Record<string, string> = {
  merge: "No conflicts",
  mergeConflict: "Has conflicts",
  mergeUnknown: "Mergeability unknown",
};

const toCount = (value: unknown): number => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

// "Checks failing · Has conflicts · 1 approval · 3 of 4 files viewed":
// the same values as the row's CHK·MRG and Review cells, in words. Parts
// with no data are left out.
export const describeStatusLine = (pr: PrData = {}): string => {
  const checks = describeChecks(pr);
  const mergeable = describeMergeable(pr);
  const approvals = toCount(pr?.approvalCount);
  const viewed = getViewedFilesState(pr);
  const viewedText =
    viewed.changedFilesCount <= 0
      ? ""
      : viewed.isComplete
        ? "All files viewed"
        : `${viewed.viewedFilesCount} of ${viewed.changedFilesCount} files viewed`;
  return [
    checks ? CHECKS_TEXT[checks.icon] : "",
    mergeable ? MERGEABLE_TEXT[mergeable.icon] : "",
    `${approvals} approval${approvals === 1 ? "" : "s"}`,
    viewedText,
  ]
    .filter(Boolean)
    .join(" · ");
};

export interface SummaryThread {
  // The file's name without its folders, and the full path.
  file: string;
  path: string;
  line: number | null;
  // The latest comment: who wrote it, its text on one line, and when.
  authorLogin: string;
  authorName: string;
  text: string;
  latestAt: string;
  url: string;
}

export interface SummaryThreads {
  threads: SummaryThread[];
  openCount: number;
}

const HTML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };

// A comment body (markdown, which GitHub lets hold HTML) down to one plain
// line: code fences, quote/heading/list markers, HTML tags and link syntax
// removed; images (markdown or <img>) as "[image]", so an image-only
// comment isn't blank; inline code and paired emphasis (**x**, _x_, ~~x~~)
// keep their text. A lone `*` or an underscore inside a word (user_id)
// stays as written. Whitespace is collapsed.
export const toPlainLine = (body: unknown): string =>
  String(body ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " [image] ")
    .replace(/<img\b[^>]*>/gi, " [image] ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/?[a-z][a-z0-9-]*(?:\s[^>]*)?\/?>/gi, " ")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_match, name: string) => HTML_ENTITIES[name] ?? "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s*(?:>|#{1,6}|[-*+]|\d+\.)\s+/gm, "")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*|__|~~)(?=\S)([\s\S]*?\S)\1/g, "$2")
    .replace(/\*(?=\S)([^*]*?\S)\*/g, "$1")
    .replace(/(^|[^\w])_(?=\S)([^_]*?\S)_(?![\w])/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();

const threadTime = (thread: ReviewThread): number => {
  const comments = asArray(thread?.comments);
  const latestComment = Math.max(...comments.map((comment) => parseSortableTime(comment?.createdAt || "")), 0);
  return Math.max(parseSortableTime(thread?.latestCommentAt || ""), latestComment);
};

// The unresolved review threads, most recently active first, as the
// summary lists them: the first `limit` of them, and how many there are.
export const getSummaryThreads = (pr: PrData = {}, limit: number = 2): SummaryThreads => {
  const open = asArray(pr?.reviewThreads).filter((thread) => thread?.isResolved !== true);
  const threads = open
    .map((thread, index) => ({ thread, index, time: threadTime(thread) }))
    // Newest first; threads with the same time (or none) keep their order.
    .sort((a, b) => b.time - a.time || a.index - b.index)
    .slice(0, Math.max(0, limit))
    .map(({ thread }) => {
      const comments = asArray(thread?.comments)
        .slice()
        .sort((a, b) => parseSortableTime(a?.createdAt || "") - parseSortableTime(b?.createdAt || ""));
      const located = comments.find((comment) => String(comment?.path || "").trim());
      const latest = comments[comments.length - 1];
      const path = String(located?.path || "").trim();
      const line = located ? (located.line ?? located.originalLine ?? null) : null;
      const url = String(comments.find((comment) => String(comment?.url || "").trim())?.url || "").trim();
      return {
        file: path.split("/").pop() || "",
        path,
        line,
        authorLogin: String(latest?.authorLogin || "").trim(),
        authorName: String(latest?.authorName || "").trim(),
        text: toPlainLine(latest?.body),
        latestAt: String(latest?.createdAt || thread?.latestCommentAt || "").trim(),
        url,
      };
    });
  return { threads, openCount: open.length };
};
