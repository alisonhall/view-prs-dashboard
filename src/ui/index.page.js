// ES module cleanup (see REACT_MIGRATION_PLAN.md): real imports for
// helper files that have been converted off the UMD wrapper, kept as one
// block at the top per normal `import` placement conventions - every
// not-yet-converted dependency below still uses the original
// `require(...) : globalThis.ViewPrsXHelpers` fallback, which continues
// to work unmodified (this file's own <script> tag is now type="module",
// see index.html) until it's converted too.
import * as formParsingHelpersModule from "./helpers/form-parsing.helpers.js";
import * as prDomAccessHelperFactory from "./helpers/pr-dom-access.helpers.js";
import * as prViewerContextHelperFactory from "./helpers/pr-viewer-context.helpers.js";
import * as prAutoRenderUnsavedHelperFactory from "./helpers/pr-auto-render-unsaved.helpers.js";
import * as prAuthorInsightsIdentityHelperFactory from "./helpers/pr-author-insights-identity.helpers.js";
import * as prAuthorInsightsDraftsHelperFactory from "./helpers/pr-author-insights-drafts.helpers.js";
import * as prAutoRenderBlockingHelperFactory from "./helpers/pr-auto-render-blocking.helpers.js";
import * as prAutoRenderIndicatorHelperFactory from "./helpers/pr-auto-render-indicator.helpers.js";
import * as prAutoRenderIndicatorLinksHelperFactory from "./helpers/pr-auto-render-indicator-links.helpers.js";
import * as prAutoRenderStateHelperFactory from "./helpers/pr-auto-render-state.helpers.js";
import * as prFilterPanelHelperFactory from "./helpers/pr-filter-panel.helpers.js";
import * as prStatusDisplayHelperFactory from "./helpers/pr-status-display.helpers.js";
import * as prActorIdentityHelperFactory from "./helpers/pr-actor-identity.helpers.js";
import { inferViewerLoginFromPage } from "./helpers/pr-viewer-login-inference.helpers.js";
import { asArray } from "./helpers/pr-as-array.helpers.js";
import { isTimeoutFailureMessage } from "./helpers/pr-failure-snackbar.helpers.js";
import { summarizeAckRefreshWarnings } from "./helpers/pr-ack-refresh-warnings.helpers.js";
// DEFAULT_REPO now imported from helpers/pr-default-repo.helpers.js (Phase
// 7, see REACT_MIGRATION_PLAN.md) everywhere it's needed -
// PrJsonModal.jsx/AuthorInsightsPrLink.jsx import it directly instead of
// reading it off window.DEFAULT_REPO. This file's own former import (for
// the now-deleted vanilla handleRequestMoreMerged instance, ninth
// follow-up, see REACT_MIGRATION_PLAN.md "Remaining-effort audit") is gone
// too - nothing left in this file needs it.
// Window-bridge elimination Phase 7 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
// latestStoredPayload/latestSelectedRepo/applyLatestPrData, and the render
// pipeline that wrote them (renderPrData/applyFreshPrPayload/loadStoredData,
// the fingerprint/manifest helpers, mountReactTable/updateReactTable), moved
// into state/PrDataProvider.jsx, which owns the PR data now and published it
// on PrDataActionsContext. Their window.* bridges are deleted, and so is the
// initial loadStoredData() call in initPage: the Provider fetches on mount.
// Phase H.14 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
// cluster 4): supportsBackfillLogPolling/lastBackfillStateKey/
// isBackfillActionPending/isBackfillRunning moved into
// BackfillStatusProvider.jsx (components/) as real React state. (This
// file's own readers of them went with its backfill code in window-bridge
// elimination Phase 7.2, and the window.* bridges with them.)
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

