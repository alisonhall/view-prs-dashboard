// ES module cleanup (see REACT_MIGRATION_PLAN.md): real imports for
// helper files that have been converted off the UMD wrapper, kept as one
// block at the top per normal `import` placement conventions - every
// not-yet-converted dependency below still uses the original
// `require(...) : globalThis.ViewPrsXHelpers` fallback, which continues
// to work unmodified (this file's own <script> tag is now type="module",
// see index.html) until it's converted too.
import * as formParsingHelpersModule from "./helpers/form-parsing.helpers.js";
import * as reactCallbackHelperFactory from "./helpers/react-callbacks.helpers.js";
import * as prDataTabOrchestratorFactory from "./orchestrators/pr-data-tab.orchestrator.js";
import * as backfillTabOrchestratorFactory from "./orchestrators/backfill-tab.orchestrator.js";
import * as prEntryDerivedCacheHelperFactory from "./helpers/pr-entry-derived-cache.helpers.js";
import * as prSectionGroupingHelperFactory from "./helpers/pr-section-grouping.helpers.js";
import * as prFormattingHelperFactory from "./helpers/pr-formatting.helpers.js";
import * as prActorIdentityRenderHelperFactory from "./helpers/pr-actor-identity-render.helpers.js";
import * as prRequestedReviewersHelperFactory from "./helpers/pr-requested-reviewers.helpers.js";
import * as prAssignedUsersHelperFactory from "./helpers/pr-assigned-users.helpers.js";
import * as prApproversHelperFactory from "./helpers/pr-approvers.helpers.js";
import * as prViewedFilesSummaryHelperFactory from "./helpers/pr-viewed-files-summary.helpers.js";
import * as prAuthorCellHelperFactory from "./helpers/pr-author-cell.helpers.js";
import * as prUiRenderUtilsHelperFactory from "./helpers/pr-ui-render-utils.helpers.js";
import * as prNeedsAttentionHelperFactory from "./helpers/pr-needs-attention.helpers.js";
import * as prUiOptionScrollHelperFactory from "./helpers/pr-ui-option-scroll.helpers.js";
import * as prDomAccessHelperFactory from "./helpers/pr-dom-access.helpers.js";
import * as prDomTraversalHelperFactory from "./helpers/pr-dom-traversal.helpers.js";
import * as prSectionOpenStateHelperFactory from "./helpers/pr-section-open-state.helpers.js";
import * as prAppliedSummaryHelperFactory from "./helpers/pr-applied-summary.helpers.js";
import * as prMergedRequestMoreConfigHelperFactory from "./helpers/pr-merged-request-more-config.helpers.js";
import * as prScopeSelectionHelperFactory from "./helpers/pr-scope-selection.helpers.js";
import * as prScopeSettingsHelperFactory from "./helpers/pr-scope-settings.helpers.js";
import * as prRepoRunContextHelperFactory from "./helpers/pr-repo-run-context.helpers.js";
import * as prRenderContextHelperFactory from "./helpers/pr-render-context.helpers.js";
import * as prRowSourcesHelperFactory from "./helpers/pr-row-sources.helpers.js";
import * as prViewerContextHelperFactory from "./helpers/pr-viewer-context.helpers.js";
import * as prFilterOptionsHelperFactory from "./helpers/pr-filter-options.helpers.js";
import * as prScopedRowsHelperFactory from "./helpers/pr-scoped-rows.helpers.js";
import * as prRenderSummaryHelperFactory from "./helpers/pr-render-summary.helpers.js";
import * as prRenderApplyHelperFactory from "./helpers/pr-render-apply.helpers.js";
import * as prFilterPipelineHelperFactory from "./helpers/pr-filter-pipeline.helpers.js";
import * as prFilterSelectionInputsHelperFactory from "./helpers/pr-filter-selection-inputs.helpers.js";
import * as prRenderSummaryInputsHelperFactory from "./helpers/pr-render-summary-inputs.helpers.js";
import * as prRenderFilterSummaryHelperFactory from "./helpers/pr-render-filter-summary.helpers.js";
import * as prRenderApplyInputsHelperFactory from "./helpers/pr-render-apply-inputs.helpers.js";
import * as prRenderFinalizeHelperFactory from "./helpers/pr-render-finalize.helpers.js";
import * as prRenderPipelineHelperFactory from "./helpers/pr-render-pipeline.helpers.js";
import * as prRenderStateCommitHelperFactory from "./helpers/pr-render-state-commit.helpers.js";
import * as prRunPrDataContextHelperFactory from "./helpers/pr-run-pr-data-context.helpers.js";
import * as prStoredDataLoadHelperFactory from "./helpers/pr-stored-data-load.helpers.js";
import * as prSinglePrUpdateHelperFactory from "./helpers/pr-single-pr-update.helpers.js";
import * as prMergedRequestMoreActionHelperFactory from "./helpers/pr-merged-request-more-action.helpers.js";
import * as prApplyFiltersCacheHelperFactory from "./helpers/pr-apply-filters-cache.helpers.js";
import * as prRenderViewerFilterSetupHelperFactory from "./helpers/pr-render-viewer-filter-setup.helpers.js";
import * as prSelectedFiltersHelperFactory from "./helpers/pr-selected-filters.helpers.js";
import * as prRowFilteringHelperFactory from "./helpers/pr-row-filtering.helpers.js";
import * as prDomVisibilityHelperFactory from "./helpers/pr-dom-visibility.helpers.js";
import * as prAutoRenderUnsavedHelperFactory from "./helpers/pr-auto-render-unsaved.helpers.js";
import * as prAuthorInsightsIdentityHelperFactory from "./helpers/pr-author-insights-identity.helpers.js";
import * as prAuthorInsightsDraftsHelperFactory from "./helpers/pr-author-insights-drafts.helpers.js";
import * as prAutoRenderBlockingHelperFactory from "./helpers/pr-auto-render-blocking.helpers.js";
import * as prAutoRenderIndicatorHelperFactory from "./helpers/pr-auto-render-indicator.helpers.js";
import * as prAutoRenderIndicatorLinksHelperFactory from "./helpers/pr-auto-render-indicator-links.helpers.js";
import * as prAutoRenderStateHelperFactory from "./helpers/pr-auto-render-state.helpers.js";
import * as prAutoRenderNavigationHelperFactory from "./helpers/pr-auto-render-navigation.helpers.js";
import * as prFilterPanelHelperFactory from "./helpers/pr-filter-panel.helpers.js";
import * as prDataPollingHelperFactory from "./helpers/pr-data-polling.helpers.js";
import * as prHttpHelperFactory from "./helpers/pr-http.helpers.js";
import * as prStatusDisplayHelperFactory from "./helpers/pr-status-display.helpers.js";
import * as prCommandOutputHelperFactory from "./helpers/pr-command-output.helpers.js";
import * as prDataTabsHelperFactory from "./helpers/pr-data-tabs.helpers.js";
import * as prActivityBadgesHelperFactory from "./helpers/pr-activity-badges.helpers.js";
import * as prBackfillHelperFactory from "./helpers/pr-backfill.helpers.js";
import * as prBackfillActionHelperFactory from "./helpers/pr-backfill-actions.helpers.js";
import * as prManagementTabsHelperFactory from "./helpers/pr-management-tabs.helpers.js";
import * as prExportHelperFactory from "./helpers/pr-export.helpers.js";
import * as prAuthorInsightsPrLinkHelperFactory from "./helpers/pr-author-insights-pr-link.helpers.js";
import * as prAuthorInsightsDisplayHelperFactory from "./helpers/pr-author-insights-display.helpers.js";
import * as prAuthorInsightsDataHelperFactory from "./helpers/pr-author-insights-data.helpers.js";
import * as prAuthorInsightsComponentFactory from "./components/pr-author-insights.component.js";
import * as prActorIdentityHelperFactory from "./helpers/pr-actor-identity.helpers.js";
import { inferViewerLoginFromPage } from "./helpers/pr-viewer-login-inference.helpers.js";
import { countPendingThreadComments } from "./helpers/pr-thread-comments.helpers.js";
import { parseSortableTime } from "./helpers/pr-sortable-time.helpers.js";
import {
  extractRowLabelNames,
  normalizeFilterToken,
  getLabelName,
} from "./helpers/pr-filter-label-extraction.helpers.js";
import { setPendingMultiSelectSelection } from "./helpers/pr-pending-multi-select-selections.helpers.js";
import * as prDataPollingOrchestrationHelperFactory from "./helpers/pr-data-polling-orchestration.helpers.js";
import * as prRowCheckboxActionsHelperFactory from "./helpers/pr-row-checkbox-actions.helpers.js";
import * as prAckLabelActionsHelperFactory from "./helpers/pr-ack-label-actions.helpers.js";
import * as prConcurrencyHelperFactory from "./helpers/pr-concurrency.helpers.js";
import * as prQuickCheckActionsHelperFactory from "./helpers/pr-quick-check-actions.helpers.js";
import * as prTriggerAutoRunActionHelperFactory from "./helpers/pr-trigger-auto-run-action.helpers.js";

// Deliberately empty - not a real repo any other user of this tool would
// have access to (see src/server/config/app-config.js's own
// defaultViewPrsRepo, which dropped the same hardcoded value for the same
// reason). Every consumer below already treats a missing repo as "nothing
// to do yet" rather than crashing (see each call site's own guard).
const DEFAULT_REPO = "";
const AUTO_DATA_POLL_MS = 30000;
const AUTO_BACKFILL_POLL_MS = 5000;
const BACKFILL_LOG_TAIL_LINES = 120;

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

// Phase 7, sub-phase 7.2 (revised scope - see REACT_MIGRATION_PLAN.md):
// centralizes every write to the latestStoredPayload/latestSelectedRepo
// pair, which used to be assigned independently at 8+ call sites with no
// coordination between them (the original migration audit's flagged
// highest-risk gap - "no request-generation guard beyond content
// fingerprinting"). Passing `undefined` for either field leaves it
// unchanged, matching each call site's own existing behavior exactly (e.g.
// applyResolvedRepo only ever updated the repo, never the payload). This is
// a pure call-site consolidation, not a behavior change - every caller
// still computes its own next value (including any `x || previousValue`
// fallback) the same way it did before, just passes the result in here
// instead of assigning the module `let`s directly.
const applyLatestPrData = ({ payload, selectedRepo } = {}) => {
  if (payload !== undefined) {
    latestStoredPayload = payload;
  }
  if (selectedRepo !== undefined) {
    latestSelectedRepo = selectedRepo;
  }
};

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
  // Activity drawer feature (see REACT_MIGRATION_PLAN.md): labelApply was
  // already being passed to setRequestActivityCounter (from
  // pr-ack-label-actions.helpers.js) before this key existed here - it
  // silently no-opped every time (setRequestActivityCounter's own
  // hasOwnProperty guard), so apply-label requests never showed up
  // anywhere. checkboxToggle/notesSave/authorComment are newly tracked -
  // see the "not all actions are shown" follow-up.
  labelApply: 0,
  checkboxToggle: 0,
  notesSave: 0,
  authorComment: 0,
};
const requestActivityStartedAtMs = {
  runScript: 0,
  ackClear: 0,
  singlePr: 0,
  dataLoad: 0,
  backfill: 0,
  labelApply: 0,
  checkboxToggle: 0,
  notesSave: 0,
  authorComment: 0,
};
// Capped, in-memory, this-tab-only history of recently finished user
// actions - "finished" just means the in-flight counter returned to 0, not
// necessarily success (threading real success/failure through every one of
// these call sites' own try/catch shapes would be a much larger change for
// a history list - the live badge above already surfaces failures via its
// own notification/snackbar path). Scheduler jobs get real ok/error in
// their own recent-activity list (JobEventsContext's recentFinished,
// SSE-driven) since that data already exists there for free.
const RECENT_REQUEST_ACTIVITY_LIMIT = 10;
let recentRequestActivityEntries = [];
const REQUEST_ACTIVITY_LABELS = {
  runScript: "Run script",
  ackClear: "Ack/Clear",
  singlePr: "Single PR update",
  dataLoad: "Data refresh",
  backfill: "Backfill request",
  labelApply: "Apply label",
  checkboxToggle: "Checkbox toggle",
  notesSave: "Notes save",
  authorComment: "Author comment",
};
const recordRecentRequestActivity = (key) => {
  const label = REQUEST_ACTIVITY_LABELS[key] || key;
  recentRequestActivityEntries = [
    { key, label, finishedAt: new Date().toISOString() },
    ...recentRequestActivityEntries,
  ].slice(0, RECENT_REQUEST_ACTIVITY_LIMIT);
  window.updateReactRecentRequestActivity?.(recentRequestActivityEntries);
};
const REQUEST_ACTIVITY_WARN_MS = 2 * 60 * 1000;
const REQUEST_ACTIVITY_CRITICAL_MS = 6 * 60 * 1000;
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
const formParsingHelpers = formParsingHelpersModule;
const toBoolean =
  formParsingHelpers?.toBoolean || ((value) => value === true || value === "on");

