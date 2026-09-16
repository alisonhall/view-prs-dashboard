const DEFAULT_REPO = "optum-rx-clinicalproducts/orx-cpp-mp-uis";
const AUTO_DATA_POLL_MS = 30000;
const AUTO_BACKFILL_POLL_MS = 5000;
const BACKFILL_LOG_TAIL_LINES = 120;

const formatDateInputValue = (date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getDefaultStatsStartDate = () => {
  const now = new Date();
  const shifted = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, now.getUTCDate()),
  );
  return formatDateInputValue(shifted);
};

const prReviewStatsDateBucketingHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-review-stats-date-bucketing.helpers.js")
    : globalThis.ViewPrsReviewStatsDateBucketingHelpers;

const { getTimelineDateKeys, bucketTimelineChartData } =
  prReviewStatsDateBucketingHelperFactory.createPrReviewStatsDateBucketingHelpers({
    formatDateInputValue,
    asArray: (...args) => asArray(...args),
    toCount: (...args) => toCount(...args),
    getNormalizedStatsDateRange: (...args) => getNormalizedStatsDateRange(...args),
  });

let lastRenderedRunStamp = "";
let lastSeenDataVersion = "";
let lastRenderedPrFingerprint = "";
let lastRenderedMetaFingerprint = "";
let lastSuccessfulRenderedCheckAt = "";
let lastSuccessfulPollCheckAt = "";
let lastPollErrorAt = "";
let hasActivePollWarning = false;
let latestPrManifest = {};
let pendingAutoRenderPayload = null;
let hasDirtyPrSectionsFields = false;
let latestStoredPayload = null;
let latestSelectedRepo = "";
let pendingAuthorFilterSelections = null;
let pendingAssignedFilterSelections = null;
let pendingApproverFilterSelections = null;
let pendingLabelFilterSelections = null;
let pendingExcludeLabelFilterSelections = null;
let pendingAuthorThreadResolutionAllowSelections = null;
let pendingAuthorThreadResolutionDenySelections = null;
let _pendingChangeFilterIgnoreCommentAuthors = null;
let _pendingChangeFilterIgnoreReviewAuthors = null;
let currentViewerLogin = "";
let currentActorLoginAliases = {};
let supportsDataMetaPolling = true;
let supportsDataManifestPolling = true;
let supportsSchedulerPolling = true;
let supportsBackfillLogPolling = true;
let lastBackfillStateKey = "";
let isBackfillActionPending = false;
let isBackfillRunning = false;
let isRequestMoreMergedPending = false;
let latestSchedulerState = {};
const requestActivityCounters = {
  runScript: 0,
  ackClear: 0,
  singlePr: 0,
  dataLoad: 0,
  backfill: 0,
};
const requestActivityStartedAtMs = {
  runScript: 0,
  ackClear: 0,
  singlePr: 0,
  dataLoad: 0,
  backfill: 0,
};
const REQUEST_ACTIVITY_WARN_MS = 2 * 60 * 1000;
const REQUEST_ACTIVITY_CRITICAL_MS = 6 * 60 * 1000;
const statsViewState = {
  sortBy: "riskyApprovals",
  filterMode: "all",
  topN: 12,
  minComments: 0,
  startDate: getDefaultStatsStartDate(),
  endDate: "",
};
const authorInsightsState = {
  selectedAuthorLogin: "",
  manualCommentsByAuthorLogin: {},
  manualCommentsLoadingByAuthorLogin: {},
  manualCommentsErrorByAuthorLogin: {},
  manualCommentDraftByAuthorLogin: {},
  manualCommentEditDraftByAuthorLogin: {},
  latestRows: null,
  latestActorsMap: null,
};
let exportFieldCatalog = {
  dataPaths: [],
  userStatePaths: [],
};
let pendingExportDataFieldSelections = null;
let pendingExportUserStateFieldSelections = null;
const reviewConversationsUiStateByKey = new Map();
const EXPORT_DATA_FIELDS_OVERRIDE_KEY = "export-data-fields";
const EXPORT_USER_STATE_FIELDS_OVERRIDE_KEY = "export-user-state-fields";
const formParsingHelpersSource =
  globalThis.ViewPrsFormParsingHelpers ||
  (typeof module !== "undefined" && module.exports && typeof require === "function"
    ? require("./helpers/form-parsing.helpers")
    : null);
const formParsingHelpersFactory =
  formParsingHelpersSource?.createFormParsingHelpers;
const formParsingHelpers =
  typeof formParsingHelpersFactory === "function"
    ? formParsingHelpersFactory()
    : null;
const toBoolean =
  formParsingHelpers?.toBoolean || ((value) => value === true || value === "on");
const prFormattingHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-formatting.helpers.js")
    : globalThis.ViewPrsFormattingHelpers;

const {
  escapeHtml,
  stripAnsi,
  formatIsoDatetime,
  toCount,
} = prFormattingHelperFactory.createPrFormattingHelpers();

const setStatusMessage = (message) => {
  document.getElementById("status").textContent = message;
  renderRequestActivity();
};

const setOutputMessage = (message) => {
  document.getElementById("output").textContent = message;
};

const setRequestActivityCounter = (key, delta = 0) => {
  if (!Object.prototype.hasOwnProperty.call(requestActivityCounters, key)) {
    return;
  }
  const next =
    Number(requestActivityCounters[key] || 0) +
    (Number.isFinite(Number(delta)) ? Number(delta) : 0);
  const safeNext = Math.max(0, next);
  requestActivityCounters[key] = safeNext;

  if (safeNext > 0 && Number(requestActivityStartedAtMs[key] || 0) <= 0) {
    requestActivityStartedAtMs[key] = Date.now();
  }
  if (safeNext === 0) {
    requestActivityStartedAtMs[key] = 0;
  }
};

const formatElapsedLabel = (elapsedMs) => {
  const totalSeconds = Math.max(
    0,
    Math.floor(
      Number.isFinite(Number(elapsedMs)) ? Number(elapsedMs) / 1000 : 0,
    ),
  );
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  }
  return `${seconds}s`;
};

const getElapsedFromStartMs = (startMs) => {
  const parsedStart = Number(startMs || 0);
  if (!Number.isFinite(parsedStart) || parsedStart <= 0) {
    return null;
  }
  return Math.max(0, Date.now() - parsedStart);
};

const withElapsedSuffix = (label, elapsedMs) => {
  if (!Number.isFinite(Number(elapsedMs)) || Number(elapsedMs) < 0) {
    return label;
  }
  return `${label} (${formatElapsedLabel(elapsedMs)})`;
};

const getRequestActivitySeverityClass = (elapsedMs) => {
  const safeElapsedMs = Number(elapsedMs);
  if (!Number.isFinite(safeElapsedMs) || safeElapsedMs < 0) {
    return "";
  }

  if (safeElapsedMs >= REQUEST_ACTIVITY_CRITICAL_MS) {
    return "scheduler-badge-critical";
  }
  if (safeElapsedMs >= REQUEST_ACTIVITY_WARN_MS) {
    return "scheduler-badge-warning";
  }
  return "";
};

const getActiveRequestActivityEntries = () => {
  const entries = [];

  if (requestActivityCounters.runScript > 0) {
    entries.push({
      label: `Run script x${requestActivityCounters.runScript}`,
      elapsedMs: getElapsedFromStartMs(requestActivityStartedAtMs.runScript),
    });
  }
  if (requestActivityCounters.ackClear > 0) {
    entries.push({
      label: `Ack/Clear x${requestActivityCounters.ackClear}`,
      elapsedMs: getElapsedFromStartMs(requestActivityStartedAtMs.ackClear),
    });
  }
  if (requestActivityCounters.singlePr > 0) {
    entries.push({
      label: `Single PR update x${requestActivityCounters.singlePr}`,
      elapsedMs: getElapsedFromStartMs(requestActivityStartedAtMs.singlePr),
    });
  }
  if (requestActivityCounters.dataLoad > 0) {
    entries.push({
      label: `Data refresh x${requestActivityCounters.dataLoad}`,
      elapsedMs: getElapsedFromStartMs(requestActivityStartedAtMs.dataLoad),
    });
  }
  if (requestActivityCounters.backfill > 0) {
    entries.push({
      label: `Backfill request x${requestActivityCounters.backfill}`,
      elapsedMs: getElapsedFromStartMs(requestActivityStartedAtMs.backfill),
    });
  }

  return entries;
};

const renderRequestActivity = () => {
  const badgeHost = getOptionalElementById("request-activity-badges");
  const details = getOptionalElementById("request-activity-details");
  if (!badgeHost || !details) {
    return;
  }

  badgeHost.innerHTML = "";
  const activeEntries = getActiveRequestActivityEntries();
  const isAutoRunInProgress = Boolean(
    latestSchedulerState?.isAutoRunInProgress,
  );
  const autoRunElapsedMs = isAutoRunInProgress
    ? getElapsedFromStartMs(
        Date.parse(String(latestSchedulerState?.lastAutoAttemptAt || "")),
      )
    : null;
  const createBadge = (text, className = "") => {
    const chip = document.createElement("span");
    chip.className = `scheduler-badge ${className}`.trim();
    chip.textContent = text;
    badgeHost.appendChild(chip);
  };

  const totalActive = activeEntries.length + (isAutoRunInProgress ? 1 : 0);

  if (totalActive === 0) {
    createBadge("No request in progress", "scheduler-badge-idle");
  } else {
    createBadge(
      `${totalActive} request${totalActive === 1 ? "" : "s"} in progress`,
      "scheduler-badge-running",
    );
    if (isAutoRunInProgress) {
      createBadge(
        withElapsedSuffix("Auto run", autoRunElapsedMs),
        `scheduler-badge-running ${getRequestActivitySeverityClass(autoRunElapsedMs)}`,
      );
    }
    activeEntries.forEach((entry) => {
      createBadge(
        withElapsedSuffix(entry.label, entry.elapsedMs),
        `scheduler-badge-running ${getRequestActivitySeverityClass(entry.elapsedMs)}`,
      );
    });
  }

  const statusLine = String(
    getOptionalElementById("status")?.textContent || "-",
  );
  details.textContent = [
    `Current status: ${statusLine}`,
    `Active requests: ${
      totalActive > 0
        ? [
            isAutoRunInProgress
              ? withElapsedSuffix("Auto run", autoRunElapsedMs)
              : "",
            ...activeEntries.map((entry) =>
              withElapsedSuffix(entry.label, entry.elapsedMs),
            ),
          ]
            .filter(Boolean)
            .join(" | ")
        : "none"
    }`,
  ].join("\n");
};

const beginRequestActivity = (key) => {
  setRequestActivityCounter(key, 1);
  renderRequestActivity();
  let ended = false;
  return () => {
    if (ended) {
      return;
    }
    ended = true;
    setRequestActivityCounter(key, -1);
    renderRequestActivity();
  };
};

const setSnackbarVariant = (snackbar, variant = "error") => {
  if (!snackbar) return;
  snackbar.className =
    variant === "warning"
      ? "error-snackbar error-snackbar-warning"
      : "error-snackbar";
};

const showErrorNotification = (title, message, autoDismissMs = 8000) => {
  const snackbar = document.getElementById("error-snackbar");
  const messageEl = document.getElementById("error-snackbar-message");

  if (!snackbar || !messageEl) return;

  setSnackbarVariant(snackbar, "error");

  // Build full message
  const fullMessage = message ? `${title}\n\n${message}` : title;
  messageEl.textContent = fullMessage;
  messageEl.className = "error-snackbar-message";

  snackbar.removeAttribute("hidden");

  // Auto-dismiss behavior
  if (autoDismissMs > 0) {
    clearTimeout(snackbar.__dismissTimeout);
    snackbar.__dismissTimeout = setTimeout(() => {
      snackbar.setAttribute("hidden", "");
    }, autoDismissMs);
  }
};

const showWarningNotification = (title, message, autoDismissMs = 12000) => {
  const snackbar = document.getElementById("error-snackbar");
  const messageEl = document.getElementById("error-snackbar-message");

  if (!snackbar || !messageEl) return;

  setSnackbarVariant(snackbar, "warning");

  const fullMessage = message ? `${title}\n\n${message}` : title;
  messageEl.textContent = fullMessage;
  messageEl.className = "error-snackbar-message";

  snackbar.removeAttribute("hidden");

  if (autoDismissMs > 0) {
    clearTimeout(snackbar.__dismissTimeout);
    snackbar.__dismissTimeout = setTimeout(() => {
      snackbar.setAttribute("hidden", "");
    }, autoDismissMs);
  }
};

const hideErrorNotification = () => {
  const snackbar = document.getElementById("error-snackbar");
  if (snackbar) {
    clearTimeout(snackbar.__dismissTimeout);
    snackbar.setAttribute("hidden", "");
  }
};

const isTimeoutFailureMessage = (value) =>
  /\b(timed?\s*out|timeout|deadline exceeded)\b/i.test(String(value || ""));

const notifyFailureSnackbar = (
  title,
  errorSource,
  fallbackMessage = "Operation failed",
) => {
  const messageCandidates =
    errorSource && typeof errorSource === "object"
      ? [
          errorSource.error,
          errorSource.summary,
          errorSource.message,
          errorSource.stderr,
          errorSource.output,
        ]
      : [errorSource];

  const normalizedCandidates = messageCandidates
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  const detail = normalizedCandidates[0] || fallbackMessage;
  const timeoutContext = normalizedCandidates.join("\n");
  const isTimeout = isTimeoutFailureMessage(timeoutContext);
  const finalTitle = isTimeout ? `${title} (timed out)` : title;

  showErrorNotification(finalTitle, detail, 0);
};

const describePollFailure = (errorSource) => {
  const messageCandidates =
    errorSource && typeof errorSource === "object"
      ? [
          errorSource.error,
          errorSource.summary,
          errorSource.message,
          errorSource.stderr,
          errorSource.output,
        ]
      : [errorSource];

  const normalizedCandidates = messageCandidates
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  return normalizedCandidates[0] || "Polling request failed.";
};

const showPollFailureWarning = ({ errorSource, attemptedAt }) => {
  lastPollErrorAt = String(attemptedAt || new Date().toISOString()).trim();

  const lastSuccessLabel = lastSuccessfulPollCheckAt
    ? formatIsoDatetime(lastSuccessfulPollCheckAt)
    : "Unavailable";
  const lastErrorLabel = formatIsoDatetime(lastPollErrorAt);

  showWarningNotification(
    "Auto-refresh warning",
    [
      `Last successful check: ${lastSuccessLabel}`,
      `Last error at: ${lastErrorLabel}`,
      "",
      describePollFailure(errorSource),
    ].join("\n"),
    0,
  );

  hasActivePollWarning = true;
};

const markPollSuccess = (checkedAt = new Date().toISOString()) => {
  lastSuccessfulPollCheckAt = String(checkedAt || "").trim();
  if (!hasActivePollWarning) {
    return;
  }

  hideErrorNotification();
  hasActivePollWarning = false;
};

const summarizeAckRefreshWarnings = (
  refreshErrors = [],
  maxSampleItems = 5,
) => {
  const normalizedErrors = Array.isArray(refreshErrors)
    ? refreshErrors.filter((entry) => entry && typeof entry === "object")
    : [];

  if (normalizedErrors.length === 0) {
    return null;
  }

  const skippedCount = normalizedErrors.filter((entry) =>
    String(entry?.error || "")
      .trim()
      .toLowerCase()
      .startsWith("skipped:"),
  ).length;
  const failedCount = Math.max(0, normalizedErrors.length - skippedCount);
  const sample = normalizedErrors
    .slice(0, Math.max(1, Number(maxSampleItems) || 5))
    .map((entry) => {
      const pr = String(entry?.prNumber || "?").trim();
      const reason = String(entry?.error || "").trim() || "Refresh issue";
      return `#${pr}: ${reason}`;
    })
    .join("\n");

  const summaryParts = [];
  if (skippedCount > 0) summaryParts.push(`${skippedCount} skipped`);
  if (failedCount > 0) summaryParts.push(`${failedCount} failed`);

  return {
    skippedCount,
    failedCount,
    summaryText:
      summaryParts.join(", ") || `${normalizedErrors.length} issue(s)`,
    sample,
  };
};

const inferViewerLoginFromPage = () => {
  const candidates = [
    getOptionalElementById("output")?.textContent,
    getOptionalElementById("status")?.textContent,
  ];

  for (const candidate of candidates) {
    const text = String(candidate || "");
    const match = text.match(/Viewer\s*:\s*([^\s|]+)/i);
    if (match && match[1]) {
      return String(match[1]).trim();
    }
  }

  return "";
};

const markInputAsNonCredentialField = (
  input,
  fieldName,
  options = { overrideName: true },
) => {
  if (formParsingHelpers?.applyCredentialHints) {
    formParsingHelpers.applyCredentialHints(input, fieldName, options);
    return;
  }

  if (!input) return;
  if (options.overrideName !== false && fieldName) {
    input.name = fieldName;
  }
  input.autocomplete = "off";
  input.setAttribute("autocomplete", "off");
  input.setAttribute("autocapitalize", "off");
  input.setAttribute("autocorrect", "off");
  input.setAttribute("spellcheck", "false");
  input.setAttribute("data-lpignore", "true");
  input.setAttribute("data-1p-ignore", "true");
  input.setAttribute("data-bwignore", "true");
  input.setAttribute("data-form-type", "other");
};

const NON_CREDENTIAL_HINT_FIELD_IDS = [
  "repo",
  "pr-numbers",
  "limit",
  "merged-limit",
  "jobs",
  "filter-pr-numbers",
];

const applyNonCredentialFieldHints = () => {
  NON_CREDENTIAL_HINT_FIELD_IDS.forEach((id) => {
    const input = getOptionalElementById(id);
    if (!input) return;
    markInputAsNonCredentialField(input, "", { overrideName: false });
  });
};

const IGNORED_CREDENTIAL_FIELD_ERROR_MARKERS = [
  "ControlLooksLikePasswordCredentialField",
  "UsernameElementUniqueID",
];

const isIgnoredCredentialFieldError = (value) => {
  const text = String(value || "");
  return IGNORED_CREDENTIAL_FIELD_ERROR_MARKERS.some((marker) =>
    text.includes(marker),
  );
};

const setBackfillLogMessage = (message) => {
  const node = getOptionalElementById("backfill-log");
  if (node) {
    node.textContent = message;
  }
};

const getUiOptionDefaults = () => ({
  repo: "",
  limit: "",
  "merged-limit": "",
  jobs: "",
  "open-mode": "none",
  "ack-changed": false,
  "show-reason": true,
  quiet: false,
  "scope-mode": "all",
  "filter-pr-numbers": "",
  label: "",
  "exclude-label": "",
  author: [],
  assigned: [],
  approver: [],
  "always-show-in-review": false,
  "attention-no-activity-mode": "all",
  "attention-include-pending-comments": true,
  "attention-ignore-merge-only-commits": false,
  "attention-include-closed-merged": true,
  "attention-include-draft-changed": true,
  "attention-include-draft-no-activity": false,
  "attention-author-thread-resolution-mode": "allow-all",
  "attention-author-thread-resolution-allow": [],
  "attention-author-thread-resolution-deny": [],
  "change-filter-use-builtin-merge-pattern": true,
});

