// ES module cleanup (see REACT_MIGRATION_PLAN.md): real imports for
// helper files that have been converted off the UMD wrapper, kept as one
// block at the top per normal `import` placement conventions - every
// not-yet-converted dependency below still uses the original
// `require(...) : globalThis.ViewPrsXHelpers` fallback, which continues
// to work unmodified (this file's own <script> tag is now type="module",
// see index.html) until it's converted too.
import * as formParsingHelpersModule from "./helpers/form-parsing.helpers.js";
import * as prDataTabOrchestratorFactory from "./orchestrators/pr-data-tab.orchestrator.js";
import * as prEntryDerivedCacheHelperFactory from "./helpers/pr-entry-derived-cache.helpers.js";
import * as prSectionGroupingHelperFactory from "./helpers/pr-section-grouping.helpers.js";
import * as prFormattingHelperFactory from "./helpers/pr-formatting.helpers.js";
import * as prActorIdentityRenderHelperFactory from "./helpers/pr-actor-identity-render.helpers.js";
import * as prRequestedReviewersHelperFactory from "./helpers/pr-requested-reviewers.helpers.js";
import * as prAssignedUsersHelperFactory from "./helpers/pr-assigned-users.helpers.js";
import * as prApproversHelperFactory from "./helpers/pr-approvers.helpers.js";
import * as prNeedsAttentionHelperFactory from "./helpers/pr-needs-attention.helpers.js";
import * as prUiOptionScrollHelperFactory from "./helpers/pr-ui-option-scroll.helpers.js";
import * as prDomAccessHelperFactory from "./helpers/pr-dom-access.helpers.js";
import * as prDomTraversalHelperFactory from "./helpers/pr-dom-traversal.helpers.js";
import * as prSectionOpenStateHelperFactory from "./helpers/pr-section-open-state.helpers.js";
import * as prAppliedSummaryHelperFactory from "./helpers/pr-applied-summary.helpers.js";
import * as prScopeSelectionHelperFactory from "./helpers/pr-scope-selection.helpers.js";
import * as prScopeSettingsHelperFactory from "./helpers/pr-scope-settings.helpers.js";
import * as prRepoRunContextHelperFactory from "./helpers/pr-repo-run-context.helpers.js";
import * as prRenderContextHelperFactory from "./helpers/pr-render-context.helpers.js";
import * as prRowSourcesHelperFactory from "./helpers/pr-row-sources.helpers.js";
import * as prViewerContextHelperFactory from "./helpers/pr-viewer-context.helpers.js";
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
import * as prMergedRequestMoreActionHelperFactory from "./helpers/pr-merged-request-more-action.helpers.js";
import * as prApplyFiltersCacheHelperFactory from "./helpers/pr-apply-filters-cache.helpers.js";
import * as prRenderViewerFilterSetupHelperFactory from "./helpers/pr-render-viewer-filter-setup.helpers.js";
import * as prSelectedFiltersHelperFactory from "./helpers/pr-selected-filters.helpers.js";
import * as prRowFilteringHelperFactory from "./helpers/pr-row-filtering.helpers.js";
import * as prRowMatchFiltersHelperFactory from "./helpers/pr-row-match-filters.helpers.js";
import * as prAutoRenderUnsavedHelperFactory from "./helpers/pr-auto-render-unsaved.helpers.js";
import * as prAuthorInsightsIdentityHelperFactory from "./helpers/pr-author-insights-identity.helpers.js";
import * as prAuthorInsightsDraftsHelperFactory from "./helpers/pr-author-insights-drafts.helpers.js";
import * as prAutoRenderBlockingHelperFactory from "./helpers/pr-auto-render-blocking.helpers.js";
import * as prAutoRenderIndicatorHelperFactory from "./helpers/pr-auto-render-indicator.helpers.js";
import * as prAutoRenderIndicatorLinksHelperFactory from "./helpers/pr-auto-render-indicator-links.helpers.js";
import * as prAutoRenderStateHelperFactory from "./helpers/pr-auto-render-state.helpers.js";
import * as prFilterPanelHelperFactory from "./helpers/pr-filter-panel.helpers.js";
import * as prDataPollingHelperFactory from "./helpers/pr-data-polling.helpers.js";
import * as prHttpHelperFactory from "./helpers/pr-http.helpers.js";
import * as prStatusDisplayHelperFactory from "./helpers/pr-status-display.helpers.js";
import * as prCommandOutputHelperFactory from "./helpers/pr-command-output.helpers.js";
import * as prDataTabsHelperFactory from "./helpers/pr-data-tabs.helpers.js";
import * as prBackfillHelperFactory from "./helpers/pr-backfill.helpers.js";
import * as prUiOptionPersistenceHelperFactory from "./helpers/pr-ui-option-persistence.helpers.js";
import * as prBackfillActionHelperFactory from "./helpers/pr-backfill-actions.helpers.js";
import * as prManagementTabsHelperFactory from "./helpers/pr-management-tabs.helpers.js";
import * as prActorIdentityHelperFactory from "./helpers/pr-actor-identity.helpers.js";
import { inferViewerLoginFromPage } from "./helpers/pr-viewer-login-inference.helpers.js";
import { countPendingThreadComments } from "./helpers/pr-thread-comments.helpers.js";
import { parseSortableTime } from "./helpers/pr-sortable-time.helpers.js";
import { asArray } from "./helpers/pr-as-array.helpers.js";
import { getManualNotesFieldSummary } from "./helpers/pr-manual-notes-summary.helpers.js";
import {
  buildFailureSnackbarNotification,
  isTimeoutFailureMessage,
} from "./helpers/pr-failure-snackbar.helpers.js";
import { DEFAULT_REPO } from "./helpers/pr-default-repo.helpers.js";
import {
  extractRowLabelNames,
  normalizeFilterToken,
} from "./helpers/pr-filter-label-extraction.helpers.js";

// DEFAULT_REPO now imported from helpers/pr-default-repo.helpers.js (Phase
// 7, see REACT_MIGRATION_PLAN.md) - PrJsonModal.jsx/AuthorInsightsPrLink.jsx
// import it directly instead of reading it off window.DEFAULT_REPO.
const AUTO_DATA_POLL_MS = 30000;
const AUTO_BACKFILL_POLL_MS = 5000;
const BACKFILL_LOG_TAIL_LINES = 120;

// Phase F (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// lastRenderedRunStamp/lastSeenDataVersion/lastRenderedPrFingerprint/
// lastRenderedMetaFingerprint/latestPrManifest/supportsDataMetaPolling/
// supportsDataManifestPolling used to be module `let`s here - moved into
// PrDataProvider.jsx's own trackingRef, which now builds pollForDataChanges
// itself. Every former write site redirects through the new
// window.pushPrDataPollingTrackingState(partial) bridge instead.
// lastSuccessfulRenderedCheckAt stays here - it's prDataTabOrchestrator's
// own concern (tab-activation catch-up), not something pollForDataChanges
// itself reads.
let lastSuccessfulRenderedCheckAt = "";
let lastSuccessfulPollCheckAt = "";
let lastPollErrorAt = "";
let hasActivePollWarning = false;
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
let supportsSchedulerPolling = true;
// Phase H.14 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
// cluster 4): supportsBackfillLogPolling/lastBackfillStateKey/
// isBackfillActionPending/isBackfillRunning moved into
// BackfillStatusProvider.jsx (components/) as real React state - this
// file reaches them via the window.getBackfillTrackingState/
// setSupportsBackfillLogPolling/setIsBackfillActionPending bridges that
// Provider now answers, same as useBackfillActions.jsx (state/) already
// did before this phase.
let isRequestMoreMergedPending = false;
// Phase 7 (see REACT_MIGRATION_PLAN.md): manualCommentsByAuthorLogin/
// manualCommentsLoadingByAuthorLogin/manualCommentsErrorByAuthorLogin/
// manualCommentDraftByAuthorLogin/manualCommentEditDraftByAuthorLogin used
// to live here too - moved to AuthorInsightsDraftsProvider.jsx's own
// useRef-held state (confirmed via grep no other read/write of any of
// those 5 fields remains on this object anywhere in this file).
// Phase H.17 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
// cluster 2): the authorInsightsState object itself (selectedAuthorLogin/
// latestRows/latestActorsMap) is deleted too - its only remaining reader/
// writer, pr-author-insights.component.js's renderAuthorInsights and the
// window.selectAuthorInsightsAuthor bridge that called it, are both
// deleted outright this phase.
const formParsingHelpers = formParsingHelpersModule;

const {
  stripAnsi,
  formatIsoDatetime,
} = prFormattingHelperFactory.createPrFormattingHelpers();

const setStatusTextOnly = (message) => {
  window.updateReactStatusText?.(message);
};

const setStatusMessage = (message) => {
  setStatusTextOnly(message);
  renderRequestActivity();
};

// Phase B (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// vanilla primitive exposed for AutoRenderBlockingProvider.jsx's
// discardAndApply to call, after applying a discarded-and-applied
// payload - same category as applyFreshPrPayload/beginRequestActivity.
if (typeof window !== "undefined") {
  window.setStatusMessage = (...args) => setStatusMessage(...args);
}

const setOutputMessage = (message) => {
  window.updateReactOutputText?.(message);
};