const {
  stripAnsi,
  formatIsoDatetime,
  toCount,
} = prFormattingHelperFactory.createPrFormattingHelpers();

const setStatusTextOnly = (message) => {
  window.updateReactStatusText?.(message);
};

const setStatusMessage = (message) => {
  setStatusTextOnly(message);
  renderRequestActivity();
};

const setOutputMessage = (message) => {
  window.updateReactOutputText?.(message);
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

// Iterates requestActivityCounters generically (keyed off
// REQUEST_ACTIVITY_LABELS) rather than one hand-written `if` block per key -
// this is exactly the shape that silently dropped labelApply before (a new
// counter key existed, but no matching branch here ever read it). Order
// matches REQUEST_ACTIVITY_LABELS' own declaration order, which mirrors the
// original hand-written order for the first 5 keys.
const getActiveRequestActivityEntries = () =>
  Object.keys(REQUEST_ACTIVITY_LABELS)
    .filter((key) => requestActivityCounters[key] > 0)
    .map((key) => ({
      label: `${REQUEST_ACTIVITY_LABELS[key]} x${requestActivityCounters[key]}`,
      elapsedMs: getElapsedFromStartMs(requestActivityStartedAtMs[key]),
    }));

// Activity drawer feature (see REACT_MIGRATION_PLAN.md): #request-activity-details
// (the Status tab's old "Current status/Active requests" text) was removed
// as redundant with the drawer's own live "In-flight user actions" section -
// this function's remaining job is just keeping #request-activity-badges
// (still a real prop the drawer reads via AppRoot's requestActivityBadges
// state) up to date.
const renderRequestActivity = () => {
  const activeEntries = getActiveRequestActivityEntries();
  const isAutoRunInProgress = Boolean(
    latestSchedulerState?.isAutoRunInProgress,
  );
  const autoRunElapsedMs = isAutoRunInProgress
    ? getElapsedFromStartMs(
        Date.parse(String(latestSchedulerState?.lastAutoAttemptAt || "")),
      )
    : null;

  window.updateReactRequestActivityBadges?.(
    getRequestActivityBadges({ activeEntries, isAutoRunInProgress, autoRunElapsedMs }),
  );
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
    recordRecentRequestActivity(key);
  };
};

// Activity drawer feature (see REACT_MIGRATION_PLAN.md): exposes
// beginRequestActivity for React components that make their own network
// call directly rather than through a vanilla helper factory (NotesSection.jsx
// is the one case today - it already reads window.postJson the same way).
if (typeof window !== "undefined") {
  window.beginRequestActivity = (...args) => beginRequestActivity(...args);
}

// Deferred-items follow-up (full vanilla-to-React sweep, see
// REACT_MIGRATION_PLAN.md): the snackbar itself is fully React-owned now
// (components/Snackbar.jsx, mounted into an empty #error-snackbar-root) -
// these 3 are thin delegating wrappers around the window.* bridges that
// component registers, kept under their original names so the ~15+
// existing call sites (notifyFailureSnackbar, markPollSuccess, etc.) don't
// need to change.
const showErrorNotification = (title, message, autoDismissMs = 8000) =>
  window.showErrorNotification?.(title, message, autoDismissMs);

const showWarningNotification = (title, message, autoDismissMs = 12000) =>
  window.showWarningNotification?.(title, message, autoDismissMs);

const hideErrorNotification = () => window.hideErrorNotification?.();

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

// Deferred-items follow-up (full vanilla-to-React sweep, see
// REACT_MIGRATION_PLAN.md): tracked so 'viewprs:react-ready' can re-invoke
// this once window.updateReactBackfillLogText actually exists - unlike
// #status/#output/#scheduler-details/#request-activity-details (all
// called repeatedly during normal operation, so they self-heal from the
// same bridge-not-ready-yet race documented for backfill badges above),
// this only populates on Backfill-tab-visit/refresh-click, so a lost race
// on the very first load would otherwise never self-correct.
let latestBackfillLogMessage = null;

const setBackfillLogMessage = (message) => {
  latestBackfillLogMessage = message;
  window.updateReactBackfillLogText?.(message);
};