const readUiSessionOverrides = async () => {
  try {
    const response = await fetch("/view-prs/user-defaults");
    if (!response.ok) return {};
    const result = await response.json();
    const parsed = result?.overrides;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (_error) {
    return {};
  }
};

const writeUiSessionOverrides = async (
  overrides,
  { preserveEmptyArrayKeys = [] } = {},
) => {
  const preserveSet = new Set(
    Array.isArray(preserveEmptyArrayKeys) ? preserveEmptyArrayKeys : [],
  );
  const entries = Object.entries(overrides || {}).filter(([key, value]) => {
    if (Array.isArray(value)) {
      return value.length > 0 || preserveSet.has(String(key));
    }
    return value !== undefined;
  });

  const data = Object.fromEntries(entries);

  try {
    await fetch("/view-prs/user-defaults", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch (_error) {
    // Best effort only.
  }
};

// Phase 6 (see REACT_MIGRATION_PLAN.md): single source of truth mapping a
// DOM field id to its FilterStateProvider Context key, for every field
// migrated onto Context so far. Shared by persistUiOptionOverrides/
// restoreUiOptionOverrides below, getNeedsAttentionConfig, and
// shouldAlwaysShowInReviewRows - one map instead of one ad hoc copy per
// call site, so a field's migration only needs to add one entry here.
const FILTER_STATE_FIELD_MAP = {
  "scope-mode": "scopeMode",
  "always-show-in-review": "alwaysShowInReview",
  "attention-no-activity-mode": "attentionNoActivityMode",
  "attention-include-pending-comments": "attentionIncludePendingComments",
  "attention-ignore-merge-only-commits": "attentionIgnoreMergeOnlyCommits",
  "attention-include-closed-merged": "attentionIncludeClosedMerged",
  "attention-include-draft-changed": "attentionIncludeDraftChanged",
  "attention-include-draft-no-activity": "attentionIncludeDraftNoActivity",
  "repo": "repo",
  "limit": "limit",
  "merged-limit": "mergedLimit",
  "jobs": "jobs",
  "open-mode": "openMode",
  "ack-changed": "ackChanged",
  "show-reason": "showReason",
  "quiet": "quiet",
  "filter-pr-numbers": "filterPrNumbers",
  "attention-author-thread-resolution-mode": "attentionAuthorThreadResolutionMode",
  "change-filter-use-builtin-merge-pattern": "changeFilterUseBuiltinMergePattern",
  "change-filter-ignore-commit-patterns": "changeFilterIgnoreCommitPatterns",
};

// Reads a migrated field's current value from FilterStateProvider's
// Context (via the window.getFilterStateValues bridge react-app.jsx's
// mountFilterStateProvider exposes) - returns undefined for an
// unmigrated field id, or if the provider hasn't mounted yet, so every
// call site below falls back to its original DOM read exactly as before.
const getFilterStateOverrideForFieldId = (id) => {
  const key = FILTER_STATE_FIELD_MAP[id];
  if (!key || typeof window === "undefined" || typeof window.getFilterStateValues !== "function") {
    return undefined;
  }
  return window.getFilterStateValues()?.[key];
};

// Writes a migrated field's value straight into Context (via
// window.setFilterStateValue) instead of mutating the DOM - returns
// whether it did (`false` for an unmigrated field id or before the
// provider mounts, letting the caller fall back to its original
// DOM-mutating approach).
const setFilterStateOverrideForFieldId = (id, value) => {
  const key = FILTER_STATE_FIELD_MAP[id];
  if (!key || typeof window === "undefined" || typeof window.setFilterStateValue !== "function") {
    return false;
  }
  window.setFilterStateValue(key, value);
  return true;
};

// Phase 6, Slice 7 (see REACT_MIGRATION_PLAN.md): the 9 multi-select lists'
// "pending selections" (used only as a restore-time seed before any
// checkbox exists yet - see the 9 `let pendingXxx`/`_pendingChangeFilterIgnoreXAuthors`
// declarations below) have no corresponding DOM element id, so they can't
// go through FILTER_STATE_FIELD_MAP/getFilterStateOverrideForFieldId like
// every other field - these two helpers are the same handled/fallback
// shape, just keyed directly by Context key instead of DOM id.
// `getPendingSelectionsValue` uses `hasOwnProperty` rather than a falsy/
// undefined check, since the module-scope fallback variable's own valid
// values include `null` (its initial/cleared state) and arrays.
const getPendingSelectionsValue = (contextKey, fallbackValue) => {
  const values =
    typeof window !== "undefined" && typeof window.getFilterStateValues === "function"
      ? window.getFilterStateValues()
      : undefined;
  return values && Object.prototype.hasOwnProperty.call(values, contextKey)
    ? values[contextKey]
    : fallbackValue;
};
const setPendingSelectionsValue = (contextKey, value, setFallback) => {
  // Always keep the module-scope variable in sync too, regardless of
  // whether Context has mounted - it's the fallback storage the vanilla
  // DOM-building path (and any bare-fixture unit test) still reads/writes
  // directly.
  setFallback(value);
  if (typeof window !== "undefined" && typeof window.setFilterStateValue === "function") {
    window.setFilterStateValue(contextKey, value);
  }
};

const persistUiOptionOverrides = async (fieldIds = null) => {
  const defaults = getUiOptionDefaults();
  const existingOverrides = await readUiSessionOverrides();
  const overrides = { ...existingOverrides };

  const allowedFields =
    Array.isArray(fieldIds) && fieldIds.length > 0 ? new Set(fieldIds) : null;
  const includeField = (id) => !allowedFields || allowedFields.has(id);

  // Phase 6 (see REACT_MIGRATION_PLAN.md): prefer reading a migrated
  // field's current value from Context (via getFilterStateOverrideForFieldId,
  // FILTER_STATE_FIELD_MAP above) over the DOM, same handled/fallback
  // shape as every other bridge.
  const getText = (id) => {
    const override = getFilterStateOverrideForFieldId(id);
    if (typeof override === "string") {
      return override.trim();
    }
    return String(getOptionalElementById(id)?.value || "").trim();
  };
  const getCheckbox = (id) => {
    const override = getFilterStateOverrideForFieldId(id);
    if (typeof override === "boolean") {
      return override;
    }
    return Boolean(getOptionalElementById(id)?.checked);
  };

  const textIds = [
    "repo",
    "limit",
    "merged-limit",
    "jobs",
    "open-mode",
    "scope-mode",
    "filter-pr-numbers",
    "attention-no-activity-mode",
    "attention-author-thread-resolution-mode",
  ];

  textIds.forEach((id) => {
    if (!includeField(id)) return;
    const value = getText(id);
    if (value !== String(defaults[id] || "")) {
      overrides[id] = value;
    } else {
      delete overrides[id];
    }
  });

  const checkboxIds = [
    "ack-changed",
    "show-reason",
    "quiet",
    "always-show-in-review",
    "attention-include-pending-comments",
    "attention-ignore-merge-only-commits",
    "attention-include-closed-merged",
    "attention-include-draft-changed",
    "attention-include-draft-no-activity",
    "change-filter-use-builtin-merge-pattern",
  ];
  checkboxIds.forEach((id) => {
    if (!includeField(id)) return;
    const value = getCheckbox(id);
    if (value !== Boolean(defaults[id])) {
      overrides[id] = value;
    } else {
      delete overrides[id];
    }
  });

  if (includeField("author")) {
    const selectedAuthors = getSelectedAuthorLogins();
    if (selectedAuthors.length > 0) {
      overrides.author = selectedAuthors;
    } else {
      delete overrides.author;
    }
  }

  if (includeField("assigned")) {
    const selectedAssignees = getSelectedAssignedLogins();
    if (selectedAssignees.length > 0) {
      overrides.assigned = selectedAssignees;
    } else {
      delete overrides.assigned;
    }
  }

  if (includeField("approver")) {
    const selectedApprovers = getSelectedApproverLogins();
    if (selectedApprovers.length > 0) {
      overrides.approver = selectedApprovers;
    } else {
      delete overrides.approver;
    }
  }

  if (includeField("label")) {
    const selectedIncludeLabels = getSelectedIncludeLabelNames();
    if (selectedIncludeLabels.length > 0) {
      overrides.label = selectedIncludeLabels.join(", ");
    } else {
      delete overrides.label;
    }
  }

  if (includeField("exclude-label")) {
    const selectedExcludeLabels = getSelectedExcludeLabelNames();
    if (selectedExcludeLabels.length > 0) {
      overrides["exclude-label"] = selectedExcludeLabels.join(", ");
    } else {
      delete overrides["exclude-label"];
    }
  }

  if (includeField("attention-author-thread-resolution-allow")) {
    const selectedAllowedLogins = getSelectedAuthorThreadResolutionAllowLogins();
    if (selectedAllowedLogins.length > 0) {
      overrides["attention-author-thread-resolution-allow"] =
        selectedAllowedLogins;
    } else {
      delete overrides["attention-author-thread-resolution-allow"];
    }
  }

  if (includeField("attention-author-thread-resolution-deny")) {
    const selectedDeniedLogins = getSelectedAuthorThreadResolutionDenyLogins();
    if (selectedDeniedLogins.length > 0) {
      overrides["attention-author-thread-resolution-deny"] =
        selectedDeniedLogins;
    } else {
      delete overrides["attention-author-thread-resolution-deny"];
    }
  }

  // Change detection filters
  if (
    includeField("change-filter-use-builtin-merge-pattern") ||
    includeField("change-filter-ignore-comment-authors") ||
    includeField("change-filter-ignore-review-authors") ||
    includeField("change-filter-ignore-commit-patterns")
  ) {
    const existingChangeFilters =
      typeof existingOverrides.changeFilters === "object" &&
      !Array.isArray(existingOverrides.changeFilters)
        ? existingOverrides.changeFilters
        : {};
    const changeFilters = { ...existingChangeFilters };

    if (includeField("change-filter-use-builtin-merge-pattern")) {
      const useBuiltin = getCheckbox("change-filter-use-builtin-merge-pattern");
      // Only save if different from default (true)
      if (useBuiltin !== true) {
        changeFilters.useBuiltinMergePattern = useBuiltin;
      } else {
        delete changeFilters.useBuiltinMergePattern;
      }
    }

    if (includeField("change-filter-ignore-comment-authors")) {
      const selectedLogins = getSelectedChangeFilterIgnoreCommentAuthors();
      if (selectedLogins.length > 0) {
        changeFilters.ignoreCommentsFromAuthors = selectedLogins;
      } else {
        delete changeFilters.ignoreCommentsFromAuthors;
      }
    }

    if (includeField("change-filter-ignore-review-authors")) {
      const selectedLogins = getSelectedChangeFilterIgnoreReviewAuthors();
      if (selectedLogins.length > 0) {
        changeFilters.ignoreReviewsFromAuthors = selectedLogins;
      } else {
        delete changeFilters.ignoreReviewsFromAuthors;
      }
    }

    if (includeField("change-filter-ignore-commit-patterns")) {
      const textarea = getOptionalElementById(
        "change-filter-ignore-commit-patterns",
      );
      const patterns = formParsingHelpers?.parseCommitPatterns
        ? formParsingHelpers.parseCommitPatterns(textarea)
        : [];
      if (patterns.length > 0) {
        changeFilters.ignoreCommitPatterns = patterns;
      } else {
        delete changeFilters.ignoreCommitPatterns;
      }
    }

    if (Object.keys(changeFilters).length > 0) {
      overrides.changeFilters = changeFilters;
    } else {
      delete overrides.changeFilters;
    }
  }

  await writeUiSessionOverrides(overrides);
};

const restoreUiOptionOverrides = async () => {
  const overrides = await readUiSessionOverrides();
  if (!overrides || Object.keys(overrides).length === 0) {
    return;
  }

  // Plain `element.value = ...` silently desyncs a React-controlled input:
  // React installs its own property setter on the native element to track
  // value changes, and assigning through the DOM's original setter (which
  // this uses instead, via the prototype descriptor) plus dispatching a
  // real 'input'/'change' event is the standard, harmless-for-uncontrolled-
  // elements-too way to make external mutations show up in React state as
  // well. Needed as more of the Run & Filter form is converted to React
  // (Phase 2) - vanilla restore logic like this one shouldn't need to know
  // or care which fields are React-owned yet.
  const setNativeValueAndDispatch = (element, value) => {
    const prototype = Object.getPrototypeOf(element);
    const nativeSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (nativeSetter) {
      nativeSetter.call(element, value);
    } else {
      element.value = value;
    }
    // <input> needs 'input' for React to notice; <select> (which this
    // helper also restores, e.g. scope-mode) only reliably notifies React
    // via 'change'. Dispatch both - a real user interaction fires both on
    // either element type anyway, so this isn't adding any event a normal
    // interaction wouldn't already produce.
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  };

  // Phase 6 (see REACT_MIGRATION_PLAN.md): a migrated field (per
  // FILTER_STATE_FIELD_MAP above) restores straight into Context via
  // window.setFilterStateValue (which itself triggers the provider's own
  // debounced-apply effect, same as a real user change would) instead of
  // going through setNativeValueAndDispatch/element.click() below, which
  // only matters for fields still owned by the DOM. Falls back to the
  // original DOM-mutating approach when the provider hasn't mounted yet.
  const setText = (id, value) => {
    if (value === undefined || value === null) return;
    if (setFilterStateOverrideForFieldId(id, String(value))) return;
    const element = getOptionalElementById(id);
    if (!element) return;
    setNativeValueAndDispatch(element, String(value));
  };

  const setCheckbox = (id, value) => {
    if (typeof value !== "boolean") return;
    if (setFilterStateOverrideForFieldId(id, value)) return;
    const element = getOptionalElementById(id);
    if (!element) return;
    if (element.checked !== value) {
      element.click();
    }
  };

  [
    "repo",
    "limit",
    "merged-limit",
    "jobs",
    "open-mode",
    "scope-mode",
    "filter-pr-numbers",
    "attention-no-activity-mode",
    "attention-author-thread-resolution-mode",
  ].forEach((id) => {
    if (Object.prototype.hasOwnProperty.call(overrides, id)) {
      setText(id, overrides[id]);
    }
  });

  [
    "ack-changed",
    "show-reason",
    "quiet",
    "always-show-in-review",
    "attention-include-pending-comments",
    "attention-ignore-merge-only-commits",
    "attention-include-closed-merged",
    "attention-include-draft-changed",
    "attention-include-draft-no-activity",
    "change-filter-use-builtin-merge-pattern",
  ].forEach((id) => {
    if (Object.prototype.hasOwnProperty.call(overrides, id)) {
      setCheckbox(id, overrides[id]);
    }
  });

  if (Array.isArray(overrides.author)) {
    setPendingSelectionsValue(
      "pendingAuthorSelections",
      overrides.author.map((value) => String(value || "").trim()).filter(Boolean),
      (v) => {
        pendingAuthorFilterSelections = v;
      },
    );
  }

  if (Array.isArray(overrides.assigned)) {
    setPendingSelectionsValue(
      "pendingAssignedSelections",
      overrides.assigned.map((value) => String(value || "").trim()).filter(Boolean),
      (v) => {
        pendingAssignedFilterSelections = v;
      },
    );
  }

  if (Array.isArray(overrides.approver)) {
    setPendingSelectionsValue(
      "pendingApproverSelections",
      overrides.approver.map((value) => String(value || "").trim()).filter(Boolean),
      (v) => {
        pendingApproverFilterSelections = v;
      },
    );
  }

  if (Object.prototype.hasOwnProperty.call(overrides, "label")) {
    const values = Array.isArray(overrides.label)
      ? overrides.label
      : parseCsvTokens(overrides.label);
    setPendingSelectionsValue(
      "pendingLabelSelections",
      values.map((value) => String(value || "").trim()).filter(Boolean),
      (v) => {
        pendingLabelFilterSelections = v;
      },
    );
  }

  if (Object.prototype.hasOwnProperty.call(overrides, "exclude-label")) {
    const values = Array.isArray(overrides["exclude-label"])
      ? overrides["exclude-label"]
      : parseCsvTokens(overrides["exclude-label"]);
    setPendingSelectionsValue(
      "pendingExcludeLabelSelections",
      values.map((value) => String(value || "").trim()).filter(Boolean),
      (v) => {
        pendingExcludeLabelFilterSelections = v;
      },
    );
  }

  if (Array.isArray(overrides["attention-author-thread-resolution-allow"])) {
    setPendingSelectionsValue(
      "pendingAuthorThreadResolutionAllowSelections",
      overrides["attention-author-thread-resolution-allow"]
        .map((value) => String(value || "").trim())
        .filter(Boolean),
      (v) => {
        pendingAuthorThreadResolutionAllowSelections = v;
      },
    );
  }

  if (Array.isArray(overrides["attention-author-thread-resolution-deny"])) {
    setPendingSelectionsValue(
      "pendingAuthorThreadResolutionDenySelections",
      overrides["attention-author-thread-resolution-deny"]
        .map((value) => String(value || "").trim())
        .filter(Boolean),
      (v) => {
        pendingAuthorThreadResolutionDenySelections = v;
      },
    );
  }

  if (Array.isArray(overrides[EXPORT_DATA_FIELDS_OVERRIDE_KEY])) {
    pendingExportDataFieldSelections = overrides[EXPORT_DATA_FIELDS_OVERRIDE_KEY]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
  }

  if (Array.isArray(overrides[EXPORT_USER_STATE_FIELDS_OVERRIDE_KEY])) {
    pendingExportUserStateFieldSelections =
      overrides[EXPORT_USER_STATE_FIELDS_OVERRIDE_KEY]
        .map((value) => String(value || "").trim())
        .filter(Boolean);
  }

  // Restore change detection filters
  if (
    overrides.changeFilters &&
    typeof overrides.changeFilters === "object" &&
    !Array.isArray(overrides.changeFilters)
  ) {
    if (typeof overrides.changeFilters.useBuiltinMergePattern === "boolean") {
      setCheckbox(
        "change-filter-use-builtin-merge-pattern",
        overrides.changeFilters.useBuiltinMergePattern,
      );
    }

    if (Array.isArray(overrides.changeFilters.ignoreCommentsFromAuthors)) {
      setPendingSelectionsValue(
        "pendingChangeFilterIgnoreCommentAuthors",
        overrides.changeFilters.ignoreCommentsFromAuthors
          .map((value) => String(value || "").trim())
          .filter(Boolean),
        (v) => {
          _pendingChangeFilterIgnoreCommentAuthors = v;
        },
      );
    }

    if (Array.isArray(overrides.changeFilters.ignoreReviewsFromAuthors)) {
      setPendingSelectionsValue(
        "pendingChangeFilterIgnoreReviewAuthors",
        overrides.changeFilters.ignoreReviewsFromAuthors
          .map((value) => String(value || "").trim())
          .filter(Boolean),
        (v) => {
          _pendingChangeFilterIgnoreReviewAuthors = v;
        },
      );
    }

    if (Array.isArray(overrides.changeFilters.ignoreCommitPatterns)) {
      if (formParsingHelpers?.formatCommitPatternsForTextarea) {
        // setText (native setter + dispatched events, see
        // setNativeValueAndDispatch above) instead of a plain
        // `textarea.value = ...` assignment - needed once this field is
        // React-owned (Phase 2), same reasoning as every other restored
        // field. HTMLTextAreaElement has its own "value" accessor
        // property (distinct from HTMLInputElement's), so the same
        // prototype-descriptor lookup works unchanged for a <textarea>.
        // Note: this specific ordering (restore arriving *after*
        // react-app.jsx has already mounted) is hard to force
        // deterministically in the e2e suite - see
        // IgnoreCommitPatternsTextarea.test.jsx's own "external native
        // value change" test for the reliable, deterministic proof this
        // technique is needed.
        setText(
          "change-filter-ignore-commit-patterns",
          formParsingHelpers.formatCommitPatternsForTextarea(
            overrides.changeFilters.ignoreCommitPatterns,
          ),
        );
      }
    }
  }

  updateAuthorThreadResolutionRuleVisibility();
  if (latestStoredPayload?.actorsMap) {
    populateAuthorThreadResolutionActorOptions(latestStoredPayload.actorsMap);
    populateChangeFilterActorOptions(latestStoredPayload.actorsMap);
  }
};

const persistRunScriptOptionOverrides = async () => {
  await persistUiOptionOverrides([
    "repo",
    "limit",
    "merged-limit",
    "jobs",
    "open-mode",
    "ack-changed",
    "show-reason",
    "quiet",
  ]);
};

const persistViewFilterOptionOverrides = async () => {
  await persistUiOptionOverrides([
    "scope-mode",
    "filter-pr-numbers",
    "label",
    "exclude-label",
    "author",
    "assigned",
    "approver",
    "always-show-in-review",
    "attention-no-activity-mode",
    "attention-include-pending-comments",
    "attention-ignore-merge-only-commits",
    "attention-include-closed-merged",
    "attention-include-draft-changed",
    "attention-include-draft-no-activity",
    "attention-author-thread-resolution-mode",
    "attention-author-thread-resolution-allow",
    "attention-author-thread-resolution-deny",
    "change-filter-use-builtin-merge-pattern",
    "change-filter-ignore-comment-authors",
    "change-filter-ignore-review-authors",
    "change-filter-ignore-commit-patterns",
  ]);
};

const normalizeAuthorThreadResolutionMode = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "allow-only" || normalized === "deny-only") {
    return normalized;
  }
  return "allow-all";
};

const getSelectedMultiSelectValuesFromList = (listId) => {
  const listNode = getOptionalElementById(listId);
  if (!listNode || typeof listNode.querySelectorAll !== "function") {
    return [];
  }

  return Array.from(listNode.querySelectorAll("input[type='checkbox']:checked"))
    .map((node) => String(node.value || "").trim())
    .filter(Boolean);
};

const getSelectedAuthorThreadResolutionAllowLogins = () =>
  getSelectedMultiSelectValuesFromList(
    "attention-author-thread-resolution-allow-list",
  );

const getSelectedAuthorThreadResolutionDenyLogins = () =>
  getSelectedMultiSelectValuesFromList(
    "attention-author-thread-resolution-deny-list",
  );

const getSelectedChangeFilterIgnoreCommentAuthors = () =>
  getSelectedMultiSelectValuesFromList(
    "change-filter-ignore-comment-authors-list",
  );

const getSelectedChangeFilterIgnoreReviewAuthors = () =>
  getSelectedMultiSelectValuesFromList(
    "change-filter-ignore-review-authors-list",
  );

const updateAuthorThreadResolutionRuleVisibility = () => {
  const mode = normalizeAuthorThreadResolutionMode(
    getOptionalElementById("attention-author-thread-resolution-mode")?.value,
  );
  const allowOptions = getOptionalElementById(
    "attention-author-thread-resolution-allow-options",
  );
  const denyOptions = getOptionalElementById(
    "attention-author-thread-resolution-deny-options",
  );

  if (allowOptions) {
    allowOptions.hidden = mode !== "allow-only";
    if (mode !== "allow-only") {
      allowOptions.open = false;
    }
  }

  if (denyOptions) {
    denyOptions.hidden = mode !== "deny-only";
    if (mode !== "deny-only") {
      denyOptions.open = false;
    }
  }
};

// Phase 6 (see REACT_MIGRATION_PLAN.md): every field read here is migrated
// onto FilterStateProvider's Context (FILTER_STATE_FIELD_MAP) - prefer it
// via getFilterStateOverrideForFieldId when mounted, falling back to the
// original DOM read otherwise, same handled/fallback shape as everywhere
// else.
const readAttentionConfigText = (id, fallbackValue) => {
  const override = getFilterStateOverrideForFieldId(id);
  if (typeof override === "string") {
    return override || fallbackValue;
  }
  return String(getOptionalElementById(id)?.value || "") || fallbackValue;
};
const readAttentionConfigCheckbox = (id) => {
  const override = getFilterStateOverrideForFieldId(id);
  if (typeof override === "boolean") {
    return override;
  }
  return Boolean(getOptionalElementById(id)?.checked);
};

const getNeedsAttentionConfig = () => ({
  noActivityMode: readAttentionConfigText("attention-no-activity-mode", "all"),
  includePendingComments: readAttentionConfigCheckbox(
    "attention-include-pending-comments",
  ),
  ignoreMergeOnlyCommits: readAttentionConfigCheckbox(
    "attention-ignore-merge-only-commits",
  ),
  includeClosedMerged: readAttentionConfigCheckbox(
    "attention-include-closed-merged",
  ),
  includeDraftChanged: readAttentionConfigCheckbox(
    "attention-include-draft-changed",
  ),
  includeDraftNoActivity: readAttentionConfigCheckbox(
    "attention-include-draft-no-activity",
  ),
});

// Phase 6 (see REACT_MIGRATION_PLAN.md): "attention-author-thread-resolution-mode"
// is migrated onto FilterStateProvider's Context (FILTER_STATE_FIELD_MAP) -
// prefer it via getFilterStateOverrideForFieldId when mounted, falling
// back to the original DOM read otherwise. Note
// updateAuthorThreadResolutionRuleVisibility's own read of this same field
// (for its show/hide UI) is left as a plain DOM read - the real
// `<select>` element's `.value` always reflects whatever React (Context
// or local state) currently renders there, so it's already correct
// either way; only this canonical pipeline read site needed updating.
const getAuthorThreadResolutionPolicy = () => {
  const override = getFilterStateOverrideForFieldId(
    "attention-author-thread-resolution-mode",
  );
  const rawMode =
    typeof override === "string"
      ? override
      : getOptionalElementById("attention-author-thread-resolution-mode")?.value;
  return {
    mode: normalizeAuthorThreadResolutionMode(rawMode),
    allowLoginKeys: new Set(
      getSelectedAuthorThreadResolutionAllowLogins().map((value) =>
        String(value || "").trim().toLowerCase(),
      ),
    ),
    denyLoginKeys: new Set(
      getSelectedAuthorThreadResolutionDenyLogins().map((value) =>
        String(value || "").trim().toLowerCase(),
      ),
    ),
  };
};

const prActorIdentityRenderHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-actor-identity-render.helpers.js")
    : globalThis.ViewPrsActorIdentityRenderHelpers;

const prActorIdentityStyleHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-actor-identity-style.helpers.js")
    : globalThis.ViewPrsActorIdentityStyleHelpers;

const {
  buildActorIdentityClassName,
  buildActorIdentityTitle,
} = prActorIdentityStyleHelperFactory.createPrActorIdentityStyleHelpers();

const {
  getEffectiveViewerLogin,
  createActorIdentityElement,
  createActorIdentityFragment,
  appendInlineSegment,
  createActorListFragment,
  appendTimestampAndActor,
} = prActorIdentityRenderHelperFactory.createPrActorIdentityRenderHelpers({
  normalizeActorLogin: (...args) => normalizeActorLogin(...args),
  getCurrentViewerLogin: () => currentViewerLogin,
  inferViewerLoginFromPage: (...args) => inferViewerLoginFromPage(...args),
  resolveActorDisplayName: (...args) => resolveActorDisplayName(...args),
  buildActorIdentityClassName: (...args) => buildActorIdentityClassName(...args),
  buildActorIdentityTitle: (...args) => buildActorIdentityTitle(...args),
  formatIsoDatetime: (...args) => formatIsoDatetime(...args),
  documentRef: typeof document !== "undefined" ? document : null,
});

const prActivityEventDescriptionHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-activity-event-description.helpers.js")
    : globalThis.ViewPrsActivityEventDescriptionHelpers;

const { createActivityEventDescriptionFragment } =
  prActivityEventDescriptionHelperFactory.createPrActivityEventDescriptionHelpers({
    createActorIdentityElement: (...args) => createActorIdentityElement(...args),
    documentRef: typeof document !== "undefined" ? document : null,
  });

const prRequestedReviewersHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-requested-reviewers.helpers.js")
    : globalThis.ViewPrsRequestedReviewersHelpers;

const { collectRequestedReviewers, formatRequestedReviewersDisplay } =
  prRequestedReviewersHelperFactory.createPrRequestedReviewersHelpers({
    asArray: (...args) => asArray(...args),
    resolveActorDisplayName: (...args) => resolveActorDisplayName(...args),
  });

const prAssignedUsersHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-assigned-users.helpers.js")
    : globalThis.ViewPrsAssignedUsersHelpers;

const { collectAssignedUsers, formatAssignedUsersDisplay } =
  prAssignedUsersHelperFactory.createPrAssignedUsersHelpers({
    asArray: (...args) => asArray(...args),
    normalizeActorLogin: (...args) => normalizeActorLogin(...args),
    resolveActorDisplayName: (...args) => resolveActorDisplayName(...args),
  });

const prApproversHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-approvers.helpers.js")
    : globalThis.ViewPrsApproversHelpers;

const { collectApproversFromRow, formatApproversDisplay } =
  prApproversHelperFactory.createPrApproversHelpers({
    asArray: (...args) => asArray(...args),
    getPreferredActorKey: (...args) => getPreferredActorKey(...args),
    resolveActorDisplayName: (...args) => resolveActorDisplayName(...args),
    formatIsoDatetime: (...args) => formatIsoDatetime(...args),
  });

const prLinesChangedInsightHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-lines-changed-insight.helpers.js")
    : globalThis.ViewPrsLinesChangedInsightHelpers;

const { createLinesChangedInsightContent } =
  prLinesChangedInsightHelperFactory.createPrLinesChangedInsightHelpers({
    toCount: (...args) => toCount(...args),
    documentRef: typeof document !== "undefined" ? document : null,
  });

const prInsightBadgeClassHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-insight-badge-class.helpers.js")
    : globalThis.ViewPrsInsightBadgeClassHelpers;

const {
  getBadgeClassForStatus,
  getBadgeClassForCheck,
  getBadgeClassForMerge,
} = prInsightBadgeClassHelperFactory.createPrInsightBadgeClassHelpers({
  isChangedStatus: (...args) => isChangedStatus(...args),
});

const prInsightMetricsSummaryHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-insight-metrics-summary.helpers.js")
    : globalThis.ViewPrsInsightMetricsSummaryHelpers;

const {
  formatReviewFootprint,
  formatConversationStatus,
  formatApprovalRisk,
  formatCommentUsefulness,
} =
  prInsightMetricsSummaryHelperFactory.createPrInsightMetricsSummaryHelpers();

const prLabelsCellHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-labels-cell.helpers.js")
    : globalThis.ViewPrsLabelsCellHelpers;

const { createLabelsCell } =
  prLabelsCellHelperFactory.createPrLabelsCellHelpers({
    getLabelName: (...args) => getLabelName(...args),
    documentRef: typeof document !== "undefined" ? document : null,
  });

const prDateCellHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-date-cell.helpers.js")
    : globalThis.ViewPrsDateCellHelpers;

const { createDateCell } =
  prDateCellHelperFactory.createPrDateCellHelpers({
    formatIsoDatetime: (...args) => formatIsoDatetime(...args),
    getManualNotesFieldSummary: (...args) => getManualNotesFieldSummary(...args),
    createAuthorFieldIndicator: (...args) => createAuthorFieldIndicator(...args),
    documentRef: typeof document !== "undefined" ? document : null,
  });

const prSelectionCellHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-selection-cell.helpers.js")
    : globalThis.ViewPrsSelectionCellHelpers;

const { createSelectionCell } =
  prSelectionCellHelperFactory.createPrSelectionCellHelpers({
    getSelectedPrNumbers: (...args) => getSelectedPrNumbers(...args),
    updateSelectedPrNumbers: (...args) => updateSelectedPrNumbers(...args),
    documentRef: typeof document !== "undefined" ? document : null,
  });

const prStatusCellHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-status-cell.helpers.js")
    : globalThis.ViewPrsStatusCellHelpers;

const { createStatusCell } =
  prStatusCellHelperFactory.createPrStatusCellHelpers({
    isChangedStatus: (...args) => isChangedStatus(...args),
    statusClass: (...args) => statusClass(...args),
    getViewedFilesState: (...args) => getViewedFilesState(...args),
    buildPrLastCheckedIndicator: (...args) => buildPrLastCheckedIndicator(...args),
    documentRef: typeof document !== "undefined" ? document : null,
  });

const prTableCellPrimitivesHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-table-cell-primitives.helpers.js")
    : globalThis.ViewPrsTableCellPrimitivesHelpers;

const { createHeaderCell, createTextCell } =
  prTableCellPrimitivesHelperFactory.createPrTableCellPrimitivesHelpers({
    getTableColumnClass: (index) => TABLE_COLUMN_CLASSES[index] || "",
    documentRef: typeof document !== "undefined" ? document : null,
  });

const prApprovedCellHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-approved-cell.helpers.js")
    : globalThis.ViewPrsApprovedCellHelpers;

const { createApprovedCell } =
  prApprovedCellHelperFactory.createPrApprovedCellHelpers({
    approvedClass: (...args) => approvedClass(...args),
    collectAssignedUsers: (...args) => collectAssignedUsers(...args),
    collectRequestedReviewers: (...args) => collectRequestedReviewers(...args),
    getCurrentViewerLogin: () => currentViewerLogin,
    resolveActorDisplayName: (...args) => resolveActorDisplayName(...args),
    getUserInitials: (...args) => getUserInitials(...args),
    getOpenConversationCountWithMe: (...args) => getOpenConversationCountWithMe(...args),
    toCount: (...args) => toCount(...args),
    documentRef: typeof document !== "undefined" ? document : null,
  });

const prAuthorCellHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-author-cell.helpers.js")
    : globalThis.ViewPrsAuthorCellHelpers;

const { createAuthorCell, collectPrAuthors } =
  prAuthorCellHelperFactory.createPrAuthorCellHelpers({
    getPreferredActorKey: (...args) => getPreferredActorKey(...args),
    createActorIdentityElement: (...args) => createActorIdentityElement(...args),
    getManualNotesSummary: (...args) => getManualNotesSummary(...args),
    documentRef: typeof document !== "undefined" ? document : null,
  });

const prTitleCellHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-title-cell.helpers.js")
    : globalThis.ViewPrsTitleCellHelpers;

const { createTitleCell } =
  prTitleCellHelperFactory.createPrTitleCellHelpers({
    formatTitleWithIcons: (...args) => formatTitleWithIcons(...args),
    autoResizeTextarea: (...args) => autoResizeTextarea(...args),
    countPendingThreadComments: (...args) => countPendingThreadComments(...args),
    documentRef: typeof document !== "undefined" ? document : null,
  });

const prActionsCellHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-actions-cell.helpers.js")
    : globalThis.ViewPrsActionsCellHelpers;

const { createActionsCell } =
  prActionsCellHelperFactory.createPrActionsCellHelpers({
    createInReviewControl: (...args) => createInReviewControl(...args),
    createFlaggedControl: (...args) => createFlaggedControl(...args),
    runSinglePrUpdate: (...args) => runSinglePrUpdate(...args),
    runAckOnlyWorkflow: (...args) => runAckOnlyWorkflow(...args),
    runClearOnlyWorkflow: (...args) => runClearOnlyWorkflow(...args),
    getLatestSelectedRepo: () => latestSelectedRepo,
    defaultRepo: DEFAULT_REPO,
    documentRef: typeof document !== "undefined" ? document : null,
  });

const prRowToggleControlsHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-row-toggle-controls.helpers.js")
    : globalThis.ViewPrsRowToggleControlsHelpers;

const { createInReviewControl, createFlaggedControl } =
  prRowToggleControlsHelperFactory.createPrRowToggleControlsHelpers({
    isInReviewEnabled: (...args) => isInReviewEnabled(...args),
    isFlaggedEnabled: (...args) => isFlaggedEnabled(...args),
    toggleInReviewForRow: (...args) => toggleInReviewForRow(...args),
    toggleFlaggedForRow: (...args) => toggleFlaggedForRow(...args),
    documentRef: typeof document !== "undefined" ? document : null,
  });

const prUiRenderUtilsHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-ui-render-utils.helpers.js")
    : globalThis.ViewPrsUiRenderUtilsHelpers;

const { parseMarkerState, safeJsonStringify } =
  prUiRenderUtilsHelperFactory.createPrUiRenderUtilsHelpers();

const prActivityTimelineRenderHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-activity-timeline-render.helpers.js")
    : globalThis.ViewPrsActivityTimelineRenderHelpers;

const { renderTimelineItems } =
  prActivityTimelineRenderHelperFactory.createPrActivityTimelineRenderHelpers({
    createActorIdentityElement: (...args) => createActorIdentityElement(...args),
  });

const prNeedsAttentionHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-needs-attention.helpers.js")
    : globalThis.ViewPrsNeedsAttentionHelpers;

const {
  shouldShowNeedsAttention,
  entryNeedsAttention,
  entryHasYourLastActivity,
} = prNeedsAttentionHelperFactory.createPrNeedsAttentionHelpers({
  asArray: (...args) => asArray(...args),
  isChangedStatus: (...args) => isChangedStatus(...args),
  getEffectiveViewerLogin: (...args) => getEffectiveViewerLogin(...args),
  collectAssignedUsers: (...args) => collectAssignedUsers(...args),
  collectRequestedReviewers: (...args) => collectRequestedReviewers(...args),
  countPendingThreadComments: (...args) => countPendingThreadComments(...args),
});

// Expose for the React hybrid table bridge (see components/PrTableApp.jsx),
// which reads these off `window` since it can't import top-level `const`
// bindings from this non-module script.
if (typeof window !== "undefined") {
  window.entryNeedsAttention = entryNeedsAttention;
  window.getNeedsAttentionConfig = getNeedsAttentionConfig;
}

const prUiOptionScrollHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-ui-option-scroll.helpers.js")
    : globalThis.ViewPrsUiOptionScrollHelpers;

const {
  registerUiOptionPersistenceHandlers,
  autoScrollBackfillLogToBottom,
} = prUiOptionScrollHelperFactory.createPrUiOptionScrollHelpers({
  getOptionalElementById: (...args) => getOptionalElementById(...args),
  persistUiOptionOverrides: (...args) => persistUiOptionOverrides(...args),
  shouldAutoScrollBackfillLogByState: (...args) =>
    shouldAutoScrollBackfillLogByState(...args),
  getBackfillScrollTop: (...args) => getBackfillScrollTop(...args),
  getIsBackfillRunning: () => isBackfillRunning,
});

const prDomAccessHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-dom-access.helpers.js")
    : globalThis.ViewPrsDomAccessHelpers;

const { getOptionalElementById, readElementAttribute } =
  prDomAccessHelperFactory.createPrDomAccessHelpers({
    documentRef: typeof document !== "undefined" ? document : null,
  });

const prDomResetHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-dom-reset.helpers.js")
    : globalThis.ViewPrsDomResetHelpers;

const { clearElementContents } =
  prDomResetHelperFactory.createPrDomResetHelpers();

const prDomTraversalHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-dom-traversal.helpers.js")
    : globalThis.ViewPrsDomTraversalHelpers;

const { collectNodesByClass, collectNodesByTag } =
  prDomTraversalHelperFactory.createPrDomTraversalHelpers();

const prSectionOpenStateHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-section-open-state.helpers.js")
    : globalThis.ViewPrsSectionOpenStateHelpers;

const { capturePrSectionOpenState } =
  prSectionOpenStateHelperFactory.createPrSectionOpenStateHelpers({
    collectNodesByClass: (...args) => collectNodesByClass(...args),
    readElementAttribute: (...args) => readElementAttribute(...args),
  });

const prInsightsStateHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-insights-state.helpers.js")
    : globalThis.ViewPrsInsightsStateHelpers;

const {
  captureExpandedInsightsState,
  captureOpenInnerInsightSectionsState,
  restoreExpandedInsightsState,
  restoreOpenInnerInsightSectionsState,
} = prInsightsStateHelperFactory.createPrInsightsStateHelpers({
  collectNodesByClass: (...args) => collectNodesByClass(...args),
  collectNodesByTag: (...args) => collectNodesByTag(...args),
  readElementAttribute: (...args) => readElementAttribute(...args),
});

const prInsightsViewStateHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-insights-view-state.helpers.js")
    : globalThis.ViewPrsInsightsViewStateHelpers;

const { captureInsightsViewState } =
  prInsightsViewStateHelperFactory.createPrInsightsViewStateHelpers({
    captureExpandedInsightsState: (...args) => captureExpandedInsightsState(...args),
    captureOpenInnerInsightSectionsState: (...args) =>
      captureOpenInnerInsightSectionsState(...args),
    restoreExpandedInsightsState: (...args) => restoreExpandedInsightsState(...args),
    restoreOpenInnerInsightSectionsState: (...args) =>
      restoreOpenInnerInsightSectionsState(...args),
  });

const prAppliedSummaryHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-applied-summary.helpers.js")
    : globalThis.ViewPrsAppliedSummaryHelpers;

const { buildAppliedSummaryViewModel } =
  prAppliedSummaryHelperFactory.createPrAppliedSummaryHelpers();

const prMergedRequestMoreConfigHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-merged-request-more-config.helpers.js")
    : globalThis.ViewPrsMergedRequestMoreConfigHelpers;

const { buildMergedRequestMoreActionOptions } =
  prMergedRequestMoreConfigHelperFactory.createPrMergedRequestMoreConfigHelpers();

const prMergedRequestMoreHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-merged-request-more.helpers.js")
    : globalThis.ViewPrsMergedRequestMoreHelpers;

const { appendMergedRequestMoreAction } =
  prMergedRequestMoreHelperFactory.createPrMergedRequestMoreHelpers({
    handleRequestMoreMerged: (...args) => handleRequestMoreMerged(...args),
    getIsRequestMoreMergedPending: () => isRequestMoreMergedPending,
    documentRef: typeof document !== "undefined" ? document : null,
  });

const prSectionGroupingHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-section-grouping.helpers.js")
    : globalThis.ViewPrsSectionGroupingHelpers;

const { buildGroupedPrSections } =
  prSectionGroupingHelperFactory.createPrSectionGroupingHelpers({
    sortRowsByPrNumberDesc: (...args) => sortRowsByPrNumberDesc(...args),
    sortRowsByDateFieldDesc: (...args) => sortRowsByDateFieldDesc(...args),
  });

const prScopeSelectionHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-scope-selection.helpers.js")
    : globalThis.ViewPrsScopeSelectionHelpers;

const { normalizeSelectedScope, resolveScopedRows } =
  prScopeSelectionHelperFactory.createPrScopeSelectionHelpers({
    entryNeedsAttention: (...args) => entryNeedsAttention(...args),
    entryHasYourLastActivity: (...args) => entryHasYourLastActivity(...args),
  });

const prScopeSettingsHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-scope-settings.helpers.js")
    : globalThis.ViewPrsScopeSettingsHelpers;

const { deriveScopeSettings } =
  prScopeSettingsHelperFactory.createPrScopeSettingsHelpers({
    parseCsvTokens: (...args) => parseCsvTokens(...args),
    normalizeSelectedScope: (...args) => normalizeSelectedScope(...args),
  });

const prRepoRunContextHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-repo-run-context.helpers.js")
    : globalThis.ViewPrsRepoRunContextHelpers;

const { deriveRepoRunContext } =
  prRepoRunContextHelperFactory.createPrRepoRunContextHelpers();

const prRenderContextHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-render-context.helpers.js")
    : globalThis.ViewPrsRenderContextHelpers;

const { captureRenderContext } =
  prRenderContextHelperFactory.createPrRenderContextHelpers({
    getElementById: (...args) => document.getElementById(...args),
    captureInsightsViewState: (...args) => captureInsightsViewState(...args),
    capturePrSectionOpenState: (...args) => capturePrSectionOpenState(...args),
  });

const prRowSourcesHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-row-sources.helpers.js")
    : globalThis.ViewPrsRowSourcesHelpers;

const { deriveRowSources } =
  prRowSourcesHelperFactory.createPrRowSourcesHelpers({
    normalizeRows: (...args) => normalizeRows(...args),
  });

const prViewerContextHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-viewer-context.helpers.js")
    : globalThis.ViewPrsViewerContextHelpers;

const { deriveViewerContext } =
  prViewerContextHelperFactory.createPrViewerContextHelpers({
    normalizeActorLoginAliases: (...args) => normalizeActorLoginAliases(...args),
    normalizeActorLogin: (...args) => normalizeActorLogin(...args),
    inferViewerLoginFromPage: (...args) => inferViewerLoginFromPage(...args),
  });

const prFilterOptionsHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-filter-options.helpers.js")
    : globalThis.ViewPrsFilterOptionsHelpers;

const { populateFilterOptions } =
  prFilterOptionsHelperFactory.createPrFilterOptionsHelpers({
    populateIncludeLabelOptions: (...args) => populateIncludeLabelOptions(...args),
    populateExcludeLabelOptions: (...args) => populateExcludeLabelOptions(...args),
    populateAuthorOptions: (...args) => populateAuthorOptions(...args),
    populateAssignedOptions: (...args) => populateAssignedOptions(...args),
    populateApproverOptions: (...args) => populateApproverOptions(...args),
    populateAuthorThreadResolutionActorOptions: (...args) =>
      populateAuthorThreadResolutionActorOptions(...args),
    populateChangeFilterActorOptions: (...args) =>
      populateChangeFilterActorOptions(...args),
  });

const prScopedRowsHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-scoped-rows.helpers.js")
    : globalThis.ViewPrsScopedRowsHelpers;

const { deriveScopedRows } =
  prScopedRowsHelperFactory.createPrScopedRowsHelpers({
    resolveScopedRows: (...args) => resolveScopedRows(...args),
    normalizeRows: (...args) => normalizeRows(...args),
  });

const prRenderSummaryHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-render-summary.helpers.js")
    : globalThis.ViewPrsRenderSummaryHelpers;

const { deriveRenderSummary } =
  prRenderSummaryHelperFactory.createPrRenderSummaryHelpers({
    buildGroupedPrSections: (...args) => buildGroupedPrSections(...args),
    buildAppliedSummaryViewModel: (...args) =>
      buildAppliedSummaryViewModel(...args),
    renderSchedulerStatus: (...args) => renderSchedulerStatus(...args),
  });

const prRenderApplyHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-render-apply.helpers.js")
    : globalThis.ViewPrsRenderApplyHelpers;

const { applyRenderResults, renderAuthorInsightsIfVisible, renderStatsViewIfVisible } =
  prRenderApplyHelperFactory.createPrRenderApplyHelpers({
    renderManagementFilterSummary: (...args) =>
      renderManagementFilterSummary(...args),
    renderExportFieldCatalog: (...args) => renderExportFieldCatalog(...args),
    renderAuthorInsights: (...args) => renderAuthorInsights(...args),
    renderStatsView: (...args) => renderStatsView(...args),
    clearElementContents: (...args) => clearElementContents(...args),
    buildMergedRequestMoreActionOptions: (...args) =>
      buildMergedRequestMoreActionOptions(...args),
    appendMergedRequestMoreAction: (...args) =>
      appendMergedRequestMoreAction(...args),
    computePrDataFingerprint: (...args) => computePrDataFingerprint(...args),
    computePrDataManifest: (...args) => computePrDataManifest(...args),
    getOptionalElementById: (...args) => getOptionalElementById(...args),
  });

const prFilterPipelineHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-filter-pipeline.helpers.js")
    : globalThis.ViewPrsFilterPipelineHelpers;

const { deriveFilterPipelineState } =
  prFilterPipelineHelperFactory.createPrFilterPipelineHelpers({
    buildSelectedFiltersViewModel: (...args) =>
      buildSelectedFiltersViewModel(...args),
    buildRowFilterCriteria: (...args) => buildRowFilterCriteria(...args),
    applyRowUiFilters: (...args) => applyRowUiFilters(...args),
  });

const prFilterSelectionInputsHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-filter-selection-inputs.helpers.js")
    : globalThis.ViewPrsFilterSelectionInputsHelpers;

const { deriveFilterSelectionInputs } =
  prFilterSelectionInputsHelperFactory.createPrFilterSelectionInputsHelpers({
    getSelectedIncludeLabelNames: (...args) =>
      getSelectedIncludeLabelNames(...args),
    getSelectedExcludeLabelNames: (...args) =>
      getSelectedExcludeLabelNames(...args),
    getSelectedAuthorLogins: (...args) => getSelectedAuthorLogins(...args),
    getSelectedAssignedLogins: (...args) => getSelectedAssignedLogins(...args),
    getSelectedApproverLogins: (...args) => getSelectedApproverLogins(...args),
    getOpenModeFilter: () => {
      const override = getFilterStateOverrideForFieldId("open-mode");
      if (typeof override === "string") {
        return override || "none";
      }
      return document.getElementById("open-mode")?.value || "none";
    },
    shouldAlwaysShowInReviewRows: (...args) =>
      shouldAlwaysShowInReviewRows(...args),
    getCustomCommentsFilter: (...args) => getCustomCommentsFilter(...args),
    getOtherNotesFilter: (...args) => getOtherNotesFilter(...args),
    getPrDifficultyFilter: (...args) => getPrDifficultyFilter(...args),
    getRallyStoriesFilter: (...args) => getRallyStoriesFilter(...args),
    getRallyLinksFilter: (...args) => getRallyLinksFilter(...args),
    getAnalysisOfPrFilter: (...args) => getAnalysisOfPrFilter(...args),
  });

const prRenderSummaryInputsHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-render-summary-inputs.helpers.js")
    : globalThis.ViewPrsRenderSummaryInputsHelpers;

const { deriveRenderSummaryInputs } =
  prRenderSummaryInputsHelperFactory.createPrRenderSummaryInputsHelpers();

const prRenderFilterSummaryHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-render-filter-summary.helpers.js")
    : globalThis.ViewPrsRenderFilterSummaryHelpers;

const { deriveRenderFilterSummaryState } =
  prRenderFilterSummaryHelperFactory.createPrRenderFilterSummaryHelpers({
    deriveScopedRows: (...args) => deriveScopedRows(...args),
    deriveFilterSelectionInputs: (...args) => deriveFilterSelectionInputs(...args),
    deriveFilterPipelineState: (...args) => deriveFilterPipelineState(...args),
    deriveRenderSummaryInputs: (...args) => deriveRenderSummaryInputs(...args),
    deriveRenderSummary: (...args) => deriveRenderSummary(...args),
  });

const prRenderApplyInputsHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-render-apply-inputs.helpers.js")
    : globalThis.ViewPrsRenderApplyInputsHelpers;

const { deriveRenderApplyInputs } =
  prRenderApplyInputsHelperFactory.createPrRenderApplyInputsHelpers();

const prRenderFinalizeHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-render-finalize.helpers.js")
    : globalThis.ViewPrsRenderFinalizeHelpers;

const { deriveRenderFinalizedState } =
  prRenderFinalizeHelperFactory.createPrRenderFinalizeHelpers({
    deriveRenderApplyInputs: (...args) => deriveRenderApplyInputs(...args),
    applyRenderResults: (...args) => applyRenderResults(...args),
    deriveCommittedRenderState: (...args) => deriveCommittedRenderState(...args),
  });

const prRenderPipelineHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-render-pipeline.helpers.js")
    : globalThis.ViewPrsRenderPipelineHelpers;

const { deriveRenderPipelineState } =
  prRenderPipelineHelperFactory.createPrRenderPipelineHelpers({
    deriveViewerFilterSetup: (...args) => deriveViewerFilterSetup(...args),
    deriveRenderFilterSummaryState: (...args) =>
      deriveRenderFilterSummaryState(...args),
    deriveRenderFinalizedState: (...args) => deriveRenderFinalizedState(...args),
  });

const prRenderStateCommitHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-render-state-commit.helpers.js")
    : globalThis.ViewPrsRenderStateCommitHelpers;

const { deriveCommittedRenderState } =
  prRenderStateCommitHelperFactory.createPrRenderStateCommitHelpers();

const prRunPrDataContextHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-run-pr-data-context.helpers.js")
    : globalThis.ViewPrsRunPrDataContextHelpers;

const { deriveRunPrDataContext } =
  prRunPrDataContextHelperFactory.createPrRunPrDataContextHelpers({
    captureRenderContext: (...args) => captureRenderContext(...args),
    deriveRepoRunContext: (...args) => deriveRepoRunContext(...args),
    deriveScopeSettings: (...args) => deriveScopeSettings(...args),
    getNeedsAttentionConfig: (...args) => getNeedsAttentionConfig(...args),
    deriveRowSources: (...args) => deriveRowSources(...args),
    getFilterStateValue: (name) =>
      typeof window !== "undefined" && typeof window.getFilterStateValues === "function"
        ? window.getFilterStateValues()[name]
        : undefined,
  });

const prStoredDataLoadHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-stored-data-load.helpers.js")
    : globalThis.ViewPrsStoredDataLoadHelpers;

const { loadStoredData } =
  prStoredDataLoadHelperFactory.createPrStoredDataLoadHelpers({
    fetch: (...args) => fetch(...args),
    beginRequestActivity: (...args) => beginRequestActivity(...args),
    setLastSeenDataVersion: (value) => {
      lastSeenDataVersion = value;
    },
    setLastRenderedRunStamp: (value) => {
      lastRenderedRunStamp = value;
    },
    setLastSuccessfulRenderedCheckAt: (value) => {
      lastSuccessfulRenderedCheckAt = value;
    },
    setLatestStoredPayload: (value) => {
      latestStoredPayload = value;
    },
    getLatestSelectedRepo: () => latestSelectedRepo,
    setLatestSelectedRepo: (value) => {
      latestSelectedRepo = value;
    },
    updateBackfillStatusFromPayload: (...args) =>
      updateBackfillStatusFromPayload(...args),
    renderPrData: (...args) => renderPrData(...args),
  });

const prSinglePrUpdateHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-single-pr-update.helpers.js")
    : globalThis.ViewPrsSinglePrUpdateHelpers;

const { runSinglePrUpdate } =
  prSinglePrUpdateHelperFactory.createPrSinglePrUpdateHelpers({
    postJson: (...args) => postJson(...args),
    beginRequestActivity: (...args) => beginRequestActivity(...args),
    setStatusMessage: (...args) => setStatusMessage(...args),
    setOutputMessage: (...args) => setOutputMessage(...args),
    getGithubAuthFailureHint: (...args) => getGithubAuthFailureHint(...args),
    formatCommandOutputWithAuthHint: (...args) =>
      formatCommandOutputWithAuthHint(...args),
    notifyFailureSnackbar: (...args) => notifyFailureSnackbar(...args),
    stripAnsi: (...args) => stripAnsi(...args),
    setLatestStoredPayload: (value) => {
      latestStoredPayload = value;
    },
    setLatestSelectedRepo: (value) => {
      latestSelectedRepo = value;
    },
    renderPrData: (...args) => renderPrData(...args),
    loadStoredData: (...args) => loadStoredData(...args),
    defaultRepo: DEFAULT_REPO,
  });

const prMergedRequestMoreActionHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-merged-request-more-action.helpers.js")
    : globalThis.ViewPrsMergedRequestMoreActionHelpers;

const { handleRequestMoreMerged } =
  prMergedRequestMoreActionHelperFactory.createPrMergedRequestMoreActionHelpers({
    getIsRequestMoreMergedPending: () => isRequestMoreMergedPending,
    setIsRequestMoreMergedPending: (value) => {
      isRequestMoreMergedPending = value;
    },
    getLatestSelectedRepo: () => latestSelectedRepo,
    defaultRepo: DEFAULT_REPO,
    getOptionalElementById: (...args) => getOptionalElementById(...args),
    beginRequestActivity: (...args) => beginRequestActivity(...args),
    postJson: (...args) => postJson(...args),
    setLatestStoredPayload: (value) => {
      latestStoredPayload = value;
    },
    setLatestSelectedRepo: (value) => {
      latestSelectedRepo = value;
    },
    renderPrData: (...args) => renderPrData(...args),
    loadStoredData: (...args) => loadStoredData(...args),
    setStatusMessage: (...args) => setStatusMessage(...args),
    notifyFailureSnackbar: (...args) => notifyFailureSnackbar(...args),
  });

const prApplyFiltersCacheHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-apply-filters-cache.helpers.js")
    : globalThis.ViewPrsApplyFiltersCacheHelpers;

const { applyFiltersFromCache } =
  prApplyFiltersCacheHelperFactory.createPrApplyFiltersCacheHelpers({
    getLatestStoredPayload: () => latestStoredPayload,
    getLatestSelectedRepo: () => latestSelectedRepo,
    renderPrData: (...args) => renderPrData(...args),
    setStatusMessage: (...args) => setStatusMessage(...args),
    logError: (...args) => console.error(...args),
  });

const prExportActionsHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-export-actions.helpers.js")
    : globalThis.ViewPrsExportActionsHelpers;

const {
  handlePreviewExport,
  handleCopyExport,
  handleDownloadExport,
} = prExportActionsHelperFactory.createPrExportActionsHelpers({
  getOptionalElementById: (...args) => getOptionalElementById(...args),
  persistExportFieldSelections: (...args) => persistExportFieldSelections(...args),
  buildVisibleExportJson: (...args) => buildVisibleExportJson(...args),
  setExportStatus: (...args) => setExportStatus(...args),
  getLatestStoredPayload: () => latestStoredPayload,
  getLatestSelectedRepo: () => latestSelectedRepo,
});

const prExportPreviewSummaryHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-export-preview-summary.helpers.js")
    : globalThis.ViewPrsExportPreviewSummaryHelpers;

const { updateExportPreviewSummary } =
  prExportPreviewSummaryHelperFactory.createPrExportPreviewSummaryHelpers({
    getLatestStoredPayload: () => latestStoredPayload,
    getOptionalElementById: (...args) => getOptionalElementById(...args),
    getVisiblePrNumbersFromSectionsHost: (...args) =>
      getVisiblePrNumbersFromSectionsHost(...args),
    getSelectedExportFieldPaths: (...args) => getSelectedExportFieldPaths(...args),
    renderExportSelectionSummary: (...args) => renderExportSelectionSummary(...args),
    collectNodesByClass: (...args) => collectNodesByClass(...args),
  });

const prExportJsonBuildHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-export-json-build.helpers.js")
    : globalThis.ViewPrsExportJsonBuildHelpers;

const { buildVisibleExportJson } =
  prExportJsonBuildHelperFactory.createPrExportJsonBuildHelpers({
    getLatestStoredPayload: () => latestStoredPayload,
    getSelectedExportFieldPaths: (...args) => getSelectedExportFieldPaths(...args),
    getOptionalElementById: (...args) => getOptionalElementById(...args),
    getVisiblePrNumbersFromSectionsHost: (...args) =>
      getVisiblePrNumbersFromSectionsHost(...args),
    buildExportPayload: (...args) => buildExportPayload(...args),
    safeJsonStringify: (...args) => safeJsonStringify(...args),
  });

const prRenderViewerFilterSetupHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-render-viewer-filter-setup.helpers.js")
    : globalThis.ViewPrsRenderViewerFilterSetupHelpers;

const { deriveViewerFilterSetup } =
  prRenderViewerFilterSetupHelperFactory.createPrRenderViewerFilterSetupHelpers({
    deriveViewerContext: (...args) => deriveViewerContext(...args),
    commitViewerContext: ({
      currentActorLoginAliases: nextActorLoginAliases,
      currentViewerLogin: nextViewerLogin,
    }) => {
      currentActorLoginAliases =
        nextActorLoginAliases && typeof nextActorLoginAliases === "object"
          ? nextActorLoginAliases
          : {};
      currentViewerLogin =
        typeof nextViewerLogin === "string" ? nextViewerLogin : "";
    },
    populateFilterOptions: (...args) => populateFilterOptions(...args),
  });

const prSelectedFiltersHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-selected-filters.helpers.js")
    : globalThis.ViewPrsSelectedFiltersHelpers;

const { buildSelectedFiltersViewModel } =
  prSelectedFiltersHelperFactory.createPrSelectedFiltersHelpers();

const prEntryDerivedCacheHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-entry-derived-cache.helpers.js")
    : globalThis.ViewPrsEntryDerivedCacheHelpers;

// Phase 5 (see REACT_MIGRATION_PLAN.md, "Performance Validation"): one
// shared cache instance for the page's whole lifetime, not recreated per
// render - its value comes entirely from persisting across renders (an
// unchanged entry's derived values/filter-match result stay cached from
// one render to the next).
const { getOrCompute: getOrComputeEntryDerivedValue } =
  prEntryDerivedCacheHelperFactory.createEntryDerivedCache();

const prRowFilteringHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-row-filtering.helpers.js")
    : globalThis.ViewPrsRowFilteringHelpers;

const { buildRowFilterCriteria, applyRowUiFilters } =
  prRowFilteringHelperFactory.createPrRowFilteringHelpers({
    rowMatchesUiFilters: (...args) => rowMatchesUiFilters(...args),
    getOrCompute: (...args) => getOrComputeEntryDerivedValue(...args),
  });

const prDomVisibilityHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-dom-visibility.helpers.js")
    : globalThis.ViewPrsDomVisibilityHelpers;

const { expandAncestorDetailsElements, ensureInsightsRowVisibleForElement } =
  prDomVisibilityHelperFactory.createPrDomVisibilityHelpers({
    readElementAttribute: (...args) => readElementAttribute(...args),
  });

const prAutoRenderUnsavedHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-auto-render-unsaved.helpers.js")
    : globalThis.ViewPrsAutoRenderUnsavedHelpers;

const {
  getDirtyTrackedFields,
  getUnsavedNotesSections,
  normalizePrNumber,
  getBlockingPrNumbers,
  getFirstUnsavedElementForPrNumber,
} = prAutoRenderUnsavedHelperFactory.createPrAutoRenderUnsavedHelpers({
  getOptionalElementById,
  readElementAttribute: (...args) => readElementAttribute(...args),
});

const prAuthorInsightsIdentityHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-author-insights-identity.helpers.js")
    : globalThis.ViewPrsAuthorInsightsIdentityHelpers;

const { getAuthorInsightsDisplayName, noteAuthorMatchesSelection } =
  prAuthorInsightsIdentityHelperFactory.createPrAuthorInsightsIdentityHelpers({
    normalizeActorLogin: (...args) => normalizeActorLogin(...args),
    resolveActorDisplayName: (...args) => resolveActorDisplayName(...args),
    getLatestActorsMap: () => authorInsightsState.latestActorsMap || {},
  });

const prAuthorInsightsDraftsHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-author-insights-drafts.helpers.js")
    : globalThis.ViewPrsAuthorInsightsDraftsHelpers;

const {
  DEFAULT_AUTHOR_INSIGHTS_SENTIMENT,
  normalizeAuthorInsightsSentiment,
  getAuthorInsightsComposerDraft,
  updateAuthorInsightsComposerDraft,
  resetAuthorInsightsComposerDraft,
  isAuthorInsightsComposerDraftDirty,
  getAuthorInsightsEditDraftMap,
  getAuthorInsightsEditDraft,
  updateAuthorInsightsEditDraft,
  resetAuthorInsightsEditDraft,
  isAuthorInsightsEditDraftDirty,
  getAuthorManualCommentsForLogin,
} = prAuthorInsightsDraftsHelperFactory.createPrAuthorInsightsDraftsHelpers({
  authorInsightsState,
  normalizeActorLogin: (...args) => normalizeActorLogin(...args),
});

const prAutoRenderBlockingHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-auto-render-blocking.helpers.js")
    : globalThis.ViewPrsAutoRenderBlockingHelpers;

const { formatBlockingPrNumbersLabel, getBlockingAuthorInsightsLogins } =
  prAutoRenderBlockingHelperFactory.createPrAutoRenderBlockingHelpers({
    normalizePrNumber,
    normalizeActorLogin: (...args) => normalizeActorLogin(...args),
    isAuthorInsightsComposerDraftDirty,
    getAuthorManualCommentsForLogin,
    isAuthorInsightsEditDraftDirty,
    getAuthorInsightsDisplayName: (...args) => getAuthorInsightsDisplayName(...args),
  });

const prAutoRenderIndicatorHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-auto-render-indicator.helpers.js")
    : globalThis.ViewPrsAutoRenderIndicatorHelpers;

const {
  buildAutoRenderBlockedStatusText,
  buildAutoRenderBlockedLinksAriaLabel,
} = prAutoRenderIndicatorHelperFactory.createPrAutoRenderIndicatorHelpers({
  getAuthorInsightsDisplayName: (...args) => getAuthorInsightsDisplayName(...args),
});

const prAutoRenderIndicatorLinksHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-auto-render-indicator-links.helpers.js")
    : globalThis.ViewPrsAutoRenderIndicatorLinksHelpers;

const { renderAutoRenderBlockedLinks } =
  prAutoRenderIndicatorLinksHelperFactory.createPrAutoRenderIndicatorLinksHelpers(
    {
      clearElementContents: (...args) => clearElementContents(...args),
      getAuthorInsightsDisplayName: (...args) =>
        getAuthorInsightsDisplayName(...args),
      navigateToPrInTable: (...args) => navigateToPrInTable(...args),
      navigateToAuthorInsights: (...args) => navigateToAuthorInsights(...args),
      buildAutoRenderBlockedLinksAriaLabel,
      documentRef: typeof document !== "undefined" ? document : null,
    },
  );

const prAutoRenderStateHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-auto-render-state.helpers.js")
    : globalThis.ViewPrsAutoRenderStateHelpers;

const { getAutoRenderBlockingState, computeHasDirtyPrSectionsFields } =
  prAutoRenderStateHelperFactory.createPrAutoRenderStateHelpers({
    getDirtyTrackedFields,
    getUnsavedNotesSections,
    getBlockingPrNumbers,
    getBlockingAuthorInsightsLogins,
    formatBlockingPrNumbersLabel,
  });

const prAutoRenderNavigationHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-auto-render-navigation.helpers.js")
    : globalThis.ViewPrsAutoRenderNavigationHelpers;

const {
  navigateToPrInTable,
  navigateToAuthorInsights,
} = prAutoRenderNavigationHelperFactory.createPrAutoRenderNavigationHelpers({
  normalizePrNumber,
  normalizeActorLogin: (...args) => normalizeActorLogin(...args),
  activateDataTab: (...args) => activateDataTab(...args),
  collectNodesByTag: (...args) => collectNodesByTag(...args),
  expandAncestorDetailsElements,
  ensureInsightsRowVisibleForElement,
  getFirstUnsavedElementForPrNumber,
  getOptionalElementById,
  getAuthorInsightsComposerDraft,
  isAuthorInsightsComposerDraftDirty,
  getAuthorInsightsEditDraftMap,
  getAuthorManualCommentsForLogin,
  isAuthorInsightsEditDraftDirty,
  authorInsightsState,
  renderAuthorInsights: (...args) => renderAuthorInsights(...args),
  documentRef: typeof document !== "undefined" ? document : null,
  setTimeoutFn: (...args) => setTimeout(...args),
});

const renderAutoRenderBlockedIndicator = () => {
  const indicator = getOptionalElementById("auto-render-blocked-indicator");
  if (!indicator) {
    return;
  }

  const isBlocked = Boolean(pendingAutoRenderPayload) && hasDirtyPrSectionsFields;
  if (!isBlocked) {
    indicator.setAttribute("hidden", "");
    return;
  }

  const {
    dirtyFieldCount,
    unsavedNotesCount,
    blockingPrNumbers,
    blockingAuthorInsightsLogins,
    blockingPrLabel,
  } = getAutoRenderBlockingState();
  const linksHost = getOptionalElementById("auto-render-blocked-pr-links");
  const statusNode = getOptionalElementById("auto-render-blocked-status");
  if (statusNode) {
    statusNode.textContent = buildAutoRenderBlockedStatusText({
      dirtyFieldCount,
      unsavedNotesCount,
      blockingAuthorInsightsCount: blockingAuthorInsightsLogins.length,
    });
  }

  if (linksHost) {
    renderAutoRenderBlockedLinks({
      linksHost,
      blockingPrNumbers,
      blockingAuthorInsightsLogins,
      blockingPrLabel,
    });
  }

  indicator.removeAttribute("hidden");
};

const flushPendingAutoRenderNow = () => {
  if (!pendingAutoRenderPayload) {
    return false;
  }
  const payload = pendingAutoRenderPayload;
  pendingAutoRenderPayload = null;
  renderAutoRenderBlockedIndicator();
  renderPrData(payload);
  return true;
};

const forceApplyPendingAutoRender = () => {
  if (!pendingAutoRenderPayload) {
    return;
  }
  flushPendingAutoRenderNow();
  setStatusMessage("Applied latest updates and discarded unsaved edits.");
};

const recomputeDirtyPrSectionsFields = () => {
  const blockingState = getAutoRenderBlockingState();
  hasDirtyPrSectionsFields = computeHasDirtyPrSectionsFields(blockingState);
  renderAutoRenderBlockedIndicator();

  if (!hasDirtyPrSectionsFields && pendingAutoRenderPayload) {
    flushPendingAutoRender();
  }

  return hasDirtyPrSectionsFields;
};

const setButtonDisabled = (id, disabled) => {
  const element = getOptionalElementById(id);
  if (element) {
    element.disabled = Boolean(disabled);
  }
};

const OPEN_PR_LAST_CHECK_STALE_MS = 15 * 60 * 1000;

const parseIsoTimestampMs = (isoValue) => {
  const raw = String(isoValue ?? "").trim();
  if (!raw || raw === "-") {
    return Number.NaN;
  }

  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const formatRelativeLastCheckedLabel = (updatedAt, nowMs = Date.now()) => {
  const updatedAtMs = parseIsoTimestampMs(updatedAt);
  if (!Number.isFinite(updatedAtMs)) {
    return {
      label: "↻ unknown",
      elapsedMs: Number.NaN,
      title: "Last checked for updates timestamp is unavailable.",
    };
  }

  const elapsedMs = Math.max(0, Number(nowMs) - updatedAtMs);
  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  if (elapsedSeconds < 60) {
    return {
      label: "↻ just now",
      elapsedMs,
      title: `Last checked for updates at ${formatIsoDatetime(updatedAt)}.`,
    };
  }

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) {
    return {
      label: `↻ ${elapsedMinutes}m ago`,
      elapsedMs,
      title: `Last checked for updates at ${formatIsoDatetime(updatedAt)}.`,
    };
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return {
      label: `↻ ${elapsedHours}h ago`,
      elapsedMs,
      title: `Last checked for updates at ${formatIsoDatetime(updatedAt)}.`,
    };
  }

  const elapsedDays = Math.floor(elapsedHours / 24);
  return {
    label: `↻ ${elapsedDays}d ago`,
    elapsedMs,
    title: `Last checked for updates at ${formatIsoDatetime(updatedAt)}.`,
  };
};

const buildPrLastCheckedIndicator = ({ updatedAt, sectionKey }) => {
  const relative = formatRelativeLastCheckedLabel(updatedAt);
  const isOpenSection = sectionKey === "open";
  const isStale =
    isOpenSection &&
    Number.isFinite(relative.elapsedMs) &&
    relative.elapsedMs > OPEN_PR_LAST_CHECK_STALE_MS;

  return {
    ...relative,
    isStale,
  };
};

const EXPIRED_GITHUB_IMAGE_PLACEHOLDER = `<span class="md-image-expired" title="Image unavailable (expired GitHub URL)">[image unavailable]</span>`;

// Replaces <img> tags whose src points to GitHub-hosted attachment URLs
// that are commonly inaccessible/expired in local environments.
const replaceExpiredGithubImages = (html) => {
  // Replace entire <img ...> tags where src is from known expiring/private GitHub attachment hosts.
  return html.replace(
    /<img\b[^>]*\bsrc=["']https:\/\/(?:private-user-images\.githubusercontent\.com|github\.com\/user-attachments)\/[^"']*["'][^>]*>/gi,
    EXPIRED_GITHUB_IMAGE_PLACEHOLDER,
  );
};

const renderMarkdownAsHtml = (markdownText) => {
  if (!markdownText || !window.marked) return String(markdownText || "").trim();
  try {
    const html = window.marked.parse(String(markdownText).trim());
    return replaceExpiredGithubImages(html);
  } catch (error) {
    console.warn("Failed to render markdown", error);
    return String(markdownText).trim();
  }
};

const renderSchedulerStatus = (schedulerRaw = {}) => {
  const scheduler = schedulerRaw || {};
  latestSchedulerState = scheduler;
  const badgeHost = document.getElementById("scheduler-badges");
  const details = document.getElementById("scheduler-details");
  badgeHost.innerHTML = "";

  const createBadge = (text, className = "") => {
    const chip = document.createElement("span");
    chip.className = `scheduler-badge ${className}`.trim();
    chip.textContent = text;
    badgeHost.appendChild(chip);
  };

  createBadge(`Every ${scheduler.intervalMinutes || 15}m`);
  createBadge(`Quick check: every ${scheduler.quickCheckIntervalMinutes || 5}m`);
  createBadge(`Manual cooldown ${scheduler.manualCooldownMinutes || 15}m`);

  const pendingOpenCount = Number(scheduler.pendingOpenCount || 0);
  const pendingMergedClosedCount = Number(scheduler.pendingMergedClosedCount || 0);
  if (pendingOpenCount > 0 || pendingMergedClosedCount > 0) {
    createBadge(
      `Update queued: ${pendingOpenCount} open, ${pendingMergedClosedCount} merged/closed`,
      "scheduler-badge-running",
    );
  }

  const autoRunBadge = scheduler.isAutoRunInProgress
    ? {
        text: "Auto run: in progress",
        className: "scheduler-badge-running",
      }
    : scheduler.lastAutoError
      ? {
          text: /timed out/i.test(String(scheduler.lastAutoError))
            ? "Auto run: timed out"
            : "Auto run: error",
          className: "scheduler-badge-error",
        }
      : {
          text: "Auto run: idle",
          className: "scheduler-badge-idle",
        };

  createBadge(autoRunBadge.text, autoRunBadge.className);

  const lines = [
    `Last manual run: ${formatIsoDatetime(scheduler.lastManualRunAt || "-")}`,
    `Last auto attempt: ${formatIsoDatetime(scheduler.lastAutoAttemptAt || "-")}`,
    `Last auto success: ${formatIsoDatetime(scheduler.lastAutoRunAt || "-")}`,
    `Last auto skip: ${scheduler.lastAutoSkipReason || "-"}`,
    `Last auto error: ${scheduler.lastAutoError || "-"}`,
    `Last quick check: ${formatIsoDatetime(scheduler.lastQuickCheckAt || "-")}`,
    `Last quick check error: ${scheduler.lastQuickCheckError || "-"}`,
    `Last merged/closed drain: ${formatIsoDatetime(scheduler.lastMergedDrainAt || "-")}`,
  ];

  details.textContent = lines.join("\n");
  applyActivePrProgressIndicators(scheduler.activePrNumbers || []);
  renderRequestActivity();
};

const normalizeActivePrNumberSet = (activePrNumbersRaw = []) => {
  const activeValues = Array.isArray(activePrNumbersRaw)
    ? activePrNumbersRaw
    : [];
  return new Set(
    activeValues
      .map((value) => String(value || "").trim())
      .filter((value) => /^\d+$/.test(value)),
  );
};

const applyActivePrProgressIndicators = (activePrNumbersRaw = []) => {
  // Dispatched unconditionally (harmless no-op with no listener) so the
  // React rendering path can show the same "PR update in progress"
  // indicator the vanilla DOM manipulation below applies directly - React
  // owns #pr-sections' markup when it's mounted, so that direct
  // manipulation wouldn't reach (or would be clobbered by) React-rendered
  // cells. This is also called from its own scheduler-status poll loop
  // (see renderSchedulerStatus), independent of the main data render, so it
  // needs its own live-update channel rather than piggybacking on
  // updateReactTable()'s payload/visiblePrNumbers plumbing.
  window.dispatchEvent(
    new CustomEvent("pr-active-progress-update", {
      detail: {
        activePrNumbers: Array.isArray(activePrNumbersRaw) ? activePrNumbersRaw : [],
      },
    }),
  );

  const sectionsHost = getOptionalElementById("pr-sections");
  if (!sectionsHost) {
    return;
  }

  const activePrNumbers = normalizeActivePrNumberSet(activePrNumbersRaw);
  const prNumberCells = collectNodesByClass(sectionsHost, "pr-number-cell");
  prNumberCells.forEach((cell) => {
    const prNumber = readElementAttribute(cell, "data-pr-number").trim();
    const indicator = collectNodesByClass(cell, "pr-progress-indicator")[0];
    if (!indicator) {
      return;
    }

    const isActive = activePrNumbers.has(prNumber);
    indicator.hidden = !isActive;
  });
};

const handleTriggerAutoRun = async () => {
  const btn = getOptionalElementById("trigger-auto-run-btn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Triggering...";
  }
  try {
    const { response, result } = await postJson("/view-prs/run-auto", {});
    if (response.status === 409) {
      showErrorNotification(
        "Auto run already in progress",
        "An auto run is already running. It will complete shortly.",
        6000,
      );
    } else if (!response.ok || result.ok === false) {
      notifyFailureSnackbar(
        "Failed to trigger auto run",
        result,
        result?.error || "Unexpected error triggering auto run",
      );
    }
  } catch (error) {
    notifyFailureSnackbar(
      "Failed to trigger auto run",
      error,
      "Unable to reach the server",
    );
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Trigger auto run";
    }
  }
};

const prFilterPanelHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-filter-panel.helpers.js")
    : globalThis.ViewPrsFilterPanelHelpers;

const {
  getSelectedAuthorLogins,
  getSelectedAssignedLogins,
  getSelectedApproverLogins,
  getSelectedIncludeLabelNames,
  getSelectedExcludeLabelNames,
  getCustomCommentsFilter,
  getOtherNotesFilter,
  getPrDifficultyFilter,
  getRallyStoriesFilter,
  getRallyLinksFilter,
  getAnalysisOfPrFilter,
  updateMultiSelectSummary,
  populateIncludeLabelOptions,
  populateExcludeLabelOptions,
  populateAuthorOptions,
  populateAssignedOptions,
  populateApproverOptions,
  renderManagementFilterSummary,
  setupMultiSelectDropdownClosing,
} = prFilterPanelHelperFactory.createPrFilterPanelHelpers({
  getPreferredActorKey: (...args) => getPreferredActorKey(...args),
  resolveActorDisplayName: (...args) => resolveActorDisplayName(...args),
  collectAssignedUsers: (...args) => collectAssignedUsers(...args),
  collectApproversFromRow: (...args) => collectApproversFromRow(...args),
  extractRowLabelNames: (...args) => extractRowLabelNames(...args),
  normalizeFilterToken: (...args) => normalizeFilterToken(...args),
  getOrCompute: (...args) => getOrComputeEntryDerivedValue(...args),
  // Phase 6, Slice 7 (see REACT_MIGRATION_PLAN.md): these 5 getter/setter
  // pairs now prefer FilterStateProvider's Context (via
  // getPendingSelectionsValue/setPendingSelectionsValue) over the plain
  // module variable, falling back to it when Context hasn't mounted -
  // pr-filter-panel.helpers.js itself is unchanged, since it only ever
  // calls these as opaque functions.
  getPendingAuthorFilterSelections: () =>
    getPendingSelectionsValue("pendingAuthorSelections", pendingAuthorFilterSelections),
  setPendingAuthorFilterSelections: (value) =>
    setPendingSelectionsValue("pendingAuthorSelections", value, (v) => {
      pendingAuthorFilterSelections = v;
    }),
  getPendingAssignedFilterSelections: () =>
    getPendingSelectionsValue("pendingAssignedSelections", pendingAssignedFilterSelections),
  setPendingAssignedFilterSelections: (value) =>
    setPendingSelectionsValue("pendingAssignedSelections", value, (v) => {
      pendingAssignedFilterSelections = v;
    }),
  getPendingApproverFilterSelections: () =>
    getPendingSelectionsValue("pendingApproverSelections", pendingApproverFilterSelections),
  setPendingApproverFilterSelections: (value) =>
    setPendingSelectionsValue("pendingApproverSelections", value, (v) => {
      pendingApproverFilterSelections = v;
    }),
  getPendingLabelFilterSelections: () =>
    getPendingSelectionsValue("pendingLabelSelections", pendingLabelFilterSelections),
  setPendingLabelFilterSelections: (value) =>
    setPendingSelectionsValue("pendingLabelSelections", value, (v) => {
      pendingLabelFilterSelections = v;
    }),
  getPendingExcludeLabelFilterSelections: () =>
    getPendingSelectionsValue("pendingExcludeLabelSelections", pendingExcludeLabelFilterSelections),
  setPendingExcludeLabelFilterSelections: (value) =>
    setPendingSelectionsValue("pendingExcludeLabelSelections", value, (v) => {
      pendingExcludeLabelFilterSelections = v;
    }),
  // Phase 2 React migration hook (see REACT_MIGRATION_PLAN.md): delegates
  // to react-app.jsx's bridge when it has mounted a given list id; a no-op
  // (React hasn't finished loading/mounting yet) when this returns false -
  // pr-filter-panel.helpers.js no longer has any DOM-building of its own to
  // fall back to.
  renderMultiSelectList: (listId, items) =>
    typeof window !== "undefined" && typeof window.renderReactMultiSelectList === "function"
      ? window.renderReactMultiSelectList(listId, items)
      : false,
  // Delegates the "Applied filters: ..." summary/chips to react-app.jsx's
  // bridge (AppliedFilterSummary.jsx) - same handled/fallback-to-no-op
  // shape as renderMultiSelectList above.
  renderFilterSummary: (summaryText, filterChips) =>
    typeof window !== "undefined" && typeof window.renderReactFilterSummary === "function"
      ? window.renderReactFilterSummary(summaryText, filterChips)
      : false,
  documentRef: typeof document !== "undefined" ? document : null,
  // Phase 6 (see REACT_MIGRATION_PLAN.md): lets getCustomCommentsFilter/
  // getOtherNotesFilter/etc. prefer a migrated field's Context value over
  // the DOM read - same FILTER_STATE_FIELD_MAP-backed helper every other
  // bridge in this migration uses, just exposed by Context key here
  // rather than DOM id (this factory's getters already know their own
  // Context key, not the DOM id).
  getFilterStateValue: (key) => {
    const values =
      typeof window !== "undefined" && typeof window.getFilterStateValues === "function"
        ? window.getFilterStateValues()
        : undefined;
    return values?.[key];
  },
});

