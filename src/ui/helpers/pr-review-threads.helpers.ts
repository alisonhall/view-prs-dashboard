import type { PrData, ReviewThread, ReviewThreadComment } from "../types/pr-data.ts";
import { asArray } from "./pr-as-array.helpers.ts";
import { parseSortableTime } from "./pr-sortable-time.helpers.ts";

// The detail pane's Conversations tab (UI_REDESIGN_PLAN.md, phase 6): each
// review thread's state (waiting on the viewer, open, resolved by the wrong
// person, resolved), grouping by file, the filters, "Next unresolved", and
// the PR's top-level comments and review summaries.

// The "PR author thread resolution" rule (Advanced visibility and attention
// rules): whether the PR author may resolve a thread someone else started.
export interface ThreadResolutionPolicy {
  mode: "allow-all" | "allow-only" | "deny-only";
  // Lower-cased logins of thread starters.
  allowLoginKeys: ReadonlySet<string>;
  denyLoginKeys: ReadonlySet<string>;
}

export const ALLOW_ALL_POLICY: ThreadResolutionPolicy = { mode: "allow-all", allowLoginKeys: new Set(), denyLoginKeys: new Set() };

const loginKey = (value: unknown) => String(value ?? "").trim().toLowerCase();

const sortedComments = (thread: ReviewThread): ReviewThreadComment[] =>
  asArray(thread?.comments)
    .slice()
    .sort((a, b) => parseSortableTime(a?.createdAt || "") - parseSortableTime(b?.createdAt || ""));