// Phase F.2 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// beginRequestActivity/renderRequestActivity's real implementations (the
// counter/history/scheduler-state bookkeeping, the badge-view-model
// construction) moved into PrDataProvider.jsx (state/) - these 2 consts
// become thin proxies to the window.* bridges that Provider now installs,
// so every one of this file's own existing call sites (the "authorComment"/
// "dataLoad"/"checkboxToggle"/"backfill" DI wirings below, setStatusMessage,
// initPage's startup call) keeps working completely unchanged. Same
// no-op-before-mount fallback shape useSinglePrUpdate.jsx/useRunScript.jsx/
// etc. already use for this exact bridge.
const beginRequestActivity = (key) =>
  (window.beginRequestActivity || (() => () => {}))(key);

const renderRequestActivity = () => {
  window.renderRequestActivity?.();
};

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

const notifyFailureSnackbar = (
  title,
  errorSource,
  fallbackMessage = "Operation failed",
) => {
  const { title: finalTitle, detail } = buildFailureSnackbarNotification(
    title,
    errorSource,
    fallbackMessage,
  );
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

// Phase H.14 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
// cluster 4): forwards to window.setBackfillLogMessage (now answered by
// BackfillStatusProvider.jsx, which just forwards to
// window.updateReactBackfillLogText itself - same end target as before),
// instead of writing that downstream bridge directly - this file's own
// callers (this factory instance's own DI, initPage's catch block below)
// go through this file's one real owner now, matching
// useBackfillActions.jsx's own shape. latestBackfillLogMessage's own
// cache+replay (below, viewprs:react-ready) is untouched - a different,
// unrelated bridge-not-ready-yet race (window.updateReactBackfillLogText
// itself, react-app.jsx's AppRoot), not something this phase's migration
// changes.
const setBackfillLogMessage = (message) => {
  latestBackfillLogMessage = message;
  window.setBackfillLogMessage?.(message);
};

// Phase E (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// getUiOptionDefaults/readUiSessionOverrides/writeUiSessionOverrides/
// persistUiOptionOverrides/restoreUiOptionOverrides/
// persistRunScriptOptionOverrides/persistViewFilterOptionOverrides used to
// live here - moved into FilterStateProvider.jsx (state/FilterStateProvider.jsx),
// which now owns UI option persistence directly (a mount-only restore
// effect, plus persistRunScriptOptions/persistViewFilterOptions exposed as
// window.persistRunScriptOptionOverrides/window.persistViewFilterOptionOverrides
// - the *same* bridge names, so every caller below is unchanged). Only
// FILTER_STATE_FIELD_MAP stays here too (shared, not duplicated - imported
// from the same pr-ui-option-persistence.helpers.js module
// FilterStateProvider.jsx uses) since getFilterStateOverrideForFieldId
// below and a few other readers (getNeedsAttentionConfig,
// shouldAlwaysShowInReviewRows, getOpenModeFilter) still need it.
const { FILTER_STATE_FIELD_MAP } = prUiOptionPersistenceHelperFactory.createPrUiOptionPersistenceHelpers({
  fetch: (...args) => fetch(...args),
});

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

// Phase 7 (see REACT_MIGRATION_PLAN.md): getAuthorThreadResolutionPolicy
// used to live here (combining "attention-author-thread-resolution-mode"'s
// Context/DOM value with getSelectedAuthorThreadResolutionAllowLogins/
// DenyLogins' own DOM scans) for ReviewThreadsSection.jsx's window.*
// bridge read - re-investigated an earlier "genuinely separate concern (a
// DOM-scan dependency)" deferral and found the DOM-scan dependency was
// real only because the 2 allow/deny lists' checked-state had nowhere
// else to live; moved to a dedicated useAuthorThreadResolutionPolicy hook
// in ReviewThreadsSection.jsx itself, now that
// AuthorThreadResolutionSelectionContext exists for exactly those 2 lists
// (same fix RowFilterSelectionContext was for the 5 row-filtering lists).
// Phase H.10 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// getSelectedAuthorThreadResolutionAllowLogins/DenyLogins (and the
// change-filter actor equivalents, getSelectedChangeFilterIgnoreComment/
// ReviewAuthors) were deleted outright - confirmed via grep they'd had no
// caller left at all since persistUiOptionOverrides itself (the function
// this comment used to say still needed them) was removed in an earlier
// phase; this comment just hadn't been updated since.

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

// collectPrAuthors now built in PrAuthorCell.jsx itself, via
// createPrAuthorCellHelpers (helpers/pr-author-cell.helpers.js) threaded
// with the real useActorIdentity().getPreferredActorKey (Phase 7, see
// REACT_MIGRATION_PLAN.md) - no window.* bridge needed any more, and
// nothing else in this file called this factory's output directly.

// safeJsonStringify now a bare export from helpers/pr-ui-render-utils.helpers.js
// (Phase 7, see REACT_MIGRATION_PLAN.md) - PrJsonModal.jsx/ExportTab.jsx
// import it directly instead of reading it off window.safeJsonStringify.
// parseMarkerState (this module's other export) is no longer used here at
// all - AuthorInsightsPrDataMeta.jsx (its one remaining consumer) builds
// formatChkDisplay directly now instead of parseMarkerState + a buggy
// formatChkDisplay call (see that file's own comment for the fix).

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
  persistViewFilterOptions: (...args) => window.persistViewFilterOptionOverrides?.(...args),
  shouldAutoScrollBackfillLogByState: (...args) =>
    shouldAutoScrollBackfillLogByState(...args),
  getBackfillScrollTop: (...args) => getBackfillScrollTop(...args),
  getIsBackfillRunning: () => window.getBackfillTrackingState?.()?.isBackfillRunning ?? false,
});

const { getOptionalElementById, readElementAttribute } =
  prDomAccessHelperFactory.createPrDomAccessHelpers({
    documentRef: typeof document !== "undefined" ? document : null,
  });

// Phase H.16 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
// cluster 2): collectNodesByTag no longer destructured here -
// navigateToPrInTableFromStats/navigateToPrInTableFromAuthorInsights
// (deleted outright) were its only 2 callers.
const { collectNodesByClass } =
  prDomTraversalHelperFactory.createPrDomTraversalHelpers();

const { capturePrSectionOpenState } =
  prSectionOpenStateHelperFactory.createPrSectionOpenStateHelpers({
    collectNodesByClass: (...args) => collectNodesByClass(...args),
    readElementAttribute: (...args) => readElementAttribute(...args),
  });

const { buildAppliedSummaryViewModel } =
  prAppliedSummaryHelperFactory.createPrAppliedSummaryHelpers();

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