const populateAuthorThreadResolutionActorOptions = (actorsMap = {}) => {
  const actorEntries = Object.entries(
    actorsMap && typeof actorsMap === "object" ? actorsMap : {},
  )
    .map(([login, displayName]) => {
      const loginValue = String(login || "").trim();
      if (!loginValue) {
        return null;
      }
      return {
        login: loginValue,
        displayName: resolveActorDisplayName(loginValue, actorsMap, displayName),
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const left = String(a.displayName || a.login).toLowerCase();
      const right = String(b.displayName || b.login).toLowerCase();
      return left.localeCompare(right);
    });

  const renderActorOptionsList = ({
    listId,
    pendingSelections,
    setPendingSelections,
    idPrefix,
  }) => {
    const listNode = getOptionalElementById(listId);
    if (!listNode) {
      return;
    }

    const existingSelections = getSelectedMultiSelectValuesFromList(listId);
    const seedSelections =
      existingSelections.length > 0
        ? existingSelections
        : Array.isArray(pendingSelections)
          ? pendingSelections
          : [];
    const selectedSet = new Set(seedSelections);

    if (actorEntries.length === 0) {
      listNode.classList.add("empty");
    } else {
      listNode.classList.remove("empty");
    }

    // Phase 2 React migration hook (see REACT_MIGRATION_PLAN.md, gotcha
    // #4): delegates to react-app.jsx's flushSync-wrapped bridge when it
    // has mounted this list id; falls back to the vanilla DOM-building
    // path below when it hasn't (not converted yet, or React hasn't
    // finished loading/mounting).
    const handled =
      typeof window !== "undefined" && typeof window.renderReactMultiSelectList === "function"
        ? window.renderReactMultiSelectList(
            listId,
            actorEntries.map(({ login, displayName }) => ({
              value: login,
              label: displayName,
              checked: selectedSet.has(login),
            })),
          )
        : false;

    if (!handled) {
      listNode.innerHTML = "";
      actorEntries.forEach(({ login, displayName }, index) => {
        const itemDiv = document.createElement("div");
        itemDiv.className = "multi-select-item";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.id = `${idPrefix}-${login}-${index}`;
        checkbox.value = login;
        checkbox.checked = selectedSet.has(login);

        const label = document.createElement("label");
        label.htmlFor = checkbox.id;
        label.textContent = displayName;

        itemDiv.appendChild(checkbox);
        itemDiv.appendChild(label);
        listNode.appendChild(itemDiv);
      });
    }

    if (Array.isArray(pendingSelections)) {
      const appliedCount = actorEntries.filter(({ login }) =>
        selectedSet.has(login),
      ).length;
      if (appliedCount > 0 || existingSelections.length > 0) {
        setPendingSelections(null);
      }
    }

    updateMultiSelectSummary(listId);
  };

  renderActorOptionsList({
    listId: "attention-author-thread-resolution-allow-list",
    pendingSelections: getPendingSelectionsValue(
      "pendingAuthorThreadResolutionAllowSelections",
      pendingAuthorThreadResolutionAllowSelections,
    ),
    setPendingSelections: (value) =>
      setPendingSelectionsValue("pendingAuthorThreadResolutionAllowSelections", value, (v) => {
        pendingAuthorThreadResolutionAllowSelections = v;
      }),
    idPrefix: "attention-author-thread-resolution-allow",
  });
  renderActorOptionsList({
    listId: "attention-author-thread-resolution-deny-list",
    pendingSelections: getPendingSelectionsValue(
      "pendingAuthorThreadResolutionDenySelections",
      pendingAuthorThreadResolutionDenySelections,
    ),
    setPendingSelections: (value) =>
      setPendingSelectionsValue("pendingAuthorThreadResolutionDenySelections", value, (v) => {
        pendingAuthorThreadResolutionDenySelections = v;
      }),
    idPrefix: "attention-author-thread-resolution-deny",
  });
};

const populateChangeFilterActorOptions = (actorsMap = {}) => {
  const actorEntries = Object.entries(
    actorsMap && typeof actorsMap === "object" ? actorsMap : {},
  )
    .map(([login, displayName]) => {
      const loginValue = String(login || "").trim();
      if (!loginValue) {
        return null;
      }
      return {
        login: loginValue,
        displayName: resolveActorDisplayName(loginValue, actorsMap, displayName),
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const left = String(a.displayName || a.login).toLowerCase();
      const right = String(b.displayName || b.login).toLowerCase();
      return left.localeCompare(right);
    });

  const renderChangeFilterActorList = ({
    listId,
    pendingSelections,
    setPendingSelections,
    idPrefix,
  }) => {
    const listNode = getOptionalElementById(listId);
    if (!listNode) {
      return;
    }

    const existingSelections = getSelectedMultiSelectValuesFromList(listId);
    const seedSelections =
      existingSelections.length > 0
        ? existingSelections
        : Array.isArray(pendingSelections)
          ? pendingSelections
          : [];
    const selectedSet = new Set(seedSelections);

    if (actorEntries.length === 0) {
      listNode.classList.add("empty");
    } else {
      listNode.classList.remove("empty");
    }

    // Phase 2 React migration hook (see REACT_MIGRATION_PLAN.md, gotcha
    // #4): delegates to react-app.jsx's flushSync-wrapped bridge when it
    // has mounted this list id; falls back to the vanilla DOM-building
    // path below when it hasn't (not converted yet, or React hasn't
    // finished loading/mounting).
    const handled =
      typeof window !== "undefined" && typeof window.renderReactMultiSelectList === "function"
        ? window.renderReactMultiSelectList(
            listId,
            actorEntries.map(({ login, displayName }) => ({
              value: login,
              label: displayName,
              checked: selectedSet.has(login),
            })),
          )
        : false;

    if (!handled) {
      listNode.innerHTML = "";
      actorEntries.forEach(({ login, displayName }, index) => {
        const itemDiv = document.createElement("div");
        itemDiv.className = "multi-select-item";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.id = `${idPrefix}-${login}-${index}`;
        checkbox.value = login;
        checkbox.checked = selectedSet.has(login);

        const label = document.createElement("label");
        label.htmlFor = checkbox.id;
        label.textContent = displayName;

        itemDiv.appendChild(checkbox);
        itemDiv.appendChild(label);
        listNode.appendChild(itemDiv);
      });
    }

    if (Array.isArray(pendingSelections)) {
      const appliedCount = actorEntries.filter(({ login }) =>
        selectedSet.has(login),
      ).length;
      if (appliedCount > 0 || existingSelections.length > 0) {
        setPendingSelections(null);
      }
    }

    updateMultiSelectSummary(listId);
  };

  renderChangeFilterActorList({
    listId: "change-filter-ignore-comment-authors-list",
    pendingSelections: getPendingSelectionsValue(
      "pendingChangeFilterIgnoreCommentAuthors",
      _pendingChangeFilterIgnoreCommentAuthors,
    ),
    setPendingSelections: (value) =>
      setPendingSelectionsValue("pendingChangeFilterIgnoreCommentAuthors", value, (v) => {
        _pendingChangeFilterIgnoreCommentAuthors = v;
      }),
    idPrefix: "change-filter-ignore-comment-authors",
  });
  renderChangeFilterActorList({
    listId: "change-filter-ignore-review-authors-list",
    pendingSelections: getPendingSelectionsValue(
      "pendingChangeFilterIgnoreReviewAuthors",
      _pendingChangeFilterIgnoreReviewAuthors,
    ),
    setPendingSelections: (value) =>
      setPendingSelectionsValue("pendingChangeFilterIgnoreReviewAuthors", value, (v) => {
        _pendingChangeFilterIgnoreReviewAuthors = v;
      }),
    idPrefix: "change-filter-ignore-review-authors",
  });
};

const renderBackfillStatus = (backfillRaw = {}) => {
  const backfill = backfillRaw || {};
  const badgeHost = getOptionalElementById("backfill-badges");
  const details = getOptionalElementById("backfill-details");
  const startButton = getOptionalElementById("backfill-start-btn");
  const stopButton = getOptionalElementById("backfill-stop-btn");
  const refreshButton = getOptionalElementById("backfill-refresh-btn");
  const refreshLogButton = getOptionalElementById("backfill-log-refresh-btn");

  if (!badgeHost || !details) {
    return;
  }

  const viewModel = getBackfillStatusViewModel({
    backfillRaw: backfill,
    isBackfillActionPending,
  });

  // Renders the badge list into #backfill-badges via React (see
  // mountBackfillBadges in react-app.jsx).
  window.updateReactBackfillBadges?.(viewModel.badges);

  details.textContent = viewModel.detailsText;
  isBackfillRunning = viewModel.isBackfillRunning;

  if (startButton) {
    startButton.disabled = viewModel.buttonState.startDisabled;
  }
  if (stopButton) {
    stopButton.disabled = viewModel.buttonState.stopDisabled;
  }
  if (refreshButton) {
    refreshButton.disabled = viewModel.buttonState.refreshDisabled;
  }
  if (refreshLogButton) {
    refreshLogButton.disabled = viewModel.buttonState.refreshLogDisabled;
  }

  lastBackfillStateKey = viewModel.stateKey;
};

const updateBackfillStatusFromPayload = (
  payload = {},
  { announce = false } = {},
) => {
  const backfill = payload?.backfill || payload || {};
  const previousStateKey = lastBackfillStateKey;
  const nextStateKey = getBackfillStateKey(backfill);

  renderBackfillStatus(backfill);

  if (announce && nextStateKey !== previousStateKey) {
    setStatusMessage(backfill.summary || "Backfill status updated");
  }
};

const loadSchedulerStatus = async () => {
  const response = await fetch("/view-prs/scheduler");
  if (response.status === 404) {
    supportsSchedulerPolling = false;
    return { ok: false, scheduler: null };
  }

  const result = await response.json();
  if (!response.ok || result.ok === false) {
    throw new Error(result.error || "Failed to fetch scheduler status");
  }

  renderSchedulerStatus(result.scheduler || {});
  return result;
};

const TABLE_COLUMN_CLASSES = [
  "pr-col-select",
  "pr-col-attention",
  "pr-col-number",
  "pr-col-status",
  "pr-col-approved",
  "pr-col-title",
  "pr-col-author",
  "pr-col-labels",
  "pr-col-check",
  "pr-col-date",
  "pr-col-actions",
];

const TABLE_HEADERS = [
  { shortLabel: "Sel", fullLabel: "Select PR", compact: true },
  { shortLabel: "Attn", fullLabel: "Needs Attention", compact: true },
  "PR",
  "STATUS",
  "APPROVED",
  "TITLE",
  "AUTHOR",
  "LABELS",
  "CHK",
  null,
  "ACTIONS",
];

const getViewedFilesSummary = (row) =>
  String(
    row?.viewedFilesSummary ||
      `${toCount(row?.viewedFilesCount)}/${toCount(row?.changedFilesCount)} viewed`,
  );

const getViewedFilesState = (row) => {
  const viewedFilesCount = toCount(row?.viewedFilesCount);
  const changedFilesCount = toCount(row?.changedFilesCount);

  return {
    viewedFilesCount,
    changedFilesCount,
    isComplete: viewedFilesCount === changedFilesCount,
    hasUnviewedFiles: viewedFilesCount < changedFilesCount,
  };
};

const getOpenConversationCount = (row) => {
  const openConversationCountRaw = row?.openConversationCount;
  const metrics = normalizeRowMetrics(row);
  const fallbackOpenConversations =
    metrics.conversationSummary.estimatedOpenConversations ||
    metrics.counts.openConversations ||
    metrics.conversationSummary.openThreads;

  return Number.isFinite(Number(openConversationCountRaw))
    ? Number(openConversationCountRaw)
    : toCount(fallbackOpenConversations);
};

const getOpenConversationCountWithMe = (row) => {
  const viewerLogin = String(
    currentViewerLogin || row?.viewerLogin || inferViewerLoginFromPage() || "",
  )
    .trim()
    .toLowerCase();

  if (!viewerLogin) {
    return {
      count: getOpenConversationCount(row),
      isViewerSpecific: false,
    };
  }

  const openThreads = asArray(row?.reviewThreads).filter(
    (thread) => thread && thread.isResolved !== true,
  );

  return {
    count: openThreads.filter((thread) => {
      const participants = asArray(thread?.participants).map((p) =>
        String(p || "")
          .trim()
          .toLowerCase(),
      );
      if (participants.includes(viewerLogin)) {
        return true;
      }

      return asArray(thread?.comments).some(
        (comment) =>
          String(comment?.authorLogin || "")
            .trim()
            .toLowerCase() === viewerLogin,
      );
    }).length,
    isViewerSpecific: true,
  };
};

const getManualNotesSummary = (entry = {}, row = {}) => {
  const notes = entry?.notes || row?.notes || {};
  const comments = asArray(notes?.comments).filter((comment) => {
    const noteText = String(comment?.note || "").trim();
    const authorText = String(comment?.author || "").trim();
    return Boolean(noteText || authorText);
  });
  const otherNotes = String(notes?.otherNotes || "").trim();

  return {
    hasNotes: comments.length > 0 || Boolean(otherNotes),
    commentsCount: comments.length,
    hasOtherNotes: Boolean(otherNotes),
  };
};

const getNotesDifficultyLevelText = (difficultyValue) => {
  const text = String(difficultyValue || "").trim();
  if (!text) return "";

  const matchedDigits = text.match(/\d+/);
  return matchedDigits ? matchedDigits[0] : "";
};

const getManualNotesFieldSummary = (entry = {}, row = {}) => {
  const notes = entry?.notes || row?.notes || {};
  const comments = asArray(notes?.comments).filter((comment) => {
    const noteText = String(comment?.note || "").trim();
    const authorText = String(comment?.author || "").trim();
    return Boolean(noteText || authorText);
  });
  const otherNotes = String(notes?.otherNotes || "").trim();
  const difficultyRaw = String(notes?.prDifficulty || "").trim();
  const rallyStories = asArray(notes?.rallyStories).filter((story) =>
    Boolean(String(story || "").trim()),
  );
  const rallyLinks = asArray(notes?.rallyLinks).filter((link) =>
    Boolean(String(link || "").trim()),
  );
  const analysisOfPr = String(notes?.analysisOfPr || "").trim();

  return {
    hasCustomComments: comments.length > 0,
    hasOtherNotes: Boolean(otherNotes),
    hasDifficulty: Boolean(difficultyRaw),
    difficultyLevelText: getNotesDifficultyLevelText(difficultyRaw),
    hasRallyStories: rallyStories.length > 0,
    hasRallyLinks: rallyLinks.length > 0,
    hasAnalysisOfPr: Boolean(analysisOfPr),
  };
};

const createAuthorFieldIndicator = ({
  hasData,
  title,
  text = "",
  extraClass = "",
}) => {
  const indicator = document.createElement("span");
  indicator.className = [
    "author-notes-field-indicator",
    hasData
      ? "author-notes-field-indicator-filled"
      : "author-notes-field-indicator-empty",
    extraClass,
  ]
    .filter(Boolean)
    .join(" ");
  indicator.title = title;
  indicator.textContent = text;
  return indicator;
};

const normalizeNameForInitials = (value) => {
  const raw = String(value || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!raw) return "";

  if (raw.includes(",")) {
    const [lastNameRaw, firstNameRaw] = raw.split(",", 2);
    const firstName = String(firstNameRaw || "").trim();
    const lastName = String(lastNameRaw || "").trim();
    if (firstName && lastName) {
      return `${firstName} ${lastName}`.trim();
    }
  }

  return raw;
};

const getUserInitials = (displayName, fallbackLogin = "") => {
  const cleanedName = normalizeNameForInitials(displayName);
  const words = cleanedName.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
  }
  if (words.length === 1 && words[0].length >= 2) {
    return words[0].slice(0, 2).toUpperCase();
  }

  const login = String(fallbackLogin || "")
    .replace(/[_-]+/g, " ")
    .trim();
  const loginWords = login.split(/\s+/).filter(Boolean);
  if (loginWords.length >= 2) {
    return `${loginWords[0][0] || ""}${loginWords[1][0] || ""}`.toUpperCase();
  }
  return login.slice(0, 2).toUpperCase() || "--";
};

const isInReviewEnabled = (row) => {
  const value = row?.inReview;
  return value === true || String(value || "").toLowerCase() === "true";
};

// Expose for the React hybrid table bridge (see components/PrTableApp.jsx),
// same reasoning as window.entryNeedsAttention/window.getNeedsAttentionConfig
// above - PrTableApp's needs-attention icon should show for the same two
// reasons vanilla's attention-cell did (components/pr-section-table.component.js,
// before it was deleted): shouldShowNeedsAttention() OR isInReviewEnabled().
if (typeof window !== "undefined") {
  window.isInReviewEnabled = isInReviewEnabled;
}

const isFlaggedEnabled = (entry, row) => {
  const rowValue = row?.flagged;
  if (rowValue === true || String(rowValue || "").toLowerCase() === "true") {
    return true;
  }

  const repo =
    String(entry?.repo || "").trim() ||
    String(latestSelectedRepo || "").trim() ||
    DEFAULT_REPO;
  const prNumber = String(row?.number || entry?.prNumber || "").trim();
  if (!repo || !prNumber) {
    return false;
  }

  const flaggedByRepo = latestStoredPayload?.flaggedByRepo;
  const value = flaggedByRepo?.[repo]?.[prNumber];
  return value === true || String(value || "").toLowerCase() === "true";
};

const toggleInReviewForRow = async (entry, row, nextValue, checkbox) => {
  const statusElement = document.getElementById("status");
  const prNumber = String(row.number || entry.prNumber || "").trim();

  if (!prNumber) {
    checkbox.checked = !nextValue;
    statusElement.textContent =
      "Unable to update in-review state: missing PR number";
    notifyFailureSnackbar(
      "In-review update failed",
      "Missing PR number",
      "Unable to update in-review state",
    );
    return;
  }

  checkbox.disabled = true;
  statusElement.textContent = `${nextValue ? "Enabling" : "Disabling"} in-review for #${prNumber}...`;

  try {
    const payload = {
      repo: entry.repo || latestSelectedRepo || "",
      ...(nextValue ? { inReview: prNumber } : { inReviewClear: prNumber }),
    };
    const response = await fetch("/view-prs/ack", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
    });
    const result = await response.json();

    if (!response.ok || result.ok === false) {
      checkbox.checked = !nextValue;
      statusElement.textContent = `Failed to update in-review for #${prNumber}`;
      notifyFailureSnackbar(
        `In-review update failed for #${prNumber}`,
        result,
        `Failed to update in-review for #${prNumber}`,
      );
      return;
    }

    statusElement.textContent = `${nextValue ? "Enabled" : "Disabled"} in-review for #${prNumber}`;
    
    // PERFORMANCE OPTIMIZATION: Update in-memory data without full re-render
    // Server now returns minimal delta (flaggedByRepo/inReviewByRepo) for checkbox operations
    if (result.flaggedByRepo && result.inReviewByRepo) {
      // Minimal response: only update flag data. Reassign (don't mutate)
      // latestStoredPayload so React's reference-equality checks (useState
      // bail-out, useEffect deps) actually detect the change and re-render.
      if (latestStoredPayload) {
        latestStoredPayload = {
          ...latestStoredPayload,
          flaggedByRepo: result.flaggedByRepo,
          inReviewByRepo: result.inReviewByRepo,
        };
      }
      latestSelectedRepo = payload.repo || latestSelectedRepo;
      // Don't call renderPrData() - checkbox already updated, UI is correct
      // Smart groups will update on next full refresh
    } else if (result.prData) {
      // Full response (backward compatibility)
      latestStoredPayload = result.prData;
      latestSelectedRepo = payload.repo || latestSelectedRepo;
    } else {
      // Fallback to full reload only if no data returned
      await loadStoredData(payload.repo || latestSelectedRepo || "");
    }
  } catch (_error) {
    checkbox.checked = !nextValue;
    statusElement.textContent = `Failed to update in-review for #${prNumber}`;
    notifyFailureSnackbar(
      `In-review update failed for #${prNumber}`,
      _error,
      `Failed to update in-review for #${prNumber}`,
    );
  } finally {
    checkbox.disabled = false;
  }
};

const toggleFlaggedForRow = async (entry, row, nextValue, checkbox) => {
  const statusElement = document.getElementById("status");
  const prNumber = String(row.number || entry.prNumber || "").trim();

  if (!prNumber) {
    checkbox.checked = !nextValue;
    statusElement.textContent =
      "Unable to update flagged state: missing PR number";
    notifyFailureSnackbar(
      "Flagged update failed",
      "Missing PR number",
      "Unable to update flagged state",
    );
    return;
  }

  checkbox.disabled = true;
  statusElement.textContent = `${nextValue ? "Flagging" : "Unflagging"} #${prNumber}...`;

  try {
    const payload = {
      repo: entry.repo || latestSelectedRepo || "",
      ...(nextValue ? { flagged: prNumber } : { flaggedClear: prNumber }),
    };
    const response = await fetch("/view-prs/ack", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
    });
    const result = await response.json();

    if (!response.ok || result.ok === false) {
      checkbox.checked = !nextValue;
      statusElement.textContent = `Failed to update flagged state for #${prNumber}`;
      notifyFailureSnackbar(
        `Flagged update failed for #${prNumber}`,
        result,
        `Failed to update flagged state for #${prNumber}`,
      );
      return;
    }

    statusElement.textContent = `${nextValue ? "Flagged" : "Unflagged"} #${prNumber}`;
    
    // PERFORMANCE OPTIMIZATION: Update in-memory data without full re-render
    // Server now returns minimal delta (flaggedByRepo/inReviewByRepo) for checkbox operations
    if (result.flaggedByRepo && result.inReviewByRepo) {
      // Minimal response: only update flag data. Reassign (don't mutate)
      // latestStoredPayload so React's reference-equality checks (useState
      // bail-out, useEffect deps) actually detect the change and re-render.
      if (latestStoredPayload) {
        latestStoredPayload = {
          ...latestStoredPayload,
          flaggedByRepo: result.flaggedByRepo,
          inReviewByRepo: result.inReviewByRepo,
        };
      }
      latestSelectedRepo = payload.repo || latestSelectedRepo;
      // Don't call renderPrData() - checkbox already updated, UI is correct
      // Smart groups will update on next full refresh
    } else if (result.prData) {
      // Full response (backward compatibility)
      latestStoredPayload = result.prData;
      latestSelectedRepo = payload.repo || latestSelectedRepo;
    } else {
      // Fallback to full reload only if no data returned
      await loadStoredData(payload.repo || latestSelectedRepo || "");
    }
  } catch (_error) {
    checkbox.checked = !nextValue;
    statusElement.textContent = `Failed to update flagged state for #${prNumber}`;
    notifyFailureSnackbar(
      `Flagged update failed for #${prNumber}`,
      _error,
      `Failed to update flagged state for #${prNumber}`,
    );
  } finally {
    checkbox.disabled = false;
  }
};

const prNotesHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-notes.helpers.js")
    : globalThis.ViewPrsPrNotesHelpers;

const {
  normalizeNotesListForUi,
  createMultiEntryField,
  hasNotesChanges,
  buildNotesPayload,
  stampOriginalCommentValues,
} = prNotesHelperFactory.createPrNotesHelpers();

const prDataPollingHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-data-polling.helpers.js")
    : globalThis.ViewPrsPrDataPollingHelpers;

const {
  computePrDataFingerprint,
  computePrDataMetaFingerprint,
  computePrDataManifest,
  getManifestDelta,
  mergeDataDeltaPayload,
  getPendingAutoRenderAction,
  getDataPollRenderAction,
} = prDataPollingHelperFactory.createPrDataPollingHelpers();

const prHttpHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-http.helpers.js")
    : globalThis.ViewPrsPrHttpHelpers;

const { postJson } = prHttpHelperFactory.createPrHttpHelpers({
  fetch: (...args) => fetch(...args),
});

const prStatusDisplayHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-status-display.helpers.js")
    : globalThis.ViewPrsPrStatusDisplayHelpers;

const {
  isChangedStatus,
  statusClass,
  approvedClass,
  statusIcon,
  formatTitleWithIcons,
  formatChkDisplay,
} = prStatusDisplayHelperFactory.createPrStatusDisplayHelpers();

void statusIcon;

const prCommandOutputHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-command-output.helpers.js")
    : globalThis.ViewPrsPrCommandOutputHelpers;

const {
  formatCommandOutput,
  getGithubAuthFailureHint,
  formatCommandOutputWithAuthHint,
} = prCommandOutputHelperFactory.createPrCommandOutputHelpers({
  stripAnsi,
});

const prDataTabsHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-data-tabs.helpers.js")
    : globalThis.ViewPrsPrDataTabsHelpers;

const { activateDataTab, initDataTabs } =
  prDataTabsHelperFactory.createPrDataTabsHelpers({
    getOptionalElementById,
    onTabActivated: () => {
      renderAuthorInsightsIfVisible();
      renderStatsViewIfVisible();
    },
  });

// PR Data Tab Orchestrator
const prDataTabOrchestratorFactory =
  typeof module !== "undefined" && module.exports
    ? require("./orchestrators/pr-data-tab.orchestrator.js")
    : globalThis.ViewPrsPrDataTabOrchestrator;

const prDataTabOrchestrator =
  prDataTabOrchestratorFactory.createPrDataTabOrchestrator({
    // Helper functions
    deriveRunPrDataContext,
    deriveRenderPipelineState,
    applyFiltersFromCache,
    loadStoredData,
    activateDataTab,
    initDataTabs,
    getOptionalElementById,
    // State management via dependency injection
    stateGetters: {
      getLatestStoredPayload: () => latestStoredPayload,
      getLatestSelectedRepo: () => latestSelectedRepo,
      getLastSuccessfulRenderedCheckAt: () => lastSuccessfulRenderedCheckAt,
      getLatestSchedulerState: () => latestSchedulerState,
    },
    stateSetters: {
      setLatestStoredPayload: (value) => {
        latestStoredPayload = value;
      },
      setLastSuccessfulRenderedCheckAt: (value) => {
        lastSuccessfulRenderedCheckAt = value;
      },
      setLastRenderedPrFingerprint: (value) => {
        lastRenderedPrFingerprint = value;
      },
      setLatestPrManifest: (value) => {
        latestPrManifest = value;
      },
      setPendingAutoRenderPayload: (value) => {
        pendingAutoRenderPayload = value;
      },
    },
    // Phase 6 (see REACT_MIGRATION_PLAN.md): lets renderPrData prefer
    // "filter-pr-numbers"'s Context value over the DOM read - same bridge
    // shape as every other Phase 6 wiring, exposed by Context key here
    // since renderPrData already knows its own key ("filterPrNumbers").
    getFilterStateValue: (key) => {
      const values =
        typeof window !== "undefined" && typeof window.getFilterStateValues === "function"
          ? window.getFilterStateValues()
          : undefined;
      return values?.[key];
    },
  });

const prBackfillHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-backfill.helpers.js")
    : globalThis.ViewPrsPrBackfillHelpers;

const {
  shouldAutoScrollBackfillLog: shouldAutoScrollBackfillLogByState,
  getBackfillScrollTop,
  getBackfillStatusViewModel,
  getBackfillStateKey,
  formatBackfillLogMessage,
} = prBackfillHelperFactory.createPrBackfillHelpers();

const prBackfillActionHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-backfill-actions.helpers.js")
    : globalThis.ViewPrsPrBackfillActionHelpers;

const {
  loadBackfillStatus,
  loadBackfillLogTail,
  handleBackfillAction,
} = prBackfillActionHelperFactory.createPrBackfillActionHelpers({
  fetch: (...args) => fetch(...args),
  postJson,
  beginRequestActivity,
  setStatusMessage,
  setOutputMessage,
  setButtonDisabled,
  notifyFailureSnackbar,
  formatCommandOutput,
  stripAnsi,
  updateBackfillStatusFromPayload,
  setBackfillLogMessage,
  autoScrollBackfillLogToBottom,
  formatBackfillLogMessage,
  getSupportsBackfillLogPolling: () => supportsBackfillLogPolling,
  setSupportsBackfillLogPolling: (value) => {
    supportsBackfillLogPolling = Boolean(value);
  },
  getIsBackfillRunning: () => isBackfillRunning,
  setIsBackfillActionPending: (value) => {
    isBackfillActionPending = Boolean(value);
  },
  backfillLogTailLines: BACKFILL_LOG_TAIL_LINES,
});

// Backfill Tab Orchestrator
const backfillTabOrchestratorFactory =
  typeof module !== "undefined" && module.exports
    ? require("./orchestrators/backfill-tab.orchestrator.js")
    : globalThis.ViewPrsBackfillTabOrchestrator;

const backfillTabOrchestrator =
  backfillTabOrchestratorFactory.createBackfillTabOrchestrator({
    // Helper functions
    loadBackfillStatus,
    loadBackfillLogTail,
    handleBackfillAction,
    renderBackfillStatus,
    setBackfillLogMessage,
    activateDataTab,
    getOptionalElementById,
    beginRequestActivity,
    notifyFailureSnackbar,
    // State management via dependency injection
    stateGetters: {
      getLastBackfillStateKey: () => lastBackfillStateKey,
    },
    stateSetters: {
      setLastBackfillStateKey: (value) => {
        lastBackfillStateKey = value;
      },
    },
  });

const prActionLogHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-action-log.helpers.js")
    : globalThis.ViewPrsPrActionLogHelpers;

const { loadActionLog } = prActionLogHelperFactory.createPrActionLogHelpers({
    fetch: (...args) => fetch(...args),
    getOptionalElementById,
    escapeHtml,
    formatIsoDatetime,
  });

const prActorNameCacheHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-actor-name-cache.helpers.js")
    : globalThis.ViewPrsPrActorNameCacheHelpers;

const { loadActorNameCache, initActorNameCacheControls } =
  prActorNameCacheHelperFactory.createPrActorNameCacheHelpers({
    fetch: (...args) => fetch(...args),
    getOptionalElementById,
  });

const prManagementTabsHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-management-tabs.helpers.js")
    : globalThis.ViewPrsPrManagementTabsHelpers;

const { initManagementTabs } =
  prManagementTabsHelperFactory.createPrManagementTabsHelpers({
    getOptionalElementById,
    loadActionLog,
    loadActorNameCache,
  });

const getPerPrUserStateFromPayload = (payload, entry, prNumber, repo) => {
  const byPrNumber = payload?.byPrNumber || {};
  const payloadEntry = byPrNumber?.[prNumber];
  const notes =
    payloadEntry?.notes ||
    entry?.notes ||
    null;

  const readRepoPrValue = (repoMap) => {
    if (!repo || !repoMap || typeof repoMap !== "object") return null;
    const perRepo = repoMap[repo];
    if (!perRepo || typeof perRepo !== "object") return null;
    const value = perRepo[prNumber];
    return value === undefined ? null : value;
  };

  return {
    notesByPrNumber: notes,
    ackByRepo: readRepoPrValue(payload?.ackByRepo),
    reverifyByRepo: readRepoPrValue(payload?.reverifyByRepo),
    inReviewByRepo: readRepoPrValue(payload?.inReviewByRepo),
  };
};

const prExportHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-export.helpers.js")
    : globalThis.ViewPrsPrExportHelpers;

const {
  getFieldCatalog: getExportFieldCatalog,
  getVisiblePrNumbersFromSectionsHost,
  buildExportPayload,
} = prExportHelperFactory.createPrExportHelpers({
  getPerPrUserStateFromPayload,
});

