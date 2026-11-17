const path = require("path");
const { sanitizeDiffPathToken, isObject } = require("./view-prs-data-helpers");

const VIEW_PRS_DETAIL_SCHEMA_VERSION = "v1";

const HEAVY_PR_DETAIL_FIELDS = [
  "activityTimeline",
  "activityEvents",
  "reviewThreads",
  "commentEvents",
];

const DETAIL_FIELD_DEFAULTS = {
  activityTimeline: [],
  activityEvents: [],
  reviewThreads: [],
  commentEvents: [],
};

const getPrDetailStorageFilePath = (prDetailDir, repo, prNumber) => {
  const safeRepo = sanitizeDiffPathToken(repo).replace(/-/g, "_");
  const safePr = String(prNumber || "").trim();
  return path.join(prDetailDir, `${safeRepo}__pr-${safePr}.json`);
};

const buildPrDetailRef = ({ filePath, schemaVersion = VIEW_PRS_DETAIL_SCHEMA_VERSION } = {}) => ({
  file: String(filePath || "").trim(),
  version: String(schemaVersion || VIEW_PRS_DETAIL_SCHEMA_VERSION),
});

const extractHeavyPrDetailFields = (prData = {}) => {
  const detailData = {};

  HEAVY_PR_DETAIL_FIELDS.forEach((field) => {
    const value = prData?.[field];
    if (Array.isArray(value)) {
      detailData[field] = value;
      return;
    }
    detailData[field] = DETAIL_FIELD_DEFAULTS[field];
  });

  return detailData;
};

const stripHeavyPrDetailFields = (prData = {}) => {
  if (!isObject(prData)) {
    return {};
  }

  const summaryData = { ...prData };
  HEAVY_PR_DETAIL_FIELDS.forEach((field) => {
    delete summaryData[field];
  });
  return summaryData;
};

const mergePrDetailFields = (summaryData = {}, detailData = {}) => {
  const merged = isObject(summaryData) ? { ...summaryData } : {};

  HEAVY_PR_DETAIL_FIELDS.forEach((field) => {
    const detailValue = detailData?.[field];
    if (Array.isArray(detailValue)) {
      merged[field] = detailValue;
      return;
    }

    const inlineValue = merged[field];
    if (!Array.isArray(inlineValue)) {
      merged[field] = DETAIL_FIELD_DEFAULTS[field];
    }
  });

  return merged;
};

// The text in the detail fields - comment bodies, commit messages, links:
// about half their size, and read only where one PR is shown in full (the
// detail pane, the expanded row's summary, the PR JSON window, the export).
const DETAIL_TEXT_KEYS = ["body", "bodyText", "bodyHTML", "messageBody", "messageHeadline", "diffHunk", "url"];

const withoutText = (item) => {
  if (!isObject(item)) return item;
  const slim = { ...item };
  DETAIL_TEXT_KEYS.forEach((key) => {
    delete slim[key];
  });
  return slim;
};

// The logins a comment @-mentions (lower case), as the page's "Waiting on
// me" reads them (mentions() in pr-review-threads.helpers.ts) - kept on a
// slim comment in place of its body.
const MENTION_PATTERN = /(^|[^\w-])@([A-Za-z0-9](?:[\w-]*[A-Za-z0-9])?(?:\[bot\])?)(?![\w-])/g;
const extractMentionedLogins = (body) => {
  const logins = new Set();
  String(body ?? "").replace(MENTION_PATTERN, (_match, _before, login) => {
    logins.add(login.toLowerCase());
    return "";
  });
  return Array.from(logins);
};

const slimThreadComment = (comment) => {
  if (!isObject(comment)) return comment;
  const mentions = extractMentionedLogins(comment.body);
  return mentions.length ? { ...withoutText(comment), mentions } : withoutText(comment);
};

// A row's detail fields as the list carries them: everything the table,
// filters, Needs Attention, Review stats and Authors read (who, what kind,
// when, resolved or not, the logins mentioned), without the text. The
// timeline is left out: its events are activityEvents grouped by day and
// person (compute-pr-row.js's buildActivityTimeline), which every reader
// outside the detail pane falls back to.
const slimPrDetailFields = (prData = {}) => {
  if (!isObject(prData)) return {};
  const asList = (value) => (Array.isArray(value) ? value : []);
  const timelineEvents = asList(prData.activityTimeline).flatMap((bucket) => asList(bucket?.events));
  const events = asList(prData.activityEvents).length ? asList(prData.activityEvents) : timelineEvents;
  return {
    ...prData,
    activityTimeline: [],
    activityEvents: events.map(withoutText),
    commentEvents: asList(prData.commentEvents).map(withoutText),
    reviewThreads: asList(prData.reviewThreads).map((thread) =>
      isObject(thread) ? { ...withoutText(thread), comments: asList(thread.comments).map(slimThreadComment) } : thread,
    ),
  };
};

const hasPrDetailContent = (prData = {}) =>
  isObject(prData) && HEAVY_PR_DETAIL_FIELDS.some((field) => Array.isArray(prData[field]) && prData[field].length > 0);

module.exports = {
  DETAIL_TEXT_KEYS,
  extractMentionedLogins,
  slimPrDetailFields,
  hasPrDetailContent,
  VIEW_PRS_DETAIL_SCHEMA_VERSION,
  HEAVY_PR_DETAIL_FIELDS,
  DETAIL_FIELD_DEFAULTS,
  getPrDetailStorageFilePath,
  buildPrDetailRef,
  extractHeavyPrDetailFields,
  stripHeavyPrDetailFields,
  mergePrDetailFields,
};
