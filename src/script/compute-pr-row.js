#!/usr/bin/env node
// One PR's row, computed from what check-open-pr-updates.sh fetched for it
// (ROADMAP.md, Data freshness step 6). This was compute_pr_state_json and
// its helpers in bash and jq - dozens of jq processes a row, most of a
// run's time on Windows. The script still fetches, reads the user state,
// clears an ack and writes the detail file; this is the computation only,
// one process a row.
//
// It was ported to match the jq value for value, checked by a parity test
// until the port shipped: jq's ordering (sort_by, group_by, unique_by,
// string comparison by code point), its `//` (only null and false fall
// through), fromdateiso8601's one format, `jq -r`'s raw output, and each
// object's key order.
//
// CLI: node compute-pr-row.js <input-dir> - reads pr.json, detail.json,
// threads.json, review-comments.json, review-url-map.json,
// viewed-files.json and settings.json from it, and prints "clear-ack" or
// "keep-ack" on the first line (the ack to clear: CHANGED since it), and
// the row's JSON on the second.

const crypto = require("crypto");
const fs = require("fs");

// --- jq semantics ----------------------------------------------------------

const TYPE_ORDER = (value) => {
  if (value === null || value === undefined) return 0;
  if (value === false) return 1;
  if (value === true) return 2;
  if (typeof value === "number") return 3;
  if (typeof value === "string") return 4;
  if (Array.isArray(value)) return 5;
  return 6;
};

// jq compares strings by their UTF-8 bytes - code point order.
const compareStrings = (a, b) => (a === b ? 0 : Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8")));

const jqCompare = (a, b) => {
  const typeA = TYPE_ORDER(a);
  const typeB = TYPE_ORDER(b);
  if (typeA !== typeB) return typeA < typeB ? -1 : 1;
  if (typeA === 3) return a === b ? 0 : a < b ? -1 : 1;
  if (typeA === 4) return compareStrings(a, b);
  if (typeA === 5) {
    for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
      const order = jqCompare(a[i], b[i]);
      if (order !== 0) return order;
    }
    return a.length === b.length ? 0 : a.length < b.length ? -1 : 1;
  }
  if (typeA === 6) {
    const keysA = Object.keys(a).sort(compareStrings);
    const keysB = Object.keys(b).sort(compareStrings);
    const keyOrder = jqCompare(keysA, keysB);
    if (keyOrder !== 0) return keyOrder;
    for (const key of keysA) {
      const order = jqCompare(a[key], b[key]);
      if (order !== 0) return order;
    }
    return 0;
  }
  return 0;
};

// Stable, as jq's.
const sortBy = (items, keyOf) =>
  items
    .map((item, index) => ({ item, index, key: keyOf(item) }))
    .sort((x, y) => jqCompare(x.key, y.key) || x.index - y.index)
    .map(({ item }) => item);

const groupBy = (items, keyOf) => {
  const groups = [];
  let lastKey;
  sortBy(items, keyOf).forEach((item) => {
    const key = keyOf(item);
    if (groups.length > 0 && jqCompare(key, lastKey) === 0) {
      groups[groups.length - 1].push(item);
    } else {
      groups.push([item]);
    }
    lastKey = key;
  });
  return groups;
};

const uniqueBy = (items, keyOf) => groupBy(items, keyOf).map((group) => group[0]);

const unique = (items) => uniqueBy(items, (item) => item);

const isAbsent = (value) => value === null || value === undefined || value === false;
// jq's `a // b`.
const alt = (...values) => {
  for (let i = 0; i < values.length - 1; i += 1) {
    if (!isAbsent(values[i])) return values[i];
  }
  return values[values.length - 1];
};

// jq's `.[]?` over an object's values too.
const each = (value) => (Array.isArray(value) ? value : value && typeof value === "object" ? Object.values(value) : []);

const field = (value, key) => (value && typeof value === "object" && !Array.isArray(value) ? value[key] : undefined);

// `x | split("T") | .[0]`: jq splits "" into [] - so null.
const datePart = (value) => (value === "" ? null : String(value).split("T")[0]);

const asciiUpcase = (value) => String(value).replace(/[a-z]/g, (c) => c.toUpperCase());
const asciiDowncase = (value) => String(value).replace(/[A-Z]/g, (c) => c.toLowerCase());

// jq's tostring: strings as they are, anything else as compact JSON.
const toString = (value) => (typeof value === "string" ? value : JSON.stringify(value === undefined ? null : value));

// `jq -r` of a value, as bash captured it: $(...) drops trailing newlines.
const dropTrailingNewlines = (text) => text.replace(/\n+$/, "");
const jqRaw = (value) => dropTrailingNewlines(value === null || value === undefined ? "null" : toString(value));

// fromdateiso8601 takes only YYYY-MM-DDTHH:MM:SSZ; anything else is an error
// (null here, as `try ... catch null`).
const toEpoch = (value) => {
  const match = typeof value === "string" ? value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})T(\d{1,2}):(\d{1,2}):(\d{1,2})Z$/) : null;
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match.map(Number);
  return Date.UTC(y, mo - 1, d, h, mi, s) / 1000;
};

const testRegex = (text, pattern, flags = "") => new RegExp(pattern, flags).test(text);

const sum = (numbers) => numbers.reduce((total, n) => total + n, 0);
// `[...] | add // 0`.
const addOrZero = (numbers) => (numbers.length === 0 ? 0 : sum(numbers));

const lastOr = (items, fallback) => (items.length > 0 ? items[items.length - 1] : fallback);
const nonEmpty = (items) => items.filter((value) => value !== null && value !== undefined && value !== "");