const buildActivityTimelineSummary = (
  activityTimelineRaw,
  fallbackSummary = "",
  isOpen = false,
  row = {},
  actorsMap = {},
) => {
  // Builds an activity timeline summary table showing bucketed activity grouped by date.
  // For open PRs, extends the timeline from today back to the oldest activity date.
  // For merged PRs, extends from the newest activity date back to the oldest.
  //
  // Filtering logic:
  // - All dates with activity are shown.
  // - Weekday dates (Mon-Fri) without activity are shown with a dash ("-").
  // - Weekend dates (Sat-Sun) without activity are omitted to reduce visual clutter.
  //
  // Timeline is sorted newest-to-oldest and grouped by date, then by actor and type.
  
  const normalizeTimelineType = (type) => {
    const normalized = String(type || "activity").trim() || "activity";
    // In condensed timeline view, treat review + comment as the same activity bucket.
    if (normalized === "review") return "comment";
    return normalized;
  };

  const timeline = Array.isArray(activityTimelineRaw)
    ? activityTimelineRaw
        .filter((item) => item && typeof item === "object")
        .map((item) => ({
          date: String(item.date || "").trim(),
          actor: String(item.actor || "unknown").trim() || "unknown",
          type: normalizeTimelineType(item.type),
          count: Number.isFinite(Number(item.count)) ? Number(item.count) : 1,
          latestAt: String(item.latestAt || "").trim(),
        }))
        .filter((item) => item.date)
    : [];

  if (!timeline.length) {
    const fallback = String(fallbackSummary || "").trim();
    return fallback || "-";
  }

  // Build a map of actor login -> display name, prioritizing the passed-in actorsMap
  const actorNameMap = new Map(
    Object.entries(actorsMap || {}).filter(([k, v]) => k && v),
  );

  // Additionally extract from timeline items themselves if not already mapped
  asArray(activityTimelineRaw).forEach((bucket) => {
    const login = String(bucket?.actor || "").trim();
    if (login && !actorNameMap.has(login)) {
      const name =
        String(bucket?.author?.name || "").trim() ||
        String(bucket?.author || "").trim() ||
        login;
      if (name && name !== login) {
        actorNameMap.set(login, name);
      }
    }
    // Extract from events within the bucket
    asArray(bucket?.events).forEach((event) => {
      const eventLogin = String(event?.actor || "").trim();
      if (eventLogin && !actorNameMap.has(eventLogin)) {
        const eventName =
          String(event?.author?.name || "").trim() ||
          String(event?.author || "").trim() ||
          eventLogin;
        if (eventName && eventName !== eventLogin) {
          actorNameMap.set(eventLogin, eventName);
        }
      }
    });
  });

  // Extract from comments if not already mapped
  asArray(row.comments).forEach((comment) => {
    const login = String(comment?.authorLogin || "").trim();
    if (login && !actorNameMap.has(login)) {
      const name =
        String(comment?.author?.name || "").trim() ||
        String(comment?.authorName || "").trim() ||
        login;
      if (name && name !== login) {
        actorNameMap.set(login, name);
      }
    }
  });

  // Extract from commentEvents if not already mapped
  asArray(row.commentEvents).forEach((event) => {
    const login = String(event?.actor || "").trim();
    if (login && !actorNameMap.has(login)) {
      const name = String(event?.actorName || "").trim() || login;
      if (name && name !== login) {
        actorNameMap.set(login, name);
      }
    }
  });

  // Extract from reviews if not already mapped
  asArray(row.reviews).forEach((review) => {
    const login = String(review?.authorLogin || "").trim();
    if (login && !actorNameMap.has(login)) {
      const name =
        String(review?.author?.name || "").trim() ||
        String(review?.authorName || "").trim() ||
        login;
      if (name && name !== login) {
        actorNameMap.set(login, name);
      }
    }
  });

  // Extract from review threads if not already mapped
  asArray(row.reviewThreads).forEach((thread) => {
    asArray(thread?.comments).forEach((comment) => {
      const login = String(comment?.authorLogin || "").trim();
      if (login && !actorNameMap.has(login)) {
        const name =
          String(comment?.author?.name || "").trim() ||
          String(comment?.authorName || "").trim() ||
          login;
        if (name && name !== login) {
          actorNameMap.set(login, name);
        }
      }
    });
  });

  // Extract from commits if not already mapped
  asArray(row.commits).forEach((commit) => {
    asArray(commit?.authors).forEach((author) => {
      const login = String(author?.login || "").trim();
      if (login && !actorNameMap.has(login)) {
        const name = String(author?.name || "").trim() || login;
        if (name && name !== login) {
          actorNameMap.set(login, name);
        }
      }
    });
  });

  // Helper to get display name for an actor
  const getActorDisplay = (login) => {
    return actorNameMap.has(login) ? actorNameMap.get(login) : login;
  };

  const typeLabel = (type, count) => {
    if (type === "comment") return count > 1 ? "comments" : "comment";
    if (type === "approval") return "approved";
    if (type === "commit") return count > 1 ? "commits" : "commit";
    if (type === "opened") return "opened PR";
    if (type === "merged") return "merged PR";
    return count > 1 ? `${type}s` : type;
  };

  const parseDay = (value) => {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const dt = new Date(Date.UTC(year, month - 1, day));
    if (Number.isNaN(dt.getTime())) return null;
    return dt;
  };

  const formatDay = (date) => {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const sorted = timeline.sort((a, b) => {
    if (a.date !== b.date) return String(b.date).localeCompare(String(a.date));
    if (a.latestAt !== b.latestAt)
      return String(b.latestAt).localeCompare(String(a.latestAt));
    if (a.actor !== b.actor)
      return String(a.actor).localeCompare(String(b.actor));
    return String(a.type).localeCompare(String(b.type));
  });

  let currentDate = "";
  let itemsByActorType = new Map();
  const groupedByDate = new Map();

  const flush = () => {
    if (!currentDate) return;
    const items = Array.from(itemsByActorType.values()).map((entry) => {
      return {
        actor: entry.actor,
        fallbackName: getActorDisplay(entry.actor),
        label: typeLabel(entry.type, entry.count),
        count: entry.count,
      };
    });
    groupedByDate.set(currentDate, items);
  };

  for (const item of sorted) {
    if (item.date !== currentDate) {
      flush();
      currentDate = item.date;
      itemsByActorType = new Map();
    }

    const key = `${item.actor}::${item.type}`;
    const existing = itemsByActorType.get(key);
    if (existing) {
      existing.count += item.count;
      if (String(item.latestAt).localeCompare(String(existing.latestAt)) > 0) {
        existing.latestAt = item.latestAt;
      }
    } else {
      itemsByActorType.set(key, {
        actor: item.actor,
        type: item.type,
        count: item.count,
        latestAt: item.latestAt,
      });
    }
  }

  flush();

  const dateKeys = Array.from(groupedByDate.keys()).sort((a, b) =>
    String(b).localeCompare(String(a)),
  );
  if (!dateKeys.length) {
    return "-";
  }

  const newest = parseDay(dateKeys[0]);
  const oldest = parseDay(dateKeys[dateKeys.length - 1]);

  const table = document.createElement("table");
  if (table?.style) {
    table.style.borderCollapse = "collapse";
    table.style.width = "100%";
  }

  if (!newest || !oldest) {
    for (const date of dateKeys) {
      const tr = document.createElement("tr");

      const tdDate = document.createElement("td");
      if (tdDate?.style) {
        tdDate.style.paddingRight = "12px";
        tdDate.style.paddingTop = "2px";
        tdDate.style.paddingBottom = "2px";
        tdDate.style.verticalAlign = "top";
        tdDate.style.whiteSpace = "nowrap";
      }
      tdDate.textContent = date;
      tr.appendChild(tdDate);

      const tdActivity = document.createElement("td");
      if (tdActivity?.style) {
        tdActivity.style.paddingTop = "2px";
        tdActivity.style.paddingBottom = "2px";
      }
      renderTimelineItems({
        container: tdActivity,
        items: groupedByDate.get(date) || [],
        row,
        actorsMap,
      });
      tr.appendChild(tdActivity);

      table.appendChild(tr);
    }
    return table;
  }

  // For open PRs, extend timeline to today; for merged PRs, use newest activity date
  const endDate = isOpen ? new Date() : newest;
  const cursor = new Date(endDate.getTime());
  // Set to UTC end of day for proper comparison
  cursor.setUTCHours(23, 59, 59, 999);

  while (cursor.getTime() >= oldest.getTime()) {
    const key = formatDay(cursor);
    const hasActivity = groupedByDate.has(key);
    const dayOfWeek = cursor.getUTCDay();
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

    // Skip weekends without activity
    if (!hasActivity && !isWeekday) {
      cursor.setUTCDate(cursor.getUTCDate() - 1);
      continue;
    }

    const tr = document.createElement("tr");

    const tdDate = document.createElement("td");
    if (tdDate?.style) {
      tdDate.style.paddingRight = "12px";
      tdDate.style.paddingTop = "2px";
      tdDate.style.paddingBottom = "2px";
      tdDate.style.verticalAlign = "top";
      tdDate.style.whiteSpace = "nowrap";
    }
    tdDate.textContent = key;
    tr.appendChild(tdDate);

    const tdActivity = document.createElement("td");
    if (tdActivity?.style) {
      tdActivity.style.paddingTop = "2px";
      tdActivity.style.paddingBottom = "2px";
    }
    renderTimelineItems({
      container: tdActivity,
      items: groupedByDate.get(key) || [],
      row,
      actorsMap,
    });
    tr.appendChild(tdActivity);

    table.appendChild(tr);
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  const rowCount = Number.isFinite(Number(table?.rows?.length))
    ? Number(table.rows.length)
    : Number(table?.children?.length || 0);
  return rowCount > 0 ? table : "-";
};

const asArray = (value) => (Array.isArray(value) ? value : []);

const formatDurationMinutes = (value) => {
  const totalMinutes = toCount(value);
  if (totalMinutes <= 0) return "0m";
  if (totalMinutes < 60) return `${totalMinutes}m`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
};

const getNormalizedStatsDateRange = () => {
  const rawStart = String(statsViewState.startDate || "").trim();
  const rawEnd = String(statsViewState.endDate || "").trim();
  const start = rawStart ? `${rawStart}T00:00:00Z` : "";
  const end = rawEnd ? `${rawEnd}T23:59:59Z` : "";

  if (start && end && start > end) {
    return {
      start: `${rawEnd}T00:00:00Z`,
      end: `${rawStart}T23:59:59Z`,
      startDate: rawEnd,
      endDate: rawStart,
    };
  }

  return {
    start,
    end,
    startDate: rawStart,
    endDate: rawEnd,
  };
};

const isWithinStatsDateRange = (
  isoValue,
  range = getNormalizedStatsDateRange(),
) => {
  const value = String(isoValue || "").trim();
  if (!range.start && !range.end) {
    return true;
  }
  if (!value) {
    return false;
  }
  if (range.start && value < range.start) {
    return false;
  }
  if (range.end && value > range.end) {
    return false;
  }
  return true;
};

const prReviewStatsAggregationHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-review-stats-aggregation.helpers.js")
    : globalThis.ViewPrsReviewStatsAggregationHelpers;

const { normalizeRowMetrics, buildReviewerStats, applyStatsControls } =
  prReviewStatsAggregationHelperFactory.createPrReviewStatsAggregationHelpers({
    toCount,
    asArray,
    getNormalizedStatsDateRange: (...args) => getNormalizedStatsDateRange(...args),
    normalizeActorLogin: (...args) => normalizeActorLogin(...args),
    getPreferredActorKey: (...args) => getPreferredActorKey(...args),
    formatTitleWithIcons: (...args) => formatTitleWithIcons(...args),
    isWithinStatsDateRange: (...args) => isWithinStatsDateRange(...args),
    resolveActorDisplayName: (...args) => resolveActorDisplayName(...args),
    statsViewState,
  });

const prReviewStatsTimelineHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-review-stats-timeline.helpers.js")
    : globalThis.ViewPrsReviewStatsTimelineHelpers;

const {
  aggregateReviewerActivityTimeline,
  aggregateReviewerCommentsTimeline,
  aggregateReviewerApprovalsTimeline,
} = prReviewStatsTimelineHelperFactory.createPrReviewStatsTimelineHelpers({
  asArray,
  getPreferredActorKey: (...args) => getPreferredActorKey(...args),
  normalizeActorLogin: (...args) => normalizeActorLogin(...args),
  isWithinStatsDateRange: (...args) => isWithinStatsDateRange(...args),
  resolveActorDisplayName: (...args) => resolveActorDisplayName(...args),
  getTimelineDateKeys,
});

const renderActivityTrendNote = (rows, actorsMap = {}) => {
  const note = document.createElement("p");
  note.className = "stats-note";
  const range = getNormalizedStatsDateRange();
  const chartData = aggregateReviewerActivityTimeline(rows, actorsMap, range);
  if (!chartData?.series || chartData.series.length === 0) {
    note.textContent = "No reviewer activity data available to render trends.";
    return note;
  }
  const totalActivity = chartData.series.reduce(
    (sum, s) => sum + s.points.reduce((ps, p) => ps + p.value, 0),
    0,
  );
  const avgDaily =
    chartData.dates.length > 0
      ? Math.round(totalActivity / chartData.dates.length)
      : 0;
  note.textContent = `Total reviewer activity: ${totalActivity} events across ${chartData.dates.length} days (~${avgDaily}/day). Showing top ${chartData.series.length} reviewers. Activity includes comments and submitted reviews on PRs authored by others, excluding Copilot actors.`;
  return note;
};

// Phase 3 React migration hooks (see REACT_MIGRATION_PLAN.md): expose
// statsViewState plus everything ReviewStatsControls/ReviewStatsContent
// (react-app.jsx) need to render and interact without index.page.js
// needing to know React mounted them.
if (typeof window !== "undefined") {
  window.getStatsViewState = () => ({ ...statsViewState });
  window.updateStatsViewStateAndRerender = (patch) => {
    Object.assign(statsViewState, patch);
    applyFiltersFromCache();
  };
  // Named distinctly from PrDateCell.jsx's own `window.formatIsoDatetime`
  // (which falls back to a much cruder default when unset) - deliberately
  // not reusing that name here, to avoid changing Phase 1's already-shipped
  // PrTableApp date formatting as a side effect of this Phase 3 work.
  window.reviewStatsFormatIsoDatetime = (...args) => formatIsoDatetime(...args);
  window.getNormalizedStatsDateRange = (...args) => getNormalizedStatsDateRange(...args);
  window.renderActivityTrendNote = (...args) => renderActivityTrendNote(...args);
  // Pure data-shaping helpers (no DOM) consumed directly by StatsVisuals.jsx/
  // ReviewerActivityChart.jsx now that the chart visuals are real JSX
  // (Track A, REACT_MIGRATION_PLAN.md) - not part of the mount-bridge
  // surface, just formatting/business logic exposed the same way every
  // other leaf component already reads window.toCount/window.asArray etc.
  window.bucketTimelineChartData = (...args) => bucketTimelineChartData(...args);
  window.aggregateReviewerCommentsTimeline = (...args) => aggregateReviewerCommentsTimeline(...args);
  window.aggregateReviewerApprovalsTimeline = (...args) => aggregateReviewerApprovalsTimeline(...args);
  // Reuses the same React-safe navigation prAuthorInsightsPrLinkHelpers
  // already provides for Author Insights' own "View in table" button
  // (dispatches 'pr-navigate-to-insights' when React owns the PR table,
  // instead of directly mutating `.hidden`/textContent on nodes React
  // renders - see that helper's own comment). The "View in table" button
  // built inline in pr-review-stats-summary.component.js does the
  // *unsafe* raw-DOM version instead and was never fixed - ReviewStatsContent
  // (react-app.jsx) uses this bridge instead of that broken vanilla
  // behavior, rather than duplicating either version a third time.
  window.navigateToPrInTableFromStats = (prNumber) =>
    prAuthorInsightsPrLinkHelpers.navigateToPrInTable(prNumber, {
      activateDataTab,
      collectNodesByTag,
    });
}

const renderStatsView = (rows, actorsMap = {}) => {
  const host = document.getElementById("pr-stats");
  if (!host) return;

  // Both the controls (#stats-controls-root) and the content
  // (#stats-content-root) live in their own static sibling containers
  // (see index.html), mounted once by react-app.jsx and owned by React
  // from then on - this function must never rebuild either.
  if (!rows.length) {
    window.updateReviewStatsContent?.(null, rows, actorsMap);
    return;
  }

  const { summary, reviewerRows } = buildReviewerStats(rows, actorsMap);
  const stats = applyStatsControls({ summary, reviewerRows });
  window.updateReviewStatsContent?.(stats, rows, actorsMap);
};

// Review Stats Tab Orchestrator
const reviewStatsTabOrchestratorFactory =
  typeof module !== "undefined" && module.exports
    ? require("./orchestrators/review-stats-tab.orchestrator.js")
    : globalThis.ViewPrsReviewStatsTabOrchestrator;

const reviewStatsTabOrchestrator =
  reviewStatsTabOrchestratorFactory.createReviewStatsTabOrchestrator({
    // Helper functions
    renderStatsView,
    activateDataTab,
    getOptionalElementById,
    // State management via dependency injection
    stateGetters: {
      getStatsViewState: () => statsViewState,
      getLatestRows: () => latestStoredPayload?.rows || [],
      getLatestActorsMap: () => latestStoredPayload?.actorsMap || {},
    },
    stateSetters: {
      setStatsViewState: (value) => {
        Object.assign(statsViewState, value);
      },
    },
  });

// Author Insights helper modules (refactored dependency injection)
const prAuthorInsightsPrLinkHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-author-insights-pr-link.helpers.js")
    : globalThis.ViewPrsAuthorInsightsPrLinkHelpers;

const prAuthorInsightsPrLinkHelpers =
  prAuthorInsightsPrLinkHelperFactory.createPrAuthorInsightsPrLinkHelpers({
    DEFAULT_REPO,
    activateDataTab: (...args) => activateDataTab(...args),
    collectNodesByTag: (...args) => collectNodesByTag(...args),
    isReactTableMounted: () => isReactTableMounted(),
  });

const prAuthorInsightsDisplayHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-author-insights-display.helpers.js")
    : globalThis.ViewPrsAuthorInsightsDisplayHelpers;

const prAuthorInsightsDisplayHelpers =
  prAuthorInsightsDisplayHelperFactory.createPrAuthorInsightsDisplayHelpers({
    resolveActorDisplayName: (...args) => resolveActorDisplayName(...args),
    getPreferredActorKey: (...args) => getPreferredActorKey(...args),
    normalizeActorLogin: (...args) => normalizeActorLogin(...args),
    normalizeAuthorInsightsSentiment: (...args) =>
      normalizeAuthorInsightsSentiment(...args),
    isChangedStatus: (...args) => isChangedStatus(...args),
    toCount,
    parseMarkerState: (...args) => parseMarkerState(...args),
    formatChkDisplay: (...args) => formatChkDisplay(...args),
    getOpenConversationCount: (...args) => getOpenConversationCount(...args),
    getViewedFilesSummary: (...args) => getViewedFilesSummary(...args),
    asArray,
    parseSortableTime: (...args) => parseSortableTime(...args),
    formatIsoDatetime: (...args) => formatIsoDatetime(...args),
  });

const prAuthorInsightsDataHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-author-insights-data.helpers.js")
    : globalThis.ViewPrsAuthorInsightsDataHelpers;

const prAuthorInsightsDataHelpers =
  prAuthorInsightsDataHelperFactory.createPrAuthorInsightsDataHelpers({
    normalizeActorLogin: (...args) => normalizeActorLogin(...args),
    fetchFn: (...args) => fetch(...args),
  });

// Repackage drafts helper as module for component
const prAuthorInsightsDraftsHelpers = {
  getAuthorInsightsComposerDraft,
  updateAuthorInsightsComposerDraft,
  resetAuthorInsightsComposerDraft,
  updateAuthorInsightsEditDraft,
  resetAuthorInsightsEditDraft,
  getAuthorInsightsEditDraft,
};

const prAuthorInsightsComponentFactory =
  typeof module !== "undefined" && module.exports
    ? require("./components/pr-author-insights.component.js")
    : globalThis.ViewPrsAuthorInsightsComponent;

const {
  renderAuthorInsights,
} =
  prAuthorInsightsComponentFactory.createPrAuthorInsightsComponent({
    prLinkHelpers: prAuthorInsightsPrLinkHelpers,
    displayHelpers: prAuthorInsightsDisplayHelpers,
    dataHelpers: prAuthorInsightsDataHelpers,
    draftHelpers: prAuthorInsightsDraftsHelpers,
    authorInsightsState,
    recomputeDirtyPrSectionsFields: (...args) =>
      recomputeDirtyPrSectionsFields(...args),
    // Phase 3 React migration hooks (see REACT_MIGRATION_PLAN.md): delegate
    // to react-app.jsx's bridges when they've mounted; pr-author-insights
    // .component.js falls back to its own vanilla DOM-building when either
    // returns false (React hasn't loaded/mounted yet).
    updateReactAuthorInsightsSelector: (options, selectedLogin) =>
      typeof window !== "undefined" && typeof window.updateAuthorInsightsSelector === "function"
        ? window.updateAuthorInsightsSelector(options, selectedLogin)
        : false,
    updateReactAuthorInsightsCreatedPrs: (rows, selectedAuthorLogin) =>
      typeof window !== "undefined" && typeof window.updateAuthorInsightsCreatedPrs === "function"
        ? window.updateAuthorInsightsCreatedPrs(rows, selectedAuthorLogin)
        : false,
    updateReactAuthorInsightsHeader: (selectedAuthorName) =>
      typeof window !== "undefined" && typeof window.updateAuthorInsightsHeader === "function"
        ? window.updateAuthorInsightsHeader(selectedAuthorName)
        : false,
    updateReactAuthorInsightsNotes: (rows, selectedAuthor, actorsMap) =>
      typeof window !== "undefined" && typeof window.updateAuthorInsightsNotes === "function"
        ? window.updateAuthorInsightsNotes(rows, selectedAuthor, actorsMap)
        : false,
    updateReactAuthorInsightsComments: (rows, selectedAuthor, actorsMap) =>
      typeof window !== "undefined" && typeof window.updateAuthorInsightsComments === "function"
        ? window.updateAuthorInsightsComments(rows, selectedAuthor, actorsMap)
        : false,
  });

// Phase 3 React migration hooks: let AuthorInsightsSelector/
// AuthorCreatedPrsSection (react-app.jsx) reach vanilla behavior without
// index.page.js needing to know React mounted them - mirrors
// window.updateStatsViewStateAndRerender for Review Stats' controls.
if (typeof window !== "undefined") {
  window.selectAuthorInsightsAuthor = (login) => {
    authorInsightsState.selectedAuthorLogin = login;
    renderAuthorInsights(
      authorInsightsState.latestRows || [],
      authorInsightsState.latestActorsMap || {},
    );
  };
  // Post-Phase-6 follow-up, Track B (REACT_MIGRATION_PLAN.md): the
  // created-PRs and PR-linked-notes sections are now real JSX
  // (AuthorCreatedPrsSection.jsx/AuthorInsightsNotesSection.jsx,
  // AuthorInsightsPrLink.jsx/AuthorInsightsPrDataMeta.jsx) instead of
  // wrapping pr-author-insights.component.js's buildCreatedPrsSection/
  // buildPrLinkedNotesSection via a ref - those two builders have been
  // deleted. These bridges expose the pure filtering/sorting/formatting
  // helpers those sections need, the same "leaf components read window.*
  // for pure data-shaping" pattern StatsVisuals/GraphCard use for Review
  // Stats (Track A).
  window.navigateToPrInTableFromAuthorInsights = (prNumber) =>
    prAuthorInsightsPrLinkHelpers.navigateToPrInTable(prNumber, {
      activateDataTab,
      collectNodesByTag,
    });
  window.getOpenConversationCount = (...args) => getOpenConversationCount(...args);
  window.normalizeAuthorInsightsSentiment = (...args) => normalizeAuthorInsightsSentiment(...args);
  window.parseSortableTime = (...args) => parseSortableTime(...args);
  window.getAuthorInsightsSentimentLabel = (...args) =>
    prAuthorInsightsDisplayHelpers.getAuthorInsightsSentimentLabel(...args);
  window.getAuthorInsightsSentimentBadgeClassName = (...args) =>
    prAuthorInsightsDisplayHelpers.getAuthorInsightsSentimentBadgeClassName(...args);
  window.getAuthorInsightsStatusBadgeClassName = (...args) =>
    prAuthorInsightsDisplayHelpers.getAuthorInsightsStatusBadgeClassName(...args);
  window.getAuthorInsightsCreatedPrStatus = (...args) =>
    prAuthorInsightsDisplayHelpers.getAuthorInsightsCreatedPrStatus(...args);
  window.sortAuthorInsightsCreatedPrsDesc = (...args) =>
    prAuthorInsightsDisplayHelpers.sortAuthorInsightsCreatedPrsDesc(...args);
  window.sortAuthorInsightsNoteMatchesDesc = (...args) =>
    prAuthorInsightsDisplayHelpers.sortAuthorInsightsNoteMatchesDesc(...args);
  window.getAuthorInsightsNoteDisplayTimestamp = (...args) =>
    prAuthorInsightsDisplayHelpers.getAuthorInsightsNoteDisplayTimestamp(...args);
  // Track B batch 2 (REACT_MIGRATION_PLAN.md): the manual comments
  // composer/editor is now real JSX too (AuthorInsightsCommentsSection.jsx)
  // instead of wrapping buildManualCommentsSection via a ref - that builder
  // (and its renderComposerForm/renderManualCommentList/
  // renderManualCommentItem/renderEditForm helpers) has been deleted.
  // These bridges expose the draft-state/data helpers that section needs.
  // Important: draft mutations still write through
  // getAuthorInsightsComposerDraft/updateAuthorInsightsComposerDraft/etc
  // into authorInsightsState - NOT local-only React state - because
  // pr-auto-render-blocking.helpers.js's getBlockingAuthorInsightsLogins
  // reads authorInsightsState.manualCommentDraftByAuthorLogin/
  // manualCommentEditDraftByAuthorLogin/manualCommentsByAuthorLogin
  // directly to decide whether an incoming poll should be blocked because
  // the user has unsaved author comment edits. Moving that shared-state
  // concern into React itself (so this bridge surface can eventually go
  // away) is Track C's job, not this one.
  window.getAuthorInsightsComposerDraft = (...args) => getAuthorInsightsComposerDraft(...args);
  window.updateAuthorInsightsComposerDraft = (...args) => updateAuthorInsightsComposerDraft(...args);
  window.resetAuthorInsightsComposerDraft = (...args) => resetAuthorInsightsComposerDraft(...args);
  window.getAuthorInsightsEditDraft = (...args) => getAuthorInsightsEditDraft(...args);
  window.updateAuthorInsightsEditDraft = (...args) => updateAuthorInsightsEditDraft(...args);
  window.resetAuthorInsightsEditDraft = (...args) => resetAuthorInsightsEditDraft(...args);
  window.getAuthorManualCommentsForLogin = (...args) => getAuthorManualCommentsForLogin(...args);
  window.getAuthorInsightsManualCommentsLoadState = (login) => ({
    loading: Boolean(authorInsightsState.manualCommentsLoadingByAuthorLogin[login]),
    error: authorInsightsState.manualCommentsErrorByAuthorLogin[login] || "",
  });
  window.setAuthorInsightsManualComments = (login, comments) => {
    authorInsightsState.manualCommentsByAuthorLogin[login] = Array.isArray(comments)
      ? comments
      : [];
  };
  window.loadAuthorManualComments = (login, onComplete) =>
    prAuthorInsightsDataHelpers.loadAuthorManualComments(login, authorInsightsState, onComplete);
  window.saveAuthorManualComment = ({ authorLogin, note, sentiment }) =>
    prAuthorInsightsDataHelpers.saveAuthorManualComment({
      authorLogin,
      note,
      sentiment,
      postJson: (...args) => postJson(...args),
    });
  window.updateAuthorManualComment = (args) =>
    prAuthorInsightsDataHelpers.updateAuthorManualComment(args);
  window.AUTHOR_COMMENT_SENTIMENT_OPTIONS = prAuthorInsightsDataHelpers.AUTHOR_COMMENT_SENTIMENT_OPTIONS;
  window.DEFAULT_AUTHOR_INSIGHTS_SENTIMENT = DEFAULT_AUTHOR_INSIGHTS_SENTIMENT;
  window.sortAuthorInsightsManualCommentsDesc = (...args) =>
    prAuthorInsightsDisplayHelpers.sortAuthorInsightsManualCommentsDesc(...args);
}

// Author Insights Tab Orchestrator
const authorInsightsTabOrchestratorFactory =
  typeof module !== "undefined" && module.exports
    ? require("./orchestrators/author-insights-tab.orchestrator.js")
    : globalThis.ViewPrsAuthorInsightsTabOrchestrator;

const authorInsightsTabOrchestrator =
  authorInsightsTabOrchestratorFactory.createAuthorInsightsTabOrchestrator({
    // Helper functions
    renderAuthorInsights,
    activateDataTab,
    getOptionalElementById,
    // State management via dependency injection
    stateGetters: {
      getAuthorInsightsState: () => authorInsightsState,
      getLatestStoredPayload: () => latestStoredPayload,
      getLatestSelectedRepo: () => latestSelectedRepo,
    },
    stateSetters: {
      setSelectedAuthorLogin: (value) => {
        authorInsightsState.selectedAuthorLogin = value;
      },
      setLatestRows: (value) => {
        authorInsightsState.latestRows = value;
      },
      setLatestActorsMap: (value) => {
        authorInsightsState.latestActorsMap = value;
      },
    },
  });

const prActorIdentityHelperFactory =
  typeof module !== "undefined" && module.exports
    ? require("./helpers/pr-actor-identity.helpers.js")
    : globalThis.ViewPrsPrActorIdentityHelpers;

const {
  normalizeActorLoginAliases,
  normalizeActorLogin,
  getPreferredActorKey,
  resolveActorDisplayName,
  buildRowActorsMap,
} = prActorIdentityHelperFactory.createPrActorIdentityHelpers({
  asArray,
  getActorLoginAliases: () => currentActorLoginAliases,
});

const createInsightSection = (summaryText, bodyBuilder, options = {}) => {
  const details = document.createElement("details");
  details.className = "insight-section";
  const key =
    String(options?.key || "").trim().toLowerCase() ||
    String(summaryText || "")
      .trim()
      .toLowerCase();
  details.setAttribute(
    "data-insight-key",
    key,
  );

  const summary = document.createElement("summary");
  summary.textContent = summaryText;
  details.appendChild(summary);

  const body = bodyBuilder();
  if (body) {
    details.appendChild(body);
  }

  return details;
};

const buildActivityEventKey = (event = {}) =>
  [
    String(event?.sourceId || ""),
    String(event?.occurredAt || ""),
    String(event?.actor || ""),
    String(event?.type || ""),
    String(event?.channel || ""),
  ].join("|");

const normalizePrRootUrl = (url) => {
  const raw = String(url || "").trim();
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/$/, "");
  } catch (_error) {
    return raw.split("#")[0].split("?")[0].replace(/\/$/, "");
  }
};

const buildFallbackActivityEvents = (row = {}) => {
  const fallback = [];
  const explicitCommentEvents = asArray(row.commentEvents);

  explicitCommentEvents.forEach((event) => {
    fallback.push({
      ...event,
      type: String(event?.type || "comment"),
      channel: String(event?.channel || "top-level"),
      sourceId: String(event?.sourceId || ""),
      occurredAt: String(event?.occurredAt || ""),
      actor: String(event?.actor || "unknown"),
      body: String(event?.body || ""),
      url: String(event?.url || ""),
    });
  });

  if (!explicitCommentEvents.length) {
    asArray(row.comments).forEach((comment) => {
      fallback.push({
        sourceId: String(comment?.id || ""),
        occurredAt: String(comment?.createdAt || ""),
        actor: String(comment?.authorLogin || "unknown"),
        type: "comment",
        channel: "top-level",
        body: String(comment?.body || ""),
        url: String(comment?.url || ""),
      });
    });

    asArray(row.reviewThreads).forEach((thread) => {
      asArray(thread?.comments).forEach((comment) => {
        fallback.push({
          sourceId: String(comment?.id || ""),
          threadId: String(thread?.id || ""),
          occurredAt: String(comment?.createdAt || ""),
          actor: String(comment?.authorLogin || "unknown"),
          type: "comment",
          channel: "thread",
          body: String(comment?.body || ""),
          url: String(comment?.url || ""),
          conversationResolved: thread?.isResolved,
        });
      });
    });
  }

  asArray(row.reviews).forEach((review) => {
    const state = String(review?.state || "");
    fallback.push({
      sourceId: String(review?.id || ""),
      occurredAt: String(review?.submittedAt || ""),
      actor: String(review?.authorLogin || "unknown"),
      type: state === "APPROVED" ? "approval" : "review",
      channel: "review",
      state,
      body: String(review?.body || ""),
      url: String(review?.url || ""),
      commitOid: String(review?.commitOid || ""),
    });
  });

  asArray(row.commits).forEach((commit) => {
    asArray(commit?.authors).forEach((author) => {
      const authorLogin = String(author?.login || "");
      if (!authorLogin) return;
      fallback.push({
        sourceId: String(commit?.oid || ""),
        occurredAt: String(commit?.committedAt || ""),
        actor: authorLogin,
        type: "commit",
        channel: "commit",
        messageHeadline: String(commit?.messageHeadline || ""),
        messageBody: String(commit?.messageBody || ""),
      });
    });
  });

  const mergedAt = String(row?.mergedAt || "");
  if (mergedAt) {
    fallback.push({
      sourceId: "merged",
      occurredAt: mergedAt,
      actor: "unknown",
      type: "merged",
      channel: "system",
      url: String(row?.url || ""),
    });
  }

  return fallback.filter((event) => String(event?.occurredAt || "").trim());
};

const createActivityEventsSection = (row, actorsMap = {}) => {
  // Prefer timeline-backed raw events when available so this detailed view
  // stays aligned with the compact activity timeline summary.
  const timelineEvents = asArray(row.activityTimeline).flatMap((bucket) =>
    asArray(bucket?.events),
  );
  const sourceEvents = timelineEvents.length
    ? timelineEvents
    : asArray(row.activityEvents);
  const fallbackEvents = buildFallbackActivityEvents(row);
  const fallbackByKey = new Map(
    fallbackEvents.map((event) => [buildActivityEventKey(event), event]),
  );
  const fallbackBySourceId = new Map(
    fallbackEvents
      .filter((event) => String(event?.sourceId || "").trim())
      .map((event) => [String(event.sourceId), event]),
  );
  const enrichedSourceEvents = sourceEvents.map((event) => {
    const sourceId = String(event?.sourceId || "").trim();
    const fallback =
      (sourceId ? fallbackBySourceId.get(sourceId) : null) ||
      fallbackByKey.get(buildActivityEventKey(event));
    if (!fallback) return event;
    return {
      ...event,
      body: String(event?.body || "").trim() || String(fallback?.body || ""),
      url: String(event?.url || "").trim() || String(fallback?.url || ""),
      state: String(event?.state || "").trim() || String(fallback?.state || ""),
      messageHeadline:
        String(event?.messageHeadline || "").trim() ||
        String(fallback?.messageHeadline || ""),
      messageBody:
        String(event?.messageBody || "").trim() ||
        String(fallback?.messageBody || ""),
      conversationResolved:
        event?.conversationResolved !== undefined
          ? event.conversationResolved
          : fallback?.conversationResolved,
    };
  });
  const preDedupeEvents = (
    enrichedSourceEvents.length ? enrichedSourceEvents : fallbackEvents
  ).slice();

  // A COMMENTED review event whose body was backfilled from its first thread
  // comment will produce a visual duplicate alongside the thread comment event.
  // Suppress any review(COMMENTED) event when a thread/top-level comment event
  // exists with the same actor, same minute, and same non-empty body.
  const threadCommentSignatures = new Set(
    preDedupeEvents
      .filter(
        (e) =>
          (String(e?.channel || "") === "thread" ||
            String(e?.channel || "") === "top-level") &&
          String(e?.body || "").trim(),
      )
      .map(
        (e) =>
          `${String(e?.actor || "")}|${String(e?.occurredAt || "").slice(0, 16)}|${String(e?.body || "").trim()}`,
      ),
  );
  const activityEvents = preDedupeEvents
    .filter((e) => {
      if (
        String(e?.channel || "") !== "review" ||
        !String(e?.body || "").trim()
      )
        return true;
      const sig = `${String(e?.actor || "")}|${String(e?.occurredAt || "").slice(0, 16)}|${String(e?.body || "").trim()}`;
      return !threadCommentSignatures.has(sig);
    })
    // Deduplicate thread/top-level comment events that share the same body,
    // channel, and minute — handles cases where the same bot comment is stored
    // with both its login and its display name as the actor value.
    .filter(
      (() => {
        const seen = new Set();
        return (e) => {
          const ch = String(e?.channel || "");
          if (ch !== "thread" && ch !== "top-level") return true;
          const body = String(e?.body || "").trim();
          if (!body) return true;
          const sig = `${ch}|${String(e?.occurredAt || "").slice(0, 16)}|${body}`;
          if (seen.has(sig)) return false;
          seen.add(sig);
          return true;
        };
      })(),
    )
    .sort((a, b) =>
      String(b?.occurredAt || "").localeCompare(String(a?.occurredAt || "")),
    )
    .slice(0, 60);

  if (!activityEvents.length) return null;

  const BODY_TRUNCATE = 280;

  return createInsightSection("Activity sequence", () => {
    const list = document.createElement("div");
    list.className = "insight-list";
    activityEvents.forEach((event) => {
      const item = document.createElement("div");
      const eventType = String(event?.type || "");
      const eventChannel = String(event?.channel || "");
      let eventKind;
      if (eventType === "approval") eventKind = "approval";
      else if (eventType === "merged") eventKind = "merged";
      else if (eventType === "opened") eventKind = "opened";
      else if (eventChannel === "commit" || eventType === "commit")
        eventKind = "commit";
      else if (eventChannel === "review" || eventType === "review")
        eventKind = "review";
      else if (eventChannel === "thread") eventKind = "thread";
      else if (eventChannel === "top-level") eventKind = "top-level";
      else eventKind = "system";
      item.className = `insight-list-item insight-event-kind-${eventKind}`;

      // Header: timestamp + description + optional link
      const header = document.createElement("div");
      header.className = "insight-event-header";
      const descSpan = document.createElement("span");
      const timestamp = formatIsoDatetime(event?.occurredAt || "-");
      descSpan.append(`${timestamp} | `);
      descSpan.appendChild(
        createActivityEventDescriptionFragment(event, row, actorsMap),
      );
      header.appendChild(descSpan);
      const directUrl = String(event?.url || "").trim();
      const fallbackUrl = String(row?.url || "").trim();
      const isReviewEvent = event?.channel === "review";
      const directIsPrRoot =
        !!directUrl &&
        normalizePrRootUrl(directUrl) === normalizePrRootUrl(fallbackUrl) &&
        !directUrl.includes("#");
      const linkUrl = directUrl
        ? directIsPrRoot && isReviewEvent
          ? ""
          : directUrl
        : isReviewEvent
          ? ""
          : fallbackUrl;
      if (linkUrl) {
        const link = document.createElement("a");
        link.className = "insight-event-link";
        link.href = linkUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = directUrl ? "View →" : "View PR →";
        header.appendChild(link);
      }
      item.appendChild(header);

      // Body text (comment, review, or commit headline)
      const bodyText = String(event?.body || "").trim();
      const headline = String(event?.messageHeadline || "").trim();
      const mainText = bodyText || headline;
      if (mainText) {
        const bodyEl = document.createElement("div");
        bodyEl.className = "insight-event-body insight-subtle";
        const truncated = mainText.length > BODY_TRUNCATE;
        bodyEl.textContent = truncated
          ? mainText.slice(0, BODY_TRUNCATE) + "…"
          : mainText;
        item.appendChild(bodyEl);
      }

      // Commit: also show message body if present
      const msgBody = String(event?.messageBody || "").trim();
      if (event?.type === "commit" && msgBody) {
        const msgBodyEl = document.createElement("div");
        msgBodyEl.className = "insight-event-body insight-subtle";
        const truncated = msgBody.length > BODY_TRUNCATE;
        msgBodyEl.textContent = truncated
          ? msgBody.slice(0, BODY_TRUNCATE) + "…"
          : msgBody;
        item.appendChild(msgBodyEl);
      }

      list.appendChild(item);
    });
    return list;
  });
};