// Phase H.17 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
// cluster 2): renderAuthorInsightsIfVisible/applyFreshAuthorInsightsIfVisible
// (and the latestAllStoredRows/latestActorsMap cache feeding them) no
// longer exist - their sole purpose was re-invoking renderAuthorInsights,
// deleted outright this phase. applyRenderResults itself needed no other
// change - its own fingerprint/manifest computation never depended on
// that cache.
const { applyRenderResults } =
  prRenderApplyHelperFactory.createPrRenderApplyHelpers({
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
      window.pushPrDataPollingTrackingState?.({ lastSeenDataVersion: value });
    },
    setLastRenderedRunStamp: (value) => {
      window.pushPrDataPollingTrackingState?.({ lastRenderedRunStamp: value });
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
    // Lazy proxy (same pattern as runSinglePrUpdate's own wiring):
    // applyFreshPrPayload is declared later in this file, safe since this
    // closure is only ever invoked long after full module evaluation.
    applyFreshPrPayload: (...args) => applyFreshPrPayload(...args),
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

// Phase G.1 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// expandAncestorDetailsElements/ensureInsightsRowVisibleForElement (this
// factory's only 2 exports) had no caller left besides the now-deleted
// navigateToPrInTable/navigateToAuthorInsights - createPrDomVisibilityHelpers's
// own instantiation is removed entirely, not just its outputs.
// Phase H.1 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// getFirstUnsavedElementForPrNumber/getDirtyTrackedFields (and the
// getOptionalElementById/readElementAttribute DI this factory only needed
// for them) are deleted outright now too - confirmed dead.
const {
  getUnsavedNotesPrNumbers,
  normalizePrNumber,
  getBlockingPrNumbers,
} = prAutoRenderUnsavedHelperFactory.createPrAutoRenderUnsavedHelpers({
  // Phase 7, sub-phase 7.5 (see REACT_MIGRATION_PLAN.md): PR Notes dirty
  // tracking is now NotesDirtyProvider.jsx's own React state, read here via
  // this dedicated bridge instead of scanning data-has-unsaved-notes DOM
  // attributes.
  getDirtyNotesPrNumbers: () => window.getDirtyNotesPrNumbers?.() || [],
});

// Phase 7 (see REACT_MIGRATION_PLAN.md): noteAuthorMatchesSelection used
// to also be destructured here for the now-deleted window.* bridge entry
// below - NotesSection.jsx/AuthorInsightsNotesSection.jsx get their own
// copy from AuthorInsightsContext/a local useMemo instead, not this one.
// Phase H.17 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
// cluster 2): getLatestActorsMap used to read authorInsightsState.latestActorsMap
// (only ever written by the now-deleted renderAuthorInsights) - repointed
// at the same live-payload-first, vanilla-cache-fallback pattern
// getLatestStoredPayload above already uses, since this needs the exact
// same data (the current payload's actorsMap), just always current now
// instead of only as current as the last renderAuthorInsights call.
const { getAuthorInsightsDisplayName } =
  prAuthorInsightsIdentityHelperFactory.createPrAuthorInsightsIdentityHelpers({
    normalizeActorLogin: (...args) => normalizeActorLogin(...args),
    resolveActorDisplayName: (...args) => resolveActorDisplayName(...args),
    getLatestActorsMap: () =>
      (window.getReactPrTablePayload?.() ?? latestStoredPayload)?.actorsMap || {},
  });

// Phase 7 (see REACT_MIGRATION_PLAN.md): the draft/comment-cache CRUD
// functions (getAuthorInsightsComposerDraft/updateAuthorInsightsComposerDraft/
// resetAuthorInsightsComposerDraft/getAuthorInsightsEditDraftMap/
// getAuthorInsightsEditDraft/updateAuthorInsightsEditDraft/
// resetAuthorInsightsEditDraft/getAuthorManualCommentsForLogin) used to be
// built here directly from authorInsightsState - moved to
// AuthorInsightsDraftsProvider.jsx (components/AuthorInsightsDraftsProvider.jsx),
// which now owns that state as real React state and republishes the exact
// same window.* bridge names, because pr-auto-render-blocking.helpers.js's
// getBlockingAuthorInsightsLogins still needs to read it from here, fully
// vanilla. Only the 3 genuinely pure functions below (confirmed via
// reading each body: no authorInsightsState reference at all, just the
// draft/comment object passed directly to each call) are still built
// locally, from a fresh no-args instance of the same factory.
const {
  normalizeAuthorInsightsSentiment,
  isAuthorInsightsComposerDraftDirty,
  isAuthorInsightsEditDraftDirty,
} = prAuthorInsightsDraftsHelperFactory.createPrAuthorInsightsDraftsHelpers();

// Fresh-reading proxy, not a direct reference to a local implementation -
// AuthorInsightsDraftsProvider (a React component) only publishes this on
// window once it mounts, which happens after this module-level wiring
// runs; a direct reference captured now would freeze on undefined. Same
// indirection this file already uses for activateDataTab above.
// Phase H.17 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
// cluster 2): the other 6 composer/edit-draft proxies this block used to
// also build (getAuthorInsightsComposerDraft/updateAuthorInsightsComposerDraft/
// resetAuthorInsightsComposerDraft/getAuthorInsightsEditDraft/
// updateAuthorInsightsEditDraft/resetAuthorInsightsEditDraft) were only
// ever repackaged into prAuthorInsightsDraftsHelpers, which only ever fed
// pr-author-insights.component.js (deleted outright) - this one stays,
// still a real DI param for getBlockingAuthorInsightsLogins below.
const getAuthorManualCommentsForLogin = (...args) => window.getAuthorManualCommentsForLogin?.(...args);

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
    // Phase 7 (see REACT_MIGRATION_PLAN.md): authorInsightsState's 5
    // draft/comment-cache fields moved to AuthorInsightsDraftsProvider.jsx
    // - window.getAuthorInsightsDraftsSnapshot is the dedicated read
    // bridge it publishes for exactly this call (see that file's own
    // comment for why a snapshot, not individual getters).
    getBlockingAuthorInsightsLogins: () =>
      getBlockingAuthorInsightsLogins(window.getAuthorInsightsDraftsSnapshot?.() || {}),
    formatBlockingPrNumbersLabel,
  });

// Phase G.1 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// createPrAutoRenderNavigationHelpers's navigateToPrInTable/
// navigateToAuthorInsights used to be instantiated here - retired
// outright (helpers/pr-auto-render-navigation.helpers.js deleted) in
// favor of state/useNavigateToPrInTable.jsx/useNavigateToAuthorInsights.jsx,
// real hooks that reuse PrTableApp.jsx's existing pr-navigate-to-insights
// listener (for the row scroll/focus) and PrDataProvider/AuthorInsightsContext
// Context (for the author-selection validation+write), rather than a
// vanilla DOM-scanning helper.

// Phase B (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// AutoRenderBlockingProvider.jsx now owns pendingAutoRenderPayload/
// hasDirtyPrSectionsFields and the whole apply/wait-for-blur/wait-for-clean
// decision (renderAutoRenderBlockedIndicator/flushPendingAutoRenderNow/
// forceApplyPendingAutoRender/flushPendingAutoRender are gone - this is
// their replacement). NotesDirtyProvider.jsx/AuthorInsightsDraftsProvider.jsx
// still call this function exactly as before - only its OWN body changed,
// from mutating a vanilla module variable + manipulating the indicator DOM
// directly, to computing the same blocking state (via the unchanged
// getAutoRenderBlockingState) and pushing it into the Provider. Still
// returns hasDirtyPrSectionsFields - NotesSection.jsx/other callers don't
// use the return value, but preserving it costs nothing and avoids a
// needless signature change.
//
// renderAutoRenderBlockedLinks (the #auto-render-blocked-pr-links sub-
// portal's own hidden/aria-label toggle) stays exactly as it was - that
// element is a sibling of the status-text/button content this Provider
// now owns, not something AutoRenderBlockingProvider.jsx needs to
// duplicate (see that file's own comment for why it isn't nested inside).
const recomputeDirtyPrSectionsFields = () => {
  const blockingState = getAutoRenderBlockingState();
  const hasDirtyPrSectionsFields = computeHasDirtyPrSectionsFields(blockingState);

  window.pushAutoRenderBlockingState?.(blockingState);

  const linksHost = getOptionalElementById("auto-render-blocked-pr-links");
  if (linksHost) {
    renderAutoRenderBlockedLinks({
      linksHost,
      blockingPrNumbers: blockingState.blockingPrNumbers,
      blockingAuthorInsightsLogins: blockingState.blockingAuthorInsightsLogins,
      blockingPrLabel: blockingState.blockingPrLabel,
    });
  }

  return hasDirtyPrSectionsFields;
};