// Window-bridge elimination Phase 7.2 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
// setStatusMessage (and its window.setStatusMessage bridge, which nothing read
// any more), setOutputMessage, the beginRequestActivity proxy, and
// showErrorNotification/notifyFailureSnackbar are deleted - their last callers
// were this file's backfill code and loadStoredData failure path, both gone.
// Phase 7.3: so is renderRequestActivity, with its startup call and
// 'viewprs:react-ready' re-push - RequestActivityProvider starts with the
// idle badges as its own state, so there is nothing to push.

// Phase H.25 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
// cluster 1): describePollFailure/showPollFailureWarning/markPollSuccess
// are deleted outright - moved into PrDataProvider.jsx (see that file's
// own comment), the only place either function's one real caller
// (pollForDataChanges) has ever lived.

// summarizeAckRefreshWarnings now lives in helpers/pr-ack-refresh-warnings.helpers.js
// (window-bridge elimination Phase 7) - useAckLabelActions.jsx imports it
// directly instead of reading window.summarizeAckRefreshWarnings. Imported
// here only for __testables (below).

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

// Window-bridge elimination Phase 7.2 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
// this file's backfill status code is gone - its loadBackfillStatus instance,
// the setBackfillLogMessage/renderBackfillStatus/updateBackfillStatusFromPayload
// forwarders (and the latestBackfillLogMessage/latestBackfillStatus caches they
// kept for the 'viewprs:react-ready' replays), the backfill-log auto-scroll,
// and window.loadBackfillStatus. initPage's initial status+log load was an
// exact duplicate of the one useBackfillTabAutoRefresh fires from AppRoot on
// mount, so it is deleted rather than moved; BackfillStatusProvider builds its
// own loadBackfillStatus for PrDataProvider's backfill poll.

// Phase H.23 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
// cluster 1): FILTER_STATE_FIELD_MAP/getFilterStateOverrideForFieldId/
// readAttentionConfigText/readAttentionConfigCheckbox/getNeedsAttentionConfig
// (Phase E's own "Needs Attention" config reader, confirmed dead here by
// H.18 already - NeedsAttentionProvider.jsx has owned the real, live
// derivation since then) and getEffectiveViewerLogin/collectRequestedReviewers/
// collectAssignedUsers/collectApproversFromRow (this file's own private
// instances, each feeding only the now-deleted entryNeedsAttention/
// rowMatchesUiFilters chain below - every live consumer elsewhere already
// builds its own separate instance of the same factory, same "call the
// zero-dependency factory again" pattern as everywhere else in this
// migration) are all deleted outright - confirmed via grep each had no
// caller left outside prDataTabOrchestrator's now-deleted pipeline. See
// Phase H.23's own plan entry for the full accounting.

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

const { getOptionalElementById } =
  prDomAccessHelperFactory.createPrDomAccessHelpers({
    documentRef: typeof document !== "undefined" ? document : null,
  });

// Phase H.23 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
// cluster 1): collectNodesByClass/capturePrSectionOpenState/
// buildAppliedSummaryViewModel/buildGroupedPrSections/normalizeSelectedScope/
// resolveScopedRows/deriveScopeSettings/captureRenderContext/deriveRowSources/
// deriveScopedRows/deriveRenderSummary/applyRenderResults/
// deriveFilterPipelineState/deriveFilterSelectionInputs (and the 11
// getSelected*/get*Filter getters it alone consumed)/deriveRenderSummaryInputs/
// deriveRenderFilterSummaryState/deriveRenderApplyInputs/
// deriveRenderFinalizedState/deriveRenderPipelineState/
// deriveCommittedRenderState/deriveRunPrDataContext are all deleted outright
// - every one of them fed only prDataTabOrchestrator's own renderPrData
// pipeline (also deleted, see renderPrData's own comment below), with zero
// other reader anywhere (confirmed via grep, not assumed - several of
// these functions' own doc comments already claimed a surviving purpose
// that turned out stale once actually traced, e.g. getNeedsAttentionConfig
// was superseded by NeedsAttentionProvider.jsx back in H.18). See Phase
// H.23's own plan entry for the full accounting. Of the 2 survivors H.23
// left, deriveRepoRunContext moved to PrDataProvider with renderPrData
// (window-bridge elimination Phase 7); deriveViewerContext (below) still
// feeds this file's actor-login aliases (see getCurrentActorLoginAliases).