const getUiOptionDefaults = () => ({
  repo: "",
  limit: "",
  "merged-limit": "",
  jobs: "",
  "pr-numbers": "",
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
  // Phase 7, sub-phase 7.4 (see REACT_MIGRATION_PLAN.md): these 6 "Any
  // (with/without)" metadata filters (FilterOptionSelect.jsx) were never
  // included here - a real, undocumented persistence gap found while
  // scoping this sub-phase, not a deliberate exclusion (unlike their
  // separate, intentional exclusion from auto-apply-on-change - see
  // react-app.jsx's FILTER_OPTION_SELECT_FIELDS comment). Default "" for
  // all 6 matches each field's own first <option value="">Any...</option>.
  "filter-custom-comments": "",
  "filter-other-notes": "",
  "filter-pr-difficulty": "",
  "filter-rally-stories": "",
  "filter-rally-links": "",
  "filter-analysis-of-pr": "",
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
  "pr-numbers": "prNumbersInput",
  "open-mode": "openMode",
  "ack-changed": "ackChanged",
  "show-reason": "showReason",
  "quiet": "quiet",
  "filter-pr-numbers": "filterPrNumbers",
  "attention-author-thread-resolution-mode": "attentionAuthorThreadResolutionMode",
  "change-filter-use-builtin-merge-pattern": "changeFilterUseBuiltinMergePattern",
  "change-filter-ignore-commit-patterns": "changeFilterIgnoreCommitPatterns",
  // Phase 7, sub-phase 7.4 (see REACT_MIGRATION_PLAN.md): persistence-gap
  // fix - see getUiOptionDefaults' matching comment above.
  "filter-custom-comments": "filterCustomComments",
  "filter-other-notes": "filterOtherNotes",
  "filter-pr-difficulty": "filterPrDifficulty",
  "filter-rally-stories": "filterRallyStories",
  "filter-rally-links": "filterRallyLinks",
  "filter-analysis-of-pr": "filterAnalysisOfPr",
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
// checkbox exists yet) have no corresponding DOM element id, so they can't
// go through FILTER_STATE_FIELD_MAP/getFilterStateOverrideForFieldId like
// every other field.
//
// Phase 7, sub-phase 7.4 (see REACT_MIGRATION_PLAN.md): writes to a
// dedicated window-level store (pr-pending-multi-select-selections.helpers.js)
// instead of FilterStateProvider's generic Context bridge - the reader
// (react-app.jsx's MultiSelectListPortals.jsx) now lives in a different ES
// module than this write side, with no shared closure scope, and routing
// through window.setFilterStateValue would have the side effect of
// changing every OTHER migrated field's restore behavior too (see that
// helper module's own comment for the full reasoning).
const setPendingSelectionsValue = (contextKey, value) => {
  setPendingMultiSelectSelection(contextKey, value);
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
    "pr-numbers",
    "open-mode",
    "scope-mode",
    "filter-pr-numbers",
    "attention-no-activity-mode",
    "attention-author-thread-resolution-mode",
    // Phase 7, sub-phase 7.4 (see REACT_MIGRATION_PLAN.md): persistence-gap
    // fix - see getUiOptionDefaults' matching comment above.
    "filter-custom-comments",
    "filter-other-notes",
    "filter-pr-difficulty",
    "filter-rally-stories",
    "filter-rally-links",
    "filter-analysis-of-pr",
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
    "pr-numbers",
    "open-mode",
    "scope-mode",
    "filter-pr-numbers",
    "attention-no-activity-mode",
    "attention-author-thread-resolution-mode",
    // Phase 7, sub-phase 7.4 (see REACT_MIGRATION_PLAN.md): persistence-gap
    // fix - see getUiOptionDefaults' matching comment above.
    "filter-custom-comments",
    "filter-other-notes",
    "filter-pr-difficulty",
    "filter-rally-stories",
    "filter-rally-links",
    "filter-analysis-of-pr",
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
    );
  }

  if (Array.isArray(overrides.assigned)) {
    setPendingSelectionsValue(
      "pendingAssignedSelections",
      overrides.assigned.map((value) => String(value || "").trim()).filter(Boolean),
    );
  }

  if (Array.isArray(overrides.approver)) {
    setPendingSelectionsValue(
      "pendingApproverSelections",
      overrides.approver.map((value) => String(value || "").trim()).filter(Boolean),
    );
  }

  if (Object.prototype.hasOwnProperty.call(overrides, "label")) {
    const values = Array.isArray(overrides.label)
      ? overrides.label
      : parseCsvTokens(overrides.label);
    setPendingSelectionsValue(
      "pendingLabelSelections",
      values.map((value) => String(value || "").trim()).filter(Boolean),
    );
  }

  if (Object.prototype.hasOwnProperty.call(overrides, "exclude-label")) {
    const values = Array.isArray(overrides["exclude-label"])
      ? overrides["exclude-label"]
      : parseCsvTokens(overrides["exclude-label"]);
    setPendingSelectionsValue(
      "pendingExcludeLabelSelections",
      values.map((value) => String(value || "").trim()).filter(Boolean),
    );
  }

  if (Array.isArray(overrides["attention-author-thread-resolution-allow"])) {
    setPendingSelectionsValue(
      "pendingAuthorThreadResolutionAllowSelections",
      overrides["attention-author-thread-resolution-allow"]
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    );
  }

  if (Array.isArray(overrides["attention-author-thread-resolution-deny"])) {
    setPendingSelectionsValue(
      "pendingAuthorThreadResolutionDenySelections",
      overrides["attention-author-thread-resolution-deny"]
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    );
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
      );
    }

    if (Array.isArray(overrides.changeFilters.ignoreReviewsFromAuthors)) {
      setPendingSelectionsValue(
        "pendingChangeFilterIgnoreReviewAuthors",
        overrides.changeFilters.ignoreReviewsFromAuthors
          .map((value) => String(value || "").trim())
          .filter(Boolean),
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
  // Phase 7, sub-phase 7.4 (see REACT_MIGRATION_PLAN.md): no repopulate
  // call needed here any more - the thread-resolution/change-filter actor
  // lists are now derived reactively by FilterOptionsProvider.jsx from
  // PrDataContext, and react-app.jsx's MultiSelectListPortals effect
  // already re-seeds checked state whenever the pending-selection Context
  // values written just above change, with no manual trigger required.
};

const persistRunScriptOptionOverrides = async () => {
  await persistUiOptionOverrides([
    "repo",
    "limit",
    "merged-limit",
    "jobs",
    "pr-numbers",
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
    // Phase 7, sub-phase 7.4 (see REACT_MIGRATION_PLAN.md): persistence-gap
    // fix - see getUiOptionDefaults' matching comment above. This is the
    // function "Apply filters (local)" actually invokes, so this is what
    // makes these 6 fields' last-applied value survive a reload.
    "filter-custom-comments",
    "filter-other-notes",
    "filter-pr-difficulty",
    "filter-rally-stories",
    "filter-rally-links",
    "filter-analysis-of-pr",
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

const {
  getEffectiveViewerLogin,
} = prActorIdentityRenderHelperFactory.createPrActorIdentityRenderHelpers({
  normalizeActorLogin: (...args) => normalizeActorLogin(...args),
  getCurrentViewerLogin: () => currentViewerLogin,
  inferViewerLoginFromPage: (...args) => inferViewerLoginFromPage(...args),
});

// Phase 7 (see REACT_MIGRATION_PLAN.md): formatRequestedReviewersDisplay/
// formatAssignedUsersDisplay/formatApproversDisplay used to also be
// destructured here for the window.* bridge below - PrInsightsRow.jsx now
// gets them from PrInsightsDisplayProvider/usePrInsightsDisplay() instead
// (state/PrInsightsDisplayContext.jsx builds its own separate instance of
// each factory, same "call the zero-dependency factory again rather than
// import index.page.js's own instance" pattern every other Context in
// this migration already uses). collectRequestedReviewers/
// collectAssignedUsers/collectApproversFromRow stay - still used by other
// vanilla code in this file.
const { collectRequestedReviewers } =
  prRequestedReviewersHelperFactory.createPrRequestedReviewersHelpers({
    asArray: (...args) => asArray(...args),
    resolveActorDisplayName: (...args) => resolveActorDisplayName(...args),
  });

const { collectAssignedUsers } =
  prAssignedUsersHelperFactory.createPrAssignedUsersHelpers({
    asArray: (...args) => asArray(...args),
    normalizeActorLogin: (...args) => normalizeActorLogin(...args),
    resolveActorDisplayName: (...args) => resolveActorDisplayName(...args),
  });

const { collectApproversFromRow } =
  prApproversHelperFactory.createPrApproversHelpers({
    asArray: (...args) => asArray(...args),
    getPreferredActorKey: (...args) => getPreferredActorKey(...args),
    resolveActorDisplayName: (...args) => resolveActorDisplayName(...args),
    formatIsoDatetime: (...args) => formatIsoDatetime(...args),
  });

// Phase 7 (see REACT_MIGRATION_PLAN.md): getBadgeClassForStatus/Check/Merge
// and formatReviewFootprint/ConversationStatus/ApprovalRisk/
// CommentUsefulness used to be destructured here for the window.* bridge
// below - PrInsightsRow.jsx now gets them from PrInsightsDisplayProvider/
// usePrInsightsDisplay() instead, and nothing else in this file calls
// either factory's output directly.

const { collectPrAuthors } =
  prAuthorCellHelperFactory.createPrAuthorCellHelpers({
    getPreferredActorKey: (...args) => getPreferredActorKey(...args),
  });

const { parseMarkerState, safeJsonStringify } =
  prUiRenderUtilsHelperFactory.createPrUiRenderUtilsHelpers();

const {
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

const { getOptionalElementById, readElementAttribute } =
  prDomAccessHelperFactory.createPrDomAccessHelpers({
    documentRef: typeof document !== "undefined" ? document : null,
  });

const { collectNodesByClass, collectNodesByTag } =
  prDomTraversalHelperFactory.createPrDomTraversalHelpers();

const { capturePrSectionOpenState } =
  prSectionOpenStateHelperFactory.createPrSectionOpenStateHelpers({
    collectNodesByClass: (...args) => collectNodesByClass(...args),
    readElementAttribute: (...args) => readElementAttribute(...args),
  });

const { buildAppliedSummaryViewModel } =
  prAppliedSummaryHelperFactory.createPrAppliedSummaryHelpers();

const { buildMergedRequestMoreActionOptions } =
  prMergedRequestMoreConfigHelperFactory.createPrMergedRequestMoreConfigHelpers();

const { buildGroupedPrSections } =
  prSectionGroupingHelperFactory.createPrSectionGroupingHelpers({
    sortRowsByPrNumberDesc: (...args) => sortRowsByPrNumberDesc(...args),
    sortRowsByDateFieldDesc: (...args) => sortRowsByDateFieldDesc(...args),
  });

const { normalizeSelectedScope, resolveScopedRows } =
  prScopeSelectionHelperFactory.createPrScopeSelectionHelpers({
    entryNeedsAttention: (...args) => entryNeedsAttention(...args),
    entryHasYourLastActivity: (...args) => entryHasYourLastActivity(...args),
  });

const { deriveScopeSettings } =
  prScopeSettingsHelperFactory.createPrScopeSettingsHelpers({
    parseCsvTokens: (...args) => parseCsvTokens(...args),
    normalizeSelectedScope: (...args) => normalizeSelectedScope(...args),
  });

const { deriveRepoRunContext } =
  prRepoRunContextHelperFactory.createPrRepoRunContextHelpers();

const { captureRenderContext } =
  prRenderContextHelperFactory.createPrRenderContextHelpers({
    getElementById: (...args) => document.getElementById(...args),
    capturePrSectionOpenState: (...args) => capturePrSectionOpenState(...args),
  });

const { deriveRowSources } =
  prRowSourcesHelperFactory.createPrRowSourcesHelpers({
    normalizeRows: (...args) => normalizeRows(...args),
  });

const { deriveViewerContext } =
  prViewerContextHelperFactory.createPrViewerContextHelpers({
    normalizeActorLoginAliases: (...args) => normalizeActorLoginAliases(...args),
    normalizeActorLogin: (...args) => normalizeActorLogin(...args),
    inferViewerLoginFromPage: (...args) => inferViewerLoginFromPage(...args),
  });

// Phase 7, sub-phase 7.4 (see REACT_MIGRATION_PLAN.md): populateFilterOptions
// is now a permanent no-op shell - every populate function it used to
// orchestrate moved to FilterOptionsProvider.jsx. Its caller
// (deriveViewerFilterSetup, part of renderPrData's still-vanilla pipeline)
// can't be deleted yet - see the sub-phase 7.2 writeup for why renderPrData
// itself is still needed - so this stays wired in as an inert call target
// rather than being ripped out of that pipeline, candidate for outright
// removal in sub-phase 7.7's final cleanup.
const { populateFilterOptions } =
  prFilterOptionsHelperFactory.createPrFilterOptionsHelpers();

const { deriveScopedRows } =
  prScopedRowsHelperFactory.createPrScopedRowsHelpers({
    resolveScopedRows: (...args) => resolveScopedRows(...args),
    normalizeRows: (...args) => normalizeRows(...args),
  });

const { deriveRenderSummary } =
  prRenderSummaryHelperFactory.createPrRenderSummaryHelpers({
    buildGroupedPrSections: (...args) => buildGroupedPrSections(...args),
    buildAppliedSummaryViewModel: (...args) =>
      buildAppliedSummaryViewModel(...args),
    renderSchedulerStatus: (...args) => renderSchedulerStatus(...args),
  });

const { applyRenderResults, renderAuthorInsightsIfVisible } =
  prRenderApplyHelperFactory.createPrRenderApplyHelpers({
    renderManagementFilterSummary: (...args) =>
      renderManagementFilterSummary(...args),
    renderAuthorInsights: (...args) => renderAuthorInsights(...args),
    buildMergedRequestMoreActionOptions: (...args) =>
      buildMergedRequestMoreActionOptions(...args),
    computePrDataFingerprint: (...args) => computePrDataFingerprint(...args),
    computePrDataManifest: (...args) => computePrDataManifest(...args),
    getOptionalElementById: (...args) => getOptionalElementById(...args),
  });

const { deriveFilterPipelineState } =
  prFilterPipelineHelperFactory.createPrFilterPipelineHelpers({
    buildSelectedFiltersViewModel: (...args) =>
      buildSelectedFiltersViewModel(...args),
    buildRowFilterCriteria: (...args) => buildRowFilterCriteria(...args),
    applyRowUiFilters: (...args) => applyRowUiFilters(...args),
  });

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

const { deriveRenderSummaryInputs } =
  prRenderSummaryInputsHelperFactory.createPrRenderSummaryInputsHelpers();

const { deriveRenderFilterSummaryState } =
  prRenderFilterSummaryHelperFactory.createPrRenderFilterSummaryHelpers({
    deriveScopedRows: (...args) => deriveScopedRows(...args),
    deriveFilterSelectionInputs: (...args) => deriveFilterSelectionInputs(...args),
    deriveFilterPipelineState: (...args) => deriveFilterPipelineState(...args),
    deriveRenderSummaryInputs: (...args) => deriveRenderSummaryInputs(...args),
    deriveRenderSummary: (...args) => deriveRenderSummary(...args),
  });

const { deriveRenderApplyInputs } =
  prRenderApplyInputsHelperFactory.createPrRenderApplyInputsHelpers();

const { deriveRenderFinalizedState } =
  prRenderFinalizeHelperFactory.createPrRenderFinalizeHelpers({
    deriveRenderApplyInputs: (...args) => deriveRenderApplyInputs(...args),
    applyRenderResults: (...args) => applyRenderResults(...args),
    deriveCommittedRenderState: (...args) => deriveCommittedRenderState(...args),
  });

const { deriveRenderPipelineState } =
  prRenderPipelineHelperFactory.createPrRenderPipelineHelpers({
    deriveViewerFilterSetup: (...args) => deriveViewerFilterSetup(...args),
    deriveRenderFilterSummaryState: (...args) =>
      deriveRenderFilterSummaryState(...args),
    deriveRenderFinalizedState: (...args) => deriveRenderFinalizedState(...args),
  });

const { deriveCommittedRenderState } =
  prRenderStateCommitHelperFactory.createPrRenderStateCommitHelpers();

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
    setLatestStoredPayload: (value) => applyLatestPrData({ payload: value }),
    getLatestSelectedRepo: () => latestSelectedRepo,
    setLatestSelectedRepo: (value) => applyLatestPrData({ selectedRepo: value }),
    updateBackfillStatusFromPayload: (...args) =>
      updateBackfillStatusFromPayload(...args),
    renderPrData: (...args) => renderPrData(...args),
  });

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
    setLatestStoredPayload: (value) => applyLatestPrData({ payload: value }),
    setLatestSelectedRepo: (value) => applyLatestPrData({ selectedRepo: value }),
    renderPrData: (...args) => renderPrData(...args),
    loadStoredData: (...args) => loadStoredData(...args),
    defaultRepo: DEFAULT_REPO,
  });

const { handleRequestMoreMerged } =
  prMergedRequestMoreActionHelperFactory.createPrMergedRequestMoreActionHelpers({
    getIsRequestMoreMergedPending: () => isRequestMoreMergedPending,
    setIsRequestMoreMergedPending: (value) => {
      isRequestMoreMergedPending = value;
    },
    getLatestSelectedRepo: () => latestSelectedRepo,
    defaultRepo: DEFAULT_REPO,
    beginRequestActivity: (...args) => beginRequestActivity(...args),
    postJson: (...args) => postJson(...args),
    setLatestStoredPayload: (value) => applyLatestPrData({ payload: value }),
    setLatestSelectedRepo: (value) => applyLatestPrData({ selectedRepo: value }),
    renderPrData: (...args) => renderPrData(...args),
    loadStoredData: (...args) => loadStoredData(...args),
    setStatusMessage: (...args) => setStatusMessage(...args),
    notifyFailureSnackbar: (...args) => notifyFailureSnackbar(...args),
  });

// The "Request more" merged-PRs button is real JSX now
// (components/MergedRequestMoreAction.jsx) - it calls this directly on
// click, passing its own local pending/status state setters as the
// onPendingChange/onStatusChange options handleRequestMoreMerged now
// expects instead of reaching into #merged-request-more-btn/-status itself.
if (typeof window !== "undefined") {
  window.handleRequestMoreMerged = (...args) => handleRequestMoreMerged(...args);
}

const { applyFiltersFromCache } =
  prApplyFiltersCacheHelperFactory.createPrApplyFiltersCacheHelpers({
    // Deferred-items follow-up, item 6 (see REACT_MIGRATION_PLAN.md):
    // prefers the same payload the visible React table is currently
    // showing (via PrDataProvider's window.getReactPrTablePayload read
    // bridge) over the raw, always-freshest latestStoredPayload - correct
    // for this consumer specifically, since a filter re-application should
    // respect the same "don't disturb an in-progress edit" deferral
    // pollForDataChanges already gives the visible table, not silently
    // filter data the user can't see yet. Falls back to the vanilla
    // variable before React has mounted.
    getLatestStoredPayload: () => window.getReactPrTablePayload?.() ?? latestStoredPayload,
    getLatestSelectedRepo: () => latestSelectedRepo,
    renderPrData: (...args) => renderPrData(...args),
    setStatusMessage: (...args) => setStatusMessage(...args),
    logError: (...args) => console.error(...args),
  });

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

const { buildSelectedFiltersViewModel } =
  prSelectedFiltersHelperFactory.createPrSelectedFiltersHelpers();

// Phase 5 (see REACT_MIGRATION_PLAN.md, "Performance Validation"): one
// shared cache instance for the page's whole lifetime, not recreated per
// render - its value comes entirely from persisting across renders (an
// unchanged entry's derived values/filter-match result stay cached from
// one render to the next).
const { getOrCompute: getOrComputeEntryDerivedValue } =
  prEntryDerivedCacheHelperFactory.createEntryDerivedCache();

const { buildRowFilterCriteria, applyRowUiFilters } =
  prRowFilteringHelperFactory.createPrRowFilteringHelpers({
    rowMatchesUiFilters: (...args) => rowMatchesUiFilters(...args),
    getOrCompute: (...args) => getOrComputeEntryDerivedValue(...args),
  });

const { expandAncestorDetailsElements, ensureInsightsRowVisibleForElement } =
  prDomVisibilityHelperFactory.createPrDomVisibilityHelpers({
    readElementAttribute: (...args) => readElementAttribute(...args),
  });

const {
  getDirtyTrackedFields,
  getUnsavedNotesPrNumbers,
  normalizePrNumber,
  getBlockingPrNumbers,
  getFirstUnsavedElementForPrNumber,
} = prAutoRenderUnsavedHelperFactory.createPrAutoRenderUnsavedHelpers({
  getOptionalElementById,
  readElementAttribute: (...args) => readElementAttribute(...args),
  // Phase 7, sub-phase 7.5 (see REACT_MIGRATION_PLAN.md): PR Notes dirty
  // tracking is now NotesDirtyProvider.jsx's own React state, read here via
  // this dedicated bridge instead of scanning data-has-unsaved-notes DOM
  // attributes.
  getDirtyNotesPrNumbers: () => window.getDirtyNotesPrNumbers?.() || [],
});

const { getAuthorInsightsDisplayName, noteAuthorMatchesSelection } =
  prAuthorInsightsIdentityHelperFactory.createPrAuthorInsightsIdentityHelpers({
    normalizeActorLogin: (...args) => normalizeActorLogin(...args),
    resolveActorDisplayName: (...args) => resolveActorDisplayName(...args),
    getLatestActorsMap: () => authorInsightsState.latestActorsMap || {},
  });

const {
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

const { formatBlockingPrNumbersLabel, getBlockingAuthorInsightsLogins } =
  prAutoRenderBlockingHelperFactory.createPrAutoRenderBlockingHelpers({
    normalizePrNumber,
    normalizeActorLogin: (...args) => normalizeActorLogin(...args),
    isAuthorInsightsComposerDraftDirty,
    getAuthorManualCommentsForLogin,
    isAuthorInsightsEditDraftDirty,
    getAuthorInsightsDisplayName: (...args) => getAuthorInsightsDisplayName(...args),
  });

const {
  buildAutoRenderBlockedStatusText,
  buildAutoRenderBlockedLinksAriaLabel,
} = prAutoRenderIndicatorHelperFactory.createPrAutoRenderIndicatorHelpers({
  getAuthorInsightsDisplayName: (...args) => getAuthorInsightsDisplayName(...args),
});

const { renderAutoRenderBlockedLinks } =
  prAutoRenderIndicatorLinksHelperFactory.createPrAutoRenderIndicatorLinksHelpers(
    {
      buildAutoRenderBlockedLinksAriaLabel,
    },
  );

const { getAutoRenderBlockingState, computeHasDirtyPrSectionsFields } =
  prAutoRenderStateHelperFactory.createPrAutoRenderStateHelpers({
    getDirtyTrackedFields,
    getUnsavedNotesPrNumbers,
    getBlockingPrNumbers,
    // Bug fix (found while auditing this cluster for Phase 7, sub-phase
    // 7.0 - see REACT_MIGRATION_PLAN.md): getAutoRenderBlockingState calls
    // this with no arguments, but getBlockingAuthorInsightsLogins takes
    // authorInsightsState as its own parameter - passed through bare
    // (shorthand property) rather than wrapped in a closure, it silently
    // defaulted to `{}` on every call, so a poll was never actually
    // deferred for an unsaved author-insights comment draft (only for
    // unsaved PR-notes fields, an unrelated dirty-tracking path). No
    // integration test exercised this specific case end-to-end - only
    // pr-auto-render-blocking.helpers.test.js's isolated unit tests, which
    // pass a real authorInsightsState explicitly and so never caught it.
    getBlockingAuthorInsightsLogins: () => getBlockingAuthorInsightsLogins(authorInsightsState),
    formatBlockingPrNumbersLabel,
  });

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
  // Deferred-items follow-up (full vanilla-to-React sweep, see
  // REACT_MIGRATION_PLAN.md): same guard pr-author-insights-pr-link.
  // helpers.js's own navigateToPrInTable already has, at its own call
  // site below (isReactTableMounted defined further down in this file,
  // line ~4092 - safe to reference here since this closure is only
  // ever called later, never during module initialization).
  isReactTableMounted: () => isReactTableMounted(),
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

// Phase 7 (see REACT_MIGRATION_PLAN.md): this file's former
// renderMarkdownAsHtml/replaceExpiredGithubImages bodies moved to
// helpers/pr-markdown-render.helpers.js - ReviewThreadsSection.jsx now
// gets renderMarkdownAsHtml from PrInsightsDisplayProvider/
// usePrInsightsDisplay() instead of the window.* bridge this used to
// populate, and nothing else in this file calls it, so it's not
// re-instantiated here at all.

// Activity drawer feature (see REACT_MIGRATION_PLAN.md): #scheduler-badges/
// #scheduler-details (the Status tab's old "Auto Refresh Scheduler" display)
// were removed as redundant once the drawer's own live "Scheduled background
// jobs" section covered the same ground - this function's only remaining
// jobs are keeping latestSchedulerState current (read by
// renderRequestActivity below) and driving the per-row progress indicator +
// request-activity re-render, both independent of anything scheduler-status
// text ever showed.
const renderSchedulerStatus = (schedulerRaw = {}) => {
  const scheduler = schedulerRaw || {};
  latestSchedulerState = scheduler;
  applyActivePrProgressIndicators(scheduler.activePrNumbers || []);
  renderRequestActivity();
};

// The server (app.js's buildActivePrKey) sends activePrNumbers as
// { repo, prNumber } pairs, not bare numbers - PR numbers are only unique
// within a repo, and several repos can have PRs actively refreshing at
// once (see getViewPrsAutoRefreshRepos' multi-repo fan-out). The set this
// builds is keyed the same "repo::prNumber" way so a lookup needs both,
// not just the number, to match.
const ACTIVE_PR_KEY_SEPARATOR = "::";

const buildActivePrKey = (prNumber, repo) =>
  `${String(repo || "").trim()}${ACTIVE_PR_KEY_SEPARATOR}${prNumber}`;

const normalizeActivePrNumberSet = (activePrNumbersRaw = []) => {
  const activeValues = Array.isArray(activePrNumbersRaw)
    ? activePrNumbersRaw
    : [];
  return new Set(
    activeValues
      .map((entry) => ({
        repo: String(entry?.repo || "").trim(),
        prNumber: String(entry?.prNumber || "").trim(),
      }))
      .filter((entry) => /^\d+$/.test(entry.prNumber))
      .map((entry) => buildActivePrKey(entry.prNumber, entry.repo)),
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

  const activePrKeys = normalizeActivePrNumberSet(activePrNumbersRaw);
  const prNumberCells = collectNodesByClass(sectionsHost, "pr-number-cell");
  prNumberCells.forEach((cell) => {
    const prNumber = readElementAttribute(cell, "data-pr-number").trim();
    const repo = readElementAttribute(cell, "data-repo").trim();
    const indicator = collectNodesByClass(cell, "pr-progress-indicator")[0];
    if (!indicator) {
      return;
    }

    const isActive = activePrKeys.has(buildActivePrKey(prNumber, repo));
    indicator.hidden = !isActive;
  });
};

// Deferred-items follow-up (full vanilla-to-React sweep, see
// REACT_MIGRATION_PLAN.md): the button itself is React-owned
// (components/TriggerAutoRunButton.jsx), which manages disabled/label
// state around this call as its injected onTrigger callback. Phase 7,
// sub-phase 7.6: the fetch/branching logic itself now lives in
// pr-trigger-auto-run-action.helpers.js's runTriggerAutoRunWorkflow (pure
// extraction, zero behavior change) - this is a thin wrapper so the
// window.handleTriggerAutoRun bridge below stays unchanged.
const handleTriggerAutoRun = () => runTriggerAutoRunWorkflow();

const QUICK_CHECK_BUTTON_LABEL = "Quick check";

// Manually triggers the scheduler's own cheap "did anything change" pass
// (POST /view-prs/quick-check -> runViewPrsQuickCheck on the server) - a
// single listing-only `gh` call per repo, no comments/reviews/diffs, so it's
// fast enough to await directly and report the result inline instead of
// firing-and-forgetting like "Trigger auto run" does for the full refresh.
//
// Deferred-items follow-up (full vanilla-to-React sweep, see
// REACT_MIGRATION_PLAN.md): the button itself is React-owned
// (components/QuickCheckButton.jsx). Unlike handleTriggerAutoRun above,
// this one's final label depends on the outcome, so rather than touching
// the DOM directly, this returns a `{ label, resetAfterMs? }` descriptor
// for that component's own onCheck callback to apply. Phase 7, sub-phase
// 7.6: the fetch/branching logic itself now lives in
// pr-quick-check-actions.helpers.js's runQuickCheckWorkflow.
const buildQuickCheckCountLabel = (pendingTotal) =>
  pendingTotal > 0
    ? `${pendingTotal} update${pendingTotal === 1 ? "" : "s"} found`
    : "No changes found";

const handleQuickCheck = () =>
  runQuickCheckWorkflow({
    fallbackLabel: QUICK_CHECK_BUTTON_LABEL,
    buildSuccessLabel: ({ pendingTotal }) => buildQuickCheckCountLabel(pendingTotal),
  });

const QUICK_CHECK_ALL_BUTTON_LABEL = "Quick check all";

// "Quick check all existing PRs" - checks every PR number already loaded in
// the app (across every repo represented in the loaded rows, not just the
// selected one), instead of requiring the user to type numbers into the Run
// & Filter tab's field. Phase 7, sub-phase 7.6: the fetch/branching logic
// itself now lives in pr-quick-check-actions.helpers.js's
// runQuickCheckAllWorkflow (which also owns collectAllLoadedPrsByRepo).
const handleQuickCheckAll = () =>
  runQuickCheckAllWorkflow({
    fallbackLabel: QUICK_CHECK_ALL_BUTTON_LABEL,
    buildSuccessLabel: ({ pendingTotal, reposChecked }) =>
      pendingTotal > 0
        ? `${buildQuickCheckCountLabel(pendingTotal)} across ${reposChecked.length} repo${
            reposChecked.length === 1 ? "" : "s"
          }`
        : "No changes found",
  });

// Manual "run sooner" reprioritization from the Activity drawer's
// dispatcher queue (see REACT_MIGRATION_PLAN.md's dispatcher plan) - POSTs
// to /view-prs/dispatcher/bump, which makes that one (repo, taskType)
// dispatcher entry immediately due and kicks an immediate tick server-side.
// The drawer's own queue re-renders from the next SSE frame (JobEventsContext),
// so this doesn't need to apply any result to the UI itself - just report
// failure if the request didn't succeed. ActivityDrawerDispatcherSection.jsx
// calls this as its onBump prop.
const handleDispatcherBump = async (repo, taskType) => {
  try {
    const { response, result } = await postJson("/view-prs/dispatcher/bump", {
      repo,
      taskType,
    });
    if (!response.ok || result.ok === false) {
      notifyFailureSnackbar("Reprioritize failed", result, "Unable to reprioritize this task");
      return false;
    }
    return true;
  } catch (error) {
    notifyFailureSnackbar("Reprioritize failed", error, "Unable to reach the server");
    return false;
  }
};

// Manual "Reset circuit breaker" action from the Activity drawer's
// circuit-breaker section - POSTs to /view-prs/circuit-breaker/reset with
// no body, resetting every repo's breaker at once (the section only shows
// up when at least one is open, and resetting "everything" matches the
// person's actual intent in the motivating case - coming back after the
// computer was asleep/locked, where the fix is "let auto refresh try
// again", not "pick which repo"). The section's own queue/state re-renders
// from the next SSE frame, so this doesn't need to apply any result to the
// UI itself - just report failure if the request didn't succeed.
// ActivityDrawerCircuitBreakerSection.jsx calls this as its onReset prop.
const handleResetCircuitBreaker = async () => {
  try {
    const { response, result } = await postJson("/view-prs/circuit-breaker/reset", {});
    if (!response.ok || result.ok === false) {
      notifyFailureSnackbar("Reset failed", result, "Unable to reset the circuit breaker");
      return false;
    }
    return true;
  } catch (error) {
    notifyFailureSnackbar("Reset failed", error, "Unable to reach the server");
    return false;
  }
};

// TriggerAutoRunButton.jsx/QuickCheckButton.jsx call these directly as
// their onTrigger/onCheck props - same exposure shape as
// window.handleRequestMoreMerged above.
if (typeof window !== "undefined") {
  window.handleTriggerAutoRun = (...args) => handleTriggerAutoRun(...args);
  window.handleQuickCheck = (...args) => handleQuickCheck(...args);
  window.handleQuickCheckAll = (...args) => handleQuickCheckAll(...args);
  window.handleDispatcherBump = (...args) => handleDispatcherBump(...args);
  window.handleResetCircuitBreaker = (...args) => handleResetCircuitBreaker(...args);
}

// Phase 7, sub-phase 7.4 (see REACT_MIGRATION_PLAN.md): the 5
// populateXOptions functions this factory used to also provide have moved
// to FilterOptionsProvider.jsx/react-app.jsx's MultiSelectListPortals,
// which derive the same option lists reactively from PrDataContext instead
// of being pushed imperatively through here - trimmed DI surface down to
// just what's still used (selection readers, the 6 "Any" filter getters,
// the applied-filter summary, and the dropdown-closing listener).
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
  renderManagementFilterSummary,
  setupMultiSelectDropdownClosing,
} = prFilterPanelHelperFactory.createPrFilterPanelHelpers({
  // Delegates the "Applied filters: ..." summary/chips to react-app.jsx's
  // bridge (AppliedFilterSummary.jsx) - same handled/fallback-to-no-op
  // shape every Phase 2 bridge in this file uses.
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

// Tracked so 'viewprs:react-ready' (initPage, below) can re-render once
// window.updateReactBackfillBadges actually exists - see that listener's
// own comment for why (same bridge-not-ready-yet race the PR table and
// filter dropdowns already guard against).
let latestBackfillStatus = null;

const renderBackfillStatus = (backfillRaw = {}) => {
  const backfill = backfillRaw || {};
  latestBackfillStatus = backfill;
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

  window.updateReactBackfillDetailsText?.(viewModel.detailsText);
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

// Phase 7 (see REACT_MIGRATION_PLAN.md): pure extraction into
// helpers/pr-viewed-files-summary.helpers.js - still bridged below,
// AuthorInsightsPrDataMeta.jsx reads window.getViewedFilesSummary
// directly (PrInsightsRow.jsx now gets it from PrInsightsDisplayProvider/
// usePrInsightsDisplay() instead).
const { getViewedFilesSummary } = prViewedFilesSummaryHelperFactory.createPrViewedFilesSummaryHelpers({
  toCount: (...args) => toCount(...args),
});

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

// Phase 7 (see REACT_MIGRATION_PLAN.md): getOpenConversationCountWithMe
// used to be wired here for the window.* bridge below - PrApprovedCell.jsx
// (like PrInsightsRow.jsx before it) now gets it from
// PrInsightsDisplayProvider/usePrInsightsDisplay() instead, and nothing
// else in this file calls it or getOpenConversationCount.

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

// Phase 7 (see REACT_MIGRATION_PLAN.md): getUserInitials/
// normalizeNameForInitials moved to helpers/pr-user-initials.helpers.js -
// PrApprovedCell.jsx now gets getUserInitials from PrInsightsDisplayProvider/
// usePrInsightsDisplay() instead of the window.* bridge this used to
// populate, and nothing else in this file calls it.

const isInReviewEnabled = (row) => {
  const value = row?.inReview;
  return value === true || String(value || "").toLowerCase() === "true";
};

// Phase 7 (see REACT_MIGRATION_PLAN.md): the window.isInReviewEnabled
// bridge this used to also populate (for components/PrTableApp.jsx) was
// confirmed dead - PrTableApp.jsx's own checkNeedsAttention delegates to
// window.entryNeedsAttention only, never isInReviewEnabled (a past bug,
// already fixed - PrTableApp.test.jsx/index.html.test.js's own regression
// tests prove this value is never read). isInReviewEnabled's real,
// legitimate consumer is this file's own "alwaysShowInReview" filter
// below, which calls it directly, not through window.

// Phase 7 (see REACT_MIGRATION_PLAN.md): isFlaggedEnabled (the sibling of
// isInReviewEnabled above) used to live here - deleted entirely, not just
// its window.* bridge, since it had zero callers of any kind (confirmed
// via grep) - unlike isInReviewEnabled, nothing internal ever called it
// either (no "alwaysShowFlagged"-style filter exists).

// Phase 7, sub-phase 7.3 (revised scope - see REACT_MIGRATION_PLAN.md): thin
// wire-ups around pr-row-checkbox-actions.helpers.js's extracted factory -
// same names, same window.*/DI call sites elsewhere in this file (notably
// react-callbacks.helpers.js's createReactCallbacks() wiring), unchanged.
const { toggleInReviewForRow, toggleFlaggedForRow } =
  prRowCheckboxActionsHelperFactory.createPrRowCheckboxActionsHelpers({
    fetchFn: (...args) => fetch(...args),
    setStatusTextOnly: (...args) => setStatusTextOnly(...args),
    notifyFailureSnackbar: (...args) => notifyFailureSnackbar(...args),
    getLatestStoredPayload: () => latestStoredPayload,
    getLatestSelectedRepo: () => latestSelectedRepo,
    applyLatestPrData: (...args) => applyLatestPrData(...args),
    loadStoredData: (...args) => loadStoredData(...args),
    beginRequestActivity: (...args) => beginRequestActivity(...args),
  });

// Phase 7 (see REACT_MIGRATION_PLAN.md): normalizeNotesListForUi used to
// be destructured here for the window.* bridge below - NotesSection.jsx
// now gets it from PrInsightsDisplayProvider/usePrInsightsDisplay()
// instead, and nothing else in this file calls this factory's output
// directly.

const {
  computePrDataFingerprint,
  computePrDataMetaFingerprint,
  computePrDataManifest,
  getManifestDelta,
  mergeDataDeltaPayload,
  getPendingAutoRenderAction,
  getDataPollRenderAction,
} = prDataPollingHelperFactory.createPrDataPollingHelpers({
  getOrCompute: getOrComputeEntryDerivedValue,
});

const { postJson } = prHttpHelperFactory.createPrHttpHelpers({
  fetch: (...args) => fetch(...args),
});

const {
  isChangedStatus,
  statusIcon,
  formatChkDisplay,
} = prStatusDisplayHelperFactory.createPrStatusDisplayHelpers();

void statusIcon;

const {
  formatCommandOutput,
  getGithubAuthFailureHint,
  formatCommandOutputWithAuthHint,
} = prCommandOutputHelperFactory.createPrCommandOutputHelpers({
  stripAnsi,
});

const { activateDataTab, initDataTabs } =
  prDataTabsHelperFactory.createPrDataTabsHelpers({
    getOptionalElementById,
    onTabActivated: () => {
      renderAuthorInsightsIfVisible();
    },
  });

// PR Data Tab Orchestrator
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
      // Deferred-items follow-up, item 6 (see REACT_MIGRATION_PLAN.md and
      // applyFiltersFromCache's own DI wiring above for the full reasoning)
      // - same read-bridge-with-fallback pattern.
      getLatestStoredPayload: () => window.getReactPrTablePayload?.() ?? latestStoredPayload,
      getLatestSelectedRepo: () => latestSelectedRepo,
      getLastSuccessfulRenderedCheckAt: () => lastSuccessfulRenderedCheckAt,
      getLatestSchedulerState: () => latestSchedulerState,
    },
    stateSetters: {
      setLatestStoredPayload: (value) => applyLatestPrData({ payload: value }),
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
    // Sub-phase 7.2 follow-up (see REACT_MIGRATION_PLAN.md): lets
    // renderPrData prefer "repo"'s Context value over the DOM read. A
    // separate bridge from getFilterStateValue above - "repo" isn't a
    // FilterStateProvider-migrated field, it's real PrDataProvider
    // Context state instead (state/PrDataProvider.jsx).
    getSelectedRepoOverride: () => window.getReactPrTableSelectedRepo?.(),
  });

const { getRequestActivityBadges } =
  prActivityBadgesHelperFactory.createPrActivityBadgesHelpers({
    withElapsedSuffix,
    getRequestActivitySeverityClass,
  });

const {
  shouldAutoScrollBackfillLog: shouldAutoScrollBackfillLogByState,
  getBackfillScrollTop,
  getBackfillStatusViewModel,
  getBackfillStateKey,
  formatBackfillLogMessage,
} = prBackfillHelperFactory.createPrBackfillHelpers();

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

// Action Log's fetch/render is React-owned (ActionLogSection.jsx, mounted
// into #action-log-container) - this just forwards to the bridge it
// registers on mount, so the tab-switch chrome (pr-management-tabs.helpers.js)
// and the Refresh button below can keep calling `loadActionLog()` unchanged.
const loadActionLog = () => window.triggerActionLogLoad?.();

// Actor Names' fetch/render/save is fully React-owned (ActorNamesTab.jsx,
// mounted into #actor-names-root - its own buttons included, not just a
// container-split like Action Log) - this just forwards to the bridge it
// registers on mount, so the tab-switch chrome (pr-management-tabs.helpers.js)
// can keep calling `loadActorNameCache()` unchanged on tab activation.
const loadActorNameCache = () => window.triggerActorNameCacheLoad?.();

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

const {
  getFieldCatalog: getExportFieldCatalog,
  getVisiblePrNumbersFromSectionsHost,
  buildExportPayload,
} = prExportHelperFactory.createPrExportHelpers({
  getPerPrUserStateFromPayload,
});

const asArray = (value) => (Array.isArray(value) ? value : []);

// Phase 7 (see REACT_MIGRATION_PLAN.md): formatDurationMinutes used to be
// defined here for the window.* bridge below - ApprovalRiskSection.jsx
// now gets it from PrInsightsDisplayProvider/usePrInsightsDisplay()
// instead, and nothing else in this file calls it.

// Phase 7, sub-phase 7.0 (see REACT_MIGRATION_PLAN.md): the Review Stats
// tab's whole aggregation cluster (statsViewState, getNormalizedStatsDateRange,
// isWithinStatsDateRange, buildReviewerStats, applyStatsControls,
// renderActivityTrendNote, the timeline aggregation functions, and every
// window.* bridge that used to expose them) moved to React - see
// state/ReviewStatsContext.jsx and components/ReviewStatsProvider.jsx,
// which derive all of it fresh from PrDataContext's statsViewState (now
// real state, owned by ReviewStatsControls) instead of a vanilla-closure
// snapshot. normalizeRowMetrics used to also be destructured here for
// getOpenConversationCount's sake (the "More insights" panel) - that's
// now PrInsightsDisplayProvider's own separate instance of this same
// factory (helpers/pr-open-conversation-count.helpers.js), so nothing in
// this file needs it any more.

if (typeof window !== "undefined") {
  // Reuses the same React-safe navigation prAuthorInsightsPrLinkHelpers
  // already provides for Author Insights' own "View in table" button
  // (dispatches 'pr-navigate-to-insights' when React owns the PR table,
  // instead of directly mutating `.hidden`/textContent on nodes React
  // renders - see that helper's own comment). The "View in table" button
  // built inline in pr-review-stats-summary.component.js does the
  // *unsafe* raw-DOM version instead and was never fixed - ReviewStatsContent
  // (react-app.jsx) uses this bridge instead of that broken vanilla
  // behavior, rather than duplicating either version a third time.
  // `repo` is optional here - ReviewStatsContent.jsx's stats "source" items
  // don't currently carry a repo field, so this still falls back to
  // navigateToPrInTable's number-only matching for now (same as before
  // this parameter existed) until the stats pipeline threads repo through
  // too.
  window.navigateToPrInTableFromStats = (prNumber, repo) =>
    prAuthorInsightsPrLinkHelpers.navigateToPrInTable(prNumber, repo, {
      activateDataTab,
      collectNodesByTag,
    });
}

// Author Insights helper modules (refactored dependency injection)

const prAuthorInsightsPrLinkHelpers =
  prAuthorInsightsPrLinkHelperFactory.createPrAuthorInsightsPrLinkHelpers({
    isReactTableMounted: () => isReactTableMounted(),
  });

const prAuthorInsightsDisplayHelpers =
  prAuthorInsightsDisplayHelperFactory.createPrAuthorInsightsDisplayHelpers({
    resolveActorDisplayName: (...args) => resolveActorDisplayName(...args),
    getPreferredActorKey: (...args) => getPreferredActorKey(...args),
    normalizeActorLogin: (...args) => normalizeActorLogin(...args),
    normalizeAuthorInsightsSentiment: (...args) =>
      normalizeAuthorInsightsSentiment(...args),
    isChangedStatus: (...args) => isChangedStatus(...args),
    asArray,
    parseSortableTime: (...args) => parseSortableTime(...args),
    formatIsoDatetime: (...args) => formatIsoDatetime(...args),
  });

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
    // Track C (post-Phase-6 follow-up, see REACT_MIGRATION_PLAN.md): pushes
    // the current selection into PrDataProvider's Context state, read
    // directly by AuthorCreatedPrsSection/AuthorInsightsNotesSection/
    // AuthorInsightsCommentsSection - see PrDataProvider.jsx.
    updateReactSelectedAuthorLogin: (login) =>
      typeof window !== "undefined" && typeof window.updateReactSelectedAuthorLogin === "function"
        ? window.updateReactSelectedAuthorLogin(login)
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
  window.navigateToPrInTableFromAuthorInsights = (prNumber, repo) =>
    prAuthorInsightsPrLinkHelpers.navigateToPrInTable(prNumber, repo, {
      activateDataTab,
      collectNodesByTag,
    });
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
  // Activity drawer feature (see REACT_MIGRATION_PLAN.md): previously
  // untracked - wrapped the same way every other tracked action is, so a
  // genuinely slow save becomes visible instead of just sitting silent.
  window.saveAuthorManualComment = async ({ authorLogin, note, sentiment }) => {
    const finishActivity = beginRequestActivity("authorComment");
    try {
      return await prAuthorInsightsDataHelpers.saveAuthorManualComment({
        authorLogin,
        note,
        sentiment,
        postJson: (...args) => postJson(...args),
      });
    } finally {
      finishActivity();
    }
  };
  window.updateAuthorManualComment = async (args) => {
    const finishActivity = beginRequestActivity("authorComment");
    try {
      return await prAuthorInsightsDataHelpers.updateAuthorManualComment(args);
    } finally {
      finishActivity();
    }
  };
}

const {
  normalizeActorLoginAliases,
  normalizeActorLogin,
  getPreferredActorKey,
  resolveActorDisplayName,
} = prActorIdentityHelperFactory.createPrActorIdentityHelpers({
  asArray,
  getActorLoginAliases: () => currentActorLoginAliases,
});

// Phase 7 (see REACT_MIGRATION_PLAN.md): buildActivityEventKey/
// normalizePrRootUrl/buildFallbackActivityEvents moved to
// helpers/pr-activity-events.helpers.js - ActivityEventsSection.jsx now
// gets them from PrInsightsDisplayProvider/usePrInsightsDisplay()
// instead of the window.* bridge these used to populate, and nothing
// else in this file calls them.

// Phase 7 (see REACT_MIGRATION_PLAN.md): getReviewConversationsStateKey/
// readReviewConversationsUiState/writeReviewConversationsUiState (and the
// reviewConversationsUiStateByKey Map they read/wrote) moved to
// helpers/pr-review-conversations-ui-state.helpers.js +
// components/ReviewConversationsUiStateProvider.jsx -
// ReviewThreadsSection.jsx now owns this entirely in React (no outward
// consumer ever needed it), and nothing else in this file calls any of
// the above.

// Phase 7 (see REACT_MIGRATION_PLAN.md): buildPrPeopleOptions moved to
// helpers/pr-notes-people-options.helpers.js - NotesSection.jsx now gets
// it from PrInsightsDisplayProvider/usePrInsightsDisplay() instead of
// the window.* bridge this used to populate, and nothing else in this
// file calls it.

const autoResizeTextarea = (el) => {
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
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

const parsePrNumbersInput = (rawValue) =>
  formParsingHelpers?.parsePrNumbersInput
    ? formParsingHelpers.parsePrNumbersInput(rawValue)
    : parseCsvTokens(rawValue).filter((value) => /^\d+$/.test(String(value)));

// Phase 7 (see REACT_MIGRATION_PLAN.md): getPrNumbersInput/getSelectedPrNumbers/
// setSelectedPrNumbers/handlePrNumbersInputChange/updateSelectedPrNumbers used
// to live here, reading/writing the "#pr-numbers" DOM input directly and
// bridged onto window for PrSelectionCell.jsx. "#pr-numbers" is now
// Context-backed (FilterStateProvider, via ContextRunScriptTextInput.jsx -
// see FILTER_STATE_FIELD_MAP's "pr-numbers" entry above) and
// PrSelectionCell.jsx reads/writes the same Context value directly via
// window.getFilterStateValues()/setFilterStateValue() (helpers/
// pr-selected-pr-numbers.helpers.js holds the pure toggle logic that used
// to live in updateSelectedPrNumbers) - no window.* bridge needed for
// this cluster at all anymore.

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
  applyLatestPrData({ selectedRepo: resolvedRepo });
  if (shouldRefetchLabelsForRepo({ repo: resolvedRepo, lastFetchedRepo: labelsFetchedForRepo })) {
    labelsFetchedForRepo = resolvedRepo;
    void refreshAvailableRepoLabels(resolvedRepo);
  }
};

const renderPrData = (payload, selectedRepo = "", options = {}) => {
  // Update global state
  if (payload) {
    applyLatestPrData({ payload });
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

// Phase 7, sub-phase 7.2 (revised scope - see REACT_MIGRATION_PLAN.md): a
// thin wire-up around pr-data-polling-orchestration.helpers.js's extracted
// factory - the actual fetch-cascade/fingerprint-diff/render-decision logic
// lives there now (pure, DI-tested, zero window/DOM dependency of its own).
// This function's own identity (a plain top-level function assigned to
// window.pollForDataChanges the same way as before) is preserved
// deliberately: index.html.test.js calls window.pollForDataChanges()
// directly at 17 call sites and never mounts <PrDataPolling>, so removing
// this wrapper (not just its body) would break that suite.
const { pollForDataChanges } =
  prDataPollingOrchestrationHelperFactory.createPrDataPollingOrchestrationHelpers({
    fetchFn: (...args) => fetch(...args),
    documentRef: typeof document !== "undefined" ? document : null,
    computePrDataManifest: (...args) => computePrDataManifest(...args),
    getManifestDelta: (...args) => getManifestDelta(...args),
    mergeDataDeltaPayload: (...args) => mergeDataDeltaPayload(...args),
    computePrDataFingerprint: (...args) => computePrDataFingerprint(...args),
    computePrDataMetaFingerprint: (...args) => computePrDataMetaFingerprint(...args),
    getDataPollRenderAction: (...args) => getDataPollRenderAction(...args),
    getSupportsDataMetaPolling: () => supportsDataMetaPolling,
    setSupportsDataMetaPolling: (value) => {
      supportsDataMetaPolling = value;
    },
    getSupportsDataManifestPolling: () => supportsDataManifestPolling,
    setSupportsDataManifestPolling: (value) => {
      supportsDataManifestPolling = value;
    },
    getLastSeenDataVersion: () => lastSeenDataVersion,
    setLastSeenDataVersion: (value) => {
      lastSeenDataVersion = value;
    },
    getLatestPrManifest: () => latestPrManifest,
    setLatestPrManifest: (value) => {
      latestPrManifest = value;
    },
    getLatestStoredPayload: () => latestStoredPayload,
    applyLatestPrData: (...args) => applyLatestPrData(...args),
    getLastRenderedPrFingerprint: () => lastRenderedPrFingerprint,
    setLastRenderedPrFingerprint: (value) => {
      lastRenderedPrFingerprint = value;
    },
    getLastRenderedMetaFingerprint: () => lastRenderedMetaFingerprint,
    setLastRenderedMetaFingerprint: (value) => {
      lastRenderedMetaFingerprint = value;
    },
    getLastRenderedRunStamp: () => lastRenderedRunStamp,
    setLastRenderedRunStamp: (value) => {
      lastRenderedRunStamp = value;
    },
    getHasDirtyPrSectionsFields: () => hasDirtyPrSectionsFields,
    getPendingAutoRenderPayload: () => pendingAutoRenderPayload,
    setPendingAutoRenderPayload: (value) => {
      pendingAutoRenderPayload = value;
    },
    renderPrData: (...args) => renderPrData(...args),
    renderAutoRenderBlockedIndicator: (...args) =>
      renderAutoRenderBlockedIndicator(...args),
    flushPendingAutoRender: (...args) => flushPendingAutoRender(...args),
    markPollSuccess: (...args) => markPollSuccess(...args),
    showPollFailureWarning: (...args) => showPollFailureWarning(...args),
    setStatusMessage: (...args) => setStatusMessage(...args),
  });

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
  // Activity drawer feature (see REACT_MIGRATION_PLAN.md's "Polling
  // retirement" section): JobEventsProvider.jsx calls this directly with
  // the scheduler object bundled into every SSE frame, replacing the old
  // schedulerInterval poll (removed from PrDataPolling.jsx) as the trigger
  // for this same rendering - the function itself (badges, details text,
  // the pr-active-progress-update dispatch) is unchanged.
  window.renderSchedulerStatus = (...args) => renderSchedulerStatus(...args);
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
        applyLatestPrData({ payload: latestData, selectedRepo: effectiveRepo });
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

const { runWithConcurrencyLimit } = prConcurrencyHelperFactory.createPrConcurrencyHelpers();

const {
  runQuickCheckWorkflow,
  runQuickCheckAllWorkflow,
} = prQuickCheckActionsHelperFactory.createPrQuickCheckActionsHelpers({
  showErrorNotification: (...args) => showErrorNotification(...args),
  showWarningNotification: (...args) => showWarningNotification(...args),
  notifyFailureSnackbar: (...args) => notifyFailureSnackbar(...args),
  loadSchedulerStatus: (...args) => loadSchedulerStatus(...args),
  postJson: (...args) => postJson(...args),
  getFormBody: () => getFormBody(),
  getLatestStoredPayload: () => latestStoredPayload,
  markPrsBusy: (...args) => window.markPrsBusy?.(...args),
  clearPrsBusy: (...args) => window.clearPrsBusy?.(...args),
});

// Phase 7, sub-phase 7.6 (see REACT_MIGRATION_PLAN.md): see that function's
// own module for why this is a separate, single-action helper file rather
// than folded into pr-quick-check-actions.helpers.js above.
const { runTriggerAutoRunWorkflow } =
  prTriggerAutoRunActionHelperFactory.createPrTriggerAutoRunActionHelpers({
    postJson: (...args) => postJson(...args),
    showErrorNotification: (...args) => showErrorNotification(...args),
    notifyFailureSnackbar: (...args) => notifyFailureSnackbar(...args),
  });

// Phase 7, sub-phase 7.3 (revised scope - see REACT_MIGRATION_PLAN.md): thin
// wire-ups around pr-ack-label-actions.helpers.js's extracted factory - same
// names, same call sites elsewhere in this file (handleAckOnly/
// handleClearOnly below, react-callbacks.helpers.js's createReactCallbacks()
// wiring), unchanged. runAckAction/runApplyLabelAction are only ever called
// internally by runAckOnlyWorkflow/runClearOnlyWorkflow/runApplyLabelWorkflow
// now that all five live inside the same factory instance, so they're not
// destructured here - index.page.js has no other caller for them.
const {
  runAckOnlyWorkflow,
  runClearOnlyWorkflow,
  runApplyLabelWorkflow,
} = prAckLabelActionsHelperFactory.createPrAckLabelActionsHelpers({
  postJson: (...args) => postJson(...args),
  setStatusMessage: (...args) => setStatusMessage(...args),
  setOutputMessage: (...args) => setOutputMessage(...args),
  beginRequestActivity: (...args) => beginRequestActivity(...args),
  getGithubAuthFailureHint: (...args) => getGithubAuthFailureHint(...args),
  formatCommandOutput: (...args) => formatCommandOutput(...args),
  formatCommandOutputWithAuthHint: (...args) => formatCommandOutputWithAuthHint(...args),
  showErrorNotification: (...args) => showErrorNotification(...args),
  showWarningNotification: (...args) => showWarningNotification(...args),
  summarizeAckRefreshWarnings: (...args) => summarizeAckRefreshWarnings(...args),
  renderPrData: (...args) => renderPrData(...args),
  loadStoredData: (...args) => loadStoredData(...args),
  getFormBody: (...args) => getFormBody(...args),
  defaultRepo: DEFAULT_REPO,
  parseCsvTokens: (...args) => parseCsvTokens(...args),
  // Bridges into PrTableApp.jsx's per-row busy/queued indicators - see
  // that component's own comments. No-op (via
  // createPrAckLabelActionsHelpers' own safe fallback) when React hasn't
  // mounted the table yet.
  markPrsBusy: (...args) => window.markPrsBusy?.(...args),
  clearPrsBusy: (...args) => window.clearPrsBusy?.(...args),
  markPrsQueued: (...args) => window.markPrsQueued?.(...args),
  clearPrsQueued: (...args) => window.clearPrsQueued?.(...args),
  // Activity drawer feature (see REACT_MIGRATION_PLAN.md): bridges into
  // PrActivityQueueProvider.jsx's bulk-batch manifest, the one place the
  // drawer shows a real ordered queue. Same no-op-until-mounted fallback
  // as the busy/queued bridges above.
  beginBulkActionBatch: (...args) => window.beginBulkActionBatch?.(...args),
  markBulkActionChunkInFlight: (...args) => window.markBulkActionChunkInFlight?.(...args),
  markBulkActionChunkDone: (...args) => window.markBulkActionChunkDone?.(...args),
  finishBulkActionBatch: (...args) => window.finishBulkActionBatch?.(...args),
  runWithConcurrencyLimit: (...args) => runWithConcurrencyLimit(...args),
  // Phase 7, sub-phase 7.3 follow-up (see REACT_MIGRATION_PLAN.md): lets
  // the loadStoredData-fallback branches return the freshly-loaded payload
  // directly, instead of react-callbacks.helpers.js having to read it back
  // itself afterward.
  getLatestStoredPayload: () => latestStoredPayload,
});

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

// Renders the dropdown into #apply-label-select-root via React (see
// ApplyLabelSelect.jsx, mounted in react-app.jsx) - a native <select>'s own
// selection-preservation behavior on re-render replaces the vanilla
// version's manual "restore previous value if still valid" logic, so no
// bridge return value or key remount is needed here.
const populateApplyLabelSelect = () => {
  window.updateReactApplyLabelOptions?.(availableRepoLabels);
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
  if (!reactCallbackHelperFactory) {
    console.warn('[ReactIntegration] React callbacks helper not available');
    return null;
  }

  const helpers = reactCallbackHelperFactory.createReactCallbackHelpers({
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
      // Phase 7, sub-phase 7.3 follow-up (see REACT_MIGRATION_PLAN.md): no
      // getLatestStoredPayload here any more. handleCheckboxChange/
      // handleAckAction/handleApplyLabel (react-callbacks.helpers.js) used
      // to mutate latestStoredPayload as a synchronous side effect (via
      // toggleFlaggedForRow/toggleInReviewForRow/runAckOnlyWorkflow/etc.)
      // and then immediately read it back via a getter, in the SAME call,
      // to push the just-mutated value into React - a real, Playwright-
      // confirmed hazard if that getter were ever switched to the
      // window.getReactPrTablePayload Context bridge (Context's payload
      // only updates *after* the getter's return value reaches
      // updateReactTableSafe, so reading it there would hand back the
      // pre-mutation payload and undo the change). Resolved by having
      // those vanilla functions return their freshly-computed
      // { payload, selectedRepo } directly instead of writing it
      // somewhere react-callbacks.helpers.js has to read back - see each
      // function's own comment. getLatestSelectedRepo stays: it's used for
      // an unrelated, pre-call repoOverride fallback, not a same-tick
      // readback.
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
  // restoreUiOptionOverrides() and loadStoredData() below both fire their
  // own independent fetches ("/view-prs/user-defaults" and "/view-prs/data"
  // respectively) with no ordering guarantee between them. The multi-select
  // filter lists (label/exclude-label/author/assigned/approver/thread-
  // resolution allow-deny/change-filter actor lists) seed their checked
  // state from the pending*FilterSelections this call populates - if
  // loadStoredData's renderPrData call runs first (a real, reproducible
  // race, not just theoretical - confirmed locally and in CI), those lists
  // render with nothing checked, restoreUiOptionOverrides() only ever runs
  // once more (on 'viewprs:react-ready', below) and never re-triggers a
  // populate, so the "restore a persisted selection" e2e tests saw a
  // permanently unchecked box after every reload. Re-render with whatever
  // payload has already loaded once overrides actually land, so the
  // apply-then-reload sequence works regardless of which fetch wins.
  //
  // queueMicrotask, not a direct call: this .then() can run essentially
  // immediately (a fast/local fetch resolving inside the same microtask
  // flush React is still processing from its own initial-mount effects) -
  // calling straight into React reentrantly mid-render/mid-effect-flush
  // has repeatedly caused real "flushSync was called from inside a
  // lifecycle method" warnings/errors elsewhere in this codebase (see
  // MultiSelectListPortals.jsx's own comment for the most recent one,
  // sub-phase 7.4). Queuing a fresh microtask guarantees React has fully
  // finished whatever it was doing first - a plain setTimeout also works
  // in a real browser, but jsdom integration tests that `await
  // user.click(...)` and assert immediately (no `waitFor`) only drain the
  // microtask queue, not macrotasks, and would see the pre-restore value;
  // a microtask still resolves within that same drain.
  void restoreUiOptionOverrides().then(() => {
    if (latestStoredPayload) {
      queueMicrotask(() => renderPrData(latestStoredPayload, latestSelectedRepo));
    }
  });
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
        // The 9 multi-select lists' pending selections (label,
        // exclude-label, author, assigned, approver, thread-resolution
        // allow/deny, change-filter ignore-author) have no DOM id and so go
        // through setPendingSelectionsValue instead of FILTER_STATE_FIELD_MAP
        // (see that function's own comment). Every OTHER Context-migrated
        // field restored above still needs this re-render to reach the
        // vanilla-rendered UI (data-meta summary, filter chips, etc.) -
        // the 9 multi-select lists specifically do not any more:
        // setPendingSelectionsValue's write (just above, inside
        // restoreUiOptionOverrides) notifies MultiSelectListPortals.jsx
        // directly (see pr-pending-multi-select-selections.helpers.js's
        // subscribeToPendingMultiSelectSelections), which re-seeds their
        // checked state on its own, independent of whether this renderPrData
        // call even changes anything a memo would notice.
        //
        // queueMicrotask: same flushSync-reentrancy/jsdom-await reasons as
        // the first restoreUiOptionOverrides().then() above - this one is
        // reachable even more directly, since it runs from inside a
        // 'viewprs:react-ready' listener that dispatchEvent invoked
        // synchronously from within a React effect.
        if (latestStoredPayload) {
          queueMicrotask(() => renderPrData(latestStoredPayload, latestSelectedRepo));
        }
      });
    },
    { once: true },
  );
  // The Backfill tab's status badges (<BackfillBadges />, mounted via
  // window.updateReactBackfillBadges) have the exact same load-order race
  // as the PR table above: loadBackfillStatus() below often resolves
  // before react-app.jsx has mounted, and renderBackfillStatus's
  // window.updateReactBackfillBadges?.(...) call silently no-ops when the
  // bridge isn't there yet - with no retry, unlike the PR table and filter
  // dropdowns, so the badges stayed permanently empty. Only actually
  // reproduces when React's mount is slow enough to lose the race (a real
  // CI-only flake - always won locally, confirmed failing intermittently
  // in CI's slower/shared runners). Re-render once React signals ready.
  window.addEventListener(
    "viewprs:react-ready",
    () => {
      if (latestBackfillStatus) {
        renderBackfillStatus(latestBackfillStatus);
      }
    },
    { once: true },
  );
  // Deferred-items follow-up (full vanilla-to-React sweep, see
  // REACT_MIGRATION_PLAN.md): same bridge-not-ready-yet race as backfill
  // badges/details above, for #backfill-log specifically (see
  // latestBackfillLogMessage's own comment for why this one needs it and
  // the others above don't).
  window.addEventListener(
    "viewprs:react-ready",
    () => {
      if (latestBackfillLogMessage !== null) {
        window.updateReactBackfillLogText?.(latestBackfillLogMessage);
      }
    },
    { once: true },
  );
  // Same bridge-not-ready-yet race as the two listeners above, for
  // applyNonCredentialFieldHints() below: it reaches for the 5 "Run Script
  // options" fields (repo/limit/merged-limit/jobs/pr-numbers) by DOM id,
  // but all 5 are React-portaled (FilterStateProvider, see
  // ContextRunScriptTextInput.jsx) and don't exist in the DOM yet at this
  // point in a real page load - react-app.jsx's own module graph is still
  // loading, same race the other listeners in this block exist for. The
  // initial call below is harmless-but-ineffective until this fires (finds
  // nothing, silently no-ops via getOptionalElementById) - kept anyway for
  // any environment where React happens to already be mounted (e.g. a test
  // harness that injects the markup synchronously up front).
  window.addEventListener(
    "viewprs:react-ready",
    () => applyNonCredentialFieldHints(),
    { once: true },
  );
  registerUiOptionPersistenceHandlers();
  initManagementTabs();
  // Initialize PR Data Tab orchestrator (which calls initDataTabs internally)
  prDataTabOrchestrator.initialize();
  // Initialize Backfill Tab orchestrator
  backfillTabOrchestrator.initialize();
  applyNonCredentialFieldHints();
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
  // Phase 7, sub-phase 7.0 (see REACT_MIGRATION_PLAN.md): actor-identity
  // resolution (normalizeActorLogin, resolveActorDisplayName,
  // getPreferredActorKey, buildRowActorsMap, getEffectiveViewerLogin,
  // buildActorIdentityClassName, buildActorIdentityTitle) moved off this
  // bridge - React now derives it independently via useActorIdentity()
  // (state/ActorIdentityContext.jsx), computed straight from the payload
  // PrDataProvider already holds instead of reading index.page.js's copy.
  // Also moved off: isChangedStatus/statusClass/approvedClass/
  // formatTitleWithIcons (createPrStatusDisplayHelpers(), zero-arg pure -
  // consuming components now import it directly), escapeHtml/
  // formatIsoDatetime (createPrFormattingHelpers(), same reasoning), and
  // countPendingThreadComments (extracted from an inline index.page.js
  // function into helpers/pr-thread-comments.helpers.js). formatChkDisplay
  // and toCount stay - AuthorInsightsPrDataMeta.jsx still reads them off
  // window (see that file's own comment for why it's deliberately deferred
  // as one atomic unit, not cherry-picked here). shouldShowNeedsAttention/
  // entryNeedsAttention/getNeedsAttentionConfig also moved off (both the
  // separate window.entryNeedsAttention/window.getNeedsAttentionConfig
  // assignment above and shouldShowNeedsAttention here) - PrTableApp.jsx
  // now derives all three via useNeedsAttention()
  // (state/NeedsAttentionContext.jsx, components/NeedsAttentionProvider.jsx),
  // since the "Needs Attention rules" config fields are all already
  // Context-native (Phase 6, FilterStateProvider) and the classification
  // helpers only need actor-identity, itself already Context-native.
  Object.assign(window, {
    formatChkDisplay,
    collectPrAuthors,
    // Phase 7 (see REACT_MIGRATION_PLAN.md): collectAssignedUsers/
    // collectRequestedReviewers/getUserInitials/getOpenConversationCountWithMe
    // used to be bridged here too - PrApprovedCell.jsx now gets all 4 from
    // PrInsightsDisplayProvider/usePrInsightsDisplay() instead, and no
    // other component reads any of these 4 names off window.
    getManualNotesSummary,
    getManualNotesFieldSummary,
    buildPrLastCheckedIndicator,
    getViewedFilesState,
    getViewedFilesSummary,
    // Phase 7 (see REACT_MIGRATION_PLAN.md): getSelectedPrNumbers/
    // updateSelectedPrNumbers used to be bridged here too -
    // PrSelectionCell.jsx now reads/writes "#pr-numbers"'s Context value
    // directly instead (see the comment at that field's old definition,
    // above getUiOptionDefaults' call sites).
    getLabelName,
    getAvailableRepoLabels,
    // Phase 7 (see REACT_MIGRATION_PLAN.md): isInReviewEnabled/
    // isFlaggedEnabled used to also be bridged here - confirmed dead for
    // the React/component side (see the comments at isInReviewEnabled's
    // definition and isFlaggedEnabled's old location above), so both
    // entries are removed. isInReviewEnabled's definition stays (still
    // used by this file's own internal filtering); isFlaggedEnabled's
    // definition was deleted outright - it had no callers at all.
    toCount,
    runSinglePrUpdate,
    // ---- "More insights" panel (see components/PrInsightsRow.jsx and
    // components/insights/*) ----
    // Phase 7 (see REACT_MIGRATION_PLAN.md): formatApproversDisplay/
    // formatRequestedReviewersDisplay/formatAssignedUsersDisplay/
    // normalizeRowMetrics/getBadgeClassForStatus/Check/Merge/
    // formatReviewFootprint/ConversationStatus/ApprovalRisk/
    // CommentUsefulness/buildFallbackActivityEvents/buildActivityEventKey/
    // normalizePrRootUrl/renderMarkdownAsHtml/buildPrPeopleOptions/
    // normalizeNotesListForUi/formatDurationMinutes all moved off this
    // bridge onto PrInsightsDisplayProvider/usePrInsightsDisplay()
    // (state/PrInsightsDisplayContext.jsx), and so did
    // readReviewConversationsUiState/writeReviewConversationsUiState (onto
    // ReviewConversationsUiStateProvider - no window.* bridge needed at
    // all there, nothing outside ReviewThreadsSection.jsx ever read them).
    // parseMarkerState/getViewedFilesSummary (above) stay -
    // AuthorInsightsPrDataMeta.jsx still reads them off window directly, a
    // documented follow-up opportunity, not an oversight.
    // getAuthorThreadResolutionPolicy stays too - a genuinely separate
    // concern (a DOM-scan dependency), deliberately out of scope.
    parseMarkerState,
    getAuthorThreadResolutionPolicy,
    parseSortableTime,
    noteAuthorMatchesSelection,
    getNotesDifficultyLevelText,
    postJson,
    asArray,
    autoResizeTextarea,
    recomputeDirtyPrSectionsFields,
    // ---- PR JSON modal (see components/PrJsonModal.jsx) ----
    safeJsonStringify,
    getPerPrUserStateFromPayload,
    DEFAULT_REPO,
    // ---- Export tab (see components/ExportTab.jsx) ----
    getExportFieldCatalog,
    getVisiblePrNumbersFromSectionsHost,
    buildExportPayload,
    // Phase 7 (see REACT_MIGRATION_PLAN.md): normalizeRows/
    // sortRowsByPrNumberDesc/sortRowsByDateFieldDesc ("Row sorting", see
    // components/PrTableApp.jsx) used to be bridged here too -
    // PrTableApp.jsx now imports all 3 directly from
    // helpers/pr-row-sorting.helpers.js instead (genuinely
    // zero-dependency), and no other component read them off window.
    // ---- Auto-render-blocked indicator links (see
    // components/AutoRenderBlockedLinks.jsx) ----
    navigateToPrInTable,
    navigateToAuthorInsights,
    getAuthorInsightsDisplayName,
  });

  // The initial loadStoredData() fetch below often resolves before the
  // deferred react-app.jsx module (and its full import graph) finishes
  // loading, so the first renderPrData() call falls back to vanilla
  // rendering. Re-render once React signals it's actually ready.
  //
  // Guard on latestStoredPayload (not just isReactTableMounted()): now that
  // 'viewprs:react-ready' only fires once window.mountReactPrTable is truly
  // assigned (see react-app.jsx's AppRoot effect), this listener typically
  // fires *before* loadStoredData() below has resolved, not after. Without
  // this guard, that made renderPrData(undefined, "") run here and, since
  // hasReactApp is now already true, take the REACT RENDERING PATH and
  // mount the table with an empty payload - marking isReactTableMounted()
  // true before the real data arrived. The real data's later renderPrData
  // call would then see "already mounted" and skip straight to
  // updateReactTable, re-running the vanilla filter-dropdown population a
  // second time in the process (once for this empty mount, once for the
  // real update) - exactly the stale-DOM-read double-populate race the
  // multi-select lists' own render-cache (createMultiSelectRenderCache,
  // MultiSelectListPortals.jsx) exists to guard against, just one extra
  // time. Only re-render here once real data has actually loaded;
  // otherwise loadStoredData()'s own renderPrData call below already
  // lands on the correct (mount, not update) path unaided.
  window.addEventListener(
    "viewprs:react-ready",
    () => {
      if (!isReactTableMounted() && latestStoredPayload) {
        renderPrData(latestStoredPayload, latestSelectedRepo);
      }
    },
    { once: true },
  );

  loadStoredData("").catch((error) => {
    setStatusMessage("Failed to load stored data");
    window.updateReactDataMetaText?.("Failed to load.");
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
          // Deferred-items follow-up (full vanilla-to-React sweep, see
          // REACT_MIGRATION_PLAN.md): used to call
          // updateMultiSelectSummary(listId) here (deleted) - now
          // redundant, since MultiSelectCheckboxList.jsx's own React
          // state already reacts to this same checkbox's onChange and
          // re-renders the summary text as part of its own render cycle.
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
  // Deferred-items follow-up (full vanilla-to-React sweep, see
  // REACT_MIGRATION_PLAN.md): #quick-check-btn/#trigger-auto-run-btn are
  // React-owned now (components/QuickCheckButton.jsx/
  // TriggerAutoRunButton.jsx), with their own onClick handlers calling
  // handleQuickCheck/handleTriggerAutoRun as injected callbacks - no
  // vanilla wiring needed here anymore.
  // Deferred-items follow-up (full vanilla-to-React sweep, see
  // REACT_MIGRATION_PLAN.md): #error-snackbar-close is React-owned now
  // (components/Snackbar.jsx), with its own onClick handler - no vanilla
  // wiring needed here anymore.
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
      formatBlockingPrNumbersLabel,
      normalizeAuthorInsightsSentiment,
      isAuthorInsightsComposerDraftDirty,
      isAuthorInsightsEditDraftDirty,
      resolveRepoForLabelsFetch,
      shouldRefetchLabelsForRepo,
    },
  };
}