// jq -cS's text: keys sorted, compact; jq also escapes DEL.
const canonicalJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort(compareStrings)
      .map((key) => `${JSON.stringify(key).replace(/\x7f/g, "\\u007f")}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  if (typeof value === "string") return JSON.stringify(value).replace(/\x7f/g, "\\u007f");
  return JSON.stringify(value === undefined ? null : value);
};

// --- the script's helpers --------------------------------------------------

// normalize_author_name: "Last, First" as "First Last", spaces collapsed.
const SPACE = "[ \\t\\n\\v\\f\\r]";
const normalizeAuthorName = (login, name) => {
  if (name === "" || name === "null") return login;
  let normalized = name;
  const comma = name.indexOf(",");
  if (comma >= 0) {
    const trim = (text) => text.replace(new RegExp(`^${SPACE}+`), "").replace(new RegExp(`${SPACE}+$`), "");
    normalized = `${trim(name.slice(comma + 1))} ${trim(name.slice(0, comma))}`;
  }
  return normalized
    .replace(new RegExp(`${SPACE}+`, "g"), " ")
    .replace(new RegExp(`^${SPACE}+`), "")
    .replace(new RegExp(`${SPACE}+$`), "");
};

const normalizeComments = (detail) =>
  sortBy(
    each(field(detail, "comments"))
      .map((c) => ({
        id: alt(c?.id, ""),
        authorLogin: alt(c?.author?.login, "unknown"),
        authorName: alt(c?.author?.name, ""),
        authorAssociation: alt(c?.authorAssociation, ""),
        createdAt: alt(c?.createdAt, ""),
        publishedAt: alt(c?.publishedAt, c?.createdAt, ""),
        body: alt(c?.body, ""),
        url: alt(c?.url, ""),
      }))
      .filter((c) => c.createdAt !== ""),
    (c) => [c.createdAt, c.id],
  );

const normalizeReviews = (detail) =>
  sortBy(
    each(field(detail, "reviews"))
      .map((r) => ({
        id: alt(r?.id, ""),
        authorLogin: alt(r?.author?.login, "unknown"),
        authorName: alt(r?.author?.name, ""),
        authorAssociation: alt(r?.authorAssociation, ""),
        submittedAt: alt(r?.submittedAt, ""),
        state: alt(r?.state, ""),
        body: alt(r?.body, ""),
        url: alt(r?.url, ""),
        commitOid: alt(r?.commit?.oid, ""),
      }))
      .filter((r) => r.submittedAt !== ""),
    (r) => [r.submittedAt, r.id],
  );

const MERGE_MAIN_HEADLINE = /^(Merge (branch|remote-tracking branch).*(main|origin\/main)|Merge main into )/;
const normalizeCommits = (detail) =>
  sortBy(
    each(field(detail, "commits"))
      .map((c) => ({
        oid: alt(c?.oid, ""),
        committedAt: alt(c?.committedDate, ""),
        messageHeadline: alt(c?.messageHeadline, ""),
        messageBody: alt(c?.messageBody, ""),
        authors: each(alt(c?.authors, [])).map((a) => ({
          login: alt(a?.login, ""),
          name: alt(a?.name, ""),
          email: alt(a?.email, ""),
        })),
      }))
      .filter((c) => c.committedAt !== "")
      .filter((c) => !MERGE_MAIN_HEADLINE.test(toString(alt(c.messageHeadline, "")))),
    (c) => [c.committedAt, c.oid],
  );

const buildCommentEvents = (comments, reviewThreads, reviewComments) => {
  const events = [
    ...each(comments).map((c) => ({
      sourceId: alt(c?.id, ""),
      threadId: "",
      occurredAt: alt(c?.createdAt, ""),
      date: datePart(alt(c?.createdAt, "")),
      actor: alt(c?.authorLogin, "unknown"),
      type: "comment",
      channel: "top-level",
      body: alt(c?.body, ""),
      url: alt(c?.url, ""),
    })),
    ...each(reviewThreads).flatMap((thread) =>
      each(thread?.comments).map((c) => ({
        sourceId: alt(c?.id, ""),
        threadId: alt(thread?.id, ""),
        occurredAt: alt(c?.createdAt, ""),
        date: datePart(alt(c?.createdAt, "")),
        actor: alt(c?.authorLogin, "unknown"),
        type: "comment",
        channel: "thread",
        body: alt(c?.body, ""),
        url: alt(c?.url, ""),
        replyToId: alt(c?.replyToId, ""),
        conversationResolved: alt(thread?.isResolved, false),
      })),
    ),
    ...each(reviewComments).map((c) => ({
      sourceId: alt(c?.id, ""),
      threadId: alt(c?.reviewId, "") !== "" ? `review-${c.reviewId}` : "",
      occurredAt: alt(c?.createdAt, ""),
      date: datePart(alt(c?.createdAt, "")),
      actor: alt(c?.authorLogin, "unknown"),
      type: "comment",
      channel: "thread",
      body: alt(c?.body, ""),
      url: alt(c?.url, ""),
      replyToId: alt(c?.inReplyToId, ""),
      conversationResolved: false,
    })),
  ].filter((e) => e.occurredAt !== "" && e.date !== "");
  return sortBy(
    uniqueBy(events, (e) =>
      [alt(e.url, ""), alt(e.occurredAt, ""), alt(e.actor, ""), alt(e.channel, ""), alt(e.body, "")].map(toString).join("|"),
    ),
    (e) => [e.occurredAt, e.actor, e.channel, e.sourceId],
  );
};

const buildActivityEvents = ({ commentEvents, reviews, commits, createdAt, authorLogin, mergedAt, mergedByLogin, closedAt }) => {
  const events = [
    ...each(commentEvents),
    ...each(reviews).map((r) => ({
      sourceId: alt(r?.id, ""),
      threadId: "",
      occurredAt: alt(r?.submittedAt, ""),
      date: datePart(alt(r?.submittedAt, "")),
      actor: alt(r?.authorLogin, "unknown"),
      type: r?.state === "APPROVED" ? "approval" : "review",
      channel: "review",
      state: alt(r?.state, ""),
      body: alt(r?.body, ""),
      url: alt(r?.url, ""),
      commitOid: alt(r?.commitOid, ""),
    })),
    ...each(commits).flatMap((commit) =>
      each(commit?.authors)
        .filter((a) => alt(a?.login, "") !== "" || alt(a?.name, "") !== "" || alt(a?.email, "") !== "")
        .map((a) => ({
          sourceId: alt(commit?.oid, ""),
          threadId: "",
          occurredAt: alt(commit?.committedAt, ""),
          date: datePart(alt(commit?.committedAt, "")),
          actor:
            alt(a?.login, "") !== ""
              ? a.login
              : alt(a?.name, "") !== ""
                ? a.name
                : alt(a?.email, "") !== ""
                  ? a.email
                  : "unknown",
          type: "commit",
          channel: "commit",
          messageHeadline: alt(commit?.messageHeadline, ""),
          messageBody: alt(commit?.messageBody, ""),
        })),
    ),
    ...(createdAt !== ""
      ? [
          {
            sourceId: "opened",
            threadId: "",
            occurredAt: createdAt,
            date: datePart(createdAt),
            actor: alt(authorLogin, "") !== "" ? authorLogin : "unknown",
            type: "opened",
            channel: "system",
          },
        ]
      : []),
    ...(mergedAt !== ""
      ? [
          {
            sourceId: "merged",
            threadId: "",
            occurredAt: mergedAt,
            date: datePart(mergedAt),
            actor: alt(mergedByLogin, "") !== "" ? mergedByLogin : "unknown",
            type: "merged",
            channel: "system",
          },
        ]
      : []),
    ...(closedAt !== "" && mergedAt === ""
      ? [
          {
            sourceId: "closed",
            threadId: "",
            occurredAt: closedAt,
            date: datePart(closedAt),
            actor: "unknown",
            type: "closed",
            channel: "system",
          },
        ]
      : []),
  ].filter((e) => e.occurredAt !== "" && e.date !== "");
  return sortBy(events, (e) => [e.occurredAt, e.actor, e.type, e.channel, e.sourceId]);
};

const timelineKey = (e) => [e.occurredAt, e.actor, e.type, e.channel, e.sourceId];
const nonEmptyChannels = (channels) => channels.filter((c) => c !== null && c !== undefined && c !== "");

const buildActivityTimeline = (activityEvents) => {
  const groups = [];
  sortBy(each(activityEvents), timelineKey).forEach((event) => {
    const last = groups[groups.length - 1];
    if (last && jqCompare(last.date, event.date) === 0 && jqCompare(last.actor, event.actor) === 0 && jqCompare(last.type, event.type) === 0) {
      groups[groups.length - 1] = {
        ...last,
        count: last.count + 1,
        latestAt: event.occurredAt,
        channels: unique(nonEmptyChannels([...alt(last.channels, []), event.channel])),
        events: [...alt(last.events, []), event],
      };
    } else {
      groups.push({
        date: event.date,
        actor: event.actor,
        type: event.type,
        count: 1,
        earliestAt: event.occurredAt,
        latestAt: event.occurredAt,
        channels: nonEmptyChannels([event.channel]),
        events: [event],
      });
    }
  });
  return sortBy(groups, (g) => [g.date, g.latestAt, g.actor, g.type]).reverse();
};

const TYPE_LABELS = { approval: "approved", opened: "opened PR", merged: "merged PR", closed: "closed PR" };
const typeLabel = (type, count) => {
  if (type === "comment" || type === "review" || type === "commit") return count > 1 ? `${type}s` : type;
  if (TYPE_LABELS[type]) return TYPE_LABELS[type];
  return count > 1 ? `${type}s` : type;
};

const buildActivityTimelineSummary = (timeline) =>
  groupBy(sortBy(each(timeline), (g) => [g.date, g.latestAt, g.actor, g.type]).reverse(), (g) => g.date)
    .map(
      (day) =>
        `${toString(day[0].date)}: ${day
          .map((g) =>
            g.count > 1
              ? `${toString(g.actor)} ${typeLabel(g.type, g.count)} (${toString(g.count)})`
              : `${toString(g.actor)} ${typeLabel(g.type, g.count)}`,
          )
          .join("; ")}`,
    )
    .join("\n");

const minutesBetween = (start, end) => {
  const startEpoch = toEpoch(start);
  const endEpoch = toEpoch(end);
  return startEpoch === null || endEpoch === null ? null : Math.floor((endEpoch - startEpoch) / 60);
};

const gt = (a, b) => jqCompare(a, b) > 0;

const buildMetrics = ({ comments, reviews, commits, reviewThreads, commentEvents, activityEvents, authorLogin, mergedAt }) => {
  const people = Object.fromEntries(
    groupBy(
      sortBy(
        [
          ...each(comments).map((c) => ({ login: alt(c?.authorLogin, ""), name: alt(c?.authorName, "") })),
          ...each(reviews).map((r) => ({ login: alt(r?.authorLogin, ""), name: alt(r?.authorName, "") })),
          ...each(reviewThreads).flatMap((t) => each(t?.comments).map((c) => ({ login: alt(c?.authorLogin, ""), name: alt(c?.authorName, "") }))),
          ...each(commits).flatMap((c) => each(c?.authors).map((a) => ({ login: alt(a?.login, ""), name: alt(a?.name, "") }))),
        ].filter((p) => p.login !== ""),
        (p) => [p.login, p.name],
      ),
      (p) => p.login,
    )
      .map((group) => ({
        key: group[0].login,
        value: alt(lastOr(nonEmpty(group.filter((p) => p.name !== p.login).map((p) => p.name)), null), ""),
      }))
      .filter((entry) => entry.value !== "")
      .map((entry) => [toString(entry.key), entry.value]),
  );
  const personName = (login) => people[login];

  const authorCommitsAfter = (comment) =>
    each(activityEvents).filter(
      (e) => e?.type === "commit" && e?.actor === authorLogin && gt(alt(e?.occurredAt, ""), alt(comment?.occurredAt, "")),
    );

  const commentsByActor = sortBy(
    groupBy(sortBy(each(commentEvents), (e) => [e.actor, e.occurredAt, e.sourceId]), (e) => e.actor).map((group) => {
      const withTime = group.filter((e) => alt(e?.occurredAt, "") !== "");
      const actor = group[0].actor;
      const row = {
        login: actor,
        name: alt(personName(actor), actor),
        topLevelCount: group.filter((e) => e.channel === "top-level").length,
        threadCount: group.filter((e) => e.channel === "thread").length,
        resolvedThreadCount: group.filter((e) => e.channel === "thread" && e.conversationResolved === true).length,
        openThreadCount: group.filter((e) => e.channel === "thread" && e.conversationResolved === false).length,
        followedByAuthorCommitCount: addOrZero(withTime.map((comment) => (authorCommitsAfter(comment).length > 0 ? 1 : 0))),
        followedByAuthorCommitWithin24hCount: addOrZero(
          withTime.map((comment) =>
            authorCommitsAfter(comment).filter((e) => alt(toEpoch(e.occurredAt), 0) - alt(toEpoch(comment.occurredAt), 0) <= 24 * 60 * 60)
              .length > 0
              ? 1
              : 0,
          ),
        ),
        totalCount: group.length,
        firstCommentAt: alt(nonEmpty(group.map((e) => e.occurredAt))[0] ?? null, ""),
        lastCommentAt: alt(lastOr(nonEmpty(group.map((e) => e.occurredAt)), null), ""),
        isPrAuthor: actor === authorLogin,
        commentsOnOthersPr: actor !== authorLogin,
      };
      return { ...row, usefulnessSignals: row.resolvedThreadCount + row.followedByAuthorCommitCount + row.followedByAuthorCommitWithin24hCount };
    }),
    (row) => [row.totalCount, row.lastCommentAt, row.login],
  ).reverse();

  const reviewsByActor = sortBy(
    groupBy(sortBy(each(reviews), (r) => [r.authorLogin, r.submittedAt, r.id]), (r) => r.authorLogin).map((group) => {
      const login = group[0].authorLogin;
      return {
        login,
        name: alt(personName(login), group[0].authorName, login),
        reviewCount: group.length,
        approvalCount: group.filter((r) => r.state === "APPROVED").length,
        commentCount: group.filter((r) => r.state === "COMMENTED").length,
        changesRequestedCount: group.filter((r) => r.state === "CHANGES_REQUESTED").length,
        dismissedCount: group.filter((r) => r.state === "DISMISSED").length,
        lastReviewAt: alt(lastOr(nonEmpty(group.map((r) => r.submittedAt)), null), ""),
        lastApprovalAt: alt(lastOr(nonEmpty(group.filter((r) => r.state === "APPROVED").map((r) => r.submittedAt)), null), ""),
        isPrAuthor: login === authorLogin,
        reviewsOnOthersPr: login !== authorLogin,
      };
    }),
    (row) => [row.approvalCount, row.reviewCount, row.lastReviewAt, row.login],
  ).reverse();

  const approvals = each(reviews)
    .filter((r) => r?.state === "APPROVED")
    .map((approval) => {
      const approvedAt = alt(approval.submittedAt, "");
      const after = (e) => gt(alt(e?.occurredAt, ""), approvedAt);
      const row = {
        login: alt(approval.authorLogin, "unknown"),
        name: alt(personName(approval.authorLogin), approval.authorName, approval.authorLogin, "unknown"),
        approvedAt,
        mergeLeadMinutes: minutesBetween(approvedAt, mergedAt),
        commentCountAfterApproval: each(activityEvents).filter((e) => after(e) && e.type === "comment").length,
        reviewCountAfterApproval: each(activityEvents).filter((e) => after(e) && e.type === "review").length,
        changeRequestCountAfterApproval: each(reviews).filter(
          (r) => gt(alt(r?.submittedAt, ""), approvedAt) && r.state === "CHANGES_REQUESTED",
        ).length,
        commitCountAfterApproval: each(activityEvents).filter((e) => after(e) && e.type === "commit").length,
      };
      row.issueSignalsAfterApprovalCount =
        row.commentCountAfterApproval + row.reviewCountAfterApproval + row.changeRequestCountAfterApproval + row.commitCountAfterApproval;
      row.highRiskApproval = row.changeRequestCountAfterApproval > 0 || row.issueSignalsAfterApprovalCount >= 3;
      row.riskyApproval = row.issueSignalsAfterApprovalCount > 0;
      return row;
    });

  const threads = each(reviewThreads);
  const openThreads = threads.filter((t) => t?.isResolved === false).length;
  const resolvedThreads = threads.filter((t) => t?.isResolved === true).length;
  const threadCommentCount = threads.flatMap((t) => each(alt(t?.comments, []))).length;
  const topLevelConversations = unique(
    each(commentEvents)
      .filter((e) => e?.channel === "top-level")
      .map((e) => e.sourceId)
      .filter((id) => id !== ""),
  ).length;
  const reviewConversations = unique(
    each(activityEvents)
      .filter((e) => e?.channel === "review" && (e.type === "review" || e.type === "approval"))
      .map((e) => e.sourceId)
      .filter((id) => id !== ""),
  ).length;
  const estimatedTotalConversations = threads.length > 0 ? threads.length : topLevelConversations + reviewConversations;
  const estimatedOpenConversations =
    threads.length > 0 ? openThreads : topLevelConversations + each(reviews).filter((r) => r?.state === "CHANGES_REQUESTED").length;
  const mergeLeadMinutes = approvals.map((a) => a.mergeLeadMinutes).filter((m) => m !== null);
  const fromOthers = commentsByActor.filter((row) => row.commentsOnOthersPr === true);

  return {
    counts: {
      topLevelComments: each(comments).length,
      threadComments: threadCommentCount,
      totalComments: each(commentEvents).length,
      reviews: each(reviews).length,
      approvals: each(reviews).filter((r) => r?.state === "APPROVED").length,
      commits: each(commits).length,
      conversations: estimatedTotalConversations,
      openConversations: estimatedOpenConversations,
    },
    commentsByActor,
    reviewsByActor,
    approvals,
    approvalSummary: {
      totalApprovals: approvals.length,
      riskyApprovals: approvals.filter((a) => a.riskyApproval === true).length,
      highRiskApprovals: approvals.filter((a) => a.highRiskApproval === true).length,
      approvalsWithChangeRequestsAfter: approvals.filter((a) => a.changeRequestCountAfterApproval > 0).length,
      approvalsWithCommentsAfter: approvals.filter((a) => a.commentCountAfterApproval > 0).length,
      approvalsWithCommitsAfter: approvals.filter((a) => a.commitCountAfterApproval > 0).length,
      averageMergeLeadMinutes: mergeLeadMinutes.length === 0 ? null : Math.floor(sum(mergeLeadMinutes) / mergeLeadMinutes.length),
    },
    commentUsefulnessSummary: {
      commentsOnOthersPrs: addOrZero(fromOthers.map((row) => row.totalCount)),
      resolvedThreadCommentsOnOthersPrs: addOrZero(fromOthers.map((row) => row.resolvedThreadCount)),
      commentsFollowedByAuthorCommit: addOrZero(fromOthers.map((row) => row.followedByAuthorCommitCount)),
      commentsFollowedByAuthorCommitWithin24h: addOrZero(fromOthers.map((row) => row.followedByAuthorCommitWithin24hCount)),
      usefulnessSignals: addOrZero(fromOthers.map((row) => row.usefulnessSignals)),
    },
    conversationSummary: {
      totalThreads: threads.length,
      openThreads,
      resolvedThreads,
      totalThreadComments: threadCommentCount,
      topLevelConversations,
      reviewConversations,
      estimatedTotalConversations,
      estimatedOpenConversations,
    },
  };
};

const splitList = (text, separator) =>
  String(text || "")
    .split(separator)
    .filter((part) => part.length > 0);

// countExternalCommits: commits with an author other than the viewer,
// after `since` (every one when empty), leaving out merge commits (a
// headline matching a merge pattern, case-insensitively - an invalid
// pattern matches nothing - or every author in the merge logins) and ones
// matching the ignore patterns. An invalid ignore pattern failed the jq
// there, which counted as none. With `reviewedOid` (the commit the
// viewer's latest review was on), the commits after it in the PR count as
// new too: a commit's date is when it was made, not pushed, so one made
// before the review and pushed after it would otherwise be missed.
// When each of a PR's commits was pushed, by id, from the pushes to its
// branch ([{before, after, timestamp}], fetch_pr_push_history_json): a
// commit came with the first push that moved the branch past it - from
// before it (`before`; any commit, when that isn't one of the PR's: a new
// branch, a force-push) to it or a commit after it (`after`). Commits no
// push reached (a fork's, or ones from before the oldest push GitHub
// returned) aren't in it.
const pushedAtByOid = (commits, pushes) => {
  const oids = each(commits).map((commit) => alt(commit?.oid, ""));
  const pushedAt = {};
  sortBy(
    each(pushes).filter((push) => alt(push?.after, "") !== "" && alt(push?.timestamp, "") !== ""),
    (push) => push.timestamp,
  ).forEach((push) => {
    const from = oids.indexOf(alt(push.before, ""));
    const upTo = oids.indexOf(push.after);
    for (let i = from + 1; i <= upTo; i += 1) {
      if (oids[i] !== "" && pushedAt[oids[i]] === undefined) pushedAt[oids[i]] = push.timestamp;
    }
  });
  return pushedAt;
};

// Whether each of a PR's commits (by its index among them) is new since
// `since`: pushed after it, when the push history says when it was pushed
// (a commit's date is when it was made, not pushed). Else dated after it,
// or after the commit the PR was at when a run first saw `since` (seenOid:
// pushed after that run, so after `since`), or after the one the viewer's
// latest review was on (reviewedOid). Everything is, with no `since`.
const newCommitTest = (commits, { since = "", reviewedOid = "", pushedAt = {}, seenOid = "" }) => {
  const indexOf = (oid) => (oid === "" ? -1 : each(commits).findIndex((commit) => commit?.oid === oid));
  const reviewedIndex = indexOf(reviewedOid);
  const seenIndex = indexOf(seenOid);
  return (commit, index) => {
    if (since === "") return true;
    const pushed = pushedAt[alt(commit?.oid, "")];
    if (pushed !== undefined) return gt(pushed, since);
    return (
      gt(alt(commit?.committedDate, ""), since) || (seenIndex !== -1 && index > seenIndex) || (reviewedIndex !== -1 && index > reviewedIndex)
    );
  };
};

const countExternalCommits = (
  detail,
  { viewerLogin, since = "", ignoreCommitPatterns = "", mergeHeadlinePatterns = [], mergeLogins = [], reviewedOid = "", pushedAt = {}, seenOid = "" },
) => {
  const mergeLoginList = mergeLogins.map(asciiDowncase);
  const allCommits = each(field(detail, "commits"));
  const isNew = newCommitTest(allCommits, { since, reviewedOid, pushedAt, seenOid });
  let ignoreRegex = null;
  if (ignoreCommitPatterns.length > 0) {
    try {
      ignoreRegex = new RegExp(ignoreCommitPatterns);
    } catch (_error) {
      return 0;
    }
  }
  return allCommits.filter((commit, index) => {
    if (!each(commit?.authors).some((a) => a?.login !== null && a?.login !== undefined && a.login !== viewerLogin)) return false;
    if (!isNew(commit, index)) return false;
    const headline = alt(commit?.messageHeadline, "");
    if (
      mergeHeadlinePatterns.some((pattern) => {
        try {
          return testRegex(headline, pattern, "i");
        } catch (_error) {
          return false;
        }
      })
    ) {
      return false;
    }
    const logins = each(commit?.authors)
      .map((a) => a?.login)
      .filter((login) => !isAbsent(login))
      .map(asciiDowncase);
    if (mergeLoginList.length > 0 && logins.length > 0 && logins.every((login) => mergeLoginList.includes(login))) return false;
    if (ignoreRegex && ignoreRegex.test(headline)) return false;
    return true;
  }).length;
};

const buildReasons = (pairs) =>
  pairs
    .filter(([, value]) => Number(value) > 0)
    .map(([label]) => label)
    .join("|");

const CHECK_RUN_STATE = (item) => {
  if (item?.__typename === "CheckRun") {
    if (alt(item.status, "") !== "COMPLETED") return "RUN";
    const conclusion = asciiUpcase(alt(item.conclusion, ""));
    if (conclusion === "SUCCESS") return "PASS";
    if (conclusion === "NEUTRAL" || conclusion === "SKIPPED") return "SKIP";
    if (conclusion === "") return "RUN";
    return "FAIL";
  }
  if (item?.__typename === "StatusContext") {
    const state = asciiUpcase(alt(item.state, ""));
    if (state === "SUCCESS") return "PASS";
    if (state === "PENDING" || state === "EXPECTED") return "RUN";
    if (state === "") return "RUN";
    return "FAIL";
  }
  return "NA";
};

const toCheckState = (detail) => {
  const states = each(alt(field(detail, "statusCheckRollup"), [])).map(CHECK_RUN_STATE);
  if (states.length === 0) return "NA";
  for (const state of ["FAIL", "RUN", "PASS", "SKIP"]) {
    if (states.includes(state)) return state;
  }
  return "NA";
};

const toMergeState = (detail) => {
  const mergeable = asciiUpcase(alt(field(detail, "mergeable"), ""));
  if (mergeable === "MERGEABLE") return "YES";
  if (mergeable === "CONFLICTING") return "NO";
  if (mergeable === "UNKNOWN" || mergeable === "") return "UNK";
  return mergeable;
};

const lastThreadComment = (thread) => lastOr(sortBy(each(alt(thread?.comments, [])), (c) => c?.createdAt), null);

// --- the row ---------------------------------------------------------------

const computePrRow = (input) => {
  const {
    pr = {},
    detail = {},
    threads = [],
    reviewComments = [],
    reviewUrlMap = {},
    viewedFilesStats = {},
    viewerLogin = "",
    ackAt = "",
    reverifyRequired = "false",
    inReviewRequired = "false",
    ignoreCommentAuthors = "",
    ignoreReviewAuthors = "",
    ignoreCommitPatterns = "",
    mergeHeadlinePatterns = ["^Merge\\b"],
    mergeLogins = [],
    // The pushes to the PR's branch (fetch_pr_push_history_json).
    pushes = [],
    // The stored row's viewerSeenHead.
    seenHead = null,
  } = input || {};

  const number = jqRaw(pr.number);
  const title = jqRaw(pr.title);
  const url = jqRaw(pr.url);
  const mergedAt = jqRaw(alt(pr.mergedAt, ""));
  const closedAt = jqRaw(alt(pr.closedAt, ""));
  const createdAt = jqRaw(alt(pr.createdAt, ""));
  const mergedByLogin = jqRaw(alt(pr.mergedBy?.login, ""));
  const sourceUpdatedAt = jqRaw(alt(pr.updatedAt, ""));
  const sourceBranch = jqRaw(alt(pr.headRefName, ""));
  const targetBranch = jqRaw(alt(pr.baseRefName, ""));
  const additions = toString(alt(pr.additions, 0));
  const deletions = toString(alt(pr.deletions, 0));
  const labels = each(alt(pr.labels, [])).map((label) =>
    label && typeof label === "object" && !Array.isArray(label) ? alt(label.name, "") : toString(label),
  );
  const authorLogin = jqRaw(alt(pr.author?.login, "-"));
  const authorName = jqRaw(alt(pr.author?.name, ""));
  const authorDisplay = dropTrailingNewlines(normalizeAuthorName(authorLogin, authorName));
  const authorIsViewer = authorLogin === viewerLogin;

  const comments = normalizeComments(detail);
  let reviews = normalizeReviews(detail);
  const requestedReviewers = uniqueBy(
    each(field(detail, "reviewRequests"))
      .map((request) => alt(request?.requestedReviewer, request?.reviewer, request?.user, request))
      .filter((person) => person && typeof person === "object" && !Array.isArray(person))
      .map((person) => ({ login: alt(person.login, ""), name: alt(person.name, "") }))
      .filter((person) => person.login !== ""),
    (person) => person.login,
  );
  const requestedReviewerLogins = unique(requestedReviewers.map((person) => alt(person.login, "")).filter((login) => login !== ""));
  const commits = normalizeCommits(detail);
  const assignees = each(field(detail, "assignees"))
    .map((person) => ({ login: alt(person?.login, ""), name: alt(person?.name, "") }))
    .filter((person) => person.login !== "");

  reviews = reviews.map((review) => ({
    ...review,
    url: alt(reviewUrlMap?.[`${toString(review.submittedAt)}_${toString(review.authorLogin)}`], review.url, ""),
  }));
  const firstByReview = (key) => {
    const map = {};
    each(reviewComments).forEach((comment) => {
      const reviewId = alt(comment?.reviewId, "");
      if (reviewId === "" || alt(comment?.[key], "") === "") return;
      map[reviewId] = alt(map[reviewId], comment[key]);
    });
    return map;
  };
  const reviewBodyMap = firstByReview("body");
  const reviewCommentUrlMap = firstByReview("url");
  reviews = reviews.map((review) => {
    const reviewUrl = review.url;
    const afterMarker = String(reviewUrl).split("pullrequestreview-")[1];
    const reviewIdText = alt(afterMarker === undefined ? null : afterMarker, "");
    const reviewId = reviewIdText === "" ? "" : alt(reviewIdText.split("?")[0], "");
    return {
      ...review,
      body: alt(review.body, "") !== "" ? review.body : reviewId !== "" ? alt(reviewBodyMap[reviewId], "") : "",
      url: reviewId !== "" && alt(reviewCommentUrlMap[reviewId], "") !== "" ? reviewCommentUrlMap[reviewId] : alt(review.url, ""),
    };
  });

  const commentEvents = buildCommentEvents(comments, threads, reviewComments);
  const activityEvents = buildActivityEvents({ commentEvents, reviews, commits, createdAt, authorLogin, mergedAt, mergedByLogin, closedAt });
  const activityTimeline = buildActivityTimeline(activityEvents);
  const activityTimelineSummary = dropTrailingNewlines(buildActivityTimelineSummary(activityTimeline));
  const metrics = buildMetrics({ comments, reviews, commits, reviewThreads: threads, commentEvents, activityEvents, authorLogin, mergedAt });

  // The viewer's last activity, their review-thread replies included.
  const myLast = alt(
    lastOr(
      sortBy(
        [
          ...each(field(detail, "comments")).filter((c) => c?.author?.login === viewerLogin).map((c) => c.createdAt),
          ...each(field(detail, "reviews")).filter((r) => r?.author?.login === viewerLogin).map((r) => r.submittedAt),
          ...each(field(detail, "commits")).filter((c) => each(c?.authors).some((a) => a?.login === viewerLogin)).map((c) => c.committedDate),
          ...each(threads).flatMap((t) => each(t?.comments).filter((c) => c?.authorLogin === viewerLogin).map((c) => c.createdAt)),
        ].filter((value) => value !== null && value !== undefined && value !== ""),
        (value) => value,
      ),
      null,
    ),
    "",
  );
  const effectiveLast = ackAt !== "" && (myLast === "" || gt(ackAt, myLast)) ? ackAt : toString(myLast);

  // A login as the ignore lists match it: whatever its case, and a bot's
  // with or without "[bot]" - GitHub's GraphQL (gh pr view) names a bot
  // "github-actions", its REST API and the README's examples
  // "github-actions[bot]", and gh its PR authors "app/github-actions".
  const ignoreKey = (login) =>
    asciiDowncase(alt(login, ""))
      .trim()
      .replace(/^app\//, "")
      .replace(/\[bot\]$/, "");
  const ignoredCommentAuthors = splitList(ignoreCommentAuthors, ",").map(ignoreKey);
  const ignoredReviewAuthors = splitList(ignoreReviewAuthors, ",").map(ignoreKey);
  const isIgnoredCommenter = (login) => ignoredCommentAuthors.includes(ignoreKey(login));
  const isIgnoredReviewer = (login) => ignoredReviewAuthors.includes(ignoreKey(login));
  const since = effectiveLast;
  const externalTopCommentCount = each(field(detail, "comments")).filter(
    (c) =>
      alt(c?.author?.login, "") !== "" &&
      c.author.login !== viewerLogin &&
      (since === "" || gt(alt(c.createdAt, ""), since)) &&
      !isIgnoredCommenter(c.author.login),
  ).length;
  const externalReviewCount = each(field(detail, "reviews")).filter(
    (r) =>
      alt(r?.author?.login, "") !== "" &&
      r.author.login !== viewerLogin &&
      (since === "" || gt(alt(r.submittedAt, ""), since)) &&
      alt(r.state, "") !== "APPROVED" &&
      !isIgnoredReviewer(r.author.login),
  ).length;
  // On the viewer's own PR, reviews that request changes or say something:
  // GitHub wraps each inline comment or thread reply in an empty COMMENTED
  // review, which the thread reasons already cover.
  const externalOwnPrReviewCount = each(field(detail, "reviews")).filter(
    (r) =>
      alt(r?.author?.login, "") !== "" &&
      r.author.login !== viewerLogin &&
      (since === "" || gt(alt(r.submittedAt, ""), since)) &&
      (r.state === "CHANGES_REQUESTED" || (r.state === "COMMENTED" && String(alt(r.body, "")).trim() !== "")) &&
      !isIgnoredReviewer(r.author.login),
  ).length;
  // The commit the viewer's latest review was on - unless an ack (seen
  // everything up to then) is the baseline, or the viewer has commented on
  // the PR or committed to it since that review: by then they'd seen the
  // commits pushed in between, which would otherwise stay new however
  // often they commented. (Their review-thread replies are reviews too.)
  const myLatestReview = lastOr(
    sortBy(
      each(field(detail, "reviews")).filter(
        (r) => alt(r?.author?.login, "") === viewerLogin && alt(r.submittedAt, "") !== "" && alt(r.commit?.oid, "") !== "",
      ),
      (r) => r.submittedAt,
    ),
    null,
  );
  const myActivityAfterReview =
    myLatestReview !== null &&
    [
      ...each(field(detail, "comments")).filter((c) => c?.author?.login === viewerLogin).map((c) => c.createdAt),
      ...each(field(detail, "commits")).filter((c) => each(c?.authors).some((a) => a?.login === viewerLogin)).map((c) => c.committedDate),
    ].some((at) => gt(alt(at, ""), myLatestReview.submittedAt));
  const reviewedOid =
    since !== "" && since === toString(myLast) && !myActivityAfterReview ? alt(myLatestReview?.commit?.oid, "") : "";
  const detailCommits = each(field(detail, "commits"));
  // When the commits were pushed, where the branch's push history says.
  const pushedAt = pushedAtByOid(detailCommits, pushes);
  // The commit the PR was at when a run first saw `since` (the viewer's
  // last activity, or Ack): kept from the stored row while `since` is the
  // same, else this run's. Commits after it were pushed after that run, so
  // after `since` - for those the push history doesn't cover (a fork's PR,
  // an older GitHub Enterprise server).
  const storedSeen = seenHead && typeof seenHead === "object" && !Array.isArray(seenHead) ? seenHead : null;
  const keptSeen = since !== "" && storedSeen !== null && storedSeen.at === since && alt(storedSeen.oid, "") !== "" ? storedSeen : null;
  const headOid = alt(lastOr(detailCommits, null)?.oid, "");
  const viewerSeenHead = keptSeen || (since !== "" && headOid !== "" ? { at: since, oid: headOid } : null);
  const commitTest = { since, reviewedOid, pushedAt, seenOid: keptSeen ? keptSeen.oid : "" };
  // For the Activity tab's "since I last looked": the commits new though
  // their dates alone would put them before it.
  const isNewCommit = newCommitTest(detailCommits, commitTest);
  const commitsAfterReview =
    since === ""
      ? []
      : detailCommits
          .filter((commit, index) => isNewCommit(commit, index) && !gt(alt(commit?.committedDate, ""), since))
          .map((commit) => alt(commit?.oid, ""))
          .filter((oid) => oid !== "");
  // How many commits the PR has, when that's more than its details hold:
  // GitHub returns the newest 250 at most.
  const commitTotalCount = Number(field(detail, "commitTotalCount")) || 0;
  const externalCommitCount = countExternalCommits(detail, {
    viewerLogin,
    ignoreCommitPatterns,
    mergeHeadlinePatterns,
    mergeLogins,
    ...commitTest,
  });

  let myLatestReviewState = sortBy(
    each(field(detail, "reviews"))
      .filter((r) => alt(r?.author?.login, "") === viewerLogin && r.submittedAt !== null && r.submittedAt !== undefined && r.state !== null && r.state !== undefined)
      .map((r) => ({ submittedAt: r.submittedAt, state: r.state })),
    (r) => r.submittedAt,
  ).reduce((state, review) => {
    if (review.state === "APPROVED") return "APPROVED";
    if (review.state === "CHANGES_REQUESTED" || review.state === "DISMISSED") return review.state;
    return state;
  }, "");
  if (requestedReviewerLogins.includes(viewerLogin)) {
    myLatestReviewState = "RE_REQUESTED";
  }

  const approversAll = sortBy(
    groupBy(
      sortBy(
        each(field(detail, "reviews"))
          .filter(
            (r) =>
              r?.author?.login !== null &&
              r?.author?.login !== undefined &&
              r.submittedAt !== null &&
              r.submittedAt !== undefined &&
              r.state !== null &&
              r.state !== undefined,
          )
          .map((r) => ({ login: r.author.login, name: alt(r.author.name, ""), state: r.state, submittedAt: r.submittedAt })),
        (r) => [r.login, r.submittedAt],
      ),
      (r) => r.login,
    )
      .map((group) => {
        const effective = group.reduce(
          (current, review) => {
            if (review.state === "APPROVED") return { state: "APPROVED", approvedAt: alt(review.submittedAt, current.approvedAt) };
            if (review.state === "CHANGES_REQUESTED" || review.state === "DISMISSED") return { state: review.state, approvedAt: "" };
            return current;
          },
          { state: "", approvedAt: "" },
        );
        return { login: alt(group[0].login, ""), name: alt(group[0].name, ""), effective };
      })
      .filter(({ effective }) => effective.state === "APPROVED")
      .map(({ login, name, effective }) => ({ login, name, approvedAt: effective.approvedAt }))
      .filter((approver) => !requestedReviewerLogins.includes(approver.login)),
    (approver) => approver.approvedAt,
  );
  const approvers = authorIsViewer ? approversAll.filter((approver) => approver.login !== viewerLogin) : approversAll;

  let approved = "NO";
  let approvalCount;
  if (authorIsViewer) {
    approvalCount = approvers.length;
    if (approvers.length >= 2) approved = "YES";
  } else {
    approvalCount = approversAll.length;
    if (myLatestReviewState === "APPROVED") approved = "YES";
  }

  const conversationSummary = metrics.conversationSummary;
  const openConversationCount = toString(alt(conversationSummary.estimatedOpenConversations, conversationSummary.openThreads, 0));
  const viewedFilesCount = jqRaw(alt(viewedFilesStats?.viewedFiles, 0));
  const changedFilesCount = jqRaw(alt(viewedFilesStats?.changedFiles, 0));
  const viewedFilesSummary = `${viewedFilesCount}/${changedFilesCount} viewed`;

  const sourceFingerprint = `fp:v2:sha256:${crypto
    .createHash("sha256")
    .update(
      canonicalJson({
        detail,
        comments,
        reviews,
        reviewRequests: requestedReviewers,
        commits,
        assignees,
        threads,
        reviewComments,
        reviewUrlMap,
        viewedFiles: viewedFilesStats,
        ciMerge: {
          statusCheckRollup: alt(field(detail, "statusCheckRollup"), []),
          mergeable: alt(field(detail, "mergeable"), ""),
          mergeStateStatus: alt(field(detail, "mergeStateStatus"), ""),
        },
      }),
      "utf8",
    )
    .digest("hex")}`;

  let unresolvedUnansweredCount = 0;
  let recentThreadReplyCount = 0;
  if (authorIsViewer) {
    const lastFromOthers = (thread) => {
      const last = lastThreadComment(thread);
      return (
        last !== null &&
        alt(last?.authorLogin, "") !== "" &&
        last.authorLogin !== viewerLogin &&
        // "Ignore comments from these authors" covers review-thread
        // comments too (a bot reviewer's).
        !isIgnoredCommenter(last.authorLogin) &&
        (effectiveLast === "" || gt(alt(last.createdAt, ""), effectiveLast))
      );
    };
    unresolvedUnansweredCount = each(threads).filter((t) => t?.isResolved === false && lastFromOthers(t)).length;
    recentThreadReplyCount = each(threads).filter((t) => lastFromOthers(t)).length;
  }

  let status = "NO_CHANGE";
  let reason = "-";
  if (authorIsViewer) {
    reason = buildReasons([
      ["unanswered-thread", unresolvedUnansweredCount],
      ["thread-reply", recentThreadReplyCount],
      ["comment", externalTopCommentCount],
      ["review", externalOwnPrReviewCount],
      ["commit", externalCommitCount],
    ]);
    if (reason !== "") status = "CHANGED";
    else reason = "-";
  } else if (effectiveLast === "") {
    status = "NO_ACTIVITY";
  } else {
    reason = buildReasons([
      ["comment", externalTopCommentCount],
      ["review", externalReviewCount],
      ["commit", externalCommitCount],
    ]);
    if (reason !== "") status = "CHANGED";
    else reason = "-";
  }

  // New activity since an ack: the ack goes (the script clears it), the
  // real reason stays.
  const clearAck = status === "CHANGED" && ackAt !== "";

  if (reverifyRequired === "true" && status === "NO_CHANGE") {
    status = "CHANGED";
    reason = "ack-cleared";
  }

  const checkState = toCheckState(detail);
  const mergeState = toMergeState(detail);

  const row = {
    number,
    title,
    titleDisplay: `${title} [CHK:${checkState}][MRG:${mergeState}]`,
    url,
    mergedAt,
    closedAt,
    sourceUpdatedAt,
    sourceFingerprint,
    sourceBranch,
    targetBranch,
    checkState,
    mergeState,
    labels,
    author: authorDisplay,
    authorLogin,
    viewerLogin,
    status,
    approved,
    approvalCount: String(approvalCount),
    inReview: String(inReviewRequired),
    approvers,
    requestedReviewers,
    assignees,
    openConversationCount,
    viewedFilesCount,
    changedFilesCount,
    additions,
    deletions,
    viewedFilesSummary,
    comments,
    reviews,
    commits,
    reviewThreads: threads,
    commentEvents,
    activityEvents,
    metrics,
    activityTimelineSummary,
    activityTimeline,
    baseline: effectiveLast,
    commitsAfterReview,
    ...(viewerSeenHead ? { viewerSeenHead } : {}),
    ...(commitTotalCount > detailCommits.length ? { commitTotalCount } : {}),
    reason,
  };
  return { row, clearAck };
};

module.exports = {
  computePrRow,
  // Each piece, for the tests.
  newCommitTest,
  pushedAtByOid,
  normalizeAuthorName,
  normalizeComments,
  normalizeReviews,
  normalizeCommits,
  buildCommentEvents,
  buildActivityEvents,
  buildActivityTimeline,
  buildActivityTimelineSummary,
  buildMetrics,
  countExternalCommits,
  buildReasons,
  toCheckState,
  toMergeState,
  canonicalJson,
  jqCompare,
};

// The script's input folder: each fetched piece in its own file (files, not
// arguments: a PR's details can pass the command line's length limit), and
// settings.json with the rest.
const readInputDir = (dir) => {
  const read = (name, fallback) => {
    const file = `${dir}/${name}`;
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8") || "null") ?? fallback : fallback;
  };
  return {
    ...read("settings.json", {}),
    pr: read("pr.json", {}),
    detail: read("detail.json", {}),
    threads: read("threads.json", []),
    reviewComments: read("review-comments.json", []),
    reviewUrlMap: read("review-url-map.json", {}),
    viewedFilesStats: read("viewed-files.json", {}),
    pushes: read("pushes.json", []),
  };
};

if (require.main === module) {
  const inputDir = process.argv[2];
  if (!inputDir) {
    process.stderr.write("usage: compute-pr-row.js <input-dir>\n");
    process.exit(2);
  }
  const { row, clearAck } = computePrRow(readInputDir(inputDir));
  process.stdout.write(`${clearAck ? "clear-ack" : "keep-ack"}\n${JSON.stringify(row)}\n`);
}