const { deriveViewerContext } =
  prViewerContextHelperFactory.createPrViewerContextHelpers({
    normalizeActorLoginAliases: (...args) => normalizeActorLoginAliases(...args),
    normalizeActorLogin: (...args) => normalizeActorLogin(...args),
    inferViewerLoginFromPage: (...args) => inferViewerLoginFromPage(...args),
  });

// Ninth follow-up (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit"):
// window.handleRequestMoreMerged and this file's own vanilla instance of
// createPrMergedRequestMoreActionHelpers are both deleted outright -
// MergedRequestMoreAction.jsx's "Request more" button (via
// MergedRequestMoreActionLive, react-app.jsx) now calls
// state/useRequestMoreMerged.jsx directly, which builds its own instance
// of the same pure factory. Confirmed no other caller of either the
// bridge or isRequestMoreMergedPending existed.

// Phase H.26 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
// cluster 1): applyFiltersFromCache (and the "Apply filters (local)"
// button/debounced-field-change triggers that called it) is deleted
// outright - a dedicated research pass, then an empirical "stub both
// bridges to no-ops, run the full suite" re-check against the current
// (post-H.23) code, confirmed zero remaining dependents: every real
// feature this used to drive (row filters, Needs Attention icons, the
// Review Conversations thread-resolution warning) is independently live
// via Context now, and calling renderPrData with an unchanged payload
// only forces a wasteful whole-app re-render, nothing else. See Phase
// H.26's own plan entry for the full writeup.

// Window-bridge elimination Phase 7 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
// renderPrData (moved to PrDataProvider) used to commit currentActorLoginAliases
// here, via deriveViewerFilterSetup, as a side effect of every render. Its
// reader is normalizeActorLogin's default aliases (getAuthorInsightsDisplayName/
// getBlockingAuthorInsightsLogins below), so derive it on demand from the
// payload the table is showing instead, cached per payload so repeated calls
// between renders don't re-walk every entry. The cache is claimed before
// deriving: deriveViewerContext is wired to normalizeActorLogin, whose default
// aliases come back here, so a nested call must get the previous aliases (as
// the old module variable gave it) rather than recurse.
let actorLoginAliasesCache = { payload: undefined, aliases: {} };
const getCurrentActorLoginAliases = () => {
  const payload = window.getReactPrTablePayload?.();
  if (payload === actorLoginAliasesCache.payload) {
    return actorLoginAliasesCache.aliases;
  }
  actorLoginAliasesCache = { payload, aliases: actorLoginAliasesCache.aliases };
  const { currentActorLoginAliases } = payload
    ? deriveViewerContext({ payload, allEntries: Object.values(payload.byPrNumber || {}) })
    : {};
  actorLoginAliasesCache.aliases =
    currentActorLoginAliases && typeof currentActorLoginAliases === "object"
      ? currentActorLoginAliases
      : {};
  return actorLoginAliasesCache.aliases;
};

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
      window.getReactPrTablePayload?.()?.actorsMap || {},
  });

