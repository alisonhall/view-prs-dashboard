const path = require("path");

const isViewPrsFixtureRow = (entry) =>
  String(entry?.data?.url || "").startsWith("https://example.com/");

const parseTimestamp = (value) => {
  const parsed = Date.parse(String(value || ""));
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
};

const isObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toTrimmedString = (value) => String(value || "").trim();

const isRepoSlug = (value) => /^[^/\s]+\/[^/\s]+$/.test(toTrimmedString(value));

const parseRepoCsv = (raw) =>
  String(raw || "")
    .split(",")
    .map((value) => toTrimmedString(value))
    .filter((value) => isRepoSlug(value));

const toUtcIsoSeconds = (value) =>
  new Date(value).toISOString().replace(/\.[0-9]{3}Z$/, "Z");

const parseNotesCommentCreatedAtFromId = (commentId) => {
  const rawId = String(commentId || "").trim();
  const match = rawId.match(/^comment-(\d{10,13})-/);
  if (!match) {
    return null;
  }

  const numericValue = Number.parseInt(match[1], 10);
  if (!Number.isFinite(numericValue)) {
    return null;
  }

  // Support legacy ids that might use seconds instead of milliseconds.
  const timestampMs = match[1].length <= 10 ? numericValue * 1000 : numericValue;
  if (!Number.isFinite(timestampMs)) {
    return null;
  }
  return timestampMs;
};

const normalizeNotesComment = (comment) => {
  if (!isObject(comment)) {
    return null;
  }
  const normalizedId =
    String(comment.id || "").trim() ||
    `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const createdAtCandidate = String(comment.createdAt || "").trim();
  const updatedAtCandidate = String(comment.updatedAt || "").trim();
  const createdAtTimestampMsFromField = Date.parse(createdAtCandidate);
  const createdAtTimestampMsFromId = parseNotesCommentCreatedAtFromId(normalizedId);
  const nowTimestampMs = Date.now();
  const createdAtTimestampMs = Number.isFinite(createdAtTimestampMsFromField)
    ? createdAtTimestampMsFromField
    : Number.isFinite(createdAtTimestampMsFromId)
      ? createdAtTimestampMsFromId
      : nowTimestampMs;
  const createdAt = toUtcIsoSeconds(createdAtTimestampMs);

  const updatedAtTimestampMs = Date.parse(updatedAtCandidate);
  const updatedAt = Number.isFinite(updatedAtTimestampMs)
    ? toUtcIsoSeconds(updatedAtTimestampMs)
    : createdAt;

  return {
    id: normalizedId,
    author: String(comment.author ?? ""),
    tone: ["Positive", "Negative", "Neutral"].includes(comment.tone)
      ? comment.tone
      : "Neutral",
    note: String(comment.note ?? ""),
    createdAt,
    updatedAt,
  };
};

const normalizeNotes = (notes) => {
  if (!isObject(notes)) {
    return null;
  }

  const comments = (Array.isArray(notes.comments) ? notes.comments : [])
    .map((comment) => normalizeNotesComment(comment))
    .filter(Boolean);

  const normalizeDifficulty = (value) => {
    const normalized = String(value ?? "").trim();
    return ["1", "2", "3", "4", "5"].includes(normalized)
      ? normalized
      : "";
  };

  const normalizeStringList = (value) => {
    if (Array.isArray(value)) {
      return value
        .map((item) => String(item ?? "").trim())
        .filter(Boolean);
    }
    const singleValue = String(value ?? "").trim();
    return singleValue ? [singleValue] : [];
  };

  return {
    comments,
    otherNotes: String(notes.otherNotes ?? ""),
    prDifficulty: normalizeDifficulty(notes.prDifficulty),
    rallyStories: normalizeStringList(notes.rallyStories),
    rallyLinks: normalizeStringList(notes.rallyLinks),
    analysisOfPr: String(notes.analysisOfPr ?? ""),
  };
};

const normalizeAuthorCommentSentiment = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return ["positive", "negative", "neutral"].includes(normalized)
    ? normalized
    : "neutral";
};

const normalizeAuthorComment = (comment) => {
  if (!isObject(comment)) {
    return null;
  }

  const createdAtCandidate = String(comment.createdAt || "").trim();
  const createdAt = Number.isFinite(Date.parse(createdAtCandidate))
    ? createdAtCandidate
    : new Date().toISOString();
  const updatedAtCandidate = String(comment.updatedAt || "").trim();
  const updatedAt = Number.isFinite(Date.parse(updatedAtCandidate))
    ? updatedAtCandidate
    : createdAt;

  return {
    id:
      String(comment.id || "").trim() ||
      `ac-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    note: String(comment.note ?? ""),
    sentiment: normalizeAuthorCommentSentiment(comment.sentiment),
    createdAt,
    updatedAt,
  };
};