const countPendingThreadComments = (row) =>
  asArray(row?.reviewThreads).reduce(
    (total, thread) =>
      total +
      asArray(thread?.comments).filter(
        (comment) => String(comment?.state || "").toUpperCase() === "PENDING",
      ).length,
    0,
  );

const getReviewConversationsStateKey = (row) => {
  const urlKey = String(row?.url || "").trim();
  if (urlKey) {
    return urlKey;
  }

  const repoKey = String(row?.repo || "").trim();
  const prNumberKey = String(row?.number || "").trim();
  if (!repoKey && !prNumberKey) {
    return "";
  }

  return `${repoKey}#${prNumberKey}`;
};

const readReviewConversationsUiState = (row) => {
  const stateKey = getReviewConversationsStateKey(row);
  const savedState = stateKey
    ? reviewConversationsUiStateByKey.get(stateKey) || null
    : null;
  const mode = String(savedState?.conversationFilterMode || "")
    .trim()
    .toLowerCase();

  return {
    stateKey,
    conversationFilterMode: ["all", "unresolved", "resolved"].includes(mode)
      ? mode
      : "unresolved",
    showSummaryCards:
      typeof savedState?.showSummaryCards === "boolean"
        ? savedState.showSummaryCards
        : true,
  };
};

const writeReviewConversationsUiState = (
  stateKey,
  conversationFilterMode,
  showSummaryCards,
) => {
  if (!stateKey) {
    return;
  }
  reviewConversationsUiStateByKey.set(stateKey, {
    conversationFilterMode,
    showSummaryCards,
  });
};

const createReviewThreadsSection = (row, actorsMap = {}) => {
  const reviewThreads = asArray(row.reviewThreads);
  const unresolvedReviewThreads = reviewThreads.filter(
    (thread) => thread?.isResolved !== true,
  );
  const resolvedReviewThreads = reviewThreads.filter(
    (thread) => thread?.isResolved === true,
  );
  const prAuthorLogin = getPreferredActorKey(row?.authorLogin, row?.author)
    .trim()
    .toLowerCase();
  const authorThreadResolutionPolicy = getAuthorThreadResolutionPolicy();
  const isCopilotActor = (value) =>
    /copilot/i.test(String(value || "").trim().toLowerCase());
  const getCommenterIdentity = (comment) => {
    const login = String(comment?.authorLogin || "").trim();
    const fallbackName = String(
      comment?.author?.name || comment?.authorName || "",
    ).trim();
    const displayName = resolveActorDisplayName(login, actorsMap, fallbackName);
    return {
      login,
      loginKey: login.toLowerCase(),
      displayName,
      isCopilot:
        isCopilotActor(login) ||
        isCopilotActor(fallbackName) ||
        isCopilotActor(displayName),
    };
  };
  const getThreadResolutionInfo = (thread) => {
    const isResolved = thread?.isResolved === true;
    const resolvedByLogin = String(thread?.resolvedByLogin || "").trim();
    const resolvedByKey = resolvedByLogin.toLowerCase();
    const resolvedByAuthor =
      isResolved &&
      Boolean(prAuthorLogin) &&
      Boolean(resolvedByKey) &&
      resolvedByKey === prAuthorLogin;

    const threadComments = asArray(thread?.comments).slice();
    const sortedComments = threadComments.sort(
      (a, b) =>
        parseSortableTime(a?.createdAt || "") -
        parseSortableTime(b?.createdAt || ""),
    );
    const starterIdentity = sortedComments.length
      ? getCommenterIdentity(sortedComments[0])
      : { loginKey: "", isCopilot: false };

    const starterLoginKey =
      starterIdentity.loginKey && starterIdentity.loginKey !== prAuthorLogin
        ? starterIdentity.loginKey
        : "";
    let authorResolvedAllowedByPolicy = true;
    if (resolvedByAuthor) {
      if (authorThreadResolutionPolicy.mode === "allow-only") {
        authorResolvedAllowedByPolicy = starterLoginKey
          ? authorThreadResolutionPolicy.allowLoginKeys.has(starterLoginKey)
          : true;
      } else if (authorThreadResolutionPolicy.mode === "deny-only") {
        authorResolvedAllowedByPolicy = starterLoginKey
          ? !authorThreadResolutionPolicy.denyLoginKeys.has(starterLoginKey)
          : true;
      }
    }
    const incorrectlyResolvedByAuthor =
      resolvedByAuthor && !authorResolvedAllowedByPolicy;

    return {
      resolvedByAuthor,
      authorResolvedAllowedByPolicy,
      incorrectlyResolvedByAuthor,
    };
  };
  const incorrectlyResolvedByAuthorCount = resolvedReviewThreads.reduce(
    (total, thread) =>
      total + (getThreadResolutionInfo(thread).incorrectlyResolvedByAuthor ? 1 : 0),
    0,
  );
  const reviewConversationCountLabel = `Review conversations (${resolvedReviewThreads.length}/${reviewThreads.length})`;
  const reviewConversationWarningText =
    incorrectlyResolvedByAuthorCount > 0
      ? `(Warning: ${incorrectlyResolvedByAuthorCount} thread${incorrectlyResolvedByAuthorCount === 1 ? "" : "s"} incorrectly resolved by PR author)`
      : "";
  const reviewConversationHeading = reviewConversationWarningText
    ? `${reviewConversationCountLabel} ${reviewConversationWarningText}`
    : reviewConversationCountLabel;
  const buildActorBodyMinuteSignature = (actor, occurredAt, body) => {
    const normalizedActor = String(actor || "")
      .trim()
      .toLowerCase();
    const normalizedOccurredAt = String(occurredAt || "").trim();
    const normalizedBody = String(body || "").trim();
    if (!normalizedActor || !normalizedOccurredAt || !normalizedBody) {
      return "";
    }
    return `${normalizedActor}|${normalizedOccurredAt.slice(0, 16)}|${normalizedBody}`;
  };

  const threadResponseSignatures = new Set();
  const threadResponseUrls = new Set();
  asArray(row.commentEvents)
    .filter((event) => {
      const type = String(event?.type || "comment")
        .trim()
        .toLowerCase();
      const channel = String(event?.channel || "")
        .trim()
        .toLowerCase();
      return type === "comment" && channel === "thread";
    })
    .forEach((event) => {
      const actor = String(event?.actor || "").trim();
      const occurredAt = String(event?.occurredAt || "").trim();
      const body = String(event?.body || "").trim();
      const url = String(event?.url || "").trim();
      if (url) {
        threadResponseUrls.add(url);
      }
      const actorVariants = [
        actor,
        resolveActorDisplayName(actor, actorsMap),
      ].filter(Boolean);
      actorVariants.forEach((actorVariant) => {
        const signature = buildActorBodyMinuteSignature(
          actorVariant,
          occurredAt,
          body,
        );
        if (signature) {
          threadResponseSignatures.add(signature);
        }
      });
    });

  if (!threadResponseSignatures.size) {
    asArray(row.reviewThreads).forEach((thread) => {
      asArray(thread?.comments).forEach((comment) => {
        const actorLogin = String(comment?.authorLogin || "").trim();
        const actorName = String(
          comment?.author?.name || comment?.authorName || "",
        ).trim();
        const occurredAt = String(comment?.createdAt || "").trim();
        const body = String(comment?.body || "").trim();
        const url = String(comment?.url || "").trim();
        if (url) {
          threadResponseUrls.add(url);
        }
        const actorVariants = [
          actorLogin,
          actorName,
          resolveActorDisplayName(actorLogin, actorsMap, actorName),
        ].filter(Boolean);
        actorVariants.forEach((actorVariant) => {
          const signature = buildActorBodyMinuteSignature(
            actorVariant,
            occurredAt,
            body,
          );
          if (signature) {
            threadResponseSignatures.add(signature);
          }
        });
      });
    });
  }

  const reviewSummaryCandidates = asArray(row.reviews)
    .filter(
      (review) =>
        String(review?.state || "")
          .trim()
          .toUpperCase() === "COMMENTED" && String(review?.body || "").trim(),
    )
    .filter((review) => {
      const createdAt = String(review?.submittedAt || "").trim();
      const body = String(review?.body || "").trim();
      const authorLogin = String(review?.authorLogin || "").trim();
      const authorName = String(
        review?.authorName || review?.author?.name || "",
      ).trim();
      const reviewUrl = String(review?.url || "").trim();
      if (reviewUrl && threadResponseUrls.has(reviewUrl)) {
        return false;
      }
      const authorVariants = [
        authorLogin,
        authorName,
        resolveActorDisplayName(authorLogin, actorsMap, authorName),
      ].filter(Boolean);
      return !authorVariants.some((authorVariant) => {
        const signature = buildActorBodyMinuteSignature(
          authorVariant,
          createdAt,
          body,
        );
        return signature && threadResponseSignatures.has(signature);
      });
    })
    .map((review) => ({
      id: String(review?.id || "").trim(),
      createdAt: String(review?.submittedAt || "").trim(),
      authorLogin: String(review?.authorLogin || "").trim(),
      authorName: String(
        review?.authorName || review?.author?.name || "",
      ).trim(),
      body: String(review?.body || "").trim(),
      url: String(review?.url || "").trim(),
      state: String(review?.state || "").trim(),
    }));

  const seenReviewSummaryKeys = new Set();
  const reviewSummaries = reviewSummaryCandidates
    .filter((review) => {
      const key =
        review.id ||
        `${review.createdAt}|${review.authorLogin}|${review.body}|${review.state}`;
      if (!key || seenReviewSummaryKeys.has(key)) return false;
      seenReviewSummaryKeys.add(key);
      return true;
    })
    .sort(
      (a, b) =>
        parseSortableTime(a?.createdAt) - parseSortableTime(b?.createdAt),
    );

  const getReviewThreadViewUrl = (thread) => {
    const explicitThreadUrl = String(
      thread?.url || thread?.threadUrl || thread?.webUrl || "",
    ).trim();
    if (explicitThreadUrl) {
      return explicitThreadUrl;
    }

    const threadComments = asArray(thread?.comments)
      .slice()
      .sort(
        (a, b) =>
          parseSortableTime(a?.createdAt || "") -
          parseSortableTime(b?.createdAt || ""),
      );

    const starterCommentUrl =
      threadComments.find((comment) => String(comment?.url || "").trim())?.url ||
      "";
    if (starterCommentUrl) {
      return starterCommentUrl;
    }

    return (
      threadComments
        .slice()
        .reverse()
        .find((comment) => String(comment?.url || "").trim())?.url || ""
    );
  };

  const createReviewThreadCard = (thread, index) => {
    const threadCard = document.createElement("div");
    const isResolved = thread?.isResolved === true;
    const resolutionInfo = getThreadResolutionInfo(thread);
    threadCard.className = [
      "insight-thread",
      isResolved ? "insight-thread-resolved" : "insight-thread-open",
      resolutionInfo.resolvedByAuthor ? "insight-thread-author-resolved" : "",
      resolutionInfo.incorrectlyResolvedByAuthor
        ? "insight-thread-author-resolved-warning"
        : "",
    ].join(" ");

    const threadComments = asArray(thread?.comments);
    const title = document.createElement("div");
    title.className = [
      "insight-thread-title",
      "insight-event-header",
      isResolved
        ? "insight-thread-title-resolved"
        : "insight-thread-title-open",
      resolutionInfo.resolvedByAuthor
        ? "insight-thread-title-author-resolved"
        : "",
      resolutionInfo.incorrectlyResolvedByAuthor
        ? "insight-thread-title-author-resolved-warning"
        : "",
    ].join(" ");
    const stateLabel = isResolved ? "Resolved" : "Open";
    const resolvedByLogin = String(thread?.resolvedByLogin || "").trim();
    const authorResolvedLabel =
      isResolved && resolutionInfo.resolvedByAuthor
        ? "Author resolved"
        : "";
    const authorResolutionWarningLabel =
      isResolved && resolutionInfo.incorrectlyResolvedByAuthor
        ? "WARNING: should be resolved by thread starter"
        : "";
    const participants = asArray(thread?.participants)
      .map((participant) => ({ login: participant }))
      .filter((participant) => String(participant?.login || "").trim());
    const rootComment = threadComments.find((c) =>
      String(c?.path || "").trim(),
    );
    const threadFilePath = rootComment
      ? String(rootComment.path || "").trim()
      : "";
    const threadFileLine =
      rootComment != null
        ? (rootComment.line ?? rootComment.originalLine ?? null)
        : null;
    const fileRef = threadFilePath
      ? threadFileLine != null
        ? `${threadFilePath}:${threadFileLine}`
        : threadFilePath
      : "";
    const titleText = document.createElement("span");
    const titleSegments = { first: true };
    appendInlineSegment(titleText, titleSegments, `${stateLabel} thread ${index + 1}`);
    appendInlineSegment(titleText, titleSegments, `${threadComments.length} comments`);
    if (participants.length) {
      const participantsFragment = document.createDocumentFragment();
      participantsFragment.append("Participants: ");
      participantsFragment.appendChild(
        createActorListFragment(participants, row, actorsMap),
      );
      appendInlineSegment(titleText, titleSegments, participantsFragment);
    } else {
      appendInlineSegment(titleText, titleSegments, "unknown participants");
    }
    appendInlineSegment(titleText, titleSegments, fileRef);
    if (isResolved && resolvedByLogin) {
      appendInlineSegment(
        titleText,
        titleSegments,
        createActorIdentityFragment({
          row,
          login: resolvedByLogin,
          actorsMap,
          prefix: "Resolved by: ",
        }),
      );
    }
    appendInlineSegment(titleText, titleSegments, authorResolvedLabel);
    appendInlineSegment(titleText, titleSegments, authorResolutionWarningLabel);
    title.appendChild(titleText);

    const threadUrl = getReviewThreadViewUrl(thread);
    if (threadUrl) {
      const link = document.createElement("a");
      link.className = "insight-event-link";
      link.href = threadUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "View →";
      title.appendChild(link);
    }
    threadCard.appendChild(title);

    const commentsHost = document.createElement("div");
    commentsHost.className = "insight-thread-comments";
    threadComments.forEach((comment) => {
      const commentCard = document.createElement("div");
      const isPending =
        String(comment?.state || "").toUpperCase() === "PENDING";
      commentCard.className = [
        "insight-thread-comment",
        isPending
          ? "insight-thread-comment-pending"
          : "insight-thread-comment-submitted",
      ].join(" ");

      const meta = document.createElement("div");
      meta.className = "insight-thread-comment-meta insight-event-header";
      const metaText = document.createElement("span");
      appendTimestampAndActor({
        container: metaText,
        row,
        timestamp: comment?.createdAt || "-",
        login: comment?.authorLogin,
        actorsMap,
        fallbackName: comment?.author?.name || comment?.authorName,
      });
      meta.appendChild(metaText);

      if (isPending) {
        const pendingBadge = document.createElement("span");
        pendingBadge.className = "insight-comment-state-badge";
        pendingBadge.textContent = "Pending";
        meta.appendChild(pendingBadge);
      }

      commentCard.appendChild(meta);

      const body = document.createElement("div");
      body.className = "insight-thread-body";
      const bodyText =
        String(comment?.body || "").trim() || "(no comment body)";
      body.innerHTML = renderMarkdownAsHtml(bodyText);
      commentCard.appendChild(body);

      commentsHost.appendChild(commentCard);
    });
    threadCard.appendChild(commentsHost);
    return threadCard;
  };

  const explicitTopLevelComments = asArray(row.comments).map((comment) => ({
    id: String(comment?.id || "").trim(),
    createdAt: String(comment?.createdAt || "").trim(),
    authorLogin: String(comment?.authorLogin || "").trim(),
    authorName: String(
      comment?.authorName || comment?.author?.name || "",
    ).trim(),
    body: String(comment?.body || "").trim(),
    url: String(comment?.url || "").trim(),
    state: String(comment?.state || "").trim(),
  }));

  const fallbackTopLevelComments =
    explicitTopLevelComments.length > 0
      ? []
      : asArray(row.commentEvents)
          .filter((event) => {
            const type = String(event?.type || "comment")
              .trim()
              .toLowerCase();
            const channel = String(event?.channel || "top-level")
              .trim()
              .toLowerCase();
            return type === "comment" && channel !== "thread";
          })
          .map((event) => ({
            id: String(event?.sourceId || "").trim(),
            createdAt: String(event?.occurredAt || "").trim(),
            authorLogin: String(event?.actor || "").trim(),
            authorName: String(event?.authorName || "").trim(),
            body: String(event?.body || "").trim(),
            url: String(event?.url || "").trim(),
            state: "",
          }));

  const seenTopLevelKeys = new Set();
  const topLevelComments = [
    ...explicitTopLevelComments,
    ...fallbackTopLevelComments,
  ]
    .filter((comment) => {
      const key =
        comment.id ||
        `${comment.createdAt}|${comment.authorLogin}|${comment.body}`;
      if (!key || seenTopLevelKeys.has(key)) return false;
      seenTopLevelKeys.add(key);
      return true;
    })
    .sort(
      (a, b) =>
        parseSortableTime(a?.createdAt) - parseSortableTime(b?.createdAt),
    );

  if (
    !reviewThreads.length &&
    !topLevelComments.length &&
    !reviewSummaries.length
  )
    return null;

  const reviewConversationsUiState = readReviewConversationsUiState(row);

  const reviewSection = createInsightSection(
    reviewConversationHeading,
    () => {
    const host = document.createElement("div");
    let showSummaryCards = reviewConversationsUiState.showSummaryCards;
    const summaryCardsHost = document.createElement("div");

    const renderSummaryCards = () => {
      clearElementContents(summaryCardsHost);
      if (!showSummaryCards) {
        return;
      }

      if (topLevelComments.length > 0) {
        const topLevelCard = document.createElement("div");
        topLevelCard.className = [
          "insight-thread",
          "insight-thread-top-level",
        ].join(" ");

        const topLevelTitle = document.createElement("div");
        topLevelTitle.className = [
          "insight-thread-title",
          "insight-event-header",
          "insight-thread-title-top-level",
        ].join(" ");

        const topLevelTitleText = document.createElement("span");
        topLevelTitleText.textContent = `Top-level PR comments | ${topLevelComments.length} comments`;
        topLevelTitle.appendChild(topLevelTitleText);

        const topLevelUrl =
          topLevelComments.find((comment) => String(comment?.url || "").trim())
            ?.url || "";
        if (topLevelUrl) {
          const link = document.createElement("a");
          link.className = "insight-event-link";
          link.href = topLevelUrl;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = "View →";
          topLevelTitle.appendChild(link);
        }
        topLevelCard.appendChild(topLevelTitle);

        const topLevelCommentsHost = document.createElement("div");
        topLevelCommentsHost.className = "insight-thread-comments";
        topLevelComments.forEach((comment) => {
          const commentCard = document.createElement("div");
          commentCard.className = [
            "insight-thread-comment",
            "insight-thread-comment-submitted",
          ].join(" ");

          const meta = document.createElement("div");
          meta.className = "insight-thread-comment-meta insight-event-header";
          const metaText = document.createElement("span");
          appendTimestampAndActor({
            container: metaText,
            row,
            timestamp: comment?.createdAt || "-",
            login: comment?.authorLogin,
            actorsMap,
            fallbackName: comment?.authorName,
          });
          meta.appendChild(metaText);

          commentCard.appendChild(meta);

          const body = document.createElement("div");
          body.className = "insight-thread-body";
          const bodyText =
            String(comment?.body || "").trim() || "(no comment body)";
          body.innerHTML = renderMarkdownAsHtml(bodyText);
          commentCard.appendChild(body);

          topLevelCommentsHost.appendChild(commentCard);
        });

        topLevelCard.appendChild(topLevelCommentsHost);
        summaryCardsHost.appendChild(topLevelCard);
      }

      if (reviewSummaries.length > 0) {
        const reviewSummaryCard = document.createElement("div");
        reviewSummaryCard.className = [
          "insight-thread",
          "insight-thread-top-level",
        ].join(" ");

        const reviewSummaryTitle = document.createElement("div");
        reviewSummaryTitle.className = [
          "insight-thread-title",
          "insight-event-header",
          "insight-thread-title-top-level",
        ].join(" ");

        const reviewSummaryTitleText = document.createElement("span");
        reviewSummaryTitleText.textContent = `Review summaries | ${reviewSummaries.length} reviews`;
        reviewSummaryTitle.appendChild(reviewSummaryTitleText);

        const reviewSummaryUrl =
          reviewSummaries.find((review) => String(review?.url || "").trim())
            ?.url || "";
        if (reviewSummaryUrl) {
          const link = document.createElement("a");
          link.className = "insight-event-link";
          link.href = reviewSummaryUrl;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = "View →";
          reviewSummaryTitle.appendChild(link);
        }
        reviewSummaryCard.appendChild(reviewSummaryTitle);

        const reviewSummariesHost = document.createElement("div");
        reviewSummariesHost.className = "insight-thread-comments";
        reviewSummaries.forEach((review) => {
          const reviewCard = document.createElement("div");
          reviewCard.className = [
            "insight-thread-comment",
            "insight-thread-comment-submitted",
          ].join(" ");

          const meta = document.createElement("div");
          meta.className = "insight-thread-comment-meta insight-event-header";
          const metaText = document.createElement("span");
          appendTimestampAndActor({
            container: metaText,
            row,
            timestamp: review?.createdAt || "-",
            login: review?.authorLogin,
            actorsMap,
            fallbackName: review?.authorName,
            suffix: ` review (${String(review?.state || "COMMENTED").toUpperCase()})`,
          });
          meta.appendChild(metaText);
          reviewCard.appendChild(meta);

          const body = document.createElement("div");
          body.className = "insight-thread-body";
          const bodyText =
            String(review?.body || "").trim() || "(no review summary)";
          body.innerHTML = renderMarkdownAsHtml(bodyText);
          reviewCard.appendChild(body);

          reviewSummariesHost.appendChild(reviewCard);
        });

        reviewSummaryCard.appendChild(reviewSummariesHost);
        summaryCardsHost.appendChild(reviewSummaryCard);
      }
    };

    renderSummaryCards();

    if (reviewThreads.length > 0) {
      let conversationFilterMode = reviewConversationsUiState.conversationFilterMode;
      writeReviewConversationsUiState(
        reviewConversationsUiState.stateKey,
        conversationFilterMode,
        showSummaryCards,
      );
      const filterHost = document.createElement("div");
      filterHost.className = "insight-thread-filter";
      const allButton = document.createElement("button");
      allButton.type = "button";
      allButton.className = "insight-thread-filter-btn";
      allButton.textContent = `All (${reviewThreads.length})`;
      const unresolvedButton = document.createElement("button");
      unresolvedButton.type = "button";
      unresolvedButton.className =
        "insight-thread-filter-btn insight-thread-filter-btn-active";
      unresolvedButton.textContent = `Unresolved (${unresolvedReviewThreads.length})`;
      const resolvedButton = document.createElement("button");
      resolvedButton.type = "button";
      resolvedButton.className = "insight-thread-filter-btn";
      resolvedButton.textContent = `Resolved (${resolvedReviewThreads.length})`;
      const summaryToggleButton = document.createElement("button");
      summaryToggleButton.type = "button";
      summaryToggleButton.className = showSummaryCards
        ? "insight-thread-summary-toggle-btn insight-thread-summary-toggle-btn-on"
        : "insight-thread-summary-toggle-btn insight-thread-summary-toggle-btn-off";
      summaryToggleButton.textContent = showSummaryCards
        ? "Summaries: On"
        : "Summaries: Off";
      filterHost.appendChild(allButton);
      filterHost.appendChild(unresolvedButton);
      filterHost.appendChild(resolvedButton);
      filterHost.appendChild(summaryToggleButton);
      host.appendChild(filterHost);
      host.appendChild(summaryCardsHost);

      const threadCardsHost = document.createElement("div");
      const syncFilterButtons = () => {
        allButton.className =
          conversationFilterMode === "all"
            ? "insight-thread-filter-btn insight-thread-filter-btn-active"
            : "insight-thread-filter-btn";
        unresolvedButton.className =
          conversationFilterMode === "unresolved"
            ? "insight-thread-filter-btn insight-thread-filter-btn-active"
            : "insight-thread-filter-btn";
        resolvedButton.className =
          conversationFilterMode === "resolved"
            ? "insight-thread-filter-btn insight-thread-filter-btn-active"
            : "insight-thread-filter-btn";
      };
      const renderVisibleThreads = () => {
        clearElementContents(threadCardsHost);
        const visibleThreads =
          conversationFilterMode === "all"
            ? reviewThreads
            : conversationFilterMode === "resolved"
              ? resolvedReviewThreads
              : unresolvedReviewThreads;
        if (!visibleThreads.length) {
          const emptyState = document.createElement("div");
          emptyState.className = "insight-subtle";
          emptyState.textContent =
            conversationFilterMode === "resolved"
              ? "No resolved review conversations."
              : conversationFilterMode === "all"
                ? "No review conversations."
                : "No unresolved review conversations.";
          threadCardsHost.appendChild(emptyState);
        } else {
          visibleThreads.forEach((thread, index) => {
            threadCardsHost.appendChild(createReviewThreadCard(thread, index));
          });
        }
      };

      allButton.onclick = () => {
        conversationFilterMode = "all";
        writeReviewConversationsUiState(
          reviewConversationsUiState.stateKey,
          conversationFilterMode,
          showSummaryCards,
        );
        syncFilterButtons();
        renderVisibleThreads();
      };
      unresolvedButton.onclick = () => {
        conversationFilterMode = "unresolved";
        writeReviewConversationsUiState(
          reviewConversationsUiState.stateKey,
          conversationFilterMode,
          showSummaryCards,
        );
        syncFilterButtons();
        renderVisibleThreads();
      };
      resolvedButton.onclick = () => {
        conversationFilterMode = "resolved";
        writeReviewConversationsUiState(
          reviewConversationsUiState.stateKey,
          conversationFilterMode,
          showSummaryCards,
        );
        syncFilterButtons();
        renderVisibleThreads();
      };
      summaryToggleButton.onclick = () => {
        showSummaryCards = !showSummaryCards;
        writeReviewConversationsUiState(
          reviewConversationsUiState.stateKey,
          conversationFilterMode,
          showSummaryCards,
        );
        summaryToggleButton.className = showSummaryCards
          ? "insight-thread-summary-toggle-btn insight-thread-summary-toggle-btn-on"
          : "insight-thread-summary-toggle-btn insight-thread-summary-toggle-btn-off";
        summaryToggleButton.textContent = showSummaryCards
          ? "Summaries: On"
          : "Summaries: Off";
        renderSummaryCards();
      };

      syncFilterButtons();
      renderVisibleThreads();
      host.appendChild(threadCardsHost);
    }
    if (!reviewThreads.length) {
      host.appendChild(summaryCardsHost);
    }
    return host;
    },
    { key: "review-conversations" },
  );
  if (incorrectlyResolvedByAuthorCount > 0) {
    if (reviewSection?.classList?.add) {
      reviewSection.classList.add(
        "insight-section-review-conversations-warning",
        "insight-section-warning",
      );
    } else {
      reviewSection.className = [
        String(reviewSection?.className || ""),
        "insight-section-review-conversations-warning",
        "insight-section-warning",
      ]
        .filter(Boolean)
        .join(" ");
    }

    const reviewSummary =
      typeof reviewSection?.querySelector === "function"
        ? reviewSection.querySelector("summary")
        : null;
    if (reviewSummary) {
      const reviewSummaryLabel = document.createElement("span");
      reviewSummaryLabel.textContent = `${reviewConversationCountLabel} `;

      const reviewSummaryWarning = document.createElement("span");
      reviewSummaryWarning.className = "insight-section-warning-text";
      reviewSummaryWarning.textContent = reviewConversationWarningText;

      clearElementContents(reviewSummary);
      reviewSummary.appendChild(reviewSummaryLabel);
      reviewSummary.appendChild(reviewSummaryWarning);
    }
  }
  return reviewSection;
};

const createApprovalRiskSection = (_row, metrics, actorsMap = {}) => {
  const approvals = asArray(metrics.approvals);
  if (!approvals.length) return null;

  return createInsightSection("Approval risk details", () => {
    const list = document.createElement("div");
    list.className = "insight-list";

    approvals.forEach((approval) => {
      const item = document.createElement("div");
      item.className = "insight-list-item";

      const title = document.createElement("div");
      const riskText = approval.riskyApproval
        ? "risk flagged"
        : "no later issue signal";
      const name = document.createElement("strong");
      name.textContent = resolveActorDisplayName(
        approval.login,
        actorsMap,
        approval.name,
      );
      title.appendChild(name);

      const suffix = document.createElement("span");
      suffix.textContent = `approved ${formatIsoDatetime(approval.approvedAt || "-")} | ${riskText}`;
      title.appendChild(suffix);
      item.appendChild(title);

      const detail = document.createElement("div");
      detail.className = "insight-subtle";
      detail.textContent = `Comments after: ${toCount(approval.commentCountAfterApproval)}, reviews after: ${toCount(approval.reviewCountAfterApproval)}, change requests after: ${toCount(approval.changeRequestCountAfterApproval)}, commits after: ${toCount(approval.commitCountAfterApproval)}, merge lead: ${approval.mergeLeadMinutes == null ? "-" : formatDurationMinutes(approval.mergeLeadMinutes)}`;
      item.appendChild(detail);

      list.appendChild(item);
    });

    return list;
  });
};

const TONE_OPTIONS = [
  { value: "Positive", label: "👍 Positive" },
  { value: "Negative", label: "👎 Negative" },
  { value: "Neutral", label: "◽ Neutral" },
];

const buildPrPeopleOptions = (row, actorsMap = {}) => {
  const people = new Map();
  const addPerson = (login, name) => {
    const l = String(login || "").trim();
    if (!l) return;
    if (!people.has(l)) {
      people.set(l, resolveActorDisplayName(l, actorsMap, name));
    }
  };
  addPerson(row?.authorLogin, row?.author);
  asArray(row?.metrics?.commentsByActor).forEach((p) =>
    addPerson(p.login, p.name),
  );
  asArray(row?.metrics?.reviewsByActor).forEach((p) =>
    addPerson(p.login, p.name),
  );
  asArray(row?.approvers).forEach((p) => addPerson(p.login, p.name));
  return Array.from(people.entries()).map(([login, name]) => ({ login, name }));
};

const autoResizeTextarea = (el) => {
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
};