// Phase 7 (see REACT_MIGRATION_PLAN.md): the draft/comment-cache CRUD
// functions moved to AuthorInsightsDraftsProvider.jsx
// (components/AuthorInsightsDraftsProvider.jsx), which owns that state as
// real React state. Eleventh follow-up (see REACT_MIGRATION_PLAN.md,
// "Remaining-effort audit"): of the bridges that Provider used to
// republish for this file, only getAuthorManualCommentsForLogin (used
// directly below) and getAuthorInsightsDraftsSnapshot (used by
// getBlockingAuthorInsightsLogins's own DI below) are still genuinely
// read from here - pr-auto-render-blocking.helpers.js's
// getBlockingAuthorInsightsLogins needs both, fully vanilla, with no
// render-tree position. The other 10 the Provider used to also publish
// were a stale leftover (confirmed dead: AuthorInsightsCommentsSection.jsx,
// their only real consumer, already called every one of them via
// useAuthorInsightsDrafts() directly) and were deleted from that Provider
// outright, not kept for this file's sake.
const {
  normalizeAuthorInsightsSentiment,
  isAuthorInsightsComposerDraftDirty,
  isAuthorInsightsEditDraftDirty,
} = prAuthorInsightsDraftsHelperFactory.createPrAuthorInsightsDraftsHelpers();

// Fresh-reading proxy, not a direct reference to a local implementation -
// AuthorInsightsDraftsProvider (a React component) only publishes this on
// window once it mounts, which happens after this module-level wiring
// runs; a direct reference captured now would freeze on undefined. Same
// indirection every other window.*-bridge-reading call in this file uses.
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

// Window-bridge elimination Phase 7.3 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
// renderSchedulerStatus and applyActivePrProgressIndicators moved to
// components/RequestActivityProvider.jsx (with window.renderSchedulerStatus and
// the window.setLatestSchedulerStateAndRender bridge they fed). The
// 'pr-active-progress-update' event dispatch moved with them; the direct
// `hidden` toggling of each row's .pr-progress-indicator is dropped, since
// PrNumberCell already renders that attribute from PrTableApp's own state.

// Phase 7, sub-phase 7.4 (see REACT_MIGRATION_PLAN.md): the 5
// populateXOptions functions this factory used to also provide have moved
// to FilterOptionsProvider.jsx/react-app.jsx's MultiSelectListPortals,
// which derive the same option lists reactively from PrDataContext instead
// of being pushed imperatively through here.
// Cleanup pass (prompted by a direct question about leftover vanilla code,
// see REACT_MIGRATION_PLAN.md): the selection readers/"Any" filter getters
// this factory also used to provide (getSelectedAuthorLogins/
// getSelectedAssignedLogins/getSelectedApproverLogins/
// getSelectedIncludeLabelNames/getSelectedExcludeLabelNames/
// getCustomCommentsFilter/getOtherNotesFilter/getPrDifficultyFilter/
// getRallyStoriesFilter/getRallyLinksFilter/getAnalysisOfPrFilter) are
// deleted from the factory itself now too, not just unused here - a
// previous pass (Phase H.23) only confirmed this file had stopped calling
// them, but left them in pr-filter-panel.helpers.js on the strength of a
// comment (just below, now also corrected) claiming
// createPrFilterSelectionInputsHelpers still needed them; that factory
// doesn't exist anywhere in the codebase any more (confirmed via grep), so
// they had zero real caller left at all. Only the dropdown-closing
// listener survives.
const { setupMultiSelectDropdownClosing } = prFilterPanelHelperFactory.createPrFilterPanelHelpers({
  documentRef: typeof document !== "undefined" ? document : null,
});

// Phase H.10 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"): the
// window.getSelectedXxx bridges these functions used to be exposed through
// are gone - Phase G.3 already moved FilterStateProvider.jsx's own
// buildOverrides() onto RowFilterSelectionContext/
// AuthorThreadResolutionSelectionContext/ChangeFilterActorSelectionContext
// directly, leaving no real caller of any of these bridges (confirmed via
// grep). getFormBody() (the comment that used to justify keeping 3 of the
// underlying functions as plain calls) was itself deleted outright in
// Phase H.20, and the functions themselves are deleted now too - see
// pr-filter-panel.helpers.js's own comment above for the full accounting.

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