const normalizeViewPrsAuthorComments = (raw) => {
  const source = isObject(raw) ? raw : {};
  const rawByAuthorLogin = isObject(source.byAuthorLogin)
    ? source.byAuthorLogin
    : {};

  const byAuthorLogin = {};
  Object.entries(rawByAuthorLogin).forEach(([authorLogin, rawAuthorEntry]) => {
    const normalizedAuthorLogin = String(authorLogin || "").trim();
    if (!normalizedAuthorLogin || !isObject(rawAuthorEntry)) {
      return;
    }

    const comments = (Array.isArray(rawAuthorEntry.comments)
      ? rawAuthorEntry.comments
      : []
    )
      .map((comment) => normalizeAuthorComment(comment))
      .filter(Boolean)
      .sort(
        (left, right) =>
          Date.parse(String(left?.createdAt || "")) -
          Date.parse(String(right?.createdAt || "")),
      );

    if (!comments.length) {
      return;
    }

    byAuthorLogin[normalizedAuthorLogin] = {
      comments,
    };
  });

  return {
    byAuthorLogin,
  };
};

const normalizePerRepoMap = (value, valueType = "string") => {
  if (!isObject(value)) {
    return {};
  }

  const out = {};
  for (const [repo, perPr] of Object.entries(value)) {
    if (!isObject(perPr)) {
      continue;
    }

    const perPrOut = {};
    for (const [prNumber, raw] of Object.entries(perPr)) {
      if (!/^\d+$/.test(String(prNumber))) {
        continue;
      }
      if (valueType === "boolean") {
        if (typeof raw === "boolean") {
          perPrOut[prNumber] = raw;
        }
      } else {
        const normalized = String(raw || "").trim();
        if (normalized) {
          perPrOut[prNumber] = normalized;
        }
      }
    }

    if (Object.keys(perPrOut).length > 0) {
      out[repo] = perPrOut;
    }
  }

  return out;
};

const normalizeViewPrsUserState = (raw) => {
  const source = isObject(raw) ? raw : {};
  const notesByPrNumber = {};
  const rawNotesMap = isObject(source.notesByPrNumber)
    ? source.notesByPrNumber
    : {};

  for (const [prNumber, notes] of Object.entries(rawNotesMap)) {
    if (!/^\d+$/.test(String(prNumber))) {
      continue;
    }
    const normalized = normalizeNotes(notes);
    if (normalized) {
      notesByPrNumber[prNumber] = normalized;
    }
  }

  return {
    notesByPrNumber,
    ackByRepo: normalizePerRepoMap(source.ackByRepo, "string"),
    reverifyByRepo: normalizePerRepoMap(source.reverifyByRepo, "boolean"),
    inReviewByRepo: normalizePerRepoMap(source.inReviewByRepo, "boolean"),
    flaggedByRepo: normalizePerRepoMap(source.flaggedByRepo, "boolean"),
  };
};

const sanitizeDiffPathToken = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";

const getPrDiffCacheFilePath = (prDiffDir, repo, prNumber) => {
  const safeRepo = sanitizeDiffPathToken(repo).replace(/-/g, "_");
  const safePr = String(prNumber || "").trim();
  return path.join(prDiffDir, `${safeRepo}__pr-${safePr}.json`);
};

const getPrDiffCommitFingerprint = (entry) => {
  const row = entry?.data || {};
  const commitOids = (Array.isArray(row?.commits) ? row.commits : [])
    .map((commit) => String(commit?.oid || "").trim())
    .filter(Boolean)
    .join(",");
  return [
    String(row?.sourceUpdatedAt || "").trim(),
    String(row?.updatedAt || "").trim(),
    commitOids,
  ].join("|");
};