// buildPrLastCheckedIndicator (and its formatRelativeLastCheckedLabel/
// parseIsoTimestampMs/OPEN_PR_LAST_CHECK_STALE_MS internals) now imported
// from helpers/pr-last-checked-indicator.helpers.js (Phase 7, see
// REACT_MIGRATION_PLAN.md) - PrStatusCell.jsx imports it directly instead
// of reading it off window.buildPrLastCheckedIndicator.

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
// jobs are driving the per-row progress indicator and keeping
// latestSchedulerState current (Phase F.2: now PrDataProvider.jsx's own
// activityRef, pushed via window.setLatestSchedulerStateAndRender, which
// also triggers the request-activity re-render that used to happen here
// directly).
const renderSchedulerStatus = (schedulerRaw = {}) => {
  const scheduler = schedulerRaw || {};
  applyActivePrProgressIndicators(scheduler.activePrNumbers || []);
  window.setLatestSchedulerStateAndRender?.(scheduler);
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
  // updateReactTable()'s payload/selectedRepo plumbing.
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

// Phase 7, sub-phase 7.4 (see REACT_MIGRATION_PLAN.md): the 5
// populateXOptions functions this factory used to also provide have moved
// to FilterOptionsProvider.jsx/react-app.jsx's MultiSelectListPortals,
// which derive the same option lists reactively from PrDataContext instead
// of being pushed imperatively through here - trimmed DI surface down to
// just what's still used (selection readers, the 6 "Any" filter getters,
// and the dropdown-closing listener). Phase H.12 (see
// REACT_MIGRATION_PLAN.md, "Full migration roadmap"): the applied-filter
// summary (renderManagementFilterSummary/renderFilterSummary) is gone too
// - AppliedFilterSummaryLive (react-app.jsx) already owned it live,
// reactively; this factory's own version was a confirmed-dead no-op.
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
  setupMultiSelectDropdownClosing,
} = prFilterPanelHelperFactory.createPrFilterPanelHelpers({
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

// Phase H.10 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// the window.getSelectedXxx bridges these 9 functions used to be exposed
// through are gone - Phase G.3 already moved FilterStateProvider.jsx's own
// buildOverrides() onto RowFilterSelectionContext/
// AuthorThreadResolutionSelectionContext/ChangeFilterActorSelectionContext
// directly, leaving no real caller of any of these bridges (confirmed via
// grep). The functions themselves stay - getFormBody() below still calls 3
// of them (getSelectedIncludeLabelNames/getSelectedExcludeLabelNames/
// getSelectedAuthorLogins) as plain function calls, not through window.

// Phase H.14 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
// cluster 4 "Backfill status rendering"): renderBackfillStatus/
// updateBackfillStatusFromPayload (the functions) and
// isBackfillRunning/isBackfillActionPending/supportsBackfillLogPolling/
// lastBackfillStateKey (the state they wrote) all moved into
// BackfillStatusProvider.jsx (components/) as real React state - this
// file no longer owns any of it, it's a pure caller of the
// window.renderBackfillStatus/updateBackfillStatusFromPayload/
// getBackfillTrackingState/setSupportsBackfillLogPolling/
// setIsBackfillActionPending bridges that Provider now answers, the exact
// same bridges useBackfillActions.jsx (state/) already called through -
// one real owner now, not two independently-drifting copies.
//
// latestBackfillStatus's own cache+replay is kept, repointed at the
// bridge - the race it exists for (loadBackfillStatus resolving before
// react-app.jsx has mounted) is unchanged by this move: whatever answers
// window.renderBackfillStatus (today BackfillStatusProvider, same as
// AppRoot's own window.updateReactBackfillBadges/etc. bridges) mounts at
// the same time AppRoot does either way, so the same 'viewprs:react-ready'
// replay below still closes the gap - see that listener's own comment.
let latestBackfillStatus = null;

const renderBackfillStatus = (backfillRaw = {}) => {
  latestBackfillStatus = backfillRaw || {};
  window.renderBackfillStatus?.(backfillRaw);
};

const updateBackfillStatusFromPayload = (payload = {}, options = {}) => {
  const backfill = payload?.backfill || payload || {};
  latestBackfillStatus = backfill;
  window.updateBackfillStatusFromPayload?.(payload, options);
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

// Phase F.2 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// these 2 reverse bridges used to also serve PrDataProvider.jsx's own
// pollSchedulerStatus - deleted outright in Phase H.2 (see
// REACT_MIGRATION_PLAN.md), once its automatic interval had already been
// retired in favor of SSE and it had no caller left besides a test.
// loadSchedulerStatus stays vanilla regardless (the quick-check workflow's
// forced scheduler refresh is a real caller beyond that), and
// supportsSchedulerPolling stays a vanilla-owned flag (loadSchedulerStatus
// itself is the only writer, on a 404) rather than forking a second copy.
if (typeof window !== "undefined") {
  window.loadSchedulerStatus = (...args) => loadSchedulerStatus(...args);
  window.getSupportsSchedulerPolling = () => supportsSchedulerPolling;
}

// getViewedFilesSummary (helpers/pr-viewed-files-summary.helpers.js) no
// longer built here at all (Phase 7, see REACT_MIGRATION_PLAN.md) -
// AuthorInsightsPrDataMeta.jsx builds its own copy directly now (the same
// zero-dependency composition PrInsightsDisplayProvider.jsx already uses),
// instead of reading window.getViewedFilesSummary.

// getViewedFilesState now imported from helpers/pr-viewed-files-state.helpers.js
// (Phase 7, see REACT_MIGRATION_PLAN.md) - PrStatusCell.jsx imports it
// directly instead of reading it off window.getViewedFilesState.

// Phase 7 (see REACT_MIGRATION_PLAN.md): getOpenConversationCountWithMe
// used to be wired here for the window.* bridge below - PrApprovedCell.jsx
// (like PrInsightsRow.jsx before it) now gets it from
// PrInsightsDisplayProvider/usePrInsightsDisplay() instead, and nothing
// else in this file calls it or getOpenConversationCount.

// getManualNotesSummary/getManualNotesFieldSummary (and their shared
// getNotesDifficultyLevelText internal) now imported from
// helpers/pr-manual-notes-summary.helpers.js (Phase 7, see
// REACT_MIGRATION_PLAN.md) - PrAuthorCell.jsx/PrDateCell.jsx import them
// directly instead of reading them off window.*.

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

// Phase H.6 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// index.page.js's own createPrRowCheckboxActionsHelpers instance (which
// used to feed toggleInReviewForRow/toggleFlaggedForRow into
// createReactCallbacks() below) is deleted outright - confirmed its only
// caller was createReactCallbacks(), and PrTableApp.jsx now builds its
// own equivalent handler directly via useRowCheckboxActions() (a real
// hook wrapping the same pr-row-checkbox-actions.helpers.js factory).

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
} = prStatusDisplayHelperFactory.createPrStatusDisplayHelpers();

void statusIcon;

const {
  formatCommandOutput,
} = prCommandOutputHelperFactory.createPrCommandOutputHelpers({
  stripAnsi,
});

// Phase H.17 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
// cluster 2): onTabActivated's only real use was re-invoking
// renderAuthorInsightsIfVisible (deleted outright this phase) -
// AuthorInsightsSelector.jsx now validates the selected author itself,
// reactively, on every payload/options change, not just on tab
// activation, so there's nothing left for a tab-activation hook to do
// here. onTabActivated is optional (see pr-data-tabs.helpers.js), so it's
// simply omitted now rather than passed as a no-op.
const { activateDataTab } =
  prDataTabsHelperFactory.createPrDataTabsHelpers({
    getOptionalElementById,
  });

// Phase A, slice 1 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// vanilla primitive exposed for TabStateProvider.jsx (a React component) to
// call - same category as applyFreshPrPayload/beginRequestActivity below,
// not a new entanglement. activateDataTab itself is completely unchanged;
// this just lets React become a second caller of it.
if (typeof window !== "undefined") {
  window.activateDataTab = (...args) => activateDataTab(...args);
}

// PR Data Tab Orchestrator
const prDataTabOrchestrator =
  prDataTabOrchestratorFactory.createPrDataTabOrchestrator({
    // Helper functions
    deriveRunPrDataContext,
    deriveRenderPipelineState,
    // Phase A, slice 1 (see REACT_MIGRATION_PLAN.md, "Full migration
    // roadmap"): the 3 data-tab buttons are now React-owned
    // (DataTabButton.jsx/TabStateProvider.jsx) - initDataTabs' own button
    // click-wiring (`.onclick = ...`) would double-fire alongside React's
    // own onClick if both ran, so this orchestrator's one-time
    // initialize() call no longer wires them. initDataTabs itself (and its
    // own tests) are untouched - only this one call site stops using it.
    initDataTabs: () => {},
    getOptionalElementById,
    // State management via dependency injection
    stateGetters: {
      // Deferred-items follow-up, item 6 (see REACT_MIGRATION_PLAN.md and
      // applyFiltersFromCache's own DI wiring above for the full reasoning)
      // - same read-bridge-with-fallback pattern.
      getLatestStoredPayload: () => window.getReactPrTablePayload?.() ?? latestStoredPayload,
      getLatestSelectedRepo: () => latestSelectedRepo,
      getLastSuccessfulRenderedCheckAt: () => lastSuccessfulRenderedCheckAt,
      getLatestSchedulerState: () => window.getLatestSchedulerState?.() || {},
    },
    stateSetters: {
      setLatestStoredPayload: (value) => applyLatestPrData({ payload: value }),
      setLastSuccessfulRenderedCheckAt: (value) => {
        lastSuccessfulRenderedCheckAt = value;
      },
      setLastRenderedPrFingerprint: (value) => {
        window.pushPrDataPollingTrackingState?.({ lastRenderedPrFingerprint: value });
      },
      setLatestPrManifest: (value) => {
        window.pushPrDataPollingTrackingState?.({ latestPrManifest: value });
      },
      setPendingAutoRenderPayload: (value) => {
        window.setPendingAutoRenderPayload?.(value);
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

// Phase H.14 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
// cluster 4): getBackfillStatusViewModel/getBackfillStateKey no longer
// destructured here - both only ever fed renderBackfillStatus/
// updateBackfillStatusFromPayload, now moved wholesale into
// BackfillStatusProvider.jsx (components/), which creates its own
// instance of this same pure factory.
const {
  shouldAutoScrollBackfillLog: shouldAutoScrollBackfillLogByState,
  getBackfillScrollTop,
  formatBackfillLogMessage,
} = prBackfillHelperFactory.createPrBackfillHelpers();

// Phase D.2 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// handleBackfillAction itself is no longer destructured here -
// state/useBackfillActions.jsx now owns the only real caller (the Start/
// Stop buttons) via its own separate factory instance. loadBackfillStatus
// stays - window.loadBackfillStatus below still has a real caller
// (PrDataProvider.jsx's pollBackfillStatus). Phase H.11 (see
// REACT_MIGRATION_PLAN.md, "Full migration roadmap"): loadBackfillLogTail
// is no longer destructured here - it was only ever called by
// backfill-tab.orchestrator.js (deleted outright that phase), and this
// factory instance's own loadBackfillStatus already calls its own
// internal loadBackfillLogTail when includeLog is true.
const { loadBackfillStatus } = prBackfillActionHelperFactory.createPrBackfillActionHelpers({
  fetch: (...args) => fetch(...args),
  postJson,
  beginRequestActivity,
  setStatusMessage,
  setOutputMessage,
  // Phase C (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
  // BackfillControls.jsx/BackfillLogControls.jsx now own the 4 backfill
  // buttons, fed by window.updateReactBackfillButtonState (same bridge
  // renderBackfillStatus's own normal reload path already uses) - this
  // replaces the old direct-by-id setButtonDisabled DI.
  setBackfillButtonState: (state) =>
    window.updateReactBackfillButtonState?.(state),
  notifyFailureSnackbar,
  formatCommandOutput,
  stripAnsi,
  updateBackfillStatusFromPayload,
  setBackfillLogMessage,
  autoScrollBackfillLogToBottom,
  formatBackfillLogMessage,
  // Phase H.14 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
  // cluster 4): reads/writes window.getBackfillTrackingState/
  // setSupportsBackfillLogPolling/setIsBackfillActionPending (now
  // answered by BackfillStatusProvider.jsx) instead of this file's own
  // module-level lets, which are deleted - the exact same bridges
  // useBackfillActions.jsx's own factory instance already used, so both
  // instances now share one real source of truth.
  getSupportsBackfillLogPolling: () =>
    window.getBackfillTrackingState?.()?.supportsBackfillLogPolling ?? true,
  setSupportsBackfillLogPolling: (value) =>
    window.setSupportsBackfillLogPolling?.(value),
  getIsBackfillRunning: () => window.getBackfillTrackingState?.()?.isBackfillRunning ?? false,
  setIsBackfillActionPending: (value) => window.setIsBackfillActionPending?.(value),
  backfillLogTailLines: BACKFILL_LOG_TAIL_LINES,
});

// Phase D.2 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// BackfillControls.jsx/BackfillLogControls.jsx used to reach
// handleBackfillAction/a refreshBackfillStatus/refreshBackfillLogTail
// wrapper pair/autoScrollBackfillLogToBottom via window.* bridges - they
// now call state/useBackfillActions.jsx's own hook directly instead, which
// builds its own instance of this same factory.
// Cluster-4 cleanup (see REACT_MIGRATION_PLAN.md, "Remaining-effort
// audit"): window.autoScrollBackfillLogToBottom itself (the bridge, not
// the local autoScrollBackfillLogToBottom function below, still used
// internally by this file's own loadBackfillStatus factory instance) had
// zero remaining readers - BackfillLogControls.jsx now owns scroll-sync
// itself via a ref (Phase G.4), and useBackfillActions.jsx's own factory
// instance passes a no-op for this DI param, not this bridge - deleted
// outright.

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

// Phase H.11 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// onBackfillTabActivated is no longer passed here - backfill-tab.orchestrator.js
// (the only thing that ever implemented it) is deleted outright.
// state/useBackfillTabAutoRefresh.jsx now owns refreshing status/log on
// Backfill-tab activation, the same way Action Log/Actor Names' own
// refresh-on-activate already works, just driven by watching
// #tab-panel-backfill's `hidden` attribute directly instead of a callback
// threaded through this factory. Real tab-switching chrome (panel
// visibility/aria-selected) stays owned here, unchanged.
const { activateTab } =
  prManagementTabsHelperFactory.createPrManagementTabsHelpers({
    getOptionalElementById,
    loadActionLog,
    loadActorNameCache,
  });

// Phase A, slice 2 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// vanilla primitive exposed for TabStateProvider.jsx to call - same
// category as window.activateDataTab above. activateTab itself is
// completely unchanged (restructured to a top-level function, same
// shape as activateDataTab, but behavior-preserving - see that file's
// own comment).
if (typeof window !== "undefined") {
  window.activateManagementTab = (...args) => activateTab(...args);
}

// getPerPrUserStateFromPayload (helpers/pr-per-pr-user-state.helpers.js,
// genuinely zero-dependency) used to be imported here too, to build this
// file's own createPrExportHelpers({ getPerPrUserStateFromPayload }) call
// for the window.getExportFieldCatalog/window.getVisiblePrNumbersFromSectionsHost/
// window.buildExportPayload bridge below (Phase 7, see
// REACT_MIGRATION_PLAN.md) - re-investigated (all 3 pr-export.helpers.js
// exports confirmed genuinely zero-dependency given a direct
// getPerPrUserStateFromPayload import) and moved entirely to ExportTab.jsx
// itself, its one real consumer, which now builds that same call directly.
// PrJsonModal.jsx (the other consumer of getPerPrUserStateFromPayload
// alone) already imported it directly rather than through this file.

// asArray now imported from helpers/pr-as-array.helpers.js (Phase 7, see
// REACT_MIGRATION_PLAN.md) - every component below imports it directly
// instead of reading it off window.asArray.

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

// Phase H.16 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
// cluster 2): window.navigateToPrInTableFromStats is deleted outright -
// ReviewStatsContent.jsx's own "View in table" buttons now call
// useNavigateToPrInTable() (state/) directly, the same hook
// AuthorInsightsPrLink.jsx uses for its sibling
// window.navigateToPrInTableFromAuthorInsights (also deleted, see
// below) - both reused AutoRenderBlockedLinks.jsx's existing,
// already-tested hook instead of writing new navigation logic.

// Phase H.17 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
// cluster 2): pr-author-insights.component.js (renderAuthorInsights) and
// the window.selectAuthorInsightsAuthor bridge that drove it are deleted
// outright, closing cluster 2's last bridge - AuthorInsightsSelector.jsx
// now validates/writes the selected author directly (resolveValidAuthorLogin
// + PrDataProvider's own setSelectedAuthorLogin), the same Context
// primitives useNavigateToAuthorInsights.jsx (state/) already used for
// the identical validation rule. prAuthorInsightsPrLinkHelpers/
// prAuthorInsightsDisplayHelpers/prAuthorInsightsDataHelpers/
// prAuthorInsightsDraftsHelpers (this file's own instances, built solely
// to feed that factory) and the authorInsightsState object itself (used
// nowhere else - see getAuthorInsightsDisplayName's own getLatestActorsMap
// DI below, repointed at latestStoredPayload instead) are deleted too.

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

// autoResizeTextarea now imported from
// helpers/pr-textarea-autoresize.helpers.js (Phase 7, see
// REACT_MIGRATION_PLAN.md) - NotesSection.jsx imports it directly instead
// of reading it off window.autoResizeTextarea.

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

// Phase 7 (see REACT_MIGRATION_PLAN.md, "live filtering"): extracted into
// its own module, pr-row-match-filters.helpers.js, matching the sibling
// pr-scope-selection.helpers.js/pr-row-filtering.helpers.js factory
// pattern - the new reactive useVisiblePrNumbers derivation
// (state/useVisiblePrNumbers.jsx) needs the same logic callable with
// Context-derived actor-identity functions instead of this file's own
// closures. Same closures wired in here as before the extraction, so this
// is a zero-behavior-change move on the vanilla side.
const { rowMatchesUiFilters } =
  prRowMatchFiltersHelperFactory.createPrRowMatchFiltersHelpers({
    getPreferredActorKey: (...args) => getPreferredActorKey(...args),
    collectAssignedUsers: (...args) => collectAssignedUsers(...args),
    collectApproversFromRow: (...args) => collectApproversFromRow(...args),
    extractRowLabelNames,
    normalizeFilterToken,
    getManualNotesFieldSummary,
    isInReviewEnabled,
  });

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

const mountReactTable = (container, initialData) => {
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
    });
    reactTableMounted = true;
    return true;
  } catch (error) {
    console.error("[ReactBridge] Error mounting React:", error);
    return false;
  }
};

const updateReactTable = (payload, selectedRepo) => {
  if (!reactTableMounted || typeof window.updateReactPrTable !== "function") {
    console.warn(
      "[ReactBridge] Cannot update: React not mounted or update callback unavailable",
    );
    return;
  }

  try {
    window.updateReactPrTable(payload, selectedRepo);
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
// Phase G.5 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"): the
// "refetch labels when the selected repo changes" trigger this function
// used to also own (comparing against labelsFetchedForRepo, now deleted)
// moved into RepoLabelsProvider.jsx's own effect - it's a real descendant
// of <PrDataProvider /> and reads selectedRepo via usePrData() directly,
// instead of this vanilla code deciding it and calling
// refreshAvailableRepoLabels imperatively. That function/its own
// dedup/cache state and window.refreshAvailableRepoLabels bridge stay
// unchanged - only the "when should I call it" decision moved.
const applyResolvedRepo = (resolvedRepo) => {
  if (!resolvedRepo) {
    return;
  }
  applyLatestPrData({ selectedRepo: resolvedRepo });
};

// Phase 7 (see REACT_MIGRATION_PLAN.md, "a real fast path for fresh-payload
// renders"): for a caller that already has a direct, authoritative fresh
// payload in hand (no refetch needed) - a research pass confirmed almost
// everything prDataTabOrchestrator.renderPrData's full pipeline computes
// today is now dead (filter dropdowns, chip text, #data-meta text, the
// merged-request-more-action push, visiblePrNumbers/filteredRows for the
// table - each already superseded by a live Context derivation elsewhere).
// Exactly 3 things are still genuinely live: fingerprint/manifest/version
// bookkeeping the next poll tick's skip-render dedup depends on, repo
// resolution + conditional label refresh, and Author Insights' own live
// re-render if that tab is open. This is exactly those 3 things, reusing
// every existing piece directly rather than reimplementing any of them -
// used by runSinglePrUpdate (replacing its own redundant loadStoredData()
// re-fetch) and, via the window.applyFreshPrPayload bridge, by
// AutoRenderBlockingProvider.jsx's own apply/discard paths (replacing the
// old vanilla flushPendingAutoRenderNow's identical call, see
// REACT_MIGRATION_PLAN.md's Phase B entry).
const applyFreshPrPayload = (payload, repo) => {
  const resolvedRepo =
    repo ||
    deriveRepoRunContext({
      selectedRepo: latestSelectedRepo,
      inputRepo: getOptionalElementById("repo")?.value,
      lastRun: payload?.lastRun,
    }).repoFilter;

  // selectedRepo deliberately omitted here (unlike applyResolvedRepo's own
  // call below) - matching renderPrData's own applyLatestPrData({ payload })
  // call exactly, so an empty resolvedRepo (no explicit repo, no #repo
  // input value, no payload.lastRun.repo) can never clobber a
  // previously-known-good latestSelectedRepo. applyResolvedRepo's own
  // `if (!resolvedRepo) return;` guard is the sole gate for that write.
  applyLatestPrData({ payload });
  // Phase F (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
  // fingerprint/manifest/version/run-stamp bookkeeping now lives in
  // PrDataProvider.jsx's own trackingRef, pushed via this one combined
  // bridge instead of direct module-variable assignment - same "who
  // writes when" structure, only the storage location changed.
  const trackingPatch = {
    lastRenderedPrFingerprint: computePrDataFingerprint(payload),
    lastRenderedMetaFingerprint: computePrDataMetaFingerprint(payload),
    latestPrManifest: computePrDataManifest(payload),
  };
  window.setPendingAutoRenderPayload?.(null);

  // Same dataVersion/runStamp/backfill bookkeeping loadStoredData does with
  // its own GET response (pr-stored-data-load.helpers.js) - needed because
  // this primitive also replaces that function for runSinglePrUpdate's
  // case, not just renderPrData. result.prData (POST /view-prs/run's
  // response) doesn't include dataMeta - lastSeenDataVersion simply isn't
  // updated from that path, which is self-correcting (the next poll's own
  // meta/manifest check finds the real version mismatch and fetches
  // normally), not a lasting staleness bug.
  const dataVersion = String(payload?.dataMeta?.dataVersion || "").trim();
  if (dataVersion) {
    trackingPatch.lastSeenDataVersion = dataVersion;
  }
  const updatedAt = String(payload?.lastRun?.updatedAt || "").trim();
  if (updatedAt) {
    trackingPatch.lastRenderedRunStamp = payload.lastRun.updatedAt;
    lastSuccessfulRenderedCheckAt = updatedAt;
  }
  window.pushPrDataPollingTrackingState?.(trackingPatch);
  updateBackfillStatusFromPayload(payload);

  applyResolvedRepo(resolvedRepo);
  // Phase H.17 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
  // cluster 2): used to call applyFreshAuthorInsightsIfVisible here, to
  // refresh the latestAllStoredRows/latestActorsMap cache that fed
  // renderAuthorInsights - both deleted outright this phase.
  // AuthorInsightsSelector.jsx now reads rows/actorsMap straight from
  // PrDataContext's own payload, which updateReactTable below keeps
  // current - no separate cache to refresh.
  updateReactTable(payload, resolvedRepo);
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
  // catalog, author insights panel, and stats view — still needs to run.
  // (The filter dropdown options themselves - label/author/assigned/
  // approver/thread-resolution/change-filter actor lists - are no longer
  // one of those side effects; they're owned by FilterOptionsProvider.jsx,
  // deriving reactively from PrDataContext instead. See
  // REACT_MIGRATION_PLAN.md, sub-phase 7.4 and the later "populateFilterOptions"
  // deletion entry for that history.) Run the full vanilla pipeline with
  // skipTableRender so it performs those side effects without building or
  // appending its own <table> markup into #pr-sections (which React owns).
  const renderPipelineResult = prDataTabOrchestrator.renderPrData(payload, selectedRepo, {
    ...options,
    skipTableRender: true,
  });
  const resolvedRepo = renderPipelineResult?.repoFilter || selectedRepo || latestSelectedRepo || '';
  applyResolvedRepo(resolvedRepo);

  // Check if already mounted
  if (isReactTableMounted()) {
    // Already mounted: just update data
    updateReactTable(
      latestStoredPayload || payload,
      resolvedRepo
    );
    return;
  }

  // First time: mount React
  const success = mountReactTable(container, {
    payload: latestStoredPayload || payload || {},
    selectedRepo: resolvedRepo,
  });

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

// Phase F (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// pollForDataChanges itself (the createPrDataPollingOrchestrationHelpers
// instance) now lives in PrDataProvider.jsx, which owns the
// fingerprint/manifest/version/polling-support tracking state this
// factory needs - index.page.js just exposes the vanilla pieces that
// Provider's own DI still needs to reach (the pure fingerprint/manifest
// helpers below, already wired with the real getOrComputeEntryDerivedValue
// cache; applyLatestPrData/renderPrData/markPollSuccess/
// showPollFailureWarning - vanilla render-pipeline primitives exposed
// *for* that Provider, same category as every other "vanilla primitive
// exposed for React" bridge in this migration). window.pollForDataChanges
// itself is now assigned by PrDataProvider.jsx instead, but stays the
// same name/shape - index.html.test.js's 17 direct call sites still work
// unchanged.
if (typeof window !== "undefined") {
  window.computePrDataManifest = (...args) => computePrDataManifest(...args);
  window.getManifestDelta = (...args) => getManifestDelta(...args);
  window.mergeDataDeltaPayload = (...args) => mergeDataDeltaPayload(...args);
  window.computePrDataFingerprint = (...args) => computePrDataFingerprint(...args);
  window.computePrDataMetaFingerprint = (...args) => computePrDataMetaFingerprint(...args);
  window.getDataPollRenderAction = (...args) => getDataPollRenderAction(...args);
  window.getLatestStoredPayload = () => latestStoredPayload;
  window.applyLatestPrData = (...args) => applyLatestPrData(...args);
  window.renderPrData = (...args) => renderPrData(...args);
  window.markPollSuccess = (...args) => markPollSuccess(...args);
  window.showPollFailureWarning = (...args) => showPollFailureWarning(...args);
}

// Phase F.2 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// pollBackfillStatus/pollSchedulerStatus's own guard+wrapper moved into
// PrDataProvider.jsx (state/), reached directly via <PrDataPolling />'s
// usePrData() Context - window.pollBackfillStatus/window.renderRequestActivity
// had no caller left besides that component, so both were deleted outright
// (pollSchedulerStatus itself was later deleted too, in Phase H.2 - see
// REACT_MIGRATION_PLAN.md). loadBackfillStatus stays vanilla here -
// initPage's own initial-load call (below) is another real caller beyond
// polling. (The backfill tab orchestrator was a 2nd such caller once -
// deleted outright in Phase H.11, see REACT_MIGRATION_PLAN.md.) Exposed
// via a new reverse bridge for PrDataProvider's own pollBackfillStatus to
// reach.
if (typeof window !== "undefined") {
  window.loadBackfillStatus = (...args) => loadBackfillStatus(...args);
}

// Track C, slice C1 (post-Phase-6 follow-up, see REACT_MIGRATION_PLAN.md):
// <PrDataPolling /> (react-app.jsx) now owns the setInterval lifecycle for
// these four functions (and the visibility-pause/beforeunload-cleanup
// behavior that used to live in index.page.js's cleanupIntervals/
// restartIntervals) - it calls them via these bridges on the same cadence
// (AUTO_DATA_POLL_MS/AUTO_BACKFILL_POLL_MS, also exposed here so the
// interval timing has one source of truth).
// window.pollForDataChanges/pollBackfillStatus/renderRequestActivity used
// to also be bridged here - Phase F/F.2 (see REACT_MIGRATION_PLAN.md,
// "Full migration roadmap") moved them into PrDataProvider.jsx, which
// used to also set window.pollSchedulerStatus itself (deleted outright
// in Phase H.2 - see that file's own header comment for why).
if (typeof window !== "undefined") {
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

// Phase H.20 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
// cluster 6): getFormBody() (this used to be its definition) and the
// window.getFormBody bridge are both gone - every field it read via
// FormData/DOM scan was already Context-backed, so state/useFormBody.jsx
// now re-derives the same shape straight from FilterStateContext/
// RowFilterSelectionContext instead. getSelectedIncludeLabelNames/
// getSelectedExcludeLabelNames/getSelectedAuthorLogins (just above) stay -
// still genuinely needed by createPrFilterSelectionInputsHelpers' own
// instance (cluster 1's territory), this was just their one other caller.

// Phase H.9 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// index.page.js's own createPrQuickCheckActionsHelpers/
// createPrTriggerAutoRunActionHelpers instances (which used to feed
// handleQuickCheck/handleQuickCheckAll/handleTriggerAutoRun below) are
// deleted outright - confirmed their only callers were those 3 functions,
// and TriggerAutoRunButton.jsx/QuickCheckButton.jsx/QuickCheckAllButton.jsx
// now build their own equivalent handlers directly via
// useTriggerAutoRun()/useQuickCheckActions() (real Context-backed
// instances, not these window-bridge-fed vanilla ones).

// Phase H.5 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// index.page.js's own createPrAckLabelActionsHelpers instance (which used
// to feed runAckOnlyWorkflow/runClearOnlyWorkflow/runApplyLabelWorkflow
// into createReactCallbacks() below) is deleted outright - confirmed its
// only caller was createReactCallbacks(), and PrTableApp.jsx now builds
// its own equivalent handlers directly via useAckLabelActions() (a real
// Context-backed instance, not this window-bridge-fed vanilla one).

// Phase D.2 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// handleAckOnly/handleClearOnly's definitions (thin 1-line wrappers around
// runAckOnlyWorkflow/runClearOnlyWorkflow) moved into
// state/useAckLabelActions.jsx - their only caller was the "Apply ack
// only"/"Apply clear only" buttons, now a hook instead of a window.* bridge.

// ---- Apply existing GitHub labels to PRs (single-row select or bulk via
// the "Run & Filter" tab's PR-number selection) ----

let availableRepoLabels = [];
let isFetchingRepoLabels = false;

// Phase 7 (see REACT_MIGRATION_PLAN.md): getAvailableRepoLabels (a plain
// pull of this module variable) used to be bridged on window for
// PrActionsCell.jsx to read directly - both it and ApplyLabelSelect.jsx
// (Run & Filter tab dropdown, below) now read the same RepoLabelsContext
// instead, fed by the one write point below, consolidating what used to
// be two separate window.* bridges for this one list.
//
// Renders into both React consumers via RepoLabelsContext
// (RepoLabelsProvider.jsx, mounted in react-app.jsx) - a native <select>'s
// own selection-preservation behavior on re-render replaces the vanilla
// version's manual "restore previous value if still valid" logic, so no
// bridge return value or key remount is needed here.
const populateApplyLabelSelect = () => {
  window.setAvailableRepoLabels?.(availableRepoLabels);
};

// Deliberately does NOT fall back to DEFAULT_REPO: that constant is only
// ever a placeholder/example value (see the "repo" field's `placeholder`
// in react-app.jsx) - it isn't guaranteed to be a repo this GitHub account
// can actually see, and eagerly querying `gh label list` against it on
// every page load produced a real 500 (repo not found) before the actual
// selected repo was even known yet. Pure so it's directly unit-testable
// via __testables without needing a DOM/fetch harness.
const resolveRepoForLabelsFetch = ({ repoOverride, currentRepo, repoInputValue } = {}) =>
  String(repoOverride || currentRepo || repoInputValue || "").trim();

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

// Phase D.2 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// handleApplyLabelClick's definition moved into
// state/useAckLabelActions.jsx - its only caller was the "Apply label"
// button, now a hook instead of a window.* bridge.

// Phase D.2 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// state/useAckLabelActions.jsx's own createPrAckLabelActionsHelpers
// instance needs these 2 reverse bridges to reach this file's real
// summarizeAckRefreshWarnings/loadStoredData, instead of forking its own
// copy (loadStoredData especially: forking a second instance here would
// mean a second independent dataVersion/runStamp tracker, duplicating
// Phase F's own chicken-and-egg bug class).
if (typeof window !== "undefined") {
  window.summarizeAckRefreshWarnings = (...args) =>
    summarizeAckRefreshWarnings(...args);
  window.loadStoredData = (...args) => loadStoredData(...args);
}

// Phase D (see REACT_MIGRATION_PLAN.md, "Full migration roadmap")/Phase D.2:
// #run-script-btn/#ack-only-btn/#clear-only-btn/#apply-label-btn are
// React-owned (RunScriptActionButton.jsx, react-app.jsx) and now call real
// hooks (useRunScript.jsx/useAckLabelActions.jsx, state/) instead of a
// window.* bridge. #refresh-labels-btn/#apply-filters-btn are the 2
// deliberate exceptions still reached via window.* - see
// useRefreshAvailableRepoLabels.jsx's own comment for why, and
// window.persistViewFilterOptionOverrides/applyFiltersFromCache's own
// Phase E history for the second.
if (typeof window !== "undefined") {
  window.refreshAvailableRepoLabels = (...args) =>
    refreshAvailableRepoLabels(...args);
  window.applyFiltersFromCache = (...args) => applyFiltersFromCache(...args);
}

/**
 * Phase H.6 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
 * createReactCallbacks()/react-callbacks.helpers.js deleted outright -
 * handleCheckboxChange (the last function that factory built) moved to
 * PrTableApp.jsx in this phase, following handleAckAction/handleApplyLabel
 * in Phase H.5. Nothing else ever called createReactCallbackHelpers(), so
 * the factory itself, its own test file, and this lazy-init wrapper are
 * all gone - confirmed via grep.
 */

const initPage = () => {
  renderRequestActivity();
  // Phase E (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
  // restoreUiOptionOverrides() used to be called here (twice - once
  // immediately, once on 'viewprs:react-ready' - see git history for the
  // old dance this required). Restore now happens automatically inside
  // FilterStateProvider's own mount effect (state/FilterStateProvider.jsx)
  // - a plain "fetch then setState" running inside React's own lifecycle,
  // not vanilla code reaching in, so none of the old queueMicrotask/
  // dual-pass machinery is needed any more.
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
  // Phase F.2 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"): same
  // bridge-not-ready-yet race as the listeners above - initPage's own
  // renderRequestActivity() call (below, this function's very first line)
  // runs before PrDataProvider.jsx has necessarily mounted yet, so the
  // initial "No request in progress" badge push can silently no-op. Re-push
  // once React signals ready, same shape as the backfill-badges fix above.
  window.addEventListener(
    "viewprs:react-ready",
    () => renderRequestActivity(),
    { once: true },
  );
  registerUiOptionPersistenceHandlers();
  // Phase A, slice 2 (see REACT_MIGRATION_PLAN.md, "Full migration
  // roadmap"): the 6 management-tab buttons are React-owned now
  // (ManagementTabButton.jsx/TabStateProvider.jsx) - initManagementTabs'
  // own button click-wiring would double-fire alongside React's own
  // onClick if both ran, so this call is removed. initManagementTabs
  // itself (and its own tests) are untouched - it's simply no longer
  // called from here.
  // Initialize PR Data Tab orchestrator (which calls initDataTabs internally)
  prDataTabOrchestrator.initialize();
  // Phase H.11 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
  // backfill-tab.orchestrator.js's own initialize() (eager status/log load
  // at page-init time) used to be called here - deleted outright along
  // with the orchestrator itself. useBackfillTabAutoRefresh.jsx now fires
  // that same eager load unconditionally on mount instead.
  applyNonCredentialFieldHints();

  const prSectionsHost = document.getElementById("pr-sections");

  // Debounce timer for input events - see recomputeDirtyOnEvent's own
  // comment for why this now applies to INPUT, not just TEXTAREA.
  let recomputeDirtyDebounceTimer = null;

  const recomputeDirtyOnEvent = (event) => {
    const tagName = String(event?.target?.tagName || "").toUpperCase();
    const isInputEvent = event?.type === "input";
    const isTextarea = tagName === "TEXTAREA";

    if (isInputEvent) {
      if (tagName !== "INPUT" && tagName !== "TEXTAREA") {
        return;
      }
      // This listener is attached directly to #pr-sections - the exact
      // same DOM node React's own table root mounts into - and it was
      // registered here in initPage(), before React ever mounts, so it
      // fires BEFORE React's own delegated listener for the same native
      // "input" event (listeners on one node fire in registration order).
      // Calling recomputeDirtyPrSectionsFields() synchronously from here
      // (as this used to do for INPUT elements, deferring only TEXTAREA)
      // calls window.pushAutoRenderBlockingState -> AutoRenderBlockingProvider's
      // bump(), a React state update - but since this runs *before*
      // React's own event handling for this same native event even
      // starts, React doesn't recognize it as happening "inside" one of
      // its own events, and flushes it synchronously right here. That
      // out-of-band re-render reconciles the controlled React-owned text
      // input (e.g. the Notes section's Rally stories/links fields) back
      // to its pre-keystroke value *before* React's own listener (second
      // in the queue on this node) gets to process the onChange for the
      // key just typed - the keystroke is silently lost, confirmed via a
      // real-browser repro: the DOM's native "input" event fires with the
      // typed value present, but the controlled input ends up reverted
      // and the component's own onChange handler never runs at all.
      // Deferring (even 0ms) moves this off the synchronous dispatch
      // stack, letting React's own onChange committing happen first.
      if (recomputeDirtyDebounceTimer) {
        clearTimeout(recomputeDirtyDebounceTimer);
      }
      recomputeDirtyDebounceTimer = setTimeout(() => {
        recomputeDirtyPrSectionsFields();
      }, isTextarea ? 300 : 0);
      return;
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
    // Same listener-ordering race as the "input" branch above (this
    // function's own comment there has the full explanation) - a native
    // "change" (select/checkbox/radio) or "click" event reaching here
    // synchronously, before React's own delegated listener for the same
    // event gets a chance to run, can revert a just-changed controlled
    // value (e.g. the Notes section's author/tone/difficulty selects)
    // before React's own onChange ever fires. Deferred the same way.
    if (recomputeDirtyDebounceTimer) {
      clearTimeout(recomputeDirtyDebounceTimer);
    }
    recomputeDirtyDebounceTimer = setTimeout(() => {
      recomputeDirtyPrSectionsFields();
    }, 0);
  };

  prSectionsHost.addEventListener("input", recomputeDirtyOnEvent);
  prSectionsHost.addEventListener("change", recomputeDirtyOnEvent);
  prSectionsHost.addEventListener("click", recomputeDirtyOnEvent);

  // Phase B (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"): the
  // "Discard unsaved" button is React-owned now
  // (AutoRenderBlockedApplyButton.jsx/AutoRenderBlockingProvider.jsx) -
  // its own onClick calls discardAndApply directly, so this vanilla
  // click-wiring (which called the now-deleted forceApplyPendingAutoRender)
  // is removed.

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
  // function into helpers/pr-thread-comments.helpers.js). formatChkDisplay/
  // toCount/parseMarkerState/getViewedFilesSummary ("Track C" - see
  // AuthorInsightsPrDataMeta.jsx's own comment) used to stay bridged here
  // too - re-investigated and found all 4 are genuinely zero-dependency,
  // the same as every other name in this comment; that file now builds
  // its own copies directly (also fixing a real, previously-masked
  // formatChkDisplay call-signature bug along the way - see its own
  // comment). shouldShowNeedsAttention/
  // entryNeedsAttention/getNeedsAttentionConfig also moved off (both the
  // separate window.entryNeedsAttention/window.getNeedsAttentionConfig
  // assignment above and shouldShowNeedsAttention here) - PrTableApp.jsx
  // now derives all three via useNeedsAttention()
  // (state/NeedsAttentionContext.jsx, components/NeedsAttentionProvider.jsx),
  // since the "Needs Attention rules" config fields are all already
  // Context-native (Phase 6, FilterStateProvider) and the classification
  // helpers only need actor-identity, itself already Context-native.
  Object.assign(window, {
    // Phase 7 (see REACT_MIGRATION_PLAN.md): collectAssignedUsers/
    // collectRequestedReviewers/getUserInitials/getOpenConversationCountWithMe
    // used to be bridged here too - PrApprovedCell.jsx now gets all 4 from
    // PrInsightsDisplayProvider/usePrInsightsDisplay() instead, and no
    // other component reads any of these 4 names off window.
    // collectPrAuthors/getManualNotesSummary/getManualNotesFieldSummary/
    // buildPrLastCheckedIndicator/getViewedFilesState used to be bridged
    // here too - PrAuthorCell.jsx/PrDateCell.jsx/PrStatusCell.jsx now
    // import/build these directly instead (collectPrAuthors via
    // createPrAuthorCellHelpers + useActorIdentity(); the other 4 from
    // their own new/existing helper modules).
    // Phase 7 (see REACT_MIGRATION_PLAN.md): getSelectedPrNumbers/
    // updateSelectedPrNumbers used to be bridged here too -
    // PrSelectionCell.jsx now reads/writes "#pr-numbers"'s Context value
    // directly instead (see the comment at that field's old definition,
    // above getUiOptionDefaults' call sites). getLabelName used to be
    // bridged here too - it had no other internal use in this file beyond
    // that bridge (confirmed via grep, so the import above was removed
    // entirely, not just the bridge entry); PrActionsCell.jsx/
    // PrLabelsCell.jsx now import it directly from
    // pr-filter-label-extraction.helpers.js instead of reading
    // window.getLabelName. getAvailableRepoLabels used to be bridged here
    // too - PrActionsCell.jsx now reads RepoLabelsContext directly instead
    // (see populateApplyLabelSelect's own comment, above
    // getAvailableRepoLabels' old definition).
    // Phase 7 (see REACT_MIGRATION_PLAN.md): isInReviewEnabled/
    // isFlaggedEnabled used to also be bridged here - confirmed dead for
    // the React/component side (see the comments at isInReviewEnabled's
    // definition and isFlaggedEnabled's old location above), so both
    // entries are removed. isInReviewEnabled's definition stays (still
    // used by this file's own internal filtering); isFlaggedEnabled's
    // definition was deleted outright - it had no callers at all.
    // Phase 7 (see REACT_MIGRATION_PLAN.md, "useSinglePrUpdate"):
    // runSinglePrUpdate used to be bridged here too - PrTableApp.jsx now
    // calls a real useSinglePrUpdate() hook instead (state/useSinglePrUpdate.jsx).
    // That hook needs applyFreshPrPayload the same way NotesSection.jsx
    // already reaches beginRequestActivity/postJson - a vanilla primitive
    // exposed *for* a React consumer, not a bridge being closed.
    applyFreshPrPayload,
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
    // getAuthorThreadResolutionPolicy used to also be bridged here -
    // re-investigated (see this file's own comment above
    // getSelectedAuthorThreadResolutionAllowLogins) and moved to a
    // dedicated hook in ReviewThreadsSection.jsx instead.
    // Phase 7 (see REACT_MIGRATION_PLAN.md): parseSortableTime/
    // noteAuthorMatchesSelection/getAuthorInsightsDisplayName (further
    // below) used to also be bridged here - confirmed dead for the React
    // side (zero window.X reads anywhere outside this file): every actual
    // consumer already gets its own copy via a direct import
    // (parseSortableTime, ReviewThreadsSection.jsx/AuthorInsightsProvider.jsx)
    // or a Context hook (noteAuthorMatchesSelection,
    // AuthorInsightsContext/a local useMemo; getAuthorInsightsDisplayName,
    // useAuthorInsights()). getNotesDifficultyLevelText had no window.X
    // consumer at all, anywhere, even before this round - it moved along
    // with getManualNotesFieldSummary (its only remaining caller) into
    // helpers/pr-manual-notes-summary.helpers.js. postJson/
    // autoResizeTextarea used to be bridged here too - NotesSection.jsx
    // (their one shared consumer) now imports both directly instead
    // (postJson via a new bare export alongside pr-http.helpers.js's
    // existing, still test-mockable factory; autoResizeTextarea via new
    // helpers/pr-textarea-autoresize.helpers.js).
    recomputeDirtyPrSectionsFields,
    // Phase 7 (see REACT_MIGRATION_PLAN.md): asArray/safeJsonStringify/
    // getPerPrUserStateFromPayload/DEFAULT_REPO used to also be bridged
    // here - every actual consumer (asArray: 8 components including
    // AuthorInsightsPrDataMeta.jsx - independent of that file's own
    // separately-deferred Track C cluster; safeJsonStringify/
    // getPerPrUserStateFromPayload/DEFAULT_REPO: PrJsonModal.jsx, plus
    // ExportTab.jsx for safeJsonStringify and AuthorInsightsPrLink.jsx for
    // DEFAULT_REPO) now imports these directly instead (see each one's
    // own new helper module / pr-ui-render-utils.helpers.js's own hoisted
    // export).
    // ---- Export tab (see components/ExportTab.jsx) ----
    // Phase 7 (see REACT_MIGRATION_PLAN.md): getExportFieldCatalog/
    // getVisiblePrNumbersFromSectionsHost/buildExportPayload used to be
    // bridged here too - ExportTab.jsx now builds its own
    // createPrExportHelpers({ getPerPrUserStateFromPayload }) directly
    // instead (confirmed genuinely zero-dependency - see that file's own
    // comment).
    // Phase 7 (see REACT_MIGRATION_PLAN.md): normalizeRows/
    // sortRowsByPrNumberDesc/sortRowsByDateFieldDesc ("Row sorting", see
    // components/PrTableApp.jsx) used to be bridged here too -
    // PrTableApp.jsx now imports all 3 directly from
    // helpers/pr-row-sorting.helpers.js instead (genuinely
    // zero-dependency), and no other component read them off window.
    // Phase G.1 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
    // navigateToPrInTable/navigateToAuthorInsights used to be bridged here
    // too (see components/AutoRenderBlockedLinks.jsx) -
    // state/useNavigateToPrInTable.jsx/useNavigateToAuthorInsights.jsx
    // replace them as real hooks; createPrAutoRenderNavigationHelpers
    // itself (helpers/pr-auto-render-navigation.helpers.js) had no other
    // caller, so it was deleted outright, not just un-bridged.
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
        void window.persistViewFilterOptionOverrides?.();
        debouncedApplyFilters();
        return;
      }
      if (
        targetId === "change-filter-use-builtin-merge-pattern" ||
        targetId === "change-filter-ignore-commit-patterns"
      ) {
        void window.persistViewFilterOptionOverrides?.();
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
            void window.persistViewFilterOptionOverrides?.();
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

  // Deferred-items follow-up (full vanilla-to-React sweep, see
  // REACT_MIGRATION_PLAN.md): #quick-check-btn/#trigger-auto-run-btn are
  // React-owned now (components/QuickCheckButton.jsx/
  // TriggerAutoRunButton.jsx), with their own onClick handlers calling
  // useQuickCheckActions()/useTriggerAutoRun() directly (Phase H.9) - no
  // vanilla wiring needed here anymore.
  // Deferred-items follow-up (full vanilla-to-React sweep, see
  // REACT_MIGRATION_PLAN.md): #error-snackbar-close is React-owned now
  // (components/Snackbar.jsx), with its own onClick handler - no vanilla
  // wiring needed here anymore.
  // Phase D (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
  // #run-script-btn/#ack-only-btn/#clear-only-btn/#apply-label-btn/
  // #refresh-labels-btn/#apply-filters-btn are React-owned now
  // (RunScriptActionButton.jsx, react-app.jsx) - no vanilla wiring needed
  // here anymore. Phase D.2 (see REACT_MIGRATION_PLAN.md) replaced 4 of
  // their 5 window.* bridges with real hooks (useRunScript.jsx/
  // useAckLabelActions.jsx, state/) - only window.applyFiltersFromCache
  // and window.refreshAvailableRepoLabels (a deliberate exception, see
  // useRefreshAvailableRepoLabels.jsx's own comment) are still reached via
  // window.* from react-app.jsx.
  // Phase C (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"): the
  // 3 backfill action buttons, the log-refresh button, and the
  // auto-scroll checkbox are React-owned now (BackfillControls.jsx/
  // BackfillLogControls.jsx) - no vanilla wiring needed here anymore.
  // Phase D.2 (see REACT_MIGRATION_PLAN.md) replaced their window.* bridges
  // with useBackfillActions.jsx (state/) - that hook's own DI param for
  // auto-scroll is a no-op (Phase G.4), not window.autoScrollBackfillLogToBottom,
  // which is itself deleted outright (cluster-4 cleanup, see
  // REACT_MIGRATION_PLAN.md, "Remaining-effort audit") - confirmed dead.

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
  // headless React root with no visible UI) - Phase F/F.2 (see
  // REACT_MIGRATION_PLAN.md) moved pollForDataChanges/pollBackfillStatus/
  // renderRequestActivity themselves into PrDataProvider.jsx too, reached
  // directly via usePrData() Context (no window.* indirection left for any
  // of the 3). window.pollSchedulerStatus (its own automatic interval
  // already retired, below) was deleted outright in Phase H.2 (see
  // REACT_MIGRATION_PLAN.md) - index.html.test.js was its only remaining
  // caller, and that test now calls window.renderSchedulerStatus
  // directly instead, the same real path SSE uses.
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
    },
  };
}