// Phase 7 (see REACT_MIGRATION_PLAN.md): isFlaggedEnabled used to live here
// too - deleted entirely, not just its window.* bridge, since it had zero
// callers of any kind (confirmed via grep).
// Phase H.23 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
// cluster 1): isInReviewEnabled (isFlaggedEnabled's sibling) is now also
// deleted outright - its own real, legitimate consumer (this file's own
// "alwaysShowInReview" row-filtering, via rowMatchesUiFilters) is gone too.
// window.isInReviewEnabled itself was already confirmed dead long before
// this (Phase 7 - PrTableApp.jsx's checkNeedsAttention never read it).

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
  statusIcon,
} = prStatusDisplayHelperFactory.createPrStatusDisplayHelpers();

void statusIcon;

// Phase H.22 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
// cluster 3): pr-data-tabs.helpers.js (activateDataTab/initDataTabs) is
// deleted outright - components/TabPanelVisibilitySync.jsx now owns the 3
// data-tab panels' `hidden` attribute reactively from TabStateContext,
// and DataTabButton.jsx already owned the buttons' className/aria-selected
// (this file's own window.activateDataTab bridge was fully redundant with
// that). initDataTabs' only call site (the orchestrator below) already
// passed a no-op in its place (Phase A, slice 1) - removed, not replaced.

// Phase H.23 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
// cluster 1): the PR Data Tab Orchestrator (orchestrators/pr-data-tab.orchestrator.js)
// and its one remaining caller, renderPrData's own
// prDataTabOrchestrator.renderPrData(...) calls, are deleted outright -
// see renderPrData's own comment below for what replaced it.
// initialize()'s own call site (below, initPage) is removed too - it only
// ever ran initDataTabs(), a no-op since Phase A slice 1.