const extractRawDiffText = (rawOutput) => {
  const output = String(rawOutput || "");
  if (!output) {
    return output;
  }

  const markers = [/^diff --git /m, /^Binary files /m, /^---\s+[ab]\//m];

  let firstMarkerIndex = -1;
  markers.forEach((marker) => {
    const match = marker.exec(output);
    if (!match || !Number.isInteger(match.index)) {
      return;
    }
    if (firstMarkerIndex === -1 || match.index < firstMarkerIndex) {
      firstMarkerIndex = match.index;
    }
  });

  if (firstMarkerIndex === -1) {
    return output;
  }

  return output.slice(firstMarkerIndex);
};

const inferFallbackRepoForNotesOnlyEntries = (
  byPrNumberRaw = {},
  lastRun,
  defaultRepo,
) => {
  const lastRunRepo = toTrimmedString(lastRun?.repo);
  if (lastRunRepo) {
    return lastRunRepo;
  }

  const repoCounts = new Map();
  Object.values(byPrNumberRaw).forEach((entry) => {
    const repo = toTrimmedString(entry?.repo);
    if (!repo) return;
    repoCounts.set(repo, (repoCounts.get(repo) || 0) + 1);
  });

  return (
    Array.from(repoCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ||
    defaultRepo
  );
};

const buildNotesOnlyMergedEntry = (defaultRepo, prNumber, notes, repo) => ({
  prNumber,
  repo: repo || defaultRepo,
  section: "merged",
  updatedAt: "",
  notes,
  data: {
    number: prNumber,
    title: "Stored notes only",
    titleDisplay: "Stored notes only",
    url: repo ? `https://github.com/${repo}/pull/${prNumber}` : "",
    labels: [],
    author: "",
    authorLogin: "",
    status: "NO_LOCAL_DATA",
    approved: "-",
    approvalCount: "0",
    inReview: "false",
    approvers: [],
    comments: [],
    reviews: [],
    commits: [],
    reviewThreads: [],
    openConversationCount: "0",
    viewedFilesCount: "0",
    changedFilesCount: "0",
    viewedFilesSummary: "0/0 viewed",
    baseline: "",
    sourceUpdatedAt: "",
    mergedAt: "",
    reason: "No retrieved PR data available",
  },
});

const buildGitDiffOnlyMergedEntry = (
  defaultRepo,
  prNumber,
  repo,
  fetchedAt = "",
) => {
  const normalizedRepo = toTrimmedString(repo) || defaultRepo;
  const normalizedFetchedAt = toTrimmedString(fetchedAt);
  return {
    prNumber,
    repo: normalizedRepo,
    section: "merged",
    updatedAt: normalizedFetchedAt,
    data: {
      number: prNumber,
      title: "Git Diff only",
      titleDisplay: "Git Diff only",
      url: normalizedRepo
        ? `https://github.com/${normalizedRepo}/pull/${prNumber}`
        : "",
      labels: [],
      author: "",
      authorLogin: "",
      status: "NO_LOCAL_DATA",
      approved: "-",
      approvalCount: "0",
      inReview: "false",
      approvers: [],
      comments: [],
      reviews: [],
      commits: [],
      reviewThreads: [],
      openConversationCount: "0",
      viewedFilesCount: "0",
      changedFilesCount: "0",
      viewedFilesSummary: "0/0 viewed",
      baseline: "",
      sourceUpdatedAt: normalizedFetchedAt,
      mergedAt: "",
      reason: "No retrieved PR data available (cached Git diff only)",
    },
  };
};

const computeViewPrsRowVersion = (entry = {}, prNumber = "") =>
  JSON.stringify({
    prNumber: String(prNumber || ""),
    repo: String(entry?.repo || ""),
    section: String(entry?.section || ""),
    updatedAt: String(entry?.updatedAt || ""),
    notes: entry?.notes || null,
    data: entry?.data || null,
  });

const buildViewPrsDataManifest = (data = {}) => {
  const byPrNumber = isObject(data?.byPrNumber) ? data.byPrNumber : {};
  const manifest = {};

  Object.keys(byPrNumber)
    .sort((a, b) => Number(a) - Number(b))
    .forEach((prNumber) => {
      const entry = byPrNumber[prNumber] || {};
      manifest[String(prNumber)] = {
        rowVersion: computeViewPrsRowVersion(entry, prNumber),
        repo: String(entry?.repo || ""),
        section: String(entry?.section || ""),
        updatedAt: String(entry?.updatedAt || ""),
      };
    });

  return manifest;
};

const backupStamp = () =>
  new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

module.exports = {
  isViewPrsFixtureRow,
  parseTimestamp,
  isObject,
  toTrimmedString,
  isRepoSlug,
  parseRepoCsv,
  normalizeNotesComment,
  normalizeNotes,
  normalizeAuthorCommentSentiment,
  normalizeAuthorComment,
  normalizeViewPrsAuthorComments,
  normalizePerRepoMap,
  normalizeViewPrsUserState,
  sanitizeDiffPathToken,
  getPrDiffCacheFilePath,
  getPrDiffCommitFingerprint,
  extractRawDiffText,
  inferFallbackRepoForNotesOnlyEntries,
  buildNotesOnlyMergedEntry,
  buildGitDiffOnlyMergedEntry,
  computeViewPrsRowVersion,
  buildViewPrsDataManifest,
  backupStamp,
};