const createNotesSection = (entry, row, actorsMap = {}) => {
  const prNumber = String(row?.number || entry?.prNumber || "").trim();
  const repo = entry?.repo || latestSelectedRepo || DEFAULT_REPO;
  const existingNotes = entry?.notes || {};
  const peopleOptions = buildPrPeopleOptions(row, actorsMap);
  asArray(existingNotes.comments).forEach((comment) => {
    const authorLogin = String(comment?.author || "").trim();
    if (!authorLogin) return;
    if (peopleOptions.some((person) => person.login === authorLogin)) return;
    peopleOptions.push({
      login: authorLogin,
      name: resolveActorDisplayName(authorLogin, actorsMap, authorLogin),
    });
  });

  const section = document.createElement("div");
  section.className = "pr-notes-section";
  section.setAttribute("data-pr-number", prNumber);
  section.dataset.hasUnsavedNotes = "false";

  const title = document.createElement("div");
  title.className = "pr-notes-title";
  title.textContent = "Notes";
  section.appendChild(title);

  // ── Comments sub-section ────────────────────────────────────────────────
  const commentsSubtitle = document.createElement("div");
  commentsSubtitle.className = "pr-notes-subtitle";
  commentsSubtitle.textContent = "Comments";
  section.appendChild(commentsSubtitle);

  const commentsList = document.createElement("div");
  commentsList.className = "pr-notes-comments-list";
  section.appendChild(commentsList);

  // Internal array that mirrors what will be saved
  const commentRows = [];
  let originalCommentCount = asArray(existingNotes.comments).length;
  let updateSaveBtn = () => {};

  const createCommentRow = (existing = null) => {
    const id =
      String(existing?.id || "").trim() ||
      `comment-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const row = document.createElement("div");
    row.className = "pr-notes-comment-row";

    // Author dropdown
    const authorSelect = document.createElement("select");
    authorSelect.className = "pr-notes-comment-author";
    const blankOpt = document.createElement("option");
    blankOpt.value = "";
    blankOpt.textContent = "— Author —";
    authorSelect.appendChild(blankOpt);
    peopleOptions.forEach(({ login, name }) => {
      const opt = document.createElement("option");
      opt.value = login;
      opt.textContent = name || login;
      opt.selected = noteAuthorMatchesSelection(
        existing?.author,
        { login, name },
        actorsMap,
      );
      authorSelect.appendChild(opt);
    });
    row.appendChild(authorSelect);

    authorSelect.dataset.originalValue = String(existing?.author || "");
    authorSelect.addEventListener("change", () => updateSaveBtn());

    // Tone dropdown
    const toneSelect = document.createElement("select");
    toneSelect.className = "pr-notes-comment-tone";
    TONE_OPTIONS.forEach(({ value, label }) => {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      opt.selected = value === (existing?.tone || "Neutral");
      toneSelect.appendChild(opt);
    });
    row.appendChild(toneSelect);

    toneSelect.dataset.originalValue = String(existing?.tone || "Neutral");
    toneSelect.addEventListener("change", () => updateSaveBtn());

    // Note textarea
    const noteTextarea = document.createElement("textarea");
    noteTextarea.className = "pr-notes-textarea pr-notes-comment-note";
    noteTextarea.rows = 2;
    noteTextarea.placeholder = "Note...";
    noteTextarea.value = String(existing?.note || "");
    noteTextarea.dataset.originalValue = noteTextarea.value;
    noteTextarea.addEventListener("input", () => {
      autoResizeTextarea(noteTextarea);
      updateSaveBtn();
    });
    row.appendChild(noteTextarea);

    // Remove button
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "pr-notes-comment-remove";
    removeBtn.textContent = "✕ Remove";
    const commentEntry = { id, authorSelect, toneSelect, noteTextarea };
    removeBtn.onclick = () => {
      const idx = commentRows.indexOf(commentEntry);
      if (idx !== -1) commentRows.splice(idx, 1);
      row.parentNode && row.parentNode.removeChild(row);
      updateSaveBtn();
    };
    row.appendChild(removeBtn);

    commentRows.push(commentEntry);
    return row;
  };

  // Populate from saved data
  asArray(existingNotes.comments).forEach((c) => {
    commentsList.appendChild(createCommentRow(c));
  });

  const addCommentBtn = document.createElement("button");
  addCommentBtn.type = "button";
  addCommentBtn.className = "pr-notes-add-comment";
  addCommentBtn.textContent = "+ Add comment";
  addCommentBtn.onclick = () => {
    commentsList.appendChild(createCommentRow());
    updateSaveBtn();
  };
  section.appendChild(addCommentBtn);

  // ── Other Notes ─────────────────────────────────────────────────────────
  const otherLabel = document.createElement("label");
  otherLabel.className = "pr-notes-label";
  otherLabel.textContent = "Other Notes";
  const otherTextarea = document.createElement("textarea");
  otherTextarea.className = "pr-notes-textarea";
  otherTextarea.rows = 3;
  otherTextarea.placeholder = "Other notes...";
  otherTextarea.value = String(existingNotes.otherNotes || "");
  otherTextarea.dataset.originalValue = otherTextarea.value;
  otherTextarea.addEventListener("input", () => {
    autoResizeTextarea(otherTextarea);
    updateSaveBtn();
  });
  otherLabel.appendChild(otherTextarea);
  section.appendChild(otherLabel);

  const difficultyLabel = document.createElement("label");
  difficultyLabel.className = "pr-notes-label";
  difficultyLabel.textContent = "PR difficulty";
  const difficultySelect = document.createElement("select");
  difficultySelect.className = "pr-notes-input";
  [
    { value: "", label: "- Select difficulty -" },
    { value: "1", label: "1 - Simple" },
    { value: "2", label: "2 - Easy" },
    { value: "3", label: "3 - Moderate" },
    { value: "4", label: "4 - Hard" },
    { value: "5", label: "5 - Very difficult" },
  ].forEach(({ value, label }) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = value === String(existingNotes.prDifficulty || "");
    difficultySelect.appendChild(option);
  });
  difficultySelect.value = String(existingNotes.prDifficulty || "");
  difficultySelect.dataset.originalValue = difficultySelect.value;
  difficultySelect.addEventListener("change", () => updateSaveBtn());
  difficultyLabel.appendChild(difficultySelect);
  section.appendChild(difficultyLabel);

  const rallyStoriesInitialValues = normalizeNotesListForUi(existingNotes.rallyStories);
  const rallyStoriesField = createMultiEntryField({
    document,
    title: "Rally stories",
    placeholder: "US12345",
    values: rallyStoriesInitialValues,
    inputClassName: "pr-notes-rally-story-input",
    onChange: () => updateSaveBtn(),
  });
  section.appendChild(rallyStoriesField.label);

  const rallyLinksInitialValues = normalizeNotesListForUi(existingNotes.rallyLinks);
  const rallyLinksField = createMultiEntryField({
    document,
    title: "Rally links",
    placeholder: "https://rally.example/US12345",
    values: rallyLinksInitialValues,
    inputClassName: "pr-notes-rally-link-input",
    onChange: () => updateSaveBtn(),
  });
  section.appendChild(rallyLinksField.label);

  const analysisLabel = document.createElement("label");
  analysisLabel.className = "pr-notes-label";
  analysisLabel.textContent = "Analysis of PR";
  const analysisTextarea = document.createElement("textarea");
  analysisTextarea.className = "pr-notes-textarea";
  analysisTextarea.rows = 4;
  analysisTextarea.placeholder = "PR analysis...";
  analysisTextarea.value = String(existingNotes.analysisOfPr || "");
  analysisTextarea.dataset.originalValue = analysisTextarea.value;
  analysisTextarea.addEventListener("input", () => {
    autoResizeTextarea(analysisTextarea);
    updateSaveBtn();
  });
  analysisLabel.appendChild(analysisTextarea);
  section.appendChild(analysisLabel);

  // ── Save ────────────────────────────────────────────────────────────────
  const statusEl = document.createElement("span");
  statusEl.className = "pr-notes-status";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "pr-notes-save";
  saveBtn.textContent = "Save notes";
  saveBtn.disabled = true;
  let originalRallyStoriesValues = rallyStoriesField.getValues();
  let originalRallyLinksValues = rallyLinksField.getValues();
  updateSaveBtn = () => {
    const hasUnsavedChanges = hasNotesChanges({
      commentRows,
      originalCommentCount,
      otherTextarea,
      difficultySelect,
      analysisTextarea,
      rallyStoriesField,
      rallyLinksField,
      originalRallyStoriesValues,
      originalRallyLinksValues,
    });
    saveBtn.disabled = !hasUnsavedChanges;
    section.dataset.hasUnsavedNotes = hasUnsavedChanges ? "true" : "false";
    recomputeDirtyPrSectionsFields();
  };
  saveBtn.onclick = async () => {
    saveBtn.disabled = true;
    statusEl.textContent = "Saving...";
    try {
      const rallyStories = rallyStoriesField.getValues();
      const rallyLinks = rallyLinksField.getValues();
      const notesPayload = buildNotesPayload({
        commentRows,
        otherNotes: otherTextarea.value,
        prDifficulty: difficultySelect.value,
        rallyStories,
        rallyLinks,
        analysisOfPr: analysisTextarea.value,
      });
      const { response, result } = await postJson("/view-prs/notes", {
        prNumber,
        repo,
        ...notesPayload,
      });
      if (!response.ok || result.ok === false) {
        statusEl.textContent = `Save failed: ${result.error || "unknown error"}`;
        return;
      }
      if (entry) {
        entry.notes = notesPayload;
      }
      // Re-stamp saved values as the new originals so dirty tracking resets.
      stampOriginalCommentValues(commentRows);
      originalCommentCount = commentRows.length;
      otherTextarea.dataset.originalValue = otherTextarea.value;
      difficultySelect.dataset.originalValue = difficultySelect.value;
      originalRallyStoriesValues = rallyStories;
      originalRallyLinksValues = rallyLinks;
      analysisTextarea.dataset.originalValue = analysisTextarea.value;
      if (result.prData) {
        latestStoredPayload = result.prData;
        applyFiltersFromCache();
      }
      statusEl.textContent = "Saved.";
      setTimeout(() => {
        statusEl.textContent = "";
      }, 3000);
    } catch (_err) {
      statusEl.textContent = "Save failed.";
    } finally {
      updateSaveBtn();
    }
  };

  section.appendChild(saveBtn);
  section.appendChild(statusEl);
  updateSaveBtn();
  return section;
};

const normalizeRows = (rows) =>
  rows.sort((a, b) => {
    const orderA = Number.isFinite(Number(a?.rowOrder))
      ? Number(a.rowOrder)
      : Number.MAX_SAFE_INTEGER;
    const orderB = Number.isFinite(Number(b?.rowOrder))
      ? Number(b.rowOrder)
      : Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return Number(b?.prNumber || 0) - Number(a?.prNumber || 0);
  });

const parseSortableTime = (value) => {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
};

const sortRowsByDateFieldDesc = (rows, fieldName) =>
  rows.sort((a, b) => {
    const dateA = parseSortableTime(a?.data?.[fieldName]);
    const dateB = parseSortableTime(b?.data?.[fieldName]);
    if (dateA !== dateB) return dateB - dateA;
    return Number(b?.prNumber || 0) - Number(a?.prNumber || 0);
  });

const sortRowsByPrNumberDesc = (rows) =>
  rows.sort((a, b) => {
    const prA = Number(a?.data?.number || a?.prNumber || 0);
    const prB = Number(b?.data?.number || b?.prNumber || 0);
    return prB - prA;
  });

const parseCsvTokens = (rawValue) =>
  String(rawValue || "")
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);

const getLabelName = (label) => {
  if (typeof label === "string") {
    return String(label || "").trim();
  }
  if (label && typeof label === "object") {
    return String(label.name || "").trim();
  }
  return "";
};

const extractRowLabelNames = (row = {}) =>
  (Array.isArray(row?.labels) ? row.labels : [])
    .map((label) => getLabelName(label))
    .filter(Boolean);

const parsePrNumbersInput = (rawValue) =>
  formParsingHelpers?.parsePrNumbersInput
    ? formParsingHelpers.parsePrNumbersInput(rawValue)
    : parseCsvTokens(rawValue).filter((value) => /^\d+$/.test(String(value)));

const getPrNumbersInput = () => document.getElementById("pr-numbers");

const getSelectedPrNumbers = () =>
  parsePrNumbersInput(getPrNumbersInput().value);

const setSelectedPrNumbers = (prNumbers) => {
  getPrNumbersInput().value = prNumbers.join(",");
};

const handlePrNumbersInputChange = () => {
  const prNumbersInput = getPrNumbersInput();
  if (!String(prNumbersInput?.value || "").trim()) {
    prNumbersInput.value = "";
  }

  syncSelectionCheckboxesWithInput();
};

const syncSelectionCheckboxesWithInput = () => {
  const selectedPrNumbers = new Set(getSelectedPrNumbers());
  const sectionsHost = document.getElementById("pr-sections");

  const visit = (node) => {
    if (!node || typeof node !== "object") return;

    const className = String(node.className || "");
    if (className.includes("row-select-checkbox")) {
      const prNumber = String(
        node.getAttribute?.("data-pr-number") || "",
      ).trim();
      node.checked = selectedPrNumbers.has(prNumber);
    }

    const children = node.children ? Array.from(node.children) : [];
    children.forEach(visit);
  };

  visit(sectionsHost);
};

const updateSelectedPrNumbers = (prNumber, shouldSelect) => {
  const current = getSelectedPrNumbers();
  const normalizedPrNumber = String(prNumber || "").trim();
  if (!/^\d+$/.test(normalizedPrNumber)) {
    return;
  }

  const next = shouldSelect
    ? current.includes(normalizedPrNumber)
      ? current
      : [...current, normalizedPrNumber]
    : current.filter((value) => value !== normalizedPrNumber);

  setSelectedPrNumbers(next);
  syncSelectionCheckboxesWithInput();
};

const normalizeFilterToken = (value) =>
  String(value || "")
    .trim()
    .replace(/[\u2018\u2019]/g, "'")
    .toLowerCase();

// Phase 6 (see REACT_MIGRATION_PLAN.md): "always-show-in-review" is
// migrated onto FilterStateProvider's Context (FILTER_STATE_FIELD_MAP) -
// prefer it via getFilterStateOverrideForFieldId when mounted, falling
// back to the original DOM read otherwise (same handled/fallback shape as
// every other Phase 2/3 bridge, so this keeps working before React
// loads/mounts).
const shouldAlwaysShowInReviewRows = () => {
  const override = getFilterStateOverrideForFieldId("always-show-in-review");
  if (typeof override === "boolean") {
    return override;
  }
  return Boolean(getOptionalElementById("always-show-in-review")?.checked);
};

const rowMatchesUiFilters = (entry, filters) => {
  const row = entry?.data || {};
  const labels = extractRowLabelNames(row)
    .map((label) => normalizeFilterToken(label))
    .filter(Boolean);
  const prNumber = String(row.number || entry?.prNumber || "").trim();
  const authorLogin = getPreferredActorKey(row.authorLogin, row.author);
  const assignedLogins = collectAssignedUsers(row).map((user) => user.login);
  const approverLogins = collectApproversFromRow(row).map((user) => user.login);

  if (filters.alwaysShowInReview && isInReviewEnabled(row)) {
    return true;
  }

  if (filters.prNumbers.length > 0 && !filters.prNumbers.includes(prNumber)) {
    return false;
  }

  if (filters.prNumbers.length > 0) {
    return true;
  }

  if (
    filters.includeLabels.length > 0 &&
    !filters.includeLabels.some((label) =>
      labels.includes(normalizeFilterToken(label)),
    )
  ) {
    return false;
  }

  if (
    filters.excludeLabels.length > 0 &&
    filters.excludeLabels.some((label) =>
      labels.includes(normalizeFilterToken(label)),
    )
  ) {
    return false;
  }

  if (
    filters.authorLogins.length > 0 &&
    !filters.authorLogins.includes(authorLogin)
  ) {
    return false;
  }

  if (
    filters.assignedLogins.length > 0 &&
    !filters.assignedLogins.some((login) => assignedLogins.includes(login))
  ) {
    return false;
  }

  if (
    filters.approverLogins.length > 0 &&
    !filters.approverLogins.some((login) => approverLogins.includes(login))
  ) {
    return false;
  }

  const notesSummary = getManualNotesFieldSummary(entry, row);

  if (filters.customComments === "with" && !notesSummary.hasCustomComments) {
    return false;
  }
  if (filters.customComments === "without" && notesSummary.hasCustomComments) {
    return false;
  }

  if (filters.otherNotes === "with" && !notesSummary.hasOtherNotes) {
    return false;
  }
  if (filters.otherNotes === "without" && notesSummary.hasOtherNotes) {
    return false;
  }

  if (filters.prDifficulty === "not-set" && notesSummary.hasDifficulty) {
    return false;
  }
  if (
    filters.prDifficulty &&
    filters.prDifficulty !== "not-set" &&
    notesSummary.difficultyLevelText !== filters.prDifficulty
  ) {
    return false;
  }

  if (filters.rallyStories === "with" && !notesSummary.hasRallyStories) {
    return false;
  }
  if (filters.rallyStories === "without" && notesSummary.hasRallyStories) {
    return false;
  }

  if (filters.rallyLinks === "with" && !notesSummary.hasRallyLinks) {
    return false;
  }
  if (filters.rallyLinks === "without" && notesSummary.hasRallyLinks) {
    return false;
  }

  if (filters.analysisOfPr === "with" && !notesSummary.hasAnalysisOfPr) {
    return false;
  }
  if (filters.analysisOfPr === "without" && notesSummary.hasAnalysisOfPr) {
    return false;
  }

  return true;
};

const ensureDefaultFilterValues = () => {};

// Phase 6 (see REACT_MIGRATION_PLAN.md): renderPrData's two genuine
// mount-failure branches used to fall back to a full vanilla table build,
// treating a real React failure the same as the merely-not-loaded-yet
// race. That vanilla table-build code has been removed - a real mount
// failure (React threw while rendering, or its bundle never finished
// loading at all) means the whole app is likely broken well beyond the
// table, and a one-shot vanilla snapshot wouldn't get live updates from
// there anyway, so this just surfaces a minimal, honest error state
// instead of pretending to recover.
const renderPrTableMountError = () => {
  const container = getOptionalElementById("pr-sections");
  if (!container) return;
  container.innerHTML =
    '<p class="pr-table-mount-error">Failed to load the PR table. Please refresh the page.</p>';
};

// Track C, slice C2b (post-Phase-6 follow-up, see REACT_MIGRATION_PLAN.md):
// replaces react-mount-bridge.js (deleted, along with its dedicated test
// file) - that module was just a thin wrapper around
// window.mountReactPrTable/window.updateReactPrTable (both still owned and
// exposed by react-app.jsx) plus an isMounted() flag and a console-logging
// layer; inlining it here removes one indirection layer with identical
// behavior. Its unmount() was confirmed dead code (no production caller
// anywhere in the app) and isn't ported.
let reactTableMounted = false;

const mountReactTable = (container, initialData, callbacks) => {
  if (!container) {
    console.error("[ReactBridge] Cannot mount: no container element");
    return false;
  }
  if (typeof window.mountReactPrTable !== "function") {
    console.error(
      "[ReactBridge] mountReactPrTable not available - is react-app.jsx loaded?",
    );
    return false;
  }

  try {
    container.innerHTML = "";
    window.mountReactPrTable(container, {
      initialPayload: initialData.payload || {},
      selectedRepo: initialData.selectedRepo || "",
      visiblePrNumbers: initialData.visiblePrNumbers || null,
      onCheckboxChange: callbacks.onCheckboxChange || (() => {}),
      onAckAction: callbacks.onAckAction || (() => {}),
      onApplyLabel: callbacks.onApplyLabel || (() => {}),
    });
    reactTableMounted = true;
    return true;
  } catch (error) {
    console.error("[ReactBridge] Error mounting React:", error);
    return false;
  }
};

const updateReactTable = (payload, selectedRepo, visiblePrNumbers) => {
  if (!reactTableMounted || typeof window.updateReactPrTable !== "function") {
    console.warn(
      "[ReactBridge] Cannot update: React not mounted or update callback unavailable",
    );
    return;
  }

  try {
    window.updateReactPrTable(payload, selectedRepo, visiblePrNumbers);
  } catch (error) {
    console.error("[ReactBridge] Error updating React:", error);
  }
};

const isReactTableMounted = () => reactTableMounted;

// Applies the render pipeline's actually-resolved repo (payload.repo ||
// #repo input value || lastRun.repo - see deriveRepoRunContext) to
// latestSelectedRepo/the label-refresh trigger. Pulled out of renderPrData
// so both the React and non-React-yet branches (which each separately call
// prDataTabOrchestrator.renderPrData) apply it identically, instead of only
// the caller-supplied `selectedRepo` (frequently empty - e.g. the initial
// page-load render passes ""), which is what let latestSelectedRepo/the
// React table's own selectedRepo prop stay empty indefinitely, silently
// falling back to lastRun.repo (whichever repo the background scheduler
// most recently refreshed - not necessarily the user's configured repo)
// while the just-computed visiblePrNumbers filter still reflected the
// correct repo, filtering every row out.
const applyResolvedRepo = (resolvedRepo) => {
  if (!resolvedRepo) {
    return;
  }
  latestSelectedRepo = resolvedRepo;
  if (shouldRefetchLabelsForRepo({ repo: resolvedRepo, lastFetchedRepo: labelsFetchedForRepo })) {
    labelsFetchedForRepo = resolvedRepo;
    void refreshAvailableRepoLabels(resolvedRepo);
  }
};

const renderPrData = (payload, selectedRepo = "", options = {}) => {
  // Update global state
  if (payload) {
    latestStoredPayload = payload;
  }

  // Get container element
  const container = document.getElementById('pr-sections');
  if (!container) {
    console.error('[renderPrData] pr-sections container not found');
    return;
  }

  // Check if React is available
  const hasReactApp = window.mountReactPrTable && typeof window.mountReactPrTable === 'function';

  if (!hasReactApp) {
    // Phase 6 (see REACT_MIGRATION_PLAN.md): this branch used to run the
    // full vanilla table-build fallback whenever React's deferred module
    // hadn't loaded/mounted yet - covering both a genuine React failure
    // and the ordinary load-order race (react-app.jsx not done loading
    // when the first payload arrives). With vanilla fallback markup now
    // gone from Phase 2/3's fields, and per explicit sign-off to accept a
    // brief empty #pr-sections during that race rather than keep building
    // a whole vanilla table just to immediately discard/replace it once
    // React does mount, this now only runs the pipeline's side effects
    // (skipTableRender: true - same call shape the React path below uses)
    // and leaves the table itself empty. The `viewprs:react-ready`
    // listener (below) re-invokes renderPrData once React actually
    // mounts, taking the REACT RENDERING PATH at that point. Note this is
    // distinct from the "mount failed"/"callbacks failed" branches
    // further down, which stay as genuine vanilla-fallback recovery for a
    // real React failure, not this race.
    const preReactRenderResult = prDataTabOrchestrator.renderPrData(payload, selectedRepo, {
      ...options,
      skipTableRender: true,
    });
    applyResolvedRepo(preReactRenderResult?.repoFilter || selectedRepo);
    return;
  }

  // ========================================
  // REACT RENDERING PATH
  // ========================================

  // The React table renders the PR rows/sections itself, but everything
  // else the vanilla pipeline normally does as a side effect of building
  // that table — the data-meta summary line, filter chips, export field
  // catalog, author insights panel, stats view, and the filter dropdown
  // options (label/author/assigned/approver/thread-resolution/change-filter
  // actor lists) — still needs to run. Run the full vanilla pipeline with
  // skipTableRender so it performs those side effects without building or
  // appending its own <table> markup into #pr-sections (which React owns).
  // Phase 5 (see REACT_MIGRATION_PLAN.md, "Performance Validation"): this
  // pipeline call already populates the filter dropdowns as one of those
  // side effects (deriveViewerFilterSetup -> populateFilterOptions, inside
  // deriveRenderPipelineState) - a second, separate
  // populateFilterDropdownsForCurrentPayload() call used to run right
  // after this one, re-deriving and re-populating the exact same 9 lists
  // a second time. Its own doc comment explained it as covering a case
  // where "the React render path... never runs that pipeline" - true of
  // an earlier architecture where the React path bypassed the orchestrator
  // entirely, no longer true now that it's called (with skipTableRender)
  // right above. Removed as a confirmed duplicate, not a real second
  // effect - verified via the full jest suite and 3 e2e runs (including
  // the multi-select persisted-restore tests, the ones most likely to
  // reveal a regression if this had been secretly load-bearing).
  const renderPipelineResult = prDataTabOrchestrator.renderPrData(payload, selectedRepo, {
    ...options,
    skipTableRender: true,
  });
  const resolvedRepo = renderPipelineResult?.repoFilter || selectedRepo || latestSelectedRepo || '';
  applyResolvedRepo(resolvedRepo);
  // The filtered set the vanilla pipeline just computed (scope, PR-number,
  // label, author, assigned, approver filters) - React must be told which
  // PR numbers passed, or it falls back to showing every stored PR for the
  // repo regardless of the active local filters.
  const visiblePrNumbers = Array.isArray(renderPipelineResult?.filteredRows)
    ? renderPipelineResult.filteredRows
        .map((entry) => String(entry?.data?.number ?? entry?.prNumber ?? ""))
        .filter(Boolean)
    : null;

  // Check if already mounted
  if (isReactTableMounted()) {
    // Already mounted: just update data
    updateReactTable(
      latestStoredPayload || payload,
      resolvedRepo,
      visiblePrNumbers
    );
    return;
  }

  // First time: mount React
  // Create callbacks
  const callbacks = createReactCallbacks();
  if (!callbacks) {
    console.error('[renderPrData] Failed to create React callbacks - cannot mount table');
    renderPrTableMountError();
    return;
  }

  // Mount React
  const success = mountReactTable(
    container,
    {
      payload: latestStoredPayload || payload || {},
      selectedRepo: resolvedRepo,
      visiblePrNumbers,
    },
    {
      onCheckboxChange: callbacks.handleCheckboxChange,
      onAckAction: callbacks.handleAckAction,
      onApplyLabel: callbacks.handleApplyLabel,
    }
  );

  if (!success) {
    console.error('[renderPrData] React mount failed - cannot render table');
    renderPrTableMountError();
  }
};

// Track C, slice C2a (post-Phase-6 follow-up, see REACT_MIGRATION_PLAN.md):
// the *only* other way React's PR table gets new data besides the full
// renderPrData pipeline above - a deliberate perf optimization used by the
// checkbox/Ack/Apply-Label React callbacks and the label-dropdown refresh,
// which push a mutated latestStoredPayload straight to the mounted React
// table without re-running the whole orchestrator pipeline (stats/filter-
// dropdown/export-catalog/author-insights side effects), since none of
// that changed. Previously this exact three-line check was duplicated
// inline at two call sites; consolidating it here means moving the payload
// itself into Context/hooks later only has to change what happens *inside*
// this one function, not hunt down every direct call site across the file.
const pushPayloadToReactTable = (payload, repo) => {
  if (isReactTableMounted()) {
    updateReactTable(payload, repo);
  }
};

const setExportStatus = (message) => {
  const node = getOptionalElementById("export-status");
  if (node) {
    node.textContent = String(message || "");
  }
};

const getExportFieldCheckboxes = () => {
  const host = getOptionalElementById("export-field-list");
  if (!host) return [];
  return collectNodesByTag(host, "input").filter(
    (node) =>
      String(node?.type || "").toLowerCase() === "checkbox" &&
      Boolean(readElementAttribute(node, "data-export-field-id").trim()),
  );
};

const getSelectedExportFieldPaths = () => {
  const dataPaths = [];
  const userStatePaths = [];

  getExportFieldCheckboxes().forEach((checkbox) => {
    if (!checkbox.checked) return;
    const source = readElementAttribute(checkbox, "data-export-source").trim();
    const path = readElementAttribute(checkbox, "data-export-path").trim();
    if (!path) return;
    if (source === "user-state") {
      userStatePaths.push(path);
      return;
    }
    dataPaths.push(path);
  });

  return {
    dataPaths,
    userStatePaths,
  };
};

const persistExportFieldSelections = async () => {
  const selected = getSelectedExportFieldPaths();
  pendingExportDataFieldSelections = [...selected.dataPaths];
  pendingExportUserStateFieldSelections = [...selected.userStatePaths];

  const existingOverrides = await readUiSessionOverrides();
  const overrides = { ...existingOverrides };
  overrides[EXPORT_DATA_FIELDS_OVERRIDE_KEY] = [...selected.dataPaths];
  overrides[EXPORT_USER_STATE_FIELDS_OVERRIDE_KEY] = [
    ...selected.userStatePaths,
  ];

  await writeUiSessionOverrides(overrides, {
    preserveEmptyArrayKeys: [
      EXPORT_DATA_FIELDS_OVERRIDE_KEY,
      EXPORT_USER_STATE_FIELDS_OVERRIDE_KEY,
    ],
  });

  return selected;
};

const renderExportSelectionSummary = ({
  dataCount = 0,
  userStateCount = 0,
  visibleCount = 0,
  totalVisibleCount = 0,
  openSectionsCount = 0,
} = {}) => {
  const summaryNode = getOptionalElementById("export-selection-summary");
  if (!summaryNode) return;

  summaryNode.textContent = [
    `Selected fields: ${dataCount} data + ${userStateCount} user state`,
    `Visible PR rows eligible for export: ${visibleCount}/${totalVisibleCount}`,
    `Expanded PR sections: ${openSectionsCount}`,
  ].join("\n");
};

const setExportCheckboxSelection = (predicate) => {
  const checkboxes = getExportFieldCheckboxes();
  checkboxes.forEach((checkbox) => {
    checkbox.checked = Boolean(predicate(checkbox));
  });
  void updateExportPreviewSummary();
};

const renderExportFieldCatalog = (payload = {}) => {
  const listNode = getOptionalElementById("export-field-list");
  if (!listNode) return;

  const previousSelection = new Set(
    getExportFieldCheckboxes()
      .filter((node) => node.checked)
      .map((node) => readElementAttribute(node, "data-export-field-id").trim())
      .filter(Boolean),
  );
  const hasSavedSelection =
    Array.isArray(pendingExportDataFieldSelections) ||
    Array.isArray(pendingExportUserStateFieldSelections);
  const savedSelection = new Set([
    ...(
      Array.isArray(pendingExportDataFieldSelections)
        ? pendingExportDataFieldSelections
        : []
    ).map((path) => `data:${path}`),
    ...(
      Array.isArray(pendingExportUserStateFieldSelections)
        ? pendingExportUserStateFieldSelections
        : []
    ).map((path) => `user-state:${path}`),
  ]);

  exportFieldCatalog = getExportFieldCatalog(payload);
  const dataPaths = Array.isArray(exportFieldCatalog?.dataPaths)
    ? exportFieldCatalog.dataPaths
    : [];
  const userStatePaths = Array.isArray(exportFieldCatalog?.userStatePaths)
    ? exportFieldCatalog.userStatePaths
    : [];
  const allFieldIds = [
    ...dataPaths.map((path) => `data:${path}`),
    ...userStatePaths.map((path) => `user-state:${path}`),
  ];
  const shouldPreferSavedSelectionOverPrevious =
    hasSavedSelection &&
    allFieldIds.length > 0 &&
    previousSelection.size === allFieldIds.length &&
    allFieldIds.every((fieldId) => previousSelection.has(fieldId));
  const shouldUsePreviousSelection =
    previousSelection.size > 0 && !shouldPreferSavedSelectionOverPrevious;

  listNode.innerHTML = "";
  const buildOption = (source, path) => {
    const label = document.createElement("label");
    label.className = "export-field-option";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    const fieldId = `${source}:${path}`;
    checkbox.setAttribute("data-export-field-id", fieldId);
    checkbox.setAttribute("data-export-source", source);
    checkbox.setAttribute("data-export-path", path);
    checkbox.checked =
      shouldUsePreviousSelection
        ? previousSelection.has(fieldId)
        : hasSavedSelection
          ? savedSelection.has(fieldId)
          : true;
    checkbox.addEventListener("change", () => {
      void updateExportPreviewSummary();
    });

    const text = document.createElement("span");
    const sourceToken =
      source === "user-state"
        ? '<span class="export-field-option-source">USER</span>'
        : '<span class="export-field-option-source">DATA</span>';
    text.innerHTML = `${sourceToken}${escapeHtml(path)}`;

    label.appendChild(checkbox);
    label.appendChild(text);
    return label;
  };

  dataPaths.forEach((path) => {
    listNode.appendChild(buildOption("data", path));
  });
  userStatePaths.forEach((path) => {
    listNode.appendChild(buildOption("user-state", path));
  });

  if (dataPaths.length === 0 && userStatePaths.length === 0) {
    const empty = document.createElement("p");
    empty.className = "stats-empty";
    empty.textContent = "No exportable fields found in current payload.";
    listNode.appendChild(empty);
  }

  void updateExportPreviewSummary();
};

// Renders the pending auto-update payload once the user is no longer focused on an input/textarea.
// Re-attaches itself as a blur listener if focus moves to another field.
const flushPendingAutoRender = () => {
  setTimeout(() => {
    const action = getPendingAutoRenderAction({
      pendingPayload: pendingAutoRenderPayload,
      focusedElement: document.activeElement,
      hasDirtyPrSectionsFields,
    });
    if (action.type === "none") {
      renderAutoRenderBlockedIndicator();
      return;
    }
    if (action.type === "wait-for-blur") {
      document.activeElement?.addEventListener?.("blur", flushPendingAutoRender, {
        once: true,
      });
      renderAutoRenderBlockedIndicator();
      return;
    }
    if (action.type === "wait-for-clean") {
      renderAutoRenderBlockedIndicator();
      return;
    }
    flushPendingAutoRenderNow();
  }, 0);
};

const pollForDataChanges = async () => {
  const pollAttemptedAt = new Date().toISOString();
  try {
    let latestVersion = "";
    let shouldTryManifestDelta = false;
    let dataResult = null;

    if (supportsDataMetaPolling) {
      const metaResponse = await fetch("/view-prs/data-meta");
      if (metaResponse.status === 404) {
        supportsDataMetaPolling = false;
      } else {
        const metaResult = await metaResponse.json();
        if (!metaResponse.ok || metaResult.ok === false) {
          throw new Error(
            metaResult?.error ||
              `Polling metadata request failed (HTTP ${metaResponse.status || "unknown"})`,
          );
        }

        latestVersion = String(metaResult?.dataVersion || "").trim();
        if (!latestVersion || latestVersion === lastSeenDataVersion) {
          markPollSuccess(pollAttemptedAt);
          return;
        }

        if (
          metaResult?.supportsDataManifest === true &&
          supportsDataManifestPolling &&
          latestStoredPayload
        ) {
          shouldTryManifestDelta = true;
        }
      }
    }

    if (shouldTryManifestDelta) {
      const manifestResponse = await fetch("/view-prs/data-manifest");
      if (manifestResponse.status === 404) {
        supportsDataManifestPolling = false;
      } else {
        const manifestResult = await manifestResponse.json();
        if (manifestResponse.ok && manifestResult?.ok !== false) {
          const nextManifest = manifestResult?.manifest || {};
          const previousManifest =
            latestPrManifest && Object.keys(latestPrManifest).length > 0
              ? latestPrManifest
              : computePrDataManifest(latestStoredPayload);
          const manifestDelta = getManifestDelta({
            previousManifest,
            nextManifest,
          });

          if (!manifestDelta.hasChanges) {
            latestPrManifest = nextManifest;
            const manifestVersion = String(
              manifestResult?.dataMeta?.dataVersion || latestVersion,
            ).trim();
            if (manifestVersion) {
              lastSeenDataVersion = manifestVersion;
            }
            markPollSuccess(pollAttemptedAt);
            return;
          }

          const deltaResponse = await fetch("/view-prs/data-delta", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prNumbers: manifestDelta.changedPrNumbers }),
          });
          const deltaResult = await deltaResponse.json();
          if (deltaResponse.ok && deltaResult?.ok !== false) {
            dataResult = mergeDataDeltaPayload({
              basePayload: latestStoredPayload,
              deltaByPrNumber: deltaResult?.byPrNumber || {},
              removedPrNumbers: manifestDelta.removedPrNumbers,
              nextDataMeta: manifestResult?.dataMeta || null,
              nextScheduler: deltaResult?.scheduler || null,
              nextLastRun: deltaResult?.lastRun || null,
              nextManifest,
            });
            latestPrManifest = nextManifest;
          }
        }
      }
    }

    if (!dataResult) {
      const response = await fetch("/view-prs/data");
      const result = await response.json();
      if (!response.ok || result.ok === false) {
        throw new Error(
          result?.error ||
            `Polling data request failed (HTTP ${response.status || "unknown"})`,
        );
      }
      dataResult = result;
    }

    const fullDataVersion = String(
      dataResult?.dataMeta?.dataVersion || latestVersion,
    ).trim();
    if (fullDataVersion && fullDataVersion === lastSeenDataVersion) {
      markPollSuccess(pollAttemptedAt);
      return;
    }
    if (fullDataVersion) {
      lastSeenDataVersion = fullDataVersion;
    }

    const latestStamp = String(dataResult?.lastRun?.updatedAt || "").trim();
    latestStoredPayload = dataResult;
    latestPrManifest =
      dataResult?.dataManifest || computePrDataManifest(dataResult);

    const newFingerprint = computePrDataFingerprint(dataResult);
    const newMetaFingerprint = computePrDataMetaFingerprint(dataResult);
    const renderAction = getDataPollRenderAction({
      newFingerprint,
      lastRenderedPrFingerprint,
      newMetaFingerprint,
      lastRenderedMetaFingerprint,
      focusedElement: document.activeElement,
      hasDirtyPrSectionsFields,
      hasPendingAutoRender: pendingAutoRenderPayload != null,
      result: dataResult,
    });
    if (renderAction.type === "skip-render") {
      return;
    }

    if (
      renderAction.type === "queue-render" ||
      renderAction.type === "queue-render-and-listen"
    ) {
      pendingAutoRenderPayload = renderAction.payload;
      renderAutoRenderBlockedIndicator();
      if (renderAction.type === "queue-render-and-listen") {
        document.activeElement?.addEventListener?.("blur", flushPendingAutoRender, {
          once: true,
        });
      }
      markPollSuccess(pollAttemptedAt);
      return;
    }

    lastRenderedPrFingerprint = newFingerprint;
    lastRenderedMetaFingerprint = newMetaFingerprint;
    renderPrData(renderAction.payload);
    markPollSuccess(pollAttemptedAt);

    if (latestStamp && latestStamp !== lastRenderedRunStamp) {
      lastRenderedRunStamp = latestStamp;
      setStatusMessage(`Auto-updated from latest run at ${latestStamp}`);
      return;
    }

    setStatusMessage("Auto-updated from latest stored data changes");
  } catch (error) {
    showPollFailureWarning({
      errorSource: error,
      attemptedAt: pollAttemptedAt,
    });
  }
};

const pollBackfillStatus = async () => {
  if (!isBackfillRunning || isBackfillActionPending) {
    return;
  }

  try {
    await loadBackfillStatus({ announce: true, includeLog: true });
  } catch (_error) {
    // Ignore polling failures and wait for the next interval.
  }
};

const pollSchedulerStatus = async () => {
  if (!supportsSchedulerPolling) {
    return;
  }

  try {
    await loadSchedulerStatus();
  } catch (_error) {
    // Ignore polling failures and wait for the next interval.
  }
};

// Track C, slice C1 (post-Phase-6 follow-up, see REACT_MIGRATION_PLAN.md):
// <PrDataPolling /> (react-app.jsx) now owns the setInterval lifecycle for
// these four functions (and the visibility-pause/beforeunload-cleanup
// behavior that used to live in index.page.js's cleanupIntervals/
// restartIntervals) - it calls them via these bridges on the same cadence
// (AUTO_DATA_POLL_MS/AUTO_BACKFILL_POLL_MS, also exposed here so the
// interval timing has one source of truth). The functions themselves are
// unchanged; only *what decides when they run* moved.
if (typeof window !== "undefined") {
  window.pollForDataChanges = (...args) => pollForDataChanges(...args);
  window.pollSchedulerStatus = (...args) => pollSchedulerStatus(...args);
  window.pollBackfillStatus = (...args) => pollBackfillStatus(...args);
  window.renderRequestActivity = (...args) => renderRequestActivity(...args);
  window.AUTO_DATA_POLL_MS = AUTO_DATA_POLL_MS;
  window.AUTO_BACKFILL_POLL_MS = AUTO_BACKFILL_POLL_MS;
}

const getFormBody = () => {
  const form = document.getElementById("run-script-form");
  const formData = new FormData(form);
  const formProps = Object.fromEntries(formData);
  const prNumbersInput = formProps.prNumbers?.trim() || "";
  const parsedPrNumbers = parsePrNumbersInput(prNumbersInput);
  const normalizedPrNumbers = parsedPrNumbers.join(",");

  return {
    repo: formProps.repo?.trim() || "",
    prNumbersInput,
    prNumberList: parsedPrNumbers,
    prNumbers: normalizedPrNumbers,
    prNumber: parsedPrNumbers[0] || "",
    limit: formProps.limit?.trim() || "",
    mergedLimit: formProps.mergedLimit?.trim() || "",
    jobs: formProps.jobs?.trim() || "",
    openMode: formProps.openMode || "none",
    label: getSelectedIncludeLabelNames().join(", "),
    excludeLabel: getSelectedExcludeLabelNames().join(", "),
    author: getSelectedAuthorLogins().join(", "),
    ackChanged: toBoolean(formProps.ackChanged),
    showReason: toBoolean(formProps.showReason),
    quiet: toBoolean(formProps.quiet),
  };
};

const handleRunScript = async () => {
  const body = getFormBody();

  if (body.prNumbersInput && !body.prNumber) {
    setStatusMessage(
      'Run script requires numeric PR number(s) in "PR number(s)"',
    );
    return;
  }

  setStatusMessage("Running...");
  setOutputMessage("");
  const finishActivity = beginRequestActivity("runScript");

  try {
    const runTargets =
      Array.isArray(body.prNumberList) && body.prNumberList.length > 0
        ? body.prNumberList
        : [""];
    const outputChunks = [];
    const failures = [];
    const effectiveRepo = body.repo || DEFAULT_REPO;

    for (let index = 0; index < runTargets.length; index += 1) {
      const runTarget = runTargets[index];
      const runBody = {
        ...body,
        prNumber: runTarget || "",
      };

      const runLabel = runTarget ? `PR #${runTarget}` : "All PRs";
      setStatusMessage(
        `Running ${runLabel} (${index + 1}/${runTargets.length})...`,
      );

      const { response, result } = await postJson("/view-prs/run", runBody);

      outputChunks.push(`=== ${runLabel} ===`);
      outputChunks.push(
        formatCommandOutputWithAuthHint(result, {
          includeError: !response.ok || result?.ok === false,
        }) || "Script completed with no output.",
      );

      if (!response.ok || result.ok === false) {
        failures.push({
          prNumber: runTarget || "all",
          status: response.status,
        });
        continue;
      }

      const latestData = result.prData || null;
      if (latestData) {
        latestStoredPayload = latestData;
        latestSelectedRepo = effectiveRepo;
        renderPrData(latestData, effectiveRepo);
      }
    }

    if (failures.length > 0) {
      const successCount = runTargets.length - failures.length;
      const hasAuthFailure = outputChunks.some((chunk) =>
        chunk.toLowerCase().includes("auth hint:"),
      );
      setStatusMessage(
        hasAuthFailure
          ? `Completed with failures (${successCount}/${runTargets.length} successful) - GitHub auth/SSO required`
          : `Completed with failures (${successCount}/${runTargets.length} successful)`,
      );

      // Show error snackbar for failures
      const failureReason = hasAuthFailure
        ? "GitHub authentication or SSO required. Check the output below for authorization link."
        : "One or more requests failed. Check the output below for details.";
      const failureDetails = failures
        .map((f) => `${f.prNumber} (HTTP ${f.status})`)
        .join(", ");
      showErrorNotification(
        `Request failed for: ${failureDetails}`,
        failureReason,
        0,
      );
    } else {
      setStatusMessage("Completed");
    }

    setOutputMessage(
      outputChunks.join("\n\n") || "Script completed with no output.",
    );
    await loadStoredData(effectiveRepo);
  } catch (error) {
    setStatusMessage("Failed (network/error)");
    showErrorNotification(
      "Request failed",
      String(error || "An unknown error occurred"),
      0, // No auto-dismiss for errors
    );
    setOutputMessage(String(error));
  } finally {
    finishActivity();
  }
};