// Whether the PR author resolved the thread, and whether the rule says they
// shouldn't have: under "allow-only" for a starter not on the allow list,
// under "deny-only" for one on the deny list. A thread the author started
// themselves is theirs to resolve.
export const getThreadResolutionInfo = (
  thread: ReviewThread,
  prAuthorLogin: string,
  policy: ThreadResolutionPolicy,
): { resolvedByAuthor: boolean; incorrectlyResolvedByAuthor: boolean } => {
  const author = loginKey(prAuthorLogin);
  const resolvedBy = loginKey(thread?.resolvedByLogin);
  const resolvedByAuthor = thread?.isResolved === true && Boolean(author) && Boolean(resolvedBy) && resolvedBy === author;
  const starterRaw = loginKey(sortedComments(thread)[0]?.authorLogin);
  const starter = starterRaw && starterRaw !== author ? starterRaw : "";

  let allowed = true;
  if (resolvedByAuthor && starter) {
    if (policy.mode === "allow-only") allowed = policy.allowLoginKeys.has(starter);
    else if (policy.mode === "deny-only") allowed = !policy.denyLoginKeys.has(starter);
  }
  return { resolvedByAuthor, incorrectlyResolvedByAuthor: resolvedByAuthor && !allowed };
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Whether `body` @-mentions `login` (not as part of a longer name).
export const mentions = (body: unknown, login: string): boolean => {
  const key = loginKey(login);
  if (!key) return false;
  return new RegExp(`(^|[^\\w-])@${escapeRegExp(key)}(?![\\w-])`, "i").test(String(body ?? ""));
};

const isPending = (comment: ReviewThreadComment | undefined) => String(comment?.state || "").toUpperCase() === "PENDING";

// "Waiting on me" (UI_REDESIGN_PLAN.md, decision 2): an unresolved thread
// the viewer started or replied in, whose latest comment is by someone
// else or mentions the viewer. Only submitted comments count: the
// viewer's own unsubmitted draft reply doesn't answer it.
export const isWaitingOnViewer = (thread: ReviewThread, viewerLogin: string): boolean => {
  const viewer = loginKey(viewerLogin);
  if (!viewer || thread?.isResolved === true) return false;
  const submitted = sortedComments(thread).filter((comment) => !isPending(comment));
  if (!submitted.some((comment) => loginKey(comment?.authorLogin) === viewer)) return false;
  const latest = submitted[submitted.length - 1];
  return loginKey(latest?.authorLogin) !== viewer || mentions(latest?.body, viewer);
};

export type ThreadState = "waiting" | "open" | "wrong" | "resolved";

export interface ThreadComment {
  id: string;
  authorLogin: string;
  authorName: string;
  createdAt: string;
  body: string;
  url: string;
  isPending: boolean;
}

export interface ThreadView {
  // The thread's id, else its position (stable for a given PR's data).
  id: string;
  // The file it's on ("" when no comment says), and the line.
  path: string;
  line: number | null;
  state: ThreadState;
  isOutdated: boolean;
  resolvedByLogin: string;
  resolvedByAuthor: boolean;
  // Oldest first: the starter, then the replies.
  comments: ThreadComment[];
  participants: string[];
  url: string;
}

export interface ConversationsContext {
  prAuthorLogin: string;
  viewerLogin: string;
  policy: ThreadResolutionPolicy;
}

const toComment = (comment: ReviewThreadComment & { author?: { name?: string } }, index: number): ThreadComment => ({
  id: String(comment?.id || "").trim() || `comment-${index}`,
  authorLogin: String(comment?.authorLogin || "").trim(),
  authorName: String(comment?.author?.name || comment?.authorName || "").trim(),
  createdAt: String(comment?.createdAt || "").trim(),
  body: String(comment?.body || "").trim(),
  url: String(comment?.url || "").trim(),
  isPending: isPending(comment),
});

// The thread's own link, else its starter's comment link, else any.
const threadUrl = (thread: ReviewThread & { url?: string; threadUrl?: string; webUrl?: string }, comments: ThreadComment[]) =>
  String(thread?.url || thread?.threadUrl || thread?.webUrl || "").trim() ||
  comments.find((comment) => comment.url)?.url ||
  "";

export const buildThreadViews = (pr: PrData, context: ConversationsContext): ThreadView[] =>
  asArray(pr?.reviewThreads).map((thread, index) => {
    const sorted = sortedComments(thread);
    const comments = sorted.map(toComment);
    const located = sorted.find((comment) => String(comment?.path || "").trim());
    const { resolvedByAuthor, incorrectlyResolvedByAuthor } = getThreadResolutionInfo(thread, context.prAuthorLogin, context.policy);
    const state: ThreadState =
      thread?.isResolved === true
        ? incorrectlyResolvedByAuthor
          ? "wrong"
          : "resolved"
        : isWaitingOnViewer(thread, context.viewerLogin)
          ? "waiting"
          : "open";
    return {
      id: String(thread?.id || "").trim() || `thread-${index}`,
      path: String(located?.path || "").trim(),
      line: located ? (located.line ?? located.originalLine ?? null) : null,
      state,
      isOutdated: thread?.isOutdated === true,
      resolvedByLogin: String(thread?.resolvedByLogin || "").trim(),
      resolvedByAuthor,
      comments,
      participants: asArray(thread?.participants)
        .map((login) => String(login || "").trim())
        .filter(Boolean),
      url: threadUrl(thread, comments),
    };
  });

export interface ConversationCounts {
  // Not resolved (waiting on you or open).
  unresolved: number;
  waiting: number;
  // Resolved by the PR author against the rule.
  wrong: number;
  total: number;
}

export const countThreads = (threads: readonly ThreadView[]): ConversationCounts => ({
  unresolved: threads.filter((thread) => thread.state === "waiting" || thread.state === "open").length,
  waiting: threads.filter((thread) => thread.state === "waiting").length,
  wrong: threads.filter((thread) => thread.state === "wrong").length,
  total: threads.length,
});

export type ConversationFilter = "unresolved" | "waiting" | "all";

// "Unresolved" also shows the threads resolved by the wrong person: they
// still need someone to look.
export const threadMatches = (thread: ThreadView, filter: ConversationFilter): boolean =>
  filter === "all" ? true : filter === "waiting" ? thread.state === "waiting" : thread.state !== "resolved";

export const filterCount = (threads: readonly ThreadView[], filter: ConversationFilter): number =>
  threads.filter((thread) => threadMatches(thread, filter)).length;

export interface FileGroup {
  path: string;
  threads: ThreadView[];
}

const byLine = (a: ThreadView, b: ThreadView) => (a.line ?? Number.POSITIVE_INFINITY) - (b.line ?? Number.POSITIVE_INFINITY);

// The threads the filter shows, grouped by file (in the order files first
// appear; threads by line), with those on no file last; and how many the
// filter hides.
export const groupThreadsByFile = (
  threads: readonly ThreadView[],
  filter: ConversationFilter,
): { groups: FileGroup[]; hiddenCount: number } => {
  const shown = threads.filter((thread) => threadMatches(thread, filter));
  const groups = new Map<string, ThreadView[]>();
  shown.forEach((thread) => {
    const list = groups.get(thread.path);
    if (list) list.push(thread);
    else groups.set(thread.path, [thread]);
  });
  const ordered = Array.from(groups.entries())
    .sort(([a], [b]) => (a === "" ? 1 : 0) - (b === "" ? 1 : 0))
    .map(([path, list]) => ({ path, threads: list.slice().sort(byLine) }));
  return { groups: ordered, hiddenCount: threads.length - shown.length };
};

// "Next unresolved": the next thread the "Unresolved" filter shows (so the
// wrongly resolved too) after `currentId`, in the order the "All" filter
// lists them, wrapping; the first when there's no current one. Null when
// the filter shows none.
export const nextUnresolvedId = (threads: readonly ThreadView[], currentId: string | null): string | null => {
  const ordered = groupThreadsByFile(threads, "all").groups.flatMap((group) => group.threads);
  const isUnresolved = (thread: ThreadView) => threadMatches(thread, "unresolved");
  const first = ordered.find(isUnresolved);
  if (!first) return null;
  const position = ordered.findIndex((thread) => thread.id === currentId);
  if (position < 0) return first.id;
  return (ordered.slice(position + 1).find(isUnresolved) ?? first).id;
};

export interface PlainComment {
  id: string;
  createdAt: string;
  authorLogin: string;
  authorName: string;
  body: string;
  url: string;
  state: string;
}

type Named = { author?: { name?: string }; authorName?: string };

const keepFirst = (comments: PlainComment[], keyOf: (comment: PlainComment) => string) => {
  const seen = new Set<string>();
  return comments.filter((comment) => {
    const key = keyOf(comment);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const oldestFirst = (a: PlainComment, b: PlainComment) => parseSortableTime(a.createdAt) - parseSortableTime(b.createdAt);

// The PR's top-level comments, oldest first: its `comments`, else the
// non-thread comment events; each once.
export const buildTopLevelComments = (pr: PrData): PlainComment[] => {
  const explicit = asArray(pr?.comments).map((comment) => ({
    id: String(comment?.id || "").trim(),
    createdAt: String(comment?.createdAt || "").trim(),
    authorLogin: String(comment?.authorLogin || "").trim(),
    authorName: String(comment?.authorName || (comment as Named)?.author?.name || "").trim(),
    body: String(comment?.body || "").trim(),
    url: String(comment?.url || "").trim(),
    state: String((comment as { state?: string })?.state || "").trim(),
  }));
  const fallback = explicit.length
    ? []
    : asArray(pr?.commentEvents)
        .filter((event) => {
          const type = String(event?.type || "comment").trim().toLowerCase();
          const channel = String(event?.channel || "top-level").trim().toLowerCase();
          return type === "comment" && channel !== "thread";
        })
        .map((event) => ({
          id: String(event?.sourceId || "").trim(),
          createdAt: String(event?.occurredAt || "").trim(),
          authorLogin: String(event?.actor || "").trim(),
          authorName: String((event as { authorName?: string })?.authorName || "").trim(),
          body: String(event?.body || "").trim(),
          url: String(event?.url || "").trim(),
          state: "",
        }));
  return keepFirst([...explicit, ...fallback], (c) => c.id || `${c.createdAt}|${c.authorLogin}|${c.body}`).sort(oldestFirst);
};

const signatureOf = (actor: string, occurredAt: string, body: string) => {
  const normalizedActor = actor.trim().toLowerCase();
  const time = occurredAt.trim();
  const text = body.trim();
  return normalizedActor && time && text ? `${normalizedActor}|${time.slice(0, 16)}|${text}` : "";
};

// The PR's COMMENTED reviews with a summary of their own, oldest first -
// not ones repeating a thread reply (same author, minute and text, or the
// same link), which GitHub records as both.
export const buildReviewSummaries = (
  pr: PrData,
  resolveActorDisplayName: (login: string, actorsMap: Record<string, unknown>, fallback?: string) => string,
  actorsMap: Record<string, unknown>,
): PlainComment[] => {
  const signatures = new Set<string>();
  const urls = new Set<string>();
  const add = (actors: string[], occurredAt: string, body: string, url: string) => {
    if (url) urls.add(url);
    actors.filter(Boolean).forEach((actor) => {
      const signature = signatureOf(actor, occurredAt, body);
      if (signature) signatures.add(signature);
    });
  };
  asArray(pr?.commentEvents)
    .filter((event) => String(event?.type || "comment").trim().toLowerCase() === "comment" && String(event?.channel || "").trim().toLowerCase() === "thread")
    .forEach((event) => {
      const actor = String(event?.actor || "").trim();
      add([actor, resolveActorDisplayName(actor, actorsMap)], String(event?.occurredAt || ""), String(event?.body || ""), String(event?.url || "").trim());
    });
  if (!signatures.size) {
    asArray(pr?.reviewThreads).forEach((thread) =>
      asArray(thread?.comments).forEach((comment) => {
        const login = String(comment?.authorLogin || "").trim();
        const name = String((comment as Named)?.author?.name || comment?.authorName || "").trim();
        add([login, name, resolveActorDisplayName(login, actorsMap, name)], String(comment?.createdAt || ""), String(comment?.body || ""), String(comment?.url || "").trim());
      }),
    );
  }

  const candidates = asArray(pr?.reviews)
    .filter((review) => String(review?.state || "").trim().toUpperCase() === "COMMENTED" && String(review?.body || "").trim())
    .map((review) => ({
      id: String(review?.id || "").trim(),
      createdAt: String(review?.submittedAt || "").trim(),
      authorLogin: String(review?.authorLogin || "").trim(),
      authorName: String(review?.authorName || review?.author?.name || "").trim(),
      body: String(review?.body || "").trim(),
      url: String(review?.url || "").trim(),
      state: String(review?.state || "").trim(),
    }))
    .filter((review) => {
      if (review.url && urls.has(review.url)) return false;
      const variants = [review.authorLogin, review.authorName, resolveActorDisplayName(review.authorLogin, actorsMap, review.authorName)].filter(Boolean);
      return !variants.some((variant) => signatures.has(signatureOf(variant, review.createdAt, review.body)));
    });
  return keepFirst(candidates, (r) => r.id || `${r.createdAt}|${r.authorLogin}|${r.body}|${r.state}`).sort(oldestFirst);
};