// Action Log's fetch/render AND its own "Refresh" button are both fully
// React-owned now (ActionLogSection.jsx, mounted into #action-log-container,
// portals the button into #action-log-refresh-btn-root too) - seventh
// follow-up (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit"), this
// file's own loadActionLog()/window.triggerActionLogLoad bridge and the
// #action-log-refresh-btn listener below are both deleted outright.
//
// Phase H.22 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
// cluster 3): pr-management-tabs.helpers.js (activateTab/initManagementTabs)
// is deleted outright - components/TabPanelVisibilitySync.jsx now owns the
// 6 management-tab panels' `hidden` attribute reactively from
// TabStateContext, and ManagementTabButton.jsx already owned the buttons'
// className/aria-selected (this file's own window.activateManagementTab
// bridge was fully redundant with that). The re-trigger-on-tab-activation
// behavior `activateTab` used to drive (loadActionLog/loadActorNameCache -
// onBackfillTabActivated was already gone, Phase H.11) moved into each
// section's own component instead (ActionLogSection.jsx/ActorNamesTab.jsx),
// watching useIsTabPanelVisible() directly, same shape
// useBackfillTabAutoRefresh.jsx already established. loadActorNameCache
// (this file's own local const) had no other caller - deleted outright,
// not just unused. Seventh follow-up (see REACT_MIGRATION_PLAN.md,
// "Remaining-effort audit"): window.triggerActorNameCacheLoad itself is
// gone too now - ActorNamesTab.jsx's own refresh buttons/re-activation
// effect call a local load() directly, having never needed a bridge to
// begin with (confirmed zero callers outside that one component).

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
  resolveActorDisplayName,
} = prActorIdentityHelperFactory.createPrActorIdentityHelpers({
  asArray,
  getActorLoginAliases: () => getCurrentActorLoginAliases(),
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

// Phase H.23 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
// cluster 1): normalizeRows/sortRowsByDateFieldDesc/sortRowsByPrNumberDesc/
// parseCsvTokens (this file's own private instances) are deleted outright -
// each only ever fed the now-deleted deriveRowSources/deriveScopedRows/
// buildGroupedPrSections/deriveScopeSettings chain.

// Phase 7 (see REACT_MIGRATION_PLAN.md): getPrNumbersInput/getSelectedPrNumbers/
// setSelectedPrNumbers/handlePrNumbersInputChange/updateSelectedPrNumbers used
// to live here, reading/writing the "#pr-numbers" DOM input directly and
// bridged onto window for PrSelectionCell.jsx. "#pr-numbers" is now
// Context-backed (FilterStateProvider, via ContextRunScriptTextInput.jsx -
// see FILTER_STATE_FIELD_MAP's "pr-numbers" entry above) and
// PrSelectionCell.jsx reads/writes the same Context value directly via
// FilterStateProvider's per-key store (useFilterFieldValue/
// useFilterFieldActions; helpers/pr-selected-pr-numbers.helpers.js holds
// the pure toggle logic that used to live in updateSelectedPrNumbers) - no
// window.* bridge needed for this cluster at all anymore.

// Phase H.23 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
// cluster 1): shouldAlwaysShowInReviewRows ("always-show-in-review"'s
// Context-or-DOM reader) is deleted too - its sole caller,
// deriveFilterSelectionInputs, is gone.

// Phase H.23 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
// cluster 1): this file's own rowMatchesUiFilters instance (pr-row-match-
// filters.helpers.js) is deleted outright - its sole consumer,
// buildRowFilterCriteria/applyRowUiFilters (pr-row-filtering.helpers.js),
// is also deleted (both only ever fed the now-deleted renderPrData
// pipeline). state/useVisiblePrNumbers.jsx's own separate instance of this
// same factory (the real, live row-filtering logic) is untouched.

// Window-bridge elimination Phase 7.3 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
// window.renderSchedulerStatus/AUTO_DATA_POLL_MS/AUTO_BACKFILL_POLL_MS are
// gone - RequestActivityProvider owns renderSchedulerStatus, and the two
// interval constants live in components/PrDataPolling.jsx, their only reader.

// Phase H.20 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
// cluster 6): getFormBody() (this used to be its definition) and the
// window.getFormBody bridge are both gone - every field it read via
// FormData/DOM scan was already Context-backed, so state/useFormBody.jsx
// now re-derives the same shape straight from FilterStateContext/
// RowFilterSelectionContext instead. getSelectedIncludeLabelNames/
// getSelectedExcludeLabelNames/getSelectedAuthorLogins (this was their one
// other caller) are deleted outright too now - see
// pr-filter-panel.helpers.js's own comment for why the
// createPrFilterSelectionInputsHelpers' instance this comment used to cite
// as their other reason to stay doesn't exist any more.

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
//
// Cleanup pass (prompted by a direct question, then a direct instruction
// to reconsider the structure so no window.* bridge is needed at all, see
// REACT_MIGRATION_PLAN.md): this entire block - the module state
// (availableRepoLabels/isFetchingRepoLabels), the DOM read of #repo, the
// fetch, and populateApplyLabelSelect's push into RepoLabelsContext - is
// deleted outright. RepoLabelsProvider.jsx (components/) now owns all of
// it directly as real React state, reading the current repo from
// usePrData()/useFilterState() instead of a DOM read, with no
// window.setAvailableRepoLabels/window.refreshAvailableRepoLabels bridge
// of any kind left anywhere in this data's path - see that file's own
// comment for how its one genuinely cross-tree caller
// (FilterStateProvider.jsx's restore-on-mount effect) is covered through
// plain Context instead. The pushPayloadToReactTable(latestStoredPayload,
// latestSelectedRepo) call this block used to also make after every
// refresh is dropped, not just moved - both of RepoLabelsContext's real
// consumers (ApplyLabelSelect.jsx/PrActionsCell.jsx) already re-render
// from the Context's own `labels` state changing, so re-pushing an
// unchanged payload into the main table only forced a wasteful whole-app
// re-render, the same class of dead re-render Phase H.26 already found
// and removed elsewhere.
//
// Phase D.2 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// handleApplyLabelClick's definition moved into
// state/useAckLabelActions.jsx - its only caller was the "Apply label"
// button, now a hook instead of a window.* bridge.

// Phase D (see REACT_MIGRATION_PLAN.md, "Full migration roadmap")/Phase D.2:
// #run-script-btn/#ack-only-btn/#clear-only-btn/#apply-label-btn are
// React-owned (RunScriptActionButton.jsx, react-app.jsx) and now call real
// hooks (useRunScript.jsx/useAckLabelActions.jsx, state/) instead of a
// window.* bridge. #refresh-labels-btn (the former "1 deliberate
// exception") is now React-owned the same way, via useRepoLabels().refresh
// - see RepoLabelsProvider.jsx's own comment for how its one genuinely
// cross-tree caller (FilterStateProvider.jsx's restore-on-mount effect)
// reaches it through plain Context instead of any window.* bridge at all.
// #apply-filters-btn (the former other exception) is gone
// entirely - Phase H.26 (see REACT_MIGRATION_PLAN.md, "Remaining-effort
// audit", cluster 1) deleted the button along with
// window.applyFiltersFromCache, its last remaining caller.

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
  // Phase E (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
  // restoreUiOptionOverrides() used to be called here (twice - once
  // immediately, once on 'viewprs:react-ready' - see git history for the
  // old dance this required). Restore now happens automatically inside
  // FilterStateProvider's own mount effect (state/FilterStateProvider.jsx)
  // - a plain "fetch then setState" running inside React's own lifecycle,
  // not vanilla code reaching in, so none of the old queueMicrotask/
  // dual-pass machinery is needed any more.
  // A bridge-not-ready-yet race for applyNonCredentialFieldHints() below
  // (this is the last 'viewprs:react-ready' listener; the backfill and
  // request-activity ones went in window-bridge elimination Phases 7.2-7.3): it reaches for the 5 "Run Script
  // options" fields (repo/limit/merged-limit/jobs/pr-numbers) by DOM id,
  // but all 5 are React-portaled (FilterStateProvider, see
  // ContextRunScriptTextInput.jsx) and don't exist in the DOM yet at this
  // point in a real page load - react-app.jsx's own module graph is still
  // loading. The
  // initial call below is harmless-but-ineffective until this fires (finds
  // nothing, silently no-ops via getOptionalElementById) - kept anyway for
  // any environment where React happens to already be mounted (e.g. a test
  // harness that injects the markup synchronously up front).
  window.addEventListener(
    "viewprs:react-ready",
    () => applyNonCredentialFieldHints(),
    { once: true },
  );
  // Phase A, slice 2 (see REACT_MIGRATION_PLAN.md, "Full migration
  // roadmap"): the 6 management-tab buttons are React-owned now
  // (ManagementTabButton.jsx/TabStateProvider.jsx) - initManagementTabs'
  // own button click-wiring would double-fire alongside React's own
  // onClick if both ran, so this call is removed. initManagementTabs
  // itself (and its own tests) are untouched - it's simply no longer
  // called from here.
  // Phase H.23 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
  // cluster 1): the PR Data Tab orchestrator's own initialize() call
  // (which only ever ran a no-op initDataTabs) is removed - the
  // orchestrator itself is deleted outright, see renderPrData's own
  // comment.
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
    // (see RepoLabelsProvider.jsx's own comment for the full history, now
    // that this file's own label-fetch block that used to sit near
    // getAvailableRepoLabels' old definition is deleted outright).
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
    // applyFreshPrPayload (which that hook needed) was bridged here as well,
    // until window-bridge elimination Phase 7 moved it into PrDataProvider.
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

  // Window-bridge elimination Phase 7 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
  // the initial loadStoredData("") call (and the 'viewprs:react-ready'
  // listener that re-rendered once React's table bridge existed) moved into
  // PrDataProvider's own mount effect, so there is no load-order race left
  // to cover here. Phase 7.2: so did the initial loadBackfillStatus call -
  // deleted, since useBackfillTabAutoRefresh already makes the same load on
  // mount. Phase 7.3: and the startup loadSchedulerStatus() call, now
  // RequestActivityProvider's mount effect.

  // Phase H.26 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
  // cluster 1): debouncedApplyFilters/window.debouncedApplyFilters are
  // deleted outright, along with the "Apply filters (local)" button
  // (window.applyFiltersFromCache, react-app.jsx) that called it - the
  // re-filtering it used to (redundantly) trigger has been live via
  // Context for a while now.
  //
  // H.26 follow-up: this phase's own first fix replaced that button's
  // other call (window.persistViewFilterOptionOverrides?.()) with a
  // vanilla delegated "change" listener here, reasoning that was the only
  // save trigger left for several fields/lists. That reasoning was itself
  // incomplete - a vanilla DOM listener can only ever see a *native* DOM
  // event, so it structurally couldn't cover TableFilterChips.jsx's "x"
  // button (a direct Context update, no DOM event at all) - a real,
  // found-via-review persistence gap, fixed by reinstating a debounced
  // Context-level watcher in FilterStateProvider.jsx instead (watching
  // `values` and all 3 selection Contexts, covering every field this
  // Provider owns regardless of what triggered the change). That watcher
  // is now the one, sufficient, fully-React-owned persistence trigger for
  // every view-filter field and multi-select list - this vanilla
  // listener pair (and the DOM-id Set it dispatched on) is deleted
  // outright as the now-fully-redundant leftover of this phase's own
  // first-pass fix, not a separate mechanism worth keeping as a
  // "harmless double-hookup". No vanilla wiring needed here at all
  // anymore for any of these fields' persistence.

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
  // #refresh-labels-btn are React-owned (RunScriptActionButton.jsx,
  // react-app.jsx) - no vanilla wiring needed here anymore, for any of
  // them. Phase D.2 (see REACT_MIGRATION_PLAN.md) replaced 4 of their
  // window.* bridges with real hooks (useRunScript.jsx/
  // useAckLabelActions.jsx, state/); a later cleanup pass gave
  // #refresh-labels-btn the same treatment (RefreshLabelsButtonLive, via
  // useRepoLabels().refresh - see RepoLabelsProvider.jsx's own comment).
  // #apply-filters-btn (the 5th) is gone entirely now - Phase H.26 (see
  // REACT_MIGRATION_PLAN.md, "Remaining-effort audit", cluster 1) deleted
  // the button along with window.applyFiltersFromCache, its last
  // remaining caller.
  // Phase C (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"): the
  // 3 backfill action buttons, the log-refresh button, and the
  // auto-scroll checkbox are React-owned now (BackfillControls.jsx/
  // BackfillLogControls.jsx) - no vanilla wiring needed here anymore.
  // Phase D.2 (see REACT_MIGRATION_PLAN.md) replaced their window.* bridges
  // with useBackfillActions.jsx (state/) - that hook's own DI param for
  // auto-scroll is a no-op (Phase G.4), not window.autoScrollBackfillLogToBottom,
  // which is itself deleted outright (cluster-4 cleanup, see
  // REACT_MIGRATION_PLAN.md, "Remaining-effort audit") - confirmed dead.

  // Track C, slice C1 (post-Phase-6 follow-up, see REACT_MIGRATION_PLAN.md):
  // the four auto-polling intervals (data/scheduler/backfill/activity-
  // render) and their visibility-pause/beforeunload-cleanup lifecycle used
  // to be owned here (setInterval/cleanupIntervals/restartIntervals). That
  // ownership moved to <PrDataPolling /> (react-app.jsx, headless, no
  // visible UI), which reads pollForDataChanges/pollBackfillStatus from
  // PrDataProvider and renderRequestActivity from RequestActivityProvider
  // (window-bridge elimination Phase 7.3). window.pollSchedulerStatus was
  // deleted outright in Phase H.2 (see REACT_MIGRATION_PLAN.md); the
  // scheduler state arrives over SSE (JobEventsProvider).
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
    },
  };
}