const runAckAction = async (payload, actionLabel) => {
  setStatusMessage(`${actionLabel}...`);
  setOutputMessage("");
  const finishActivity = beginRequestActivity("ackClear");

  try {
    const { response, result } = await postJson("/view-prs/ack", payload);

    if (!response.ok || result.ok === false) {
      const authHint = getGithubAuthFailureHint(result);
      setStatusMessage(
        authHint
          ? `Failed (${response.status}) - GitHub auth required`
          : `Failed (${response.status})`,
      );
      setOutputMessage(formatCommandOutputWithAuthHint(result));
      showErrorNotification(
        `${actionLabel} failed`,
        authHint
          ? "GitHub authentication or SSO required. Check the output below for authorization link."
          : `HTTP ${response.status}: Check the output below for details.`,
        0,
      );
      return;
    }

    setStatusMessage(`${actionLabel} completed`);
    setOutputMessage(
      formatCommandOutput(result, { includeError: false }) ||
        `${actionLabel} completed.`,
    );

    const warningSummary = summarizeAckRefreshWarnings(result?.refreshErrors);
    if (warningSummary) {
      showWarningNotification(
        `${actionLabel} completed with warnings (${warningSummary.summaryText})`,
        warningSummary.sample,
      );
    }

    if (result.prData) {
      renderPrData(result.prData, payload.repo || DEFAULT_REPO);
    } else {
      await loadStoredData(payload.repo || DEFAULT_REPO);
    }
  } catch (error) {
    setStatusMessage("Failed (network/error)");
    setOutputMessage(String(error));
    showErrorNotification(
      `${actionLabel} failed`,
      String(error || "An unknown error occurred"),
      0,
    );
  } finally {
    finishActivity();
  }
};

const runAckOnlyWorkflow = async (ackValue = "", repoOverride = "") => {
  const body = getFormBody();

  const ack = String(ackValue || body.prNumbers || "").trim();
  if (!ack) {
    setStatusMessage('Ack only requires numeric value(s) in "PR number(s)"');
    return;
  }

  const repo = String(repoOverride || body.repo || "").trim();
  await runAckAction({ repo, ack }, "Ack only");
};

const runClearOnlyWorkflow = async (ackClearValue = "", repoOverride = "") => {
  const body = getFormBody();

  const ackClear = String(ackClearValue || body.prNumbers || "").trim();
  if (!ackClear) {
    setStatusMessage('Clear only requires numeric value(s) in "PR number(s)"');
    return;
  }

  const repo = String(repoOverride || body.repo || "").trim();
  await runAckAction({ repo, ackClear }, "Clear only");
};

const handleAckOnly = async () => {
  await runAckOnlyWorkflow();
};

const handleClearOnly = async () => {
  await runClearOnlyWorkflow();
};

// ---- Apply existing GitHub labels to PRs (single-row select or bulk via
// the "Run & Filter" tab's PR-number selection) ----

let availableRepoLabels = [];
let isFetchingRepoLabels = false;

const getAvailableRepoLabels = () => availableRepoLabels;

const populateApplyLabelSelect = () => {
  const select = getOptionalElementById("apply-label-select");
  if (!select) {
    return;
  }

  const previousValue = select.value;
  select.innerHTML = "";

  const placeholderOption = document.createElement("option");
  placeholderOption.value = "";
  placeholderOption.textContent = availableRepoLabels.length
    ? "Choose a label..."
    : "No labels found for this repo";
  select.appendChild(placeholderOption);

  availableRepoLabels.forEach((label) => {
    const option = document.createElement("option");
    option.value = label.name;
    option.textContent = label.name;
    select.appendChild(option);
  });

  if (availableRepoLabels.some((label) => label.name === previousValue)) {
    select.value = previousValue;
  }
};

let labelsFetchedForRepo = "";

// Deliberately does NOT fall back to DEFAULT_REPO: that constant is only
// ever a placeholder/example value (see the "repo" field's `placeholder`
// in react-app.jsx) - it isn't guaranteed to be a repo this GitHub account
// can actually see, and eagerly querying `gh label list` against it on
// every page load produced a real 500 (repo not found) before the actual
// selected repo was even known yet. Pure so it's directly unit-testable
// via __testables without needing a DOM/fetch harness.
const resolveRepoForLabelsFetch = ({ repoOverride, currentRepo, repoInputValue } = {}) =>
  String(repoOverride || currentRepo || repoInputValue || "").trim();

// Avoids re-fetching the same repo's labels on every render/poll tick -
// only worth a network call when the resolved repo actually changed since
// the last successful (or attempted) fetch.
const shouldRefetchLabelsForRepo = ({ repo, lastFetchedRepo } = {}) =>
  Boolean(repo) && repo !== lastFetchedRepo;

const refreshAvailableRepoLabels = async (repoOverride) => {
  const repoInput = getOptionalElementById("repo");
  const repo = resolveRepoForLabelsFetch({
    repoOverride,
    currentRepo: latestSelectedRepo,
    repoInputValue: repoInput ? repoInput.value : "",
  });
  if (!repo || isFetchingRepoLabels) {
    return;
  }

  isFetchingRepoLabels = true;
  try {
    const response = await fetch(`/view-prs/labels?repo=${encodeURIComponent(repo)}`);
    const result = await response.json();
    if (response.ok && result?.ok !== false) {
      availableRepoLabels = Array.isArray(result.labels) ? result.labels : [];
      populateApplyLabelSelect();
      pushPayloadToReactTable(latestStoredPayload, latestSelectedRepo);
    }
  } catch (_error) {
    // Best-effort: leave any previously cached labels/options in place.
  } finally {
    isFetchingRepoLabels = false;
  }
};

const runApplyLabelAction = async ({ repo, label, prNumbers }, actionLabel) => {
  setStatusMessage(`${actionLabel}...`);
  setOutputMessage("");
  const finishActivity = beginRequestActivity("labelApply");

  try {
    const { response, result } = await postJson("/view-prs/labels/apply", {
      repo,
      label,
      prNumbers,
    });

    if (!response.ok || result.ok === false) {
      const authHint = getGithubAuthFailureHint(result);
      setStatusMessage(
        authHint
          ? `Failed (${response.status}) - GitHub auth required`
          : `Failed (${response.status})`,
      );
      setOutputMessage(formatCommandOutputWithAuthHint(result));
      showErrorNotification(
        `${actionLabel} failed`,
        authHint
          ? "GitHub authentication or SSO required. Check the output below for authorization link."
          : String(result?.error || `HTTP ${response.status}: Check the output below for details.`),
        0,
      );
      return;
    }

    setStatusMessage(result.summary || `${actionLabel} completed`);

    const combinedErrors = [
      ...(Array.isArray(result.applyErrors) ? result.applyErrors : []),
      ...(Array.isArray(result.refreshErrors) ? result.refreshErrors : []),
    ];
    if (combinedErrors.length) {
      showWarningNotification(
        `${actionLabel} completed with ${combinedErrors.length} error(s)`,
        combinedErrors
          .map((entry) => `#${entry.prNumber}: ${entry.error}`)
          .join("\n"),
      );
    }

    if (result.prData) {
      renderPrData(result.prData, repo || DEFAULT_REPO);
    } else {
      await loadStoredData(repo || DEFAULT_REPO);
    }
  } catch (error) {
    setStatusMessage("Failed (network/error)");
    setOutputMessage(String(error));
    showErrorNotification(
      `${actionLabel} failed`,
      String(error || "An unknown error occurred"),
      0,
    );
  } finally {
    finishActivity();
  }
};

const runApplyLabelWorkflow = async (prNumbersValue = "", labelValue = "", repoOverride = "") => {
  const body = getFormBody();

  const prNumbers = String(prNumbersValue || body.prNumbers || "").trim();
  if (!prNumbers) {
    setStatusMessage('Apply label requires numeric value(s) in "PR number(s)"');
    return;
  }

  const label = String(labelValue || "").trim();
  if (!label) {
    setStatusMessage("Choose a label to apply");
    return;
  }

  const repo = String(repoOverride || body.repo || "").trim();
  await runApplyLabelAction({ repo, label, prNumbers }, "Apply label");
};

const handleApplyLabelClick = async () => {
  const select = getOptionalElementById("apply-label-select");
  await runApplyLabelWorkflow("", select ? select.value : "", "");
};

/**
 * Create React callback helpers (lazy initialization)
 * This factory creates the callbacks that React uses to communicate with vanilla JS.
 */
let reactCallbacks = null;

function createReactCallbacks() {
  if (reactCallbacks) {
    return reactCallbacks;
  }

  // Check if React callbacks helper is available
  if (!window.ViewPrsReactCallbacksHelpers) {
    console.warn('[ReactIntegration] React callbacks helper not available');
    return null;
  }

  const helpers = window.ViewPrsReactCallbacksHelpers.createReactCallbackHelpers({
    // Pass vanilla JS functions
    toggleInReviewForRow: toggleInReviewForRow,
    toggleFlaggedForRow: toggleFlaggedForRow,
    runAckOnlyWorkflow: runAckOnlyWorkflow,
    runClearOnlyWorkflow: runClearOnlyWorkflow,
    runApplyLabelWorkflow: runApplyLabelWorkflow,

    // Update React table function - see pushPayloadToReactTable's own
    // comment (Track C, slice C2a, REACT_MIGRATION_PLAN.md) for why this
    // is a deliberately separate fast path from renderPrData.
    updateReactTable: pushPayloadToReactTable,

    // State getters
    stateGetters: {
      getLatestStoredPayload: () => latestStoredPayload,
      getLatestSelectedRepo: () => latestSelectedRepo,
    },
  });

  reactCallbacks = helpers;
  return helpers;
}

const initPage = () => {
  renderRequestActivity();
  ensureDefaultFilterValues();
  updateAuthorThreadResolutionRuleVisibility();
  void restoreUiOptionOverrides();
  // Phase 6 (see REACT_MIGRATION_PLAN.md): restoreUiOptionOverrides' first
  // call above almost always runs before react-app.jsx's deferred module
  // has mounted FilterStateProvider, so every Context-migrated field's
  // setFilterStateOverrideForFieldId call above is a no-op (no
  // window.setFilterStateValue yet) - and, now that Phase 2 removed the
  // vanilla fallback markup those fields' setText/setCheckbox used to fall
  // back to, there's no DOM element left to mutate either, so the restore
  // was silently dropped instead of merely falling back. Re-running once
  // React signals it's mounted (same event/pattern the PR table's
  // renderPrData retry above uses) picks the override values up for real;
  // this is idempotent with the first call.
  window.addEventListener(
    "viewprs:react-ready",
    () => {
      void restoreUiOptionOverrides().then(() => {
        // The "repo" field only actually restores here (see the comment
        // above): before React mounts it into #repo-root, it has no
        // Context and no DOM element to restore into, so the saved repo
        // isn't known yet on the first restoreUiOptionOverrides() call
        // above. Only fetch labels once the real configured repo (not the
        // placeholder DEFAULT_REPO) is available.
        void refreshAvailableRepoLabels();
      });
    },
    { once: true },
  );
  registerUiOptionPersistenceHandlers();
  initManagementTabs();
  initActorNameCacheControls();
  // Initialize PR Data Tab orchestrator (which calls initDataTabs internally)
  prDataTabOrchestrator.initialize();
  // Initialize Author Insights Tab orchestrator
  authorInsightsTabOrchestrator.initialize();
  // Initialize Backfill Tab orchestrator
  backfillTabOrchestrator.initialize();
  // Initialize Review Stats Tab orchestrator
  reviewStatsTabOrchestrator.initialize();
  applyNonCredentialFieldHints();
  setExportStatus("Waiting for data...");
  renderAutoRenderBlockedIndicator();

  const prSectionsHost = document.getElementById("pr-sections");
  
  // Debounce timer for input events to improve textarea performance
  let recomputeDirtyDebounceTimer = null;
  
  const recomputeDirtyOnEvent = (event) => {
    const tagName = String(event?.target?.tagName || "").toUpperCase();
    const isInputEvent = event?.type === "input";
    const isTextarea = tagName === "TEXTAREA";
    
    if (isInputEvent) {
      if (tagName !== "INPUT" && tagName !== "TEXTAREA") {
        return;
      }
      // Debounce input events for textareas to reduce lag while typing
      if (isTextarea) {
        if (recomputeDirtyDebounceTimer) {
          clearTimeout(recomputeDirtyDebounceTimer);
        }
        recomputeDirtyDebounceTimer = setTimeout(() => {
          recomputeDirtyPrSectionsFields();
        }, 300); // 300ms debounce - feels responsive but reduces computation
        return;
      }
    }
    if (event?.type === "change") {
      if (tagName !== "INPUT" && tagName !== "TEXTAREA" && tagName !== "SELECT") {
        return;
      }
    }
    if (event?.type === "click") {
      const className = String(event?.target?.className || "");
      if (!className.includes("pr-notes-")) {
        return;
      }
    }
    recomputeDirtyPrSectionsFields();
  };

  prSectionsHost.addEventListener("input", recomputeDirtyOnEvent);
  prSectionsHost.addEventListener("change", recomputeDirtyOnEvent);
  prSectionsHost.addEventListener("click", recomputeDirtyOnEvent);

  const applyNowBtn = getOptionalElementById("auto-render-blocked-apply-btn");
  if (applyNowBtn) {
    applyNowBtn.addEventListener("click", () => {
      forceApplyPendingAutoRender();
    });
  }

  // Expose the pure (non-DOM) row-rendering logic for the React hybrid
  // table (see components/PrRow.jsx and friends) so it can reproduce the
  // vanilla row/cell output exactly instead of guessing at field names and
  // formatting rules. These are plain functions with no DOM dependency;
  // React builds its own JSX elements and only borrows the *values*.
  Object.assign(window, {
    isChangedStatus,
    statusClass,
    approvedClass,
    formatTitleWithIcons,
    formatChkDisplay,
    getPreferredActorKey,
    collectPrAuthors,
    resolveActorDisplayName,
    buildRowActorsMap,
    normalizeActorLogin,
    collectAssignedUsers,
    collectRequestedReviewers,
    buildActorIdentityClassName,
    buildActorIdentityTitle,
    getEffectiveViewerLogin,
    getUserInitials,
    getOpenConversationCountWithMe,
    getManualNotesSummary,
    getManualNotesFieldSummary,
    buildPrLastCheckedIndicator,
    countPendingThreadComments,
    escapeHtml,
    getViewedFilesState,
    getViewedFilesSummary,
    getSelectedPrNumbers,
    updateSelectedPrNumbers,
    getLabelName,
    getAvailableRepoLabels,
    isInReviewEnabled,
    isFlaggedEnabled,
    shouldShowNeedsAttention,
    toCount,
    formatIsoDatetime,
    runSinglePrUpdate,
    // ---- "More insights" panel (see components/PrInsightsRow.jsx and
    // components/insights/*) ----
    parseMarkerState,
    buildRowActorsMap,
    formatApproversDisplay,
    formatRequestedReviewersDisplay,
    formatAssignedUsersDisplay,
    normalizeRowMetrics,
    getBadgeClassForStatus,
    getBadgeClassForCheck,
    getBadgeClassForMerge,
    formatReviewFootprint,
    formatConversationStatus,
    formatApprovalRisk,
    formatCommentUsefulness,
    buildActivityTimelineSummary,
    buildFallbackActivityEvents,
    buildActivityEventKey,
    normalizePrRootUrl,
    getAuthorThreadResolutionPolicy,
    parseSortableTime,
    readReviewConversationsUiState,
    writeReviewConversationsUiState,
    renderMarkdownAsHtml,
    buildPrPeopleOptions,
    noteAuthorMatchesSelection,
    normalizeNotesListForUi,
    getNotesDifficultyLevelText,
    formatDurationMinutes,
    postJson,
    asArray,
    autoResizeTextarea,
    recomputeDirtyPrSectionsFields,
    // ---- PR JSON modal (see components/PrJsonModal.jsx) ----
    safeJsonStringify,
    getPerPrUserStateFromPayload,
    DEFAULT_REPO,
    // ---- Row sorting (see components/PrTableApp.jsx) ----
    normalizeRows,
    sortRowsByPrNumberDesc,
    sortRowsByDateFieldDesc,
  });

  // The initial loadStoredData() fetch below often resolves before the
  // deferred react-app.jsx module (and its full import graph) finishes
  // loading, so the first renderPrData() call falls back to vanilla
  // rendering. Re-render once React signals it's actually ready.
  window.addEventListener(
    "viewprs:react-ready",
    () => {
      if (!isReactTableMounted()) {
        renderPrData(latestStoredPayload, latestSelectedRepo);
      }
    },
    { once: true },
  );

  loadStoredData("").catch((error) => {
    setStatusMessage("Failed to load stored data");
    document.getElementById("data-meta").textContent = "Failed to load.";
    setOutputMessage(String(error));
    notifyFailureSnackbar(
      "Failed to load stored data",
      error,
      "Unable to load stored PR data",
    );
  });
  loadBackfillStatus({ includeLog: true }).catch((error) => {
    renderBackfillStatus({
      ok: false,
      running: false,
      summary: error?.result?.summary || "Failed to load backfill status",
      error: error?.result?.error || error.message,
    });
    setBackfillLogMessage("Failed to load backfill log");
    notifyFailureSnackbar(
      "Failed to load backfill status",
      error?.result || error,
      "Unable to load backfill status",
    );
  });

  loadSchedulerStatus().catch((_error) => {
    // Ignore startup scheduler fetch failures; the next poll will retry.
  });
  
  // PERFORMANCE OPTIMIZATION: Debounce filter changes to reduce re-renders
  // When changing multiple filters rapidly, only re-render once after changes stop
  let filterChangeDebounceTimer = null;
  const debouncedApplyFilters = () => {
    if (filterChangeDebounceTimer) {
      clearTimeout(filterChangeDebounceTimer);
    }
    filterChangeDebounceTimer = setTimeout(() => {
      applyFiltersFromCache();
    }, 150); // 150ms feels instant but batches rapid changes
  };
  // Phase 6 (see REACT_MIGRATION_PLAN.md): exposed so FilterStateProvider
  // (react-app.jsx) can trigger the same debounced apply for its own
  // Context-owned fields (scope-mode/always-show-in-review so far) - this
  // is still the one function actually doing the debounce+apply; only
  // *what triggers it* for those fields has moved off the vanilla
  // delegated "change" listener.
  window.debouncedApplyFilters = debouncedApplyFilters;
  
  getPrNumbersInput().addEventListener("input", handlePrNumbersInputChange);
  getPrNumbersInput().addEventListener("change", handlePrNumbersInputChange);

  // Delegated on the form (a stable ancestor never replaced by React) for
  // every field below rather than attached to each field directly:
  // several of these (scope-mode, filter-pr-numbers, always-show-in-review,
  // the five attention-* checkboxes, attention-no-activity-mode,
  // attention-author-thread-resolution-mode) are React-owned fields (see
  // Phase 2 in REACT_MIGRATION_PLAN.md), and ReactDOM.createRoot().render()
  // creates a fresh DOM node when it mounts - a listener already attached
  // directly to the pre-mount static/fallback node is silently orphaned
  // rather than firing on the field React now owns, since it mounts
  // *after* this code runs (a classic script, run before react-app.jsx's
  // deferred module graph finishes loading). The native "change" event
  // still bubbles up to the form regardless of which side rendered the
  // target field, so this single delegated listener is immune to that
  // node-replacement timing entirely - do not revert to direct
  // addEventListener calls on these ids without re-reading that section of
  // the plan doc.
  const debouncedApplyOnChangeIds = new Set([
    "scope-mode",
    "filter-pr-numbers",
    "always-show-in-review",
    "attention-include-pending-comments",
    "attention-ignore-merge-only-commits",
    "attention-include-closed-merged",
    "attention-include-draft-changed",
    "attention-include-draft-no-activity",
    "attention-no-activity-mode",
  ]);
  const runScriptForm = getOptionalElementById("run-script-form");
  if (runScriptForm) {
    runScriptForm.addEventListener("change", (event) => {
      const targetId = event.target?.id;
      if (!targetId) {
        return;
      }
      if (targetId === "attention-author-thread-resolution-mode") {
        updateAuthorThreadResolutionRuleVisibility();
        void persistViewFilterOptionOverrides();
        debouncedApplyFilters();
        return;
      }
      if (
        targetId === "change-filter-use-builtin-merge-pattern" ||
        targetId === "change-filter-ignore-commit-patterns"
      ) {
        void persistViewFilterOptionOverrides();
        debouncedApplyFilters();
        return;
      }
      if (debouncedApplyOnChangeIds.has(targetId)) {
        debouncedApplyFilters();
      }
    });
  }

  // Add event listeners to checkboxes in multi-select filter groups
  [
    "label-list",
    "exclude-label-list",
    "author-list",
    "assigned-list",
    "approver-list",
    "attention-author-thread-resolution-allow-list",
    "attention-author-thread-resolution-deny-list",
    "change-filter-ignore-comment-authors-list",
    "change-filter-ignore-review-authors-list",
  ].forEach((listId) => {
    const listElement = document.getElementById(listId);
    if (listElement) {
      listElement.addEventListener("change", (event) => {
        if (event.target.type === "checkbox") {
          updateMultiSelectSummary(listId);
          if (
            listId === "attention-author-thread-resolution-allow-list" ||
            listId === "attention-author-thread-resolution-deny-list" ||
            listId === "change-filter-ignore-comment-authors-list" ||
            listId === "change-filter-ignore-review-authors-list"
          ) {
            void persistViewFilterOptionOverrides();
          }
          debouncedApplyFilters(); // Use debounced version for multi-select changes
        }
      });
    }
  });

  // change-filter-use-builtin-merge-pattern's and
  // change-filter-ignore-commit-patterns' "change" -> persist + apply are
  // now handled by the delegated listener on #run-script-form above (see
  // the special-case branch for their ids) - Phase 2, see
  // REACT_MIGRATION_PLAN.md gotcha #3. Do not re-add a direct
  // addEventListener for either once they're React-owned.

  setupMultiSelectDropdownClosing();

  document.getElementById("run-script-btn").addEventListener("click", () => {
    void persistRunScriptOptionOverrides();
    void handleRunScript();
  });
  const triggerAutoRunBtn = getOptionalElementById("trigger-auto-run-btn");
  if (triggerAutoRunBtn) {
    triggerAutoRunBtn.addEventListener("click", () => {
      void handleTriggerAutoRun();
    });
  }
  const closeBtn = getOptionalElementById("error-snackbar-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", hideErrorNotification);
  }
  document.getElementById("ack-only-btn").addEventListener("click", () => {
    void handleAckOnly();
  });
  document.getElementById("clear-only-btn").addEventListener("click", () => {
    void handleClearOnly();
  });
  const applyLabelBtn = getOptionalElementById("apply-label-btn");
  if (applyLabelBtn) {
    applyLabelBtn.addEventListener("click", () => {
      void handleApplyLabelClick();
    });
  }
  const refreshLabelsBtn = getOptionalElementById("refresh-labels-btn");
  if (refreshLabelsBtn) {
    refreshLabelsBtn.addEventListener("click", () => {
      void refreshAvailableRepoLabels();
    });
  }
  document.getElementById("apply-filters-btn").addEventListener("click", () => {
    void persistViewFilterOptionOverrides();
    applyFiltersFromCache();
  });
  document
    .getElementById("backfill-start-btn")
    .addEventListener("click", () => {
      void handleBackfillAction("start");
    });
  document.getElementById("backfill-stop-btn").addEventListener("click", () => {
    void handleBackfillAction("stop");
  });
  document
    .getElementById("backfill-refresh-btn")
    .addEventListener("click", () => {
      const finishActivity = beginRequestActivity("backfill");
      void loadBackfillStatus({ announce: true, includeLog: true })
        .catch((error) => {
          renderBackfillStatus({
            ok: false,
            running: false,
            summary:
              error?.result?.summary || "Failed to refresh backfill status",
            error: error?.result?.error || error.message,
          });
          setBackfillLogMessage("Failed to load backfill log");
          notifyFailureSnackbar(
            "Failed to refresh backfill status",
            error?.result || error,
            "Unable to refresh backfill status",
          );
        })
        .finally(() => {
          finishActivity();
        });
    });
  document
    .getElementById("backfill-log-refresh-btn")
    .addEventListener("click", () => {
      const finishActivity = beginRequestActivity("backfill");
      void loadBackfillLogTail()
        .catch((error) => {
          setBackfillLogMessage(
            `Failed to load backfill log\n\n${error.message || String(error)}`,
          );
          notifyFailureSnackbar(
            "Failed to refresh backfill log",
            error,
            "Unable to refresh backfill log",
          );
        })
        .finally(() => {
          finishActivity();
        });
    });
  document
    .getElementById("backfill-log-autoscroll")
    .addEventListener("change", () => {
      autoScrollBackfillLogToBottom();
    });

  const actionLogRefreshBtn = getOptionalElementById("action-log-refresh-btn");
  if (actionLogRefreshBtn) {
    actionLogRefreshBtn.addEventListener("click", () => {
      void loadActionLog();
    });
  }

  const exportPreviewBtn = getOptionalElementById("export-preview-btn");
  if (exportPreviewBtn) {
    exportPreviewBtn.addEventListener("click", () => {
      void handlePreviewExport();
    });
  }

  const exportCopyBtn = getOptionalElementById("export-copy-btn");
  if (exportCopyBtn) {
    exportCopyBtn.addEventListener("click", () => {
      void handleCopyExport();
    });
  }

  const exportDownloadBtn = getOptionalElementById("export-download-btn");
  if (exportDownloadBtn) {
    exportDownloadBtn.addEventListener("click", () => {
      void handleDownloadExport();
    });
  }

  const exportSelectAllBtn = getOptionalElementById("export-select-all-btn");
  if (exportSelectAllBtn) {
    exportSelectAllBtn.addEventListener("click", () => {
      setExportCheckboxSelection(() => true);
    });
  }

  const exportSelectNoneBtn = getOptionalElementById("export-select-none-btn");
  if (exportSelectNoneBtn) {
    exportSelectNoneBtn.addEventListener("click", () => {
      setExportCheckboxSelection(() => false);
    });
  }

  const exportSelectDataBtn = getOptionalElementById("export-select-data-btn");
  if (exportSelectDataBtn) {
    exportSelectDataBtn.addEventListener("click", () => {
      setExportCheckboxSelection(
        (checkbox) =>
          readElementAttribute(checkbox, "data-export-source") === "data",
      );
    });
  }

  const exportSelectUserStateBtn = getOptionalElementById(
    "export-select-user-state-btn",
  );
  if (exportSelectUserStateBtn) {
    exportSelectUserStateBtn.addEventListener("click", () => {
      setExportCheckboxSelection(
        (checkbox) =>
          readElementAttribute(checkbox, "data-export-source") ===
          "user-state",
      );
    });
  }

  // Track C, slice C1 (post-Phase-6 follow-up, see REACT_MIGRATION_PLAN.md):
  // the four auto-polling intervals (data/scheduler/backfill/activity-
  // render) and their visibility-pause/beforeunload-cleanup lifecycle used
  // to be owned here (setInterval/cleanupIntervals/restartIntervals). That
  // ownership moved to <PrDataPolling /> (react-app.jsx, mounted as a
  // headless React root with no visible UI) - it calls the same underlying
  // functions via window.pollForDataChanges/pollSchedulerStatus/
  // pollBackfillStatus/renderRequestActivity (exposed below), just with
  // React now deciding *when* they run instead of index.page.js.
};

if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    const reasonMessage =
      event?.reason?.message ||
      event?.reason?.stack ||
      String(event?.reason || "");
    if (isIgnoredCredentialFieldError(reasonMessage)) {
      event.preventDefault();
      return;
    }
    console.error("Unhandled promise rejection:", event.reason);
  });

  window.addEventListener("error", (event) => {
    if (isIgnoredCredentialFieldError(event?.message)) {
      event.preventDefault();
    }
  });
}

if (typeof document !== "undefined") {
  initPage();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    __testables: {
      isTimeoutFailureMessage,
      summarizeAckRefreshWarnings,
      aggregateReviewerActivityTimeline,
      formatBlockingPrNumbersLabel,
      normalizeAuthorInsightsSentiment,
      isAuthorInsightsComposerDraftDirty,
      isAuthorInsightsEditDraftDirty,
      resolveRepoForLabelsFetch,
      shouldRefetchLabelsForRepo,
    },
  };
}
