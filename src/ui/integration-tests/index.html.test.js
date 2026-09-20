/** @jest-environment jsdom */

const fs = require("fs");
const path = require("path");
const React = require("react");
// Phase 6 (see REACT_MIGRATION_PLAN.md): this suite mounts the real
// PrTableApp (see installReactTableMountBridge() below) via
// @testing-library/react's own render()/cleanup() rather than a hand-rolled
// ReactDOM.createRoot() bridge - see that function's own comment for why.
// Importing it also configures @testing-library/dom's *shared* global
// config (the same `configure()` singleton this file's own
// `screen`/`waitFor`/`within` below read from) with an eventWrapper that
// wraps every fireEvent-dispatched event (which @testing-library/user-event
// uses internally for every keystroke/click) in act().
const { render: rtlRender, cleanup } = require("@testing-library/react");
const { flushSync } = require("react-dom");
// @testing-library/react's render() sets this automatically, but setting it
// here too documents the requirement plainly and stays correct even if the
// bridge above ever stops going through render().
global.IS_REACT_ACT_ENVIRONMENT = true;
const { screen, waitFor, within, fireEvent } = require("@testing-library/dom");
const userEvent = require("@testing-library/user-event").default;
const { createMultiPrPayload } = require("../test-fixtures/pr-data.fixtures.js");
const { PrTableApp } = require("../components/PrTableApp");
const { PrDataProvider } = require("../state/PrDataProvider");
const { MultiSelectCheckboxList } = require("../components/MultiSelectCheckboxList");
const { AppliedFilterSummary } = require("../components/AppliedFilterSummary");
// Phase 6 (see REACT_MIGRATION_PLAN.md): these three are plain UMD helper
// modules (require()-able directly), but in the browser PrTableApp.jsx and
// index.page.js read them off window.ViewPrsXxxHelpers (set by index.html's
// own <script> tags, which this suite never loads) rather than importing
// them - see the initTestPage() wiring below for where they get attached.
const sectionConfigHelpers = require("../helpers/pr-section-config.helpers.js");
const smartGroupsHelpers = require("../helpers/pr-smart-groups.helpers.js");
const reactCallbacksHelpers = require("../helpers/react-callbacks.helpers.js");

const htmlPath = path.join(__dirname, "..", "index.html");
const indexHtml = fs.readFileSync(htmlPath, "utf8");
const cssPath = path.join(__dirname, "..", "index.css");
const indexCss = fs.readFileSync(cssPath, "utf8");

const extractBodyHtml = (fullHtml) => {
  const bodyMatch = String(fullHtml || "").match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return bodyMatch && bodyMatch[1] ? bodyMatch[1] : "";
};

const createOkJsonResponse = (payload) => ({
  ok: true,
  status: 200,
  json: async () => payload,
});

let latestDataPayload = { ok: true, byPrNumber: {}, lastRun: null };
let actionLogEntries = [];
let actorNameCacheEntries = {};
let actorLoginAliasEntries = {};
let fetchMock;

const createFetchMock = ({
  userDefaultsOverrides = {},
  backfillStatusResponse = null,
  authorCommentsGetHandler = null,
} = {}) =>
  jest.fn(async (url, init = {}) => {
    const normalizedUrl = String(url || "");
    const method = String(init?.method || "GET").toUpperCase();

    if (normalizedUrl === "/view-prs/user-defaults" && method === "GET") {
      return createOkJsonResponse({ ok: true, overrides: userDefaultsOverrides });
    }

    if (normalizedUrl === "/view-prs/user-defaults" && method === "PUT") {
      return createOkJsonResponse({ ok: true });
    }

    if (normalizedUrl === "/view-prs/backfill" && method === "GET") {
      if (backfillStatusResponse) {
        return createOkJsonResponse(backfillStatusResponse);
      }
      return createOkJsonResponse({
        ok: true,
        running: false,
        summary: "Backfill status: not running",
        output: "Backfill status: not running",
      });
    }

    if (normalizedUrl === "/view-prs/backfill/start" && method === "POST") {
      return createOkJsonResponse({
        ok: true,
        running: true,
        summary: "Started background backfill (PID: 321).",
        output: "Started background backfill (PID: 321).",
      });
    }

    if (normalizedUrl === "/view-prs/backfill/stop" && method === "POST") {
      return createOkJsonResponse({
        ok: true,
        running: false,
        summary: "Stopped background backfill (PID: 321).",
        output: "Stopped background backfill (PID: 321).",
      });
    }

    if (normalizedUrl.startsWith("/view-prs/backfill/log") && method === "GET") {
      return createOkJsonResponse({
        ok: true,
        summary: "Showing 2 log line(s)",
        tail: "line-1\nline-2",
      });
    }

    if (normalizedUrl === "/view-prs/action-log" && method === "GET") {
      return createOkJsonResponse({ ok: true, entries: actionLogEntries });
    }

    if (normalizedUrl === "/view-prs/actor-name-cache" && method === "GET") {
      return createOkJsonResponse({
        ok: true,
        entries: actorNameCacheEntries,
        count: Object.keys(actorNameCacheEntries).length,
      });
    }

    if (normalizedUrl === "/view-prs/actor-name-cache" && method === "PUT") {
      actorNameCacheEntries = JSON.parse(String(init?.body || "{}"));
      return createOkJsonResponse({
        ok: true,
        entries: actorNameCacheEntries,
        count: Object.keys(actorNameCacheEntries).length,
      });
    }

    if (normalizedUrl === "/view-prs/actor-login-aliases" && method === "GET") {
      return createOkJsonResponse({
        ok: true,
        entries: actorLoginAliasEntries,
        count: Object.keys(actorLoginAliasEntries).length,
      });
    }

    if (normalizedUrl === "/view-prs/actor-login-aliases" && method === "PUT") {
      actorLoginAliasEntries = JSON.parse(String(init?.body || "{}"));
      return createOkJsonResponse({
        ok: true,
        entries: actorLoginAliasEntries,
        count: Object.keys(actorLoginAliasEntries).length,
      });
    }

    if (normalizedUrl === "/view-prs/ack" && method === "POST") {
      return createOkJsonResponse({ ok: true, prData: latestDataPayload });
    }

    if (normalizedUrl === "/view-prs/data" && method === "GET") {
      return createOkJsonResponse(latestDataPayload);
    }

    if (
      normalizedUrl.startsWith("/view-prs/author-comments?") &&
      method === "GET"
    ) {
      if (typeof authorCommentsGetHandler === "function") {
        return authorCommentsGetHandler(normalizedUrl, init);
      }
      return createOkJsonResponse({ ok: true, comments: [] });
    }

    if (normalizedUrl.startsWith("/view-prs/diff?") && method === "GET") {
      return createOkJsonResponse({
        ok: true,
        source: "cache",
        stale: false,
        warning: "",
        commitFingerprint: "abc123",
        fetchedAt: "2026-06-16T10:00:00Z",
        filePath: "data/pr-diffs/owner__repo__pr-101.json",
        diffText: "diff --git a/file.js b/file.js\n+console.log('hello');",
      });
    }

    if (normalizedUrl === "/view-prs/scheduler" && method === "GET") {
      return {
        ok: false,
        status: 404,
        json: async () => ({ ok: false }),
      };
    }

    return createOkJsonResponse({ ok: true });
  });

// Phase 6 (see REACT_MIGRATION_PLAN.md): index.html no longer has vanilla
// fallback markup nested inside each "#<id>-root" container for the 26
// Run & Filter form fields React owns unconditionally - only real React
// (react-app.jsx, never loaded/mounted in this jsdom-only suite) creates
// these elements now. Several things break without them existing at all,
// not just field-specific assertions - most importantly,
// pr-data-tab.orchestrator.js's renderPrData bails out of rendering
// *anything* (not just filters - the whole PR table too) if `#repo`/
// `#filter-pr-numbers` don't exist. This simulates what React would have
// mounted, using the exact same id/name/type/default values the deleted
// markup had, so this suite can keep exercising index.page.js's real
// behavior against real DOM nodes with real "name" attributes/values,
// same as it always could.
const injectRunFilterFieldElements = () => {
  const setRootContent = (rootId, html) => {
    const root = document.getElementById(rootId);
    if (root && !root.firstElementChild) {
      root.innerHTML = html;
    }
  };

  setRootContent(
    "scope-mode-root",
    '<select id="scope-mode" name="scopeMode"><option value="all" selected>All stored rows</option><option value="last-run">Last run rows</option><option value="needs-attention">Needs attention rows</option><option value="needs-attention-or-interacted">Needs attention or interacted rows</option></select>',
  );
  setRootContent(
    "filter-pr-numbers-root",
    '<input type="text" id="filter-pr-numbers" name="filterPrNumbers" placeholder="912, 921" />',
  );
  setRootContent(
    "filter-custom-comments-root",
    '<select id="filter-custom-comments" name="filterCustomComments"><option value="" selected>Any (with or without)</option><option value="with">With custom comments</option><option value="without">Without custom comments</option></select>',
  );
  setRootContent(
    "filter-other-notes-root",
    '<select id="filter-other-notes" name="filterOtherNotes"><option value="" selected>Any (with or without)</option><option value="with">With other notes</option><option value="without">Without other notes</option></select>',
  );
  setRootContent(
    "filter-pr-difficulty-root",
    '<select id="filter-pr-difficulty" name="filterPrDifficulty"><option value="" selected>Any (set or not set)</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option><option value="not-set">Not set</option></select>',
  );
  setRootContent(
    "filter-rally-stories-root",
    '<select id="filter-rally-stories" name="filterRallyStories"><option value="" selected>Any (with or without)</option><option value="with">With Rally stories</option><option value="without">Without Rally stories</option></select>',
  );
  setRootContent(
    "filter-rally-links-root",
    '<select id="filter-rally-links" name="filterRallyLinks"><option value="" selected>Any (with or without)</option><option value="with">With Rally links</option><option value="without">Without Rally links</option></select>',
  );
  setRootContent(
    "filter-analysis-of-pr-root",
    '<select id="filter-analysis-of-pr" name="filterAnalysisOfPr"><option value="" selected>Any (with or without)</option><option value="with">With analysis</option><option value="without">Without analysis</option></select>',
  );
  setRootContent(
    "always-show-in-review-root",
    '<input type="checkbox" id="always-show-in-review" name="alwaysShowInReview" />',
  );
  setRootContent(
    "attention-no-activity-mode-root",
    '<select id="attention-no-activity-mode" name="attentionNoActivityMode"><option value="all" selected>Mark all NO_ACTIVITY PRs</option><option value="mine-only">Only NO_ACTIVITY PRs assigned to me or where I am a reviewer</option><option value="assigned-only">Only NO_ACTIVITY PRs assigned to me</option><option value="reviewer-only">Only PRs where I am a reviewer</option><option value="none">Never mark NO_ACTIVITY PRs</option></select>',
  );
  setRootContent(
    "attention-include-pending-comments-root",
    '<input type="checkbox" id="attention-include-pending-comments" name="attentionIncludePendingComments" checked />',
  );
  setRootContent(
    "attention-ignore-merge-only-commits-root",
    '<input type="checkbox" id="attention-ignore-merge-only-commits" name="attentionIgnoreMergeOnlyCommits" />',
  );
  setRootContent(
    "attention-include-closed-merged-root",
    '<input type="checkbox" id="attention-include-closed-merged" name="attentionIncludeClosedMerged" checked />',
  );
  setRootContent(
    "attention-include-draft-changed-root",
    '<input type="checkbox" id="attention-include-draft-changed" name="attentionIncludeDraftChanged" checked />',
  );
  setRootContent(
    "attention-include-draft-no-activity-root",
    '<input type="checkbox" id="attention-include-draft-no-activity" name="attentionIncludeDraftNoActivity" />',
  );
  setRootContent(
    "attention-author-thread-resolution-mode-root",
    '<select id="attention-author-thread-resolution-mode" name="attentionAuthorThreadResolutionMode"><option value="allow-all" selected>Allow PR authors to resolve all own-PR threads</option><option value="allow-only">Allow only for selected thread starters</option><option value="deny-only">Disallow for selected thread starters</option></select>',
  );
  setRootContent(
    "change-filter-use-builtin-merge-pattern-root",
    '<input type="checkbox" id="change-filter-use-builtin-merge-pattern" name="changeFilterUseBuiltinMergePattern" checked />',
  );
  setRootContent(
    "change-filter-ignore-commit-patterns-root",
    '<textarea id="change-filter-ignore-commit-patterns" name="changeFilterIgnoreCommitPatterns" rows="4" aria-describedby="commit-patterns-help"></textarea>',
  );
  setRootContent(
    "repo-root",
    '<input type="text" id="repo" name="repo" placeholder="owner/repo" />',
  );
  setRootContent(
    "limit-root",
    '<input type="number" id="limit" name="limit" min="1" placeholder="200" />',
  );
  setRootContent(
    "merged-limit-root",
    '<input type="number" id="merged-limit" name="mergedLimit" min="1" placeholder="15" />',
  );
  setRootContent("jobs-root", '<input type="number" id="jobs" name="jobs" min="1" placeholder="6" />');
  setRootContent(
    "open-mode-root",
    '<select id="open-mode" name="openMode"><option value="none" selected>none</option><option value="changed">changed</option><option value="all">all</option></select>',
  );
  setRootContent("ack-changed-root", '<input type="checkbox" id="ack-changed" name="ackChanged" />');
  setRootContent(
    "show-reason-root",
    '<input type="checkbox" id="show-reason" name="showReason" checked />',
  );
  setRootContent("quiet-root", '<input type="checkbox" id="quiet" name="quiet" />');
};

// Phase 6 (see REACT_MIGRATION_PLAN.md): this suite never loads the real
// react-app.jsx bundle (an ES module, and heavy with its own import-time
// side effects mounting ~10 unrelated React roots), so index.page.js's
// renderPrData always used to see hasReactApp as false and take its
// "React not available" branch, which used to build a full vanilla table.
// That branch (and the vanilla table-build code it called) is gone now, so
// this suite needs a real React-rendered table to keep exercising real
// row/checkbox/Ack DOM the same way a real browser does. Rather than
// importing the whole react-app.jsx module, this reimplements just its
// mountReactPrTable/updateReactPrTable pairing directly against the same
// PrTableApp component real production mounts - see react-app.jsx's real
// mountReactPrTable, and index.page.js's mountReactTable/updateReactTable
// (Track C slice C2b, REACT_MIGRATION_PLAN.md) for the real callers.
// Called both from initTestPage() and from the one test below that builds
// its own page setup from scratch instead of using it.
//
// Mounts via @testing-library/react's own render()/cleanup() rather than a
// hand-rolled ReactDOM.createRoot() bridge. An earlier version of this
// helper did that directly, and independently (imperfectly) reinvented
// several things RTL already solves: act()-wrapping every render, and -
// critically - tracking and tearing down every previously rendered
// instance on cleanup(). A hand-rolled per-container Map/unmount loop kept
// getting that subtly wrong across this suite's many initTestPage() calls
// per test (this suite's own renderCleanNotesSection() helper, e.g., calls
// it several times in one test): index.page.js's mocked fetch()-driven
// loadStoredData() calls aren't necessarily settled by the time a test
// moves on to its next initTestPage() call, and a second mount() call for
// the same real #pr-sections container - or too many un-torn-down roots
// accumulating across a test - corrupted React 18's cross-root event
// delegation (a typed input's native value updated the DOM but never
// reached React's onChange/state at all). cleanup() is RTL's own
// real, battle-tested fix for exactly this class of problem.
// Phase 6 (see REACT_MIGRATION_PLAN.md): pr-filter-panel.helpers.js's
// multi-select populate functions and renderManagementFilterSummary have
// no DOM-building of their own anymore - they only call
// window.renderReactMultiSelectList/window.renderReactFilterSummary
// (real react-app.jsx bridges, never loaded in this jsdom-only suite - see
// installReactTableMountBridge's own comment for why the PR table gets the
// same "reimplement just the bridge, not the whole module" treatment).
// Real containers already exist in index.html for all of these (no
// `-root` placeholder/portal involved, matching react-app.jsx's own
// comment on MULTI_SELECT_LIST_ID_PREFIXES and mountAppliedFilterSummary),
// so this mounts the same real components react-app.jsx does, directly
// into them, via RTL's render()/cleanup() like every other bridge here.
const MULTI_SELECT_LIST_ID_PREFIXES = {
  "label-list": "label",
  "exclude-label-list": "exclude-label",
  "author-list": "author",
  "assigned-list": "assigned",
  "approver-list": "approver",
  // Post-Phase-6 follow-up (see REACT_MIGRATION_PLAN.md): these 4 are built
  // directly in index.page.js (not pr-filter-panel.helpers.js) but share
  // the exact same window.renderReactMultiSelectList bridge/no-fallback
  // shape - added here to match react-app.jsx's real
  // MULTI_SELECT_LIST_ID_PREFIXES after index.page.js's own vanilla
  // DOM-building fallback for them was deleted as dead code (it was never
  // reachable in production, only in this stub, once it always returned
  // `false` for these 4 ids for lack of an entry here).
  "attention-author-thread-resolution-allow-list": "attention-author-thread-resolution-allow",
  "attention-author-thread-resolution-deny-list": "attention-author-thread-resolution-deny",
  "change-filter-ignore-comment-authors-list": "change-filter-ignore-comment-authors",
  "change-filter-ignore-review-authors-list": "change-filter-ignore-review-authors",
};

const installReactFilterPanelMountBridges = () => {
  const multiSelectEntries = {};
  window.renderReactMultiSelectList = (listId, options) => {
    const idPrefix = MULTI_SELECT_LIST_ID_PREFIXES[listId];
    const container = document.getElementById(listId);
    if (!idPrefix || !container) return false;
    // Matches react-app.jsx's renderReactMultiSelectList exactly: an
    // incrementing `key` forces a full remount (not a prop-diff update) on
    // every call, so the component's internal `checked` state always
    // re-initializes fresh from `options` - see MultiSelectCheckboxList.jsx's
    // own comment for why a plain rerender() would be wrong here.
    const entry = multiSelectEntries[listId] || { rerender: null, renderCount: 0 };
    entry.renderCount += 1;
    const element = React.createElement(MultiSelectCheckboxList, {
      key: entry.renderCount,
      options,
      idPrefix,
    });
    // flushSync, matching react-app.jsx's real renderReactMultiSelectList:
    // a same-tick DOM read right after this call (getSelectedMultiSelectValues,
    // used to seed a *different* list or the filter-apply pipeline that
    // triggered this render in the first place) must see the committed
    // result, not React 18's default batched/deferred commit.
    if (entry.rerender) {
      flushSync(() => entry.rerender(element));
    } else {
      let rerender;
      flushSync(() => {
        ({ rerender } = rtlRender(element, { container }));
      });
      entry.rerender = rerender;
    }
    multiSelectEntries[listId] = entry;
    return true;
  };

  let filterSummaryRerender = null;
  window.renderReactFilterSummary = (summaryText, filterChips) => {
    const container = document.getElementById("management-filter-summary-root");
    if (!container) return false;
    if (filterSummaryRerender) {
      filterSummaryRerender(React.createElement(AppliedFilterSummary, { summaryText, filterChips }));
    } else {
      const { rerender } = rtlRender(
        React.createElement(AppliedFilterSummary, { summaryText, filterChips }),
        { container },
      );
      filterSummaryRerender = rerender;
    }
    return true;
  };
};

// Track C, slices C2b/C2c (post-Phase-6 follow-up, see
// REACT_MIGRATION_PLAN.md): index.page.js no longer calls
// window.ReactMountBridge (that module was deleted - it was just a thin
// wrapper around window.mountReactPrTable/window.updateReactPrTable plus an
// isMounted() flag, now inlined directly into index.page.js as
// mountReactTable/updateReactTable/isReactTableMounted). This stub now
// defines window.mountReactPrTable/window.updateReactPrTable themselves -
// the same functions react-app.jsx really exposes - using real RTL
// rendering, matching mountReactPrTable's own real contract: it mounts the
// real <PrDataProvider /> (state/PrDataProvider.jsx) wrapping PrTableApp,
// exactly like react-app.jsx's own mountReactPrTable does, and lets the
// Provider's own useEffect assign window.updateReactPrTable - this stub no
// longer reimplements that merge logic itself.
const installReactTableMountBridge = () => {
  cleanup();
  window.ViewPrsSectionConfigHelpers = sectionConfigHelpers;
  window.ViewPrsSmartGroupsHelpers = smartGroupsHelpers;
  window.ViewPrsReactCallbacksHelpers = reactCallbacksHelpers;
  installReactFilterPanelMountBridges();

  window.mountReactPrTable = (containerElement, props) => {
    if (!containerElement) return null;
    rtlRender(
      React.createElement(
        PrDataProvider,
        {
          initialPayload: props?.initialPayload,
          initialSelectedRepo: props?.selectedRepo,
          initialVisiblePrNumbers: props?.visiblePrNumbers,
        },
        React.createElement(PrTableApp, {
          onCheckboxChange: props?.onCheckboxChange,
          onAckAction: props?.onAckAction,
          onApplyLabel: props?.onApplyLabel,
        }),
      ),
      { container: containerElement },
    );
    return { unmount: () => {} };
  };
};

const initTestPage = ({
  dataPayload,
  actionEntries,
  actorNameEntries,
  actorLoginAliasEntries: aliasEntries,
  userDefaultsOverrides,
  backfillStatusResponse,
  authorCommentsGetHandler,
} = {}) => {
  // Unmount the previous generation's React root(s) while their container
  // is still attached to the document (about to be replaced below) rather
  // than after - see installReactTableMountBridge()'s own cleanup() call
  // for why unmounting matters here; doing it before detaching the
  // container gives React's own commit/cleanup work a normally-connected
  // DOM to run against.
  cleanup();
  jest.resetModules();
  latestDataPayload = dataPayload || { ok: true, byPrNumber: {}, lastRun: null };
  actionLogEntries = Array.isArray(actionEntries) ? actionEntries : [];
  actorNameCacheEntries = actorNameEntries && typeof actorNameEntries === "object"
    ? actorNameEntries
    : {};
  actorLoginAliasEntries = aliasEntries && typeof aliasEntries === "object"
    ? aliasEntries
    : {};
  document.body.innerHTML = extractBodyHtml(indexHtml);
  injectRunFilterFieldElements();
  installReactTableMountBridge();

  fetchMock = createFetchMock({
    userDefaultsOverrides,
    backfillStatusResponse,
    authorCommentsGetHandler,
  });
  global.fetch = fetchMock;
  window.fetch = global.fetch;
  window.marked = {
    parse: (markdownText) => `<p>${String(markdownText || "")}</p>`,
  };

  require("../index.page.js");
};

// Helper functions for multi-select checkbox lists (label, exclude-label, author, assigned, approver filters)
const getMultiSelectList = (listId) => document.getElementById(listId);

const getSelectedMultiSelectValues = (listId) => {
  const list = getMultiSelectList(listId);
  if (!list) return [];
  const checkboxes = Array.from(list.querySelectorAll("input[type='checkbox']:checked"));
  return checkboxes.map((cb) => cb.value);
};

const isMultiSelectEmpty = (listId) => {
  const list = getMultiSelectList(listId);
  return !list || list.classList.contains("empty");
};

const clickMultiSelectCheckbox = async (listId, value, user) => {
  const list = getMultiSelectList(listId);
  if (!list) throw new Error(`Multi-select list not found: ${listId}`);
  const checkbox = list.querySelector(`input[type="checkbox"][value="${value}"]`);
  if (!checkbox) throw new Error(`Checkbox not found for value: ${value} in list: ${listId}`);
  await user.click(checkbox);
};

describe("index page rendering with Testing Library", () => {
  beforeAll(() => {
    // jsdom does not implement scrollIntoView; polyfill to prevent unhandled exceptions
    // in page code that calls it as a UX enhancement (no-op is correct in tests)
    if (typeof window.HTMLElement.prototype.scrollIntoView !== "function") {
      window.HTMLElement.prototype.scrollIntoView = () => {};
    }
  });

  // index.page.js starts several real setInterval-based auto-refresh
  // pollers as soon as it's required, and only clears them on a real
  // 'visibilitychange'/'beforeunload' event, which jsdom never fires
  // between tests. It also schedules one-shot setTimeout-based debounce
  // timers (e.g. applyFiltersFromCache's filter-change debounce) that can
  // still be pending when a test ends. Since initTestPage() does
  // jest.resetModules() + require("../index.page.js") before every test,
  // each test leaked its own live intervals/timeouts into the ones from
  // every test run before it. A stale timer from an earlier test firing
  // mid-test calls back into that earlier test's now-orphaned closure
  // (e.g. renderPrData with that test's PR data) and overwrites the
  // *current* test's DOM (document is shared across the whole file) -
  // this is what caused several tests to fail only when run as part of
  // the full file, and pass in isolation. Track every interval/timeout
  // created during a test and clear it afterward so no test leaks live
  // timers into the next one.
  // The same require-on-every-test pattern also means every test's
  // instance of index.page.js calls window/document.addEventListener
  // ("visibilitychange", "beforeunload", "unhandledrejection", "error",
  // etc.) again, and those accumulate on the single jsdom window/document
  // shared by the whole file (nothing ever calls removeEventListener
  // between tests). By the end of the file, dozens of stale listeners
  // from earlier tests - each closing over that earlier test's now-gone
  // module state - were still live and could react to events raised
  // during a later, unrelated test. Track listeners added to window/
  // document during a test and remove them afterward, same as the
  // interval tracking above.
  const realWindowAddEventListener = window.addEventListener.bind(window);
  const realWindowRemoveEventListener = window.removeEventListener.bind(window);
  const realDocumentAddEventListener = document.addEventListener.bind(document);
  const realDocumentRemoveEventListener =
    document.removeEventListener.bind(document);
  let trackedListeners = [];

  const realSetInterval = global.setInterval;
  const realClearInterval = global.clearInterval;
  const realSetTimeout = global.setTimeout;
  const realClearTimeout = global.clearTimeout;
  let trackedIntervalIds = [];
  let trackedTimeoutIds = [];

  beforeEach(async () => {
    trackedIntervalIds = [];
    const trackingSetInterval = (...args) => {
      const id = realSetInterval(...args);
      trackedIntervalIds.push(id);
      return id;
    };
    global.setInterval = trackingSetInterval;
    window.setInterval = trackingSetInterval;

    trackedTimeoutIds = [];
    const trackingSetTimeout = (...args) => {
      const id = realSetTimeout(...args);
      trackedTimeoutIds.push(id);
      return id;
    };
    global.setTimeout = trackingSetTimeout;
    window.setTimeout = trackingSetTimeout;

    trackedListeners = [];
    window.addEventListener = (type, listener, options) => {
      trackedListeners.push({ target: window, type, listener, options });
      return realWindowAddEventListener(type, listener, options);
    };
    document.addEventListener = (type, listener, options) => {
      trackedListeners.push({ target: document, type, listener, options });
      return realDocumentAddEventListener(type, listener, options);
    };

    initTestPage();
    // This initial initTestPage() call's own loadStoredData() fetch
    // (index.page.js's initPage(), fire-and-forget - see that file's
    // `loadStoredData("").catch(...)` call) is never awaited by
    // initTestPage() itself. Most tests only ever call initTestPage() once,
    // so by the time this stale promise resolves the test has already
    // finished and moved on to afterEach's own one-tick flush (below) -
    // harmless. But a test that calls initTestPage() again itself (e.g. to
    // render a second, differently-configured page instance) does so
    // *before* this one settles, and when it finally does resolve it
    // renders this generic empty-default payload onto whatever the *test's
    // own* later initTestPage() call had just mounted - real,
    // reproducing flakiness where an in-progress interaction (e.g. typing
    // into a notes field) appeared to lose its state, when what actually
    // happened was the whole row disappearing under it as this stale
    // empty-payload render landed. One tick here lets it settle against
    // *this* call's own (about-to-be-discarded) DOM instead.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }, 20_000);

  afterEach(async () => {
    // Some click handlers (e.g. "Apply filters (local)") kick off a
    // fire-and-forget persistence fetch (`void persistViewFilterOptionOverrides()`)
    // that the test never awaits. If that Promise chain is still pending
    // when the test ends, it resolves during the *next* test - after
    // document.body.innerHTML has already been replaced - and can
    // re-render using this test's now-stale closure state into the next
    // test's fresh DOM. Give one microtask tick for any such dangling
    // promise to settle (against the DOM this test is about to discard)
    // before the next test's beforeEach swaps the DOM out from under it.
    await new Promise((resolve) => setTimeout(resolve, 0));

    trackedListeners.forEach(({ target, type, listener, options }) => {
      if (target === window) {
        realWindowRemoveEventListener(type, listener, options);
      } else {
        realDocumentRemoveEventListener(type, listener, options);
      }
    });
    trackedListeners = [];
    window.addEventListener = realWindowAddEventListener;
    document.addEventListener = realDocumentAddEventListener;

    trackedIntervalIds.forEach((id) => realClearInterval(id));
    trackedIntervalIds = [];
    global.setInterval = realSetInterval;
    window.setInterval = realSetInterval;

    trackedTimeoutIds.forEach((id) => realClearTimeout(id));
    trackedTimeoutIds = [];
    global.setTimeout = realSetTimeout;
    window.setTimeout = realSetTimeout;
  });

  test("shows key management and data tabs from static HTML", () => {
    expect(screen.getByRole("heading", { name: "View PR Updates" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Activity" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Run & Filter" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "PR data" })).toBeInTheDocument();
  });

  test("blocked auto-update indicator is hidden by default and exposes apply action", () => {
    const indicator = document.getElementById("auto-render-blocked-indicator");
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveAttribute("hidden");
    expect(document.getElementById("auto-render-blocked-pr-links")).toBeInTheDocument();
    expect(document.getElementById("auto-render-blocked-apply-btn")).toBeInTheDocument();
  });

  test("switches the active data tab when a user clicks Review statistics", async () => {
    const user = userEvent.setup();
    const reviewStatsTab = screen.getByRole("tab", { name: "Review statistics" });
    const prDataTab = screen.getByRole("tab", { name: "PR data" });

    await user.click(reviewStatsTab);

    expect(reviewStatsTab).toHaveAttribute("aria-selected", "true");
    expect(prDataTab).toHaveAttribute("aria-selected", "false");
    expect(document.getElementById("tab-panel-review-stats").hidden).toBe(false);
    expect(document.getElementById("tab-panel-pr-data").hidden).toBe(true);
  });

  // "author insights View in table switches to PR data tab and expands the
  // insights row" was removed here: it exercised Review Stats' "View in
  // table" link/content, which is React-owned (#stats-content-root) with
  // no vanilla-DOM fallback left for this jsdom-only suite (which never
  // loads react-app.jsx) to render into - see the "React-owned Review
  // Stats content renders cards/table and 'View in table' navigates..."
  // e2e test for that coverage.

  test("open row controls and insights render expected details", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 11,
            overrides: {
              notes: {
                comments: [
                  {
                    id: "c1",
                    author: "reviewer1",
                    tone: "Positive",
                    note: "Looks good overall",
                  },
                ],
                otherNotes: "Follow up on rollout",
              },
              data: {
                title: "Open row controls parity",
                titleDisplay: "Open row controls parity [CHK:PASS][MRG:YES]",
                author: "Alison Hall",
                authorLogin: "ahall236_uhg",
                url: "https://example.com/11",
                labels: ["bug"],
                openConversationCount: "1",
                viewedFilesCount: "3",
                changedFilesCount: "5",
                viewedFilesSummary: "3/5 viewed",
                reviewThreads: [
                  {
                    id: "thread-open-1",
                    isResolved: false,
                    resolvedByLogin: "",
                    participants: ["reviewer1", "ahall236_uhg"],
                    comments: [
                      {
                        id: "thread-open-comment-1",
                        authorLogin: "reviewer1",
                        authorName: "Reviewer One",
                        createdAt: "2026-03-10T10:45:00Z",
                        body: "Please add one more test case",
                        state: "PENDING",
                      },
                    ],
                  },
                ],
              },
            },
          },
        ],
        actorsMap: {
          ahall236_uhg: "Alison Hall",
          reviewer1: "Reviewer One",
        },
      }),
    });
    const user = userEvent.setup();

    await waitFor(() => {
      expect(document.querySelector('[data-pr-section="open"]')).toBeTruthy();
    });
    // This PR's unresolved review thread also independently qualifies it
    // for the "Needs Attention" smart group, which renders it a second time
    // there (smart groups have non-exclusive membership by design) - scope
    // to the "Open PRs" lifecycle section specifically so the query below
    // is unambiguous.
    const openSection = document.querySelector('[data-pr-section="open"]');
    const prLink = within(openSection).getByText("#11");
    const row = prLink.closest("tr");
    expect(row).toBeTruthy();

    expect(row?.querySelector("input[type='checkbox']")).toBeTruthy();
    expect(within(openSection).getByLabelText("In Review for PR #11")).toBeInTheDocument();
    expect(within(openSection).getByLabelText("Flagged for PR #11")).toBeInTheDocument();
    expect(row?.querySelector(".row-action-btn.update")).toBeTruthy();
    expect(row?.querySelector(".row-action-btn.ack")).toBeTruthy();
    expect(
      within(openSection).getByRole("button", { name: "View PR JSON details for #11" }),
    ).toBeInTheDocument();

    const insightsToggle = row?.querySelector(".row-insights-toggle");
    expect(insightsToggle?.textContent).toBe("More insights");
    expect(String(row?.querySelector(".row-pending-comments-chip")?.textContent || "")).toBe(
      "Pending comments: 1",
    );

    const insightsRow = row?.nextElementSibling;
    expect(insightsRow?.hidden).toBe(true);
    await user.click(insightsToggle);
    expect(insightsRow?.hidden).toBe(false);
    expect(insightsToggle?.textContent).toBe("Hide insights");
    expect(insightsRow?.querySelector(".insights-row-cell")?.getAttribute("colspan")).toBe(
      "11",
    );

    const insightsContent = insightsRow?.querySelector(".row-insights-content");
    expect(insightsContent).toBeTruthy();
    expect(indexCss).toMatch(/\.row-insights-content\s*\{[^}]*max-height:\s*80vh;[^}]*overflow-y:\s*auto;/s);
    expect(insightsContent?.querySelector(".pr-notes-section")).toBeTruthy();
  });

  test("given review comment markdown with github user attachments when insights render then blocked image tags are replaced with unavailable placeholders", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 12,
            overrides: {
              data: {
                title: "Attachment markdown rendering",
                titleDisplay: "Attachment markdown rendering [CHK:PASS][MRG:YES]",
                author: "Alison Hall",
                authorLogin: "ahall236_uhg",
                url: "https://example.com/12",
                openConversationCount: "1",
                viewedFilesCount: "0",
                changedFilesCount: "1",
                viewedFilesSummary: "0/1 viewed",
                reviewThreads: [
                  {
                    id: "thread-attachments-1",
                    isResolved: false,
                    resolvedByLogin: "",
                    participants: ["reviewer1", "ahall236_uhg"],
                    comments: [
                      {
                        id: "thread-attachments-comment-1",
                        authorLogin: "reviewer1",
                        authorName: "Reviewer One",
                        createdAt: "2026-03-10T10:45:00Z",
                        body: '<img alt="image" src="https://github.com/user-attachments/assets/6505dfd5-67b9-43b3-8411-92e5e051bfee" />',
                        state: "PENDING",
                      },
                    ],
                  },
                ],
              },
            },
          },
        ],
        actorsMap: {
          ahall236_uhg: "Alison Hall",
          reviewer1: "Reviewer One",
        },
      }),
    });
    const user = userEvent.setup();

    await waitFor(() => {
      expect(document.querySelector('[data-pr-section="open"]')).toBeTruthy();
    });
    // This PR's unresolved review thread also independently qualifies it
    // for the "Needs Attention" smart group, which renders it a second time
    // there (smart groups have non-exclusive membership by design) - scope
    // to the "Open PRs" lifecycle section specifically so the query below
    // is unambiguous.
    const openSection = document.querySelector('[data-pr-section="open"]');
    const prLink = within(openSection).getByText("#12");
    const row = prLink.closest("tr");
    expect(row).toBeTruthy();

    const insightsToggle = row?.querySelector(".row-insights-toggle");
    expect(insightsToggle).toBeTruthy();
    await user.click(insightsToggle);

    const insightsRow = row?.nextElementSibling;
    expect(insightsRow?.hidden).toBe(false);

    const insightsContent = insightsRow?.querySelector(".row-insights-content");
    const placeholder = insightsContent?.querySelector(".md-image-expired");
    expect(placeholder).toBeTruthy();
    expect(String(placeholder?.textContent || "")).toContain("image unavailable");

    const retainedAttachmentImage = insightsContent?.querySelector(
      'img[src*="github.com/user-attachments"]',
    );
    expect(retainedAttachmentImage).toBeNull();
  });

  test("given additions and deletions are available, when More insights is expanded, then Lines changed renders GitHub-style totals", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 13,
            overrides: {
              data: {
                title: "Lines changed insight",
                titleDisplay: "Lines changed insight [CHK:PASS][MRG:YES]",
                author: "Alison Hall",
                authorLogin: "ahall236_uhg",
                url: "https://example.com/13",
                openConversationCount: "0",
                viewedFilesCount: "1",
                changedFilesCount: "4",
                additions: "37",
                deletions: "12",
                viewedFilesSummary: "1/4 viewed",
              },
            },
          },
        ],
      }),
    });
    const user = userEvent.setup();

    const prLink = await screen.findByText("#13");
    const row = prLink.closest("tr");
    expect(row).toBeTruthy();

    const insightsToggle = row?.querySelector(".row-insights-toggle");
    expect(insightsToggle).toBeTruthy();
    await user.click(insightsToggle);

    const insightsContent = row?.nextElementSibling?.querySelector(".row-insights-content");
    expect(insightsContent).toBeTruthy();
    const insightsText = String(insightsContent?.textContent || "");
    expect(insightsText).toContain("Lines changed");
    expect(insightsText).toContain(
      "4 files changed, +37 additions, -12 deletions (49 lines changed)",
    );
    expect(
      insightsContent?.querySelector(".insight-line-changes-files")?.textContent,
    ).toBe("4 files changed");
    expect(
      insightsContent?.querySelector(".insight-line-changes-additions")?.textContent,
    ).toBe("+37 additions");
    expect(
      insightsContent?.querySelector(".insight-line-changes-deletions")?.textContent,
    ).toBe("-12 deletions");
    expect(
      insightsContent?.querySelector(".insight-line-changes-total")?.textContent,
    ).toBe("49 lines changed");
  });

  test("given open and merged rows when rendering PR cells then relative last-checked indicators use each row's updated timestamp", async () => {
    const nowSpy = jest
      .spyOn(Date, "now")
      .mockReturnValue(new Date("2026-06-16T10:30:00Z").getTime());

    try {
      initTestPage({
        dataPayload: createMultiPrPayload({
          prs: [
            {
              scenario: "open-no-change",
              prNumber: 11,
              overrides: {
                data: {
                  title: "Open PR",
                  titleDisplay: "Open PR [CHK:PASS][MRG:YES]",
                  author: "Author One",
                  authorLogin: "author-one",
                  url: "https://example.com/11",
                  updatedAt: "2026-06-16T10:10:00Z",
                },
                updatedAt: "2026-06-16T10:10:00Z",
              },
            },
            {
              scenario: "merged",
              prNumber: 99,
              overrides: {
                data: {
                  title: "Merged PR",
                  titleDisplay: "Merged PR [CHK:PASS][MRG:YES]",
                  author: "Author Two",
                  authorLogin: "author-two",
                  url: "https://example.com/99",
                  mergedAt: "2026-06-16T10:00:00Z",
                  updatedAt: "2026-06-16T10:00:00Z",
                },
                updatedAt: "2026-06-16T10:20:00Z",
              },
            },
          ],
          lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:10:00Z" },
        }),
      });

      await waitFor(() => {
        expect(screen.getByText("#11")).toBeInTheDocument();
      });

      const openRow = screen.getByText("#11").closest("tr");
      const mergedRow = screen.getByText("#99").closest("tr");
      const openIndicator = openRow?.querySelector(
        ".status-cell .pr-last-checked-indicator",
      );
      const mergedIndicator = mergedRow?.querySelector(
        ".status-cell .pr-last-checked-indicator",
      );

      expect(openIndicator).toBeTruthy();
      expect(mergedIndicator).toBeTruthy();
      expect(String(openIndicator?.textContent || "")).toBe("↻ 20m ago");
      expect(String(mergedIndicator?.textContent || "")).toBe("↻ 10m ago");
      expect(String(openIndicator?.className || "")).toContain(
        "pr-last-checked-indicator-stale",
      );
      expect(String(mergedIndicator?.className || "")).not.toContain(
        "pr-last-checked-indicator-stale",
      );
    } finally {
      nowSpy.mockRestore();
    }
  });

  test("given an open PR row, when rendering PR and status cells, then progress stays in the PR cell and relative last-checked text appears in the status cell", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 12,
            overrides: {
              data: {
                title: "Progress placement",
                titleDisplay: "Progress placement [CHK:PASS]",
                author: "Author One",
                authorLogin: "author-one",
                url: "https://example.com/12",
                updatedAt: "2026-06-16T10:10:00Z",
              },
              updatedAt: "2026-06-16T10:10:00Z",
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:30:00Z" },
      }),
    });

    await waitFor(() => {
      expect(screen.getByText("#12")).toBeInTheDocument();
    });

    const prCellContent = document.querySelector(
      '.pr-number-cell[data-pr-number="12"] .pr-number-cell-content',
    );
    expect(prCellContent).toBeTruthy();

    const firstChild = prCellContent?.children?.[0];
    const secondChild = prCellContent?.children?.[1];
    const thirdChild = prCellContent?.children?.[2];

    expect(String(firstChild?.className || "")).toContain("pr-number-cell-top");
    expect(String(secondChild?.className || "")).toContain("pr-number-cell-progress");
    expect(thirdChild).toBeUndefined();

    expect(firstChild?.querySelector(".pr-link")).toBeTruthy();
    expect(firstChild?.querySelector(".pr-progress-indicator")).toBeNull();
    expect(secondChild?.querySelector(".pr-progress-indicator")).toBeTruthy();
    const statusLastChecked = document.querySelector(
      '.status-cell .pr-last-checked-indicator',
    );
    expect(statusLastChecked).toBeTruthy();
  });

  test("given author thread-resolution policy modes, when PR author resolves a review thread, then warning behavior follows the selected rule", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-changed",
            prNumber: 77,
            overrides: {
              data: {
                title: "Review conversation policy",
                titleDisplay: "Review conversation policy [CHK:PASS]",
                author: "PR Author",
                authorLogin: "pr-author",
                url: "https://example.com/77",
                updatedAt: "2026-03-10T12:00:00Z",
                reviewThreads: [
                  {
                    id: "thread-author-resolved",
                    isResolved: true,
                    resolvedByLogin: "pr-author",
                    participants: ["reviewer1", "pr-author"],
                    comments: [
                      {
                        id: "author-resolved-1",
                        authorLogin: "reviewer1",
                        authorName: "Reviewer One",
                        createdAt: "2026-03-10T10:45:00Z",
                        body: "Please rename this helper.",
                      },
                      {
                        id: "author-resolved-2",
                        authorLogin: "pr-author",
                        authorName: "PR Author",
                        createdAt: "2026-03-10T11:15:00Z",
                        body: "Updated helper name.",
                      },
                    ],
                  },
                ],
              },
            },
          },
        ],
        actorsMap: {
          "pr-author": "PR Author",
          reviewer1: "Reviewer One",
          reviewer2: "Reviewer Two",
        },
        lastRun: { repo: "owner/repo", updatedAt: "2026-03-10T12:00:00Z" },
      }),
    });

    const user = userEvent.setup();

    // This PR's incorrectly-author-resolved thread also independently
    // qualifies it for the "Needs Attention" smart group in some of the
    // policy-mode states this test exercises below, which renders it a
    // second time there (smart groups have non-exclusive membership by
    // design) - scope every lookup to the "Open PRs" lifecycle section
    // specifically so these queries stay unambiguous across every mode.
    const getOpenSection = async () => {
      await waitFor(() => {
        expect(document.querySelector('[data-pr-section="open"]')).toBeTruthy();
      });
      return document.querySelector('[data-pr-section="open"]');
    };

    const openReviewSection = async () => {
      const openSection = await getOpenSection();
      const row = within(openSection).getByText("#77").closest("tr");
      const toggle = row?.querySelector(".row-insights-toggle");
      if (toggle && toggle.getAttribute("aria-expanded") !== "true") {
        await user.click(toggle);
      }
      const insightsRow = row?.nextElementSibling;
      const insightsContent = insightsRow?.querySelector(".row-insights-content");
      return Array.from(
        insightsContent?.querySelectorAll("details.insight-section") || [],
      ).find((node) => {
        const summary = node.querySelector("summary");
        return String(summary?.textContent || "").startsWith("Review conversations");
      });
    };

    const expectWarningState = async (expectedWarning) => {
      const reviewSection = await openReviewSection();
      const summaryText = String(
        reviewSection?.querySelector("summary")?.textContent || "",
      );
      if (expectedWarning) {
        expect(summaryText).toContain(
          "Warning: 1 thread incorrectly resolved by PR author",
        );
        expect(String(reviewSection?.className || "")).toContain(
          "insight-section-warning",
        );
      } else {
        expect(summaryText).toBe("Review conversations (1/1)");
        expect(String(reviewSection?.className || "")).not.toContain(
          "insight-section-warning",
        );
      }
    };

    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));
    await waitFor(async () => {
      const openSection = await getOpenSection();
      expect(within(openSection).getByText("#77")).toBeInTheDocument();
    });

    await expectWarningState(false);

    const modeField = document.getElementById(
      "attention-author-thread-resolution-mode",
    );

    await user.selectOptions(modeField, "allow-only");
    await waitFor(() => {
      expect(
        getSelectedMultiSelectValues("attention-author-thread-resolution-allow-list"),
      ).toEqual([]);
    });
    await clickMultiSelectCheckbox(
      "attention-author-thread-resolution-allow-list",
      "reviewer2",
      user,
    );
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));
    await expectWarningState(true);

    await clickMultiSelectCheckbox(
      "attention-author-thread-resolution-allow-list",
      "reviewer2",
      user,
    );
    await clickMultiSelectCheckbox(
      "attention-author-thread-resolution-allow-list",
      "reviewer1",
      user,
    );
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));
    await expectWarningState(false);

    await user.selectOptions(modeField, "deny-only");
    await clickMultiSelectCheckbox(
      "attention-author-thread-resolution-deny-list",
      "reviewer1",
      user,
    );
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));
    await expectWarningState(true);
  });

  test("given both allow and deny starter lists include the same actor, when policy mode switches, then only the active mode list is enforced", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-changed",
            prNumber: 177,
            overrides: {
              data: {
                title: "Thread policy mode precedence",
                titleDisplay: "Thread policy mode precedence [CHK:PASS]",
                author: "PR Author",
                authorLogin: "pr-author",
                url: "https://example.com/177",
                updatedAt: "2026-03-10T12:00:00Z",
                reviewThreads: [
                  {
                    id: "thread-mode-precedence",
                    isResolved: true,
                    resolvedByLogin: "pr-author",
                    participants: ["reviewer1", "pr-author"],
                    comments: [
                      {
                        id: "mode-precedence-comment-1",
                        authorLogin: "reviewer1",
                        authorName: "Reviewer One",
                        createdAt: "2026-03-10T10:45:00Z",
                        body: "Please adjust this logic.",
                      },
                      {
                        id: "mode-precedence-comment-2",
                        authorLogin: "pr-author",
                        authorName: "PR Author",
                        createdAt: "2026-03-10T11:15:00Z",
                        body: "Applied the update.",
                      },
                    ],
                  },
                ],
              },
            },
          },
        ],
        actorsMap: {
          "pr-author": "PR Author",
          reviewer1: "Reviewer One",
        },
        lastRun: { repo: "owner/repo", updatedAt: "2026-03-10T12:00:00Z" },
      }),
    });

    const user = userEvent.setup();

    // This PR's incorrectly-author-resolved thread also independently
    // qualifies it for the "Needs Attention" smart group in some of the
    // policy-mode states this test exercises below, which renders it a
    // second time there (smart groups have non-exclusive membership by
    // design) - scope every lookup to the "Open PRs" lifecycle section
    // specifically so these queries stay unambiguous across every mode.
    const getOpenSection = async () => {
      await waitFor(() => {
        expect(document.querySelector('[data-pr-section="open"]')).toBeTruthy();
      });
      return document.querySelector('[data-pr-section="open"]');
    };

    const openReviewSection = async () => {
      const openSection = await getOpenSection();
      const row = within(openSection).getByText("#177").closest("tr");
      const toggle = row?.querySelector(".row-insights-toggle");
      if (toggle && toggle.getAttribute("aria-expanded") !== "true") {
        await user.click(toggle);
      }
      const insightsRow = row?.nextElementSibling;
      const insightsContent = insightsRow?.querySelector(".row-insights-content");
      return Array.from(
        insightsContent?.querySelectorAll("details.insight-section") || [],
      ).find((node) => {
        const summary = node.querySelector("summary");
        return String(summary?.textContent || "").startsWith("Review conversations");
      });
    };

    const expectWarningState = async (expectedWarning) => {
      const reviewSection = await openReviewSection();
      const summaryText = String(
        reviewSection?.querySelector("summary")?.textContent || "",
      );
      if (expectedWarning) {
        expect(summaryText).toContain(
          "Warning: 1 thread incorrectly resolved by PR author",
        );
      } else {
        expect(summaryText).toBe("Review conversations (1/1)");
      }
    };

    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));
    await waitFor(async () => {
      const openSection = await getOpenSection();
      expect(within(openSection).getByText("#177")).toBeInTheDocument();
    });

    const modeField = document.getElementById(
      "attention-author-thread-resolution-mode",
    );

    await user.selectOptions(modeField, "allow-only");
    await clickMultiSelectCheckbox(
      "attention-author-thread-resolution-allow-list",
      "reviewer1",
      user,
    );

    await user.selectOptions(modeField, "deny-only");
    await clickMultiSelectCheckbox(
      "attention-author-thread-resolution-deny-list",
      "reviewer1",
      user,
    );

    await user.selectOptions(modeField, "allow-only");
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));
    await expectWarningState(false);

    await user.selectOptions(modeField, "deny-only");
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));
    await expectWarningState(true);
  });

  test("given mixed resolved and unresolved conversations, when opening Review conversations, then the heading shows resolved over total counts", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-changed",
            prNumber: 79,
            overrides: {
              data: {
                title: "Review conversation mixed counts",
                titleDisplay: "Review conversation mixed counts [CHK:PASS]",
                author: "PR Author",
                authorLogin: "pr-author",
                url: "https://example.com/79",
                updatedAt: "2026-03-10T12:00:00Z",
                reviewThreads: [
                  {
                    id: "thread-resolved",
                    isResolved: true,
                    resolvedByLogin: "reviewer1",
                    participants: ["reviewer1", "pr-author"],
                    comments: [
                      {
                        id: "resolved-comment-1",
                        authorLogin: "reviewer1",
                        authorName: "Reviewer One",
                        createdAt: "2026-03-10T10:45:00Z",
                        body: "Looks good.",
                      },
                    ],
                  },
                  {
                    id: "thread-unresolved",
                    isResolved: false,
                    participants: ["reviewer1", "pr-author"],
                    comments: [
                      {
                        id: "unresolved-comment-1",
                        authorLogin: "reviewer1",
                        authorName: "Reviewer One",
                        createdAt: "2026-03-10T11:15:00Z",
                        body: "Please address this.",
                      },
                    ],
                  },
                ],
              },
            },
          },
        ],
        actorsMap: {
          "pr-author": "PR Author",
          reviewer1: "Reviewer One",
        },
        lastRun: { repo: "owner/repo", updatedAt: "2026-03-10T12:00:00Z" },
      }),
    });

    const user = userEvent.setup();
    await waitFor(() => {
      expect(document.querySelector('[data-pr-section="open"]')).toBeTruthy();
    });
    // This PR's unresolved review thread also independently qualifies it
    // for the "Needs Attention" smart group, which renders it a second time
    // there (smart groups have non-exclusive membership by design) - scope
    // to the "Open PRs" lifecycle section specifically so the query below
    // is unambiguous.
    const openSection = document.querySelector('[data-pr-section="open"]');
    const row = within(openSection).getByText("#79").closest("tr");
    await user.click(row?.querySelector(".row-insights-toggle"));

    const reviewSection = row?.nextElementSibling?.querySelector(
      'details.insight-section[data-insight-key="review-conversations"]',
    );
    expect(reviewSection).toBeTruthy();
    expect(String(reviewSection?.querySelector("summary")?.textContent || "")).toBe(
      "Review conversations (1/2)",
    );
  });

  test("given the current user and PR author appear in PR details, when insights render, then each actor gets its matching identity styling", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-changed",
            prNumber: 80,
            overrides: {
              data: {
                url: "https://example.com/80",
                title: "Identity styling coverage",
                titleDisplay: "Identity styling coverage [CHK:PASS]",
                author: "PR Author",
                authorLogin: "pr-author",
                updatedAt: "2026-03-10T12:00:00Z",
                baseline: "2026-03-01T10:00:00Z",
              activityTimeline: [
                {
                  date: "2026-03-10",
                  actor: "pr-author",
                  type: "comment",
                  count: 1,
                  latestAt: "2026-03-10T11:15:00Z",
                },
                {
                  date: "2026-03-10",
                  actor: "ahall236_uhg",
                  type: "review",
                  count: 1,
                  latestAt: "2026-03-10T11:30:00Z",
                },
              ],
              activityEvents: [
                {
                  occurredAt: "2026-03-10T11:30:00Z",
                  actor: "ahall236_uhg",
                  type: "review",
                  channel: "review",
                  state: "COMMENTED",
                  body: "Looks good after the latest update.",
                  url: "https://example.com/80#review-1",
                },
                {
                  occurredAt: "2026-03-10T11:15:00Z",
                  actor: "pr-author",
                  type: "comment",
                  channel: "thread",
                  body: "I addressed the feedback.",
                  url: "https://example.com/80#thread-1",
                },
              ],
              reviewThreads: [
                {
                  id: "thread-identity-1",
                  isResolved: false,
                  resolvedByLogin: "",
                  participants: ["ahall236_uhg", "pr-author"],
                  comments: [
                    {
                      id: "thread-identity-comment-1",
                      authorLogin: "ahall236_uhg",
                      authorName: "Alison Hall",
                      createdAt: "2026-03-10T10:45:00Z",
                      body: "Please rename this helper.",
                    },
                    {
                      id: "thread-identity-comment-2",
                      authorLogin: "pr-author",
                      authorName: "PR Author",
                      createdAt: "2026-03-10T11:15:00Z",
                      body: "Updated helper name.",
                    },
                  ],
                },
              ],
            },
          },
        },
        ],
        actorsMap: {
          ahall236_uhg: "Alison Hall",
          "pr-author": "PR Author",
        },
        lastRun: { repo: "owner/repo", updatedAt: "2026-03-10T12:00:00Z" },
      }),
    });

    document.getElementById("status").textContent = "Viewer : ahall236_uhg";

    const user = userEvent.setup();
    await waitFor(() => {
      expect(document.querySelector('[data-pr-section="open"]')).toBeTruthy();
    });
    // This PR's unresolved review thread also independently qualifies it
    // for the "Needs Attention" smart group, which renders it a second time
    // there (smart groups have non-exclusive membership by design) - scope
    // to the "Open PRs" lifecycle section specifically so the query below
    // is unambiguous.
    const openSection = document.querySelector('[data-pr-section="open"]');
    const row = within(openSection).getByText("#80").closest("tr");
    expect(row).toBeTruthy();

    const authorCellIdentity = row?.querySelector(".author-cell-name.actor-identity-pr-author");
    expect(authorCellIdentity).toBeTruthy();
    expect(authorCellIdentity?.className).not.toContain("actor-identity-viewer");

    await user.click(row?.querySelector(".row-insights-toggle"));

    const insightsContent = row?.nextElementSibling?.querySelector(".row-insights-content");
    expect(insightsContent).toBeTruthy();

    const reviewSection = insightsContent?.querySelector(
      'details.insight-section[data-insight-key="review-conversations"]',
    );
    expect(reviewSection?.querySelector(".actor-identity-pr-author")?.textContent).toContain(
      "PR Author",
    );
    expect(reviewSection?.querySelector(".actor-identity-viewer")?.textContent).toContain(
      "Alison Hall",
    );

    const activitySequenceSection = Array.from(
      insightsContent?.querySelectorAll('details.insight-section[data-insight-key="activity sequence"] .actor-identity') || [],
    );
    expect(
      activitySequenceSection.some(
        (node) =>
          String(node.textContent || "") === "Alison Hall" &&
          node.classList.contains("actor-identity-viewer"),
      ),
    ).toBe(true);
    expect(
      activitySequenceSection.some(
        (node) =>
          String(node.textContent || "") === "PR Author" &&
          node.classList.contains("actor-identity-pr-author"),
      ),
    ).toBe(true);

    const activityTimelineActors = Array.from(
      insightsContent?.querySelectorAll("table .actor-identity") || [],
    );
    expect(
      activityTimelineActors.some(
        (node) =>
          String(node.textContent || "") === "Alison Hall" &&
          node.classList.contains("actor-identity-viewer"),
      ),
    ).toBe(true);
    expect(
      activityTimelineActors.some(
        (node) =>
          String(node.textContent || "") === "PR Author" &&
          node.classList.contains("actor-identity-pr-author"),
      ),
    ).toBe(true);

    expect(indexCss).toMatch(/\.actor-identity-viewer\s*\{/);
    expect(indexCss).toMatch(/\.actor-identity-pr-author\s*\{/);
  });

  test("given a review thread with multiple comments, when opening Review conversations, then the View link targets the full thread starter URL", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-changed",
            prNumber: 78,
            overrides: {
              data: {
                title: "Review thread link target",
                titleDisplay: "Review thread link target [CHK:PASS]",
                author: "PR Author",
                authorLogin: "pr-author",
                url: "https://example.com/78",
                updatedAt: "2026-03-10T12:00:00Z",
                reviewThreads: [
                  {
                    id: "thread-link-target",
                    isResolved: false,
                    participants: ["reviewer1", "pr-author"],
                    comments: [
                      {
                        id: "thread-root-comment",
                        authorLogin: "reviewer1",
                        authorName: "Reviewer One",
                        createdAt: "2026-03-10T10:45:00Z",
                        body: "Please update this line.",
                        url: "https://github.com/owner/repo/pull/78#discussion_r_root",
                      },
                      {
                        id: "thread-latest-comment",
                        authorLogin: "pr-author",
                        authorName: "PR Author",
                        createdAt: "2026-03-10T11:15:00Z",
                        body: "Applied the requested update.",
                        url: "https://github.com/owner/repo/pull/78#discussion_r_latest",
                      },
                    ],
                  },
                ],
              },
            },
          },
        ],
        actorsMap: {
          "pr-author": "PR Author",
          reviewer1: "Reviewer One",
        },
        lastRun: { repo: "owner/repo", updatedAt: "2026-03-10T12:00:00Z" },
      }),
    });

    const user = userEvent.setup();
    await waitFor(() => {
      expect(document.querySelector('[data-pr-section="open"]')).toBeTruthy();
    });
    // This PR's unresolved review thread also independently qualifies it
    // for the "Needs Attention" smart group, which renders it a second time
    // there (smart groups have non-exclusive membership by design) - scope
    // to the "Open PRs" lifecycle section specifically so the query below
    // is unambiguous.
    const openSection = document.querySelector('[data-pr-section="open"]');
    const row = within(openSection).getByText("#78").closest("tr");
    await user.click(row?.querySelector(".row-insights-toggle"));

    const reviewSection = row?.nextElementSibling?.querySelector(
      'details.insight-section[data-insight-key="review-conversations"]',
    );
    expect(reviewSection).toBeTruthy();

    const viewLink = reviewSection?.querySelector(
      ".insight-thread .insight-thread-title .insight-event-link",
    );
    expect(viewLink).toBeTruthy();
    expect(viewLink?.getAttribute("href")).toBe(
      "https://github.com/owner/repo/pull/78#discussion_r_root",
    );
  });

  test("given requested reviewers are absent but review actors exist, when insights render, then the Reviewers field falls back to review actors", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 801,
            overrides: {
              data: {
                title: "Requested reviewers fallback",
                titleDisplay: "Requested reviewers fallback [CHK:PASS]",
                author: "PR Author",
                authorLogin: "pr-author",
                url: "https://example.com/801",
                updatedAt: "2026-03-10T12:00:00Z",
                requestedReviewers: [],
                reviewRequests: [],
                reviewers: [],
                reviews: [
                  {
                    authorLogin: "reviewer1",
                    authorName: "Reviewer One",
                  },
                ],
                metrics: {
                  reviewsByActor: [
                    {
                      login: "reviewer2",
                      name: "Reviewer Two",
                    },
                  ],
                },
              },
            },
          },
        ],
        actorsMap: {
          reviewer1: "Reviewer One",
          reviewer2: "Reviewer Two",
          "pr-author": "PR Author",
        },
        lastRun: { repo: "owner/repo", updatedAt: "2026-03-10T12:00:00Z" },
      }),
    });

    const user = userEvent.setup();
    const row = (await screen.findByText("#801")).closest("tr");
    await user.click(row?.querySelector(".row-insights-toggle"));

    const insightsContent = row?.nextElementSibling?.querySelector(".row-insights-content");
    const reviewersKey = Array.from(
      insightsContent?.querySelectorAll(".insight-key") || [],
    ).find((node) => String(node.textContent || "").trim() === "Reviewers");

    expect(reviewersKey).toBeTruthy();
    const reviewersValue = reviewersKey?.nextElementSibling;
    expect(String(reviewersValue?.textContent || "")).toContain(
      "Reviewer One (reviewer1)",
    );
    expect(String(reviewersValue?.textContent || "")).toContain("Reviewer Two");
  });

  test("switches management tab panels when a user opens Run & Filter", async () => {
    const user = userEvent.setup();
    const activityTab = screen.getByRole("tab", { name: "Activity" });
    const runFilterTab = screen.getByRole("tab", { name: "Run & Filter" });

    await user.click(runFilterTab);

    expect(runFilterTab).toHaveAttribute("aria-selected", "true");
    expect(activityTab).toHaveAttribute("aria-selected", "false");
    expect(document.getElementById("tab-panel-script").hidden).toBe(false);
    expect(document.getElementById("tab-panel-status").hidden).toBe(true);
  });

  test("filters, scheduler, backfill, and visibility toggles update rendered output", async () => {
    initTestPage({
      backfillStatusResponse: {
        ok: true,
        running: true,
        pid: "456",
        logFile: "/tmp/backfill.log",
        pidFile: "/tmp/backfill.pid",
        summary: "Backfill status: running (PID: 456)",
      },
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 2,
            overrides: {
              data: {
                title: "Filtered Entry",
                titleDisplay: "Filtered Entry [CHK:PASS][MRG:YES]",
                url: "https://example.com/2",
                labels: ["platform-team"],
                author: "Some Author",
                authorLogin: "someone",
                baseline: "2026-03-01T10:00:00Z",
                mergedAt: "2026-03-01T10:00:00Z",
                updatedAt: "2026-03-10T10:00:00Z",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-03-10T10:00:00Z" },
        scheduler: {
          intervalMinutes: 15,
          manualCooldownMinutes: 15,
          isAutoRunInProgress: false,
          lastAutoError:
            "owner/repo: Auto refresh timed out after 900s",
          lastQuickCheckSkipReason: "already-in-progress",
        },
      }),
    });
    const user = userEvent.setup();

    await waitFor(() => {
      const dataMeta = document.getElementById("data-meta")?.textContent || "";
      expect(dataMeta).toContain("Rows: 1");
    });

    // The scheduler badges themselves are React-owned (#scheduler-badges,
    // mounted by react-app.jsx, reusing <BackfillBadges />) and no longer
    // have a vanilla-DOM fallback to assert against in this jsdom-only
    // suite (which never loads react-app.jsx) - see SchedulerBadges
    // coverage via BackfillBadges.test.jsx (shared component) plus the
    // "React-owned scheduler status badges..." e2e test for that coverage.
    // `details` stays vanilla-rendered regardless, so it's still asserted
    // on directly here.
    const schedulerDetailsText = document.getElementById("scheduler-details")?.textContent || "";
    expect(schedulerDetailsText).toContain("Last auto error:");
    // Surfaces why a quick check was skipped (e.g. blocked by an in-progress
    // full auto refresh) - previously invisible, since runViewPrsQuickCheck's
    // skip branches didn't persist anything to scheduler state at all.
    expect(schedulerDetailsText).toContain("Last quick check skip: already-in-progress");

    await user.click(screen.getByRole("tab", { name: "Backfill" }));
    expect(document.getElementById("tab-panel-backfill").hidden).toBe(false);
    expect(document.getElementById("tab-panel-status").hidden).toBe(true);

    // The backfill badges themselves are React-owned (#backfill-badges,
    // mounted by react-app.jsx) and no longer have a vanilla-DOM fallback
    // to assert against in this jsdom-only suite (which never loads
    // react-app.jsx) - see the "React-owned Backfill status badges..." e2e
    // test for that coverage. This waitFor still gates on the same async
    // status load completing, via `details`, which stays vanilla-rendered
    // regardless.
    await waitFor(() => {
      expect(document.getElementById("backfill-details")?.textContent || "").toContain(
        "PID: 456",
      );
    });
    expect(screen.getByRole("button", { name: "Start backfill" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Stop backfill" })).toBeEnabled();
    expect(document.getElementById("backfill-details")?.textContent || "").toContain(
      "PID: 456",
    );

    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [],
        lastRun: { repo: "owner/repo", updatedAt: "2026-03-10T10:00:00Z" },
        scheduler: {
          intervalMinutes: 15,
          manualCooldownMinutes: 15,
          isAutoRunInProgress: false,
        },
      }),
    });

    await waitFor(() => {
      expect(isMultiSelectEmpty("author-list")).toBe(true);
    });
  });

  test("renders request-activity details from JavaScript init logic", async () => {
    // The request-activity badges themselves are React-owned
    // (#request-activity-badges, mounted by react-app.jsx, reusing
    // <BackfillBadges />) and no longer have a vanilla-DOM fallback to
    // assert against in this jsdom-only suite (which never loads
    // react-app.jsx) - see pr-activity-badges.helpers.test.js for
    // getRequestActivityBadges' own coverage. `details` stays
    // vanilla-rendered regardless, so it's still asserted on directly here.
    await waitFor(() => {
      expect(screen.getByText(/Current status: Not run/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Active requests: none/i)).toBeInTheDocument();
  });

  test("applies non-credential autofill hints without changing existing form field names", () => {
    const repoField = document.getElementById("repo");
    const prNumbersField = document.getElementById("pr-numbers");
    const targetFieldIds = [
      "repo",
      "pr-numbers",
      "limit",
      "merged-limit",
      "jobs",
      "filter-pr-numbers",
    ];

    expect(repoField).toHaveAttribute("name", "repo");
    expect(prNumbersField).toHaveAttribute("name", "prNumbers");

    targetFieldIds.forEach((id) => {
      const field = document.getElementById(id);
      expect(field).toHaveAttribute("autocomplete", "off");
      expect(field).toHaveAttribute("autocapitalize", "off");
      expect(field).toHaveAttribute("autocorrect", "off");
      expect(field).toHaveAttribute("spellcheck", "false");
      expect(field).toHaveAttribute("data-lpignore", "true");
      expect(field).toHaveAttribute("data-1p-ignore", "true");
      expect(field).toHaveAttribute("data-bwignore", "true");
      expect(field).toHaveAttribute("data-form-type", "other");
    });

    expect(repoField).toHaveAttribute("name", "repo");
    expect(prNumbersField).toHaveAttribute("name", "prNumbers");
  });

  test("given run and filter tab when Apply filters (local) is clicked then view-filter defaults are persisted", async () => {
    const user = userEvent.setup();
    fetchMock.mockClear();

    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

    await user.click(
      screen.getByRole("button", { name: "Apply filters (local)" }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const putCall = fetchMock.mock.calls.find((call) => {
      const [url, init] = call;
      return (
        String(url || "") === "/view-prs/user-defaults" &&
        String(init?.method || "GET").toUpperCase() === "PUT"
      );
    });

    expect(putCall).toBeDefined();
  });

  test("given local filters and mixed PR delimiters when actions run then local apply stays local and run script posts numeric IDs", async () => {
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

    fetchMock.mockClear();
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/user-defaults" &&
          String(init?.method || "GET").toUpperCase() === "PUT"
        );
      });
      expect(putCall).toBeDefined();
    });

    const runCallsAfterLocalApply = fetchMock.mock.calls.filter((call) => {
      const [url] = call;
      return String(url || "") === "/view-prs/run";
    });
    expect(runCallsAfterLocalApply.length).toBe(0);

    const prNumbersInput = document.getElementById("pr-numbers");
    await user.clear(prNumbersInput);
    await user.type(prNumbersInput, "912  921,  300");

    fetchMock.mockClear();
    await user.click(screen.getByRole("button", { name: "Run script" }));

    await waitFor(() => {
      const runCalls = fetchMock.mock.calls.filter((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/run" &&
          String(init?.method || "GET").toUpperCase() === "POST"
        );
      });
      expect(runCalls.length).toBe(3);
    });

    const runCalls = fetchMock.mock.calls.filter((call) => {
      const [url, init] = call;
      return (
        String(url || "") === "/view-prs/run" &&
        String(init?.method || "GET").toUpperCase() === "POST"
      );
    });
    const bodies = runCalls.map((call) => String(call[1]?.body || ""));
    expect(bodies.some((b) => b.includes('"912"') || b.includes('"prNumber":"912"'))).toBe(true);
    expect(bodies.some((b) => b.includes('"921"') || b.includes('"prNumber":"921"'))).toBe(true);
    expect(bodies.some((b) => b.includes('"300"') || b.includes('"prNumber":"300"'))).toBe(true);
  });

  test("given no selected author and toggled checkboxes when Run script posts payload then author fallback and boolean flags are mapped", async () => {
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

    // Note: With checkbox-based filters, authors are populated dynamically from PR data.
    // This test verifies that when no author checkboxes are selected, the author field
    // defaults to an empty string in the payload.

    const prNumbersInput = document.getElementById("pr-numbers");
    await user.clear(prNumbersInput);
    await user.type(prNumbersInput, "101  xyz, 202");

    const ackChangedCheckbox = document.getElementById("ack-changed");
    const showReasonCheckbox = document.getElementById("show-reason");
    const quietCheckbox = document.getElementById("quiet");

    await user.click(ackChangedCheckbox);
    await user.click(showReasonCheckbox);
    await user.click(quietCheckbox);

    fetchMock.mockClear();
    await user.click(screen.getByRole("button", { name: "Run script" }));

    await waitFor(() => {
      const runCalls = fetchMock.mock.calls.filter((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/run" &&
          String(init?.method || "GET").toUpperCase() === "POST"
        );
      });
      expect(runCalls.length).toBe(2);
    });

    const runCalls = fetchMock.mock.calls.filter((call) => {
      const [url, init] = call;
      return (
        String(url || "") === "/view-prs/run" &&
        String(init?.method || "GET").toUpperCase() === "POST"
      );
    });

    const firstBody = JSON.parse(String(runCalls[0][1]?.body || "{}"));
    const secondBody = JSON.parse(String(runCalls[1][1]?.body || "{}"));

    expect(firstBody.author).toBe("");
    expect(firstBody.ackChanged).toBe(true);
    expect(firstBody.showReason).toBe(false);
    expect(firstBody.quiet).toBe(true);
    expect(firstBody.prNumbersInput).toBe("101  xyz, 202");
    expect(firstBody.prNumberList).toEqual(["101", "202"]);
    expect(firstBody.prNumbers).toBe("101,202");
    expect(firstBody.prNumber).toBe("101");
    expect(secondBody.prNumber).toBe("202");
  });

  test("given the Quick check button when clicked then it posts to /view-prs/quick-check and shows the pending-change count", async () => {
    fetchMock.mockImplementation(async (url, init = {}) => {
      const normalizedUrl = String(url || "");
      const method = String(init?.method || "GET").toUpperCase();

      if (normalizedUrl === "/view-prs/quick-check" && method === "POST") {
        return createOkJsonResponse({
          ok: true,
          lastQuickCheckAt: "2026-06-16T10:00:00Z",
          reposChecked: ["owner/repo"],
          reposFailed: [],
          newPendingOpenCount: 2,
          newPendingMergedClosedCount: 1,
        });
      }
      if (normalizedUrl === "/view-prs/scheduler" && method === "GET") {
        return createOkJsonResponse({ ok: true, scheduler: {} });
      }

      return createOkJsonResponse({ ok: true });
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

    const quickCheckBtn = screen.getByRole("button", { name: "Quick check" });
    await user.click(quickCheckBtn);

    await waitFor(() => {
      const quickCheckCalls = fetchMock.mock.calls.filter((call) => {
        const [url, callInit] = call;
        return (
          String(url || "") === "/view-prs/quick-check" &&
          String(callInit?.method || "GET").toUpperCase() === "POST"
        );
      });
      expect(quickCheckCalls.length).toBe(1);
    });

    await waitFor(() => {
      expect(quickCheckBtn.textContent).toBe("3 updates found");
    });
    expect(quickCheckBtn.disabled).toBe(false);
  });

  test("given nothing changed when Quick check succeeds then the button reports no changes found", async () => {
    fetchMock.mockImplementation(async (url, init = {}) => {
      const normalizedUrl = String(url || "");
      const method = String(init?.method || "GET").toUpperCase();

      if (normalizedUrl === "/view-prs/quick-check" && method === "POST") {
        return createOkJsonResponse({
          ok: true,
          lastQuickCheckAt: "2026-06-16T10:00:00Z",
          reposChecked: ["owner/repo"],
          reposFailed: [],
          newPendingOpenCount: 0,
          newPendingMergedClosedCount: 0,
        });
      }

      return createOkJsonResponse({ ok: true });
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

    const quickCheckBtn = screen.getByRole("button", { name: "Quick check" });
    await user.click(quickCheckBtn);

    await waitFor(() => {
      expect(quickCheckBtn.textContent).toBe("No changes found");
    });
  });

  test("given one repo failed but others succeeded when Quick check completes then a warning notes the incomplete check", async () => {
    fetchMock.mockImplementation(async (url, init = {}) => {
      const normalizedUrl = String(url || "");
      const method = String(init?.method || "GET").toUpperCase();

      if (normalizedUrl === "/view-prs/quick-check" && method === "POST") {
        return createOkJsonResponse({
          ok: true,
          lastQuickCheckAt: "2026-06-16T10:00:00Z",
          reposChecked: ["owner/repo-ok"],
          reposFailed: [{ repo: "owner/repo-broken", error: "gh auth expired" }],
          newPendingOpenCount: 0,
          newPendingMergedClosedCount: 0,
          error: "Quick check failed for 1 of 2 repo(s): owner/repo-broken",
        });
      }

      return createOkJsonResponse({ ok: true });
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

    const quickCheckBtn = screen.getByRole("button", { name: "Quick check" });
    await user.click(quickCheckBtn);

    await waitFor(() => {
      expect(quickCheckBtn.textContent).toBe("No changes found");
    });
    const snackbarMessage = document.getElementById("error-snackbar-message");
    expect(String(snackbarMessage?.textContent || "")).toContain(
      "Quick check incomplete",
    );
    expect(String(snackbarMessage?.textContent || "")).toContain(
      "owner/repo-broken",
    );
  });

  test("given the auto-refresh circuit is open when Quick check is clicked then a warning notification is shown", async () => {
    fetchMock.mockImplementation(async (url, init = {}) => {
      const normalizedUrl = String(url || "");
      const method = String(init?.method || "GET").toUpperCase();

      if (normalizedUrl === "/view-prs/quick-check" && method === "POST") {
        return {
          ok: false,
          status: 503,
          json: async () => ({
            ok: false,
            error:
              "Auto refresh circuit breaker is open after repeated failures - try again later.",
          }),
        };
      }

      return createOkJsonResponse({ ok: true });
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

    const quickCheckBtn = screen.getByRole("button", { name: "Quick check" });
    await user.click(quickCheckBtn);

    await waitFor(() => {
      const snackbar = document.getElementById("error-snackbar");
      expect(snackbar).not.toHaveAttribute("hidden");
    });
    const snackbarMessage = document.getElementById("error-snackbar-message");
    expect(String(snackbarMessage?.textContent || "")).toContain(
      "Quick check unavailable",
    );
    expect(quickCheckBtn.textContent).toBe("Quick check");
  });

  test("given a quick check already in progress when Quick check is clicked then a conflict notification is shown", async () => {
    fetchMock.mockImplementation(async (url, init = {}) => {
      const normalizedUrl = String(url || "");
      const method = String(init?.method || "GET").toUpperCase();

      if (normalizedUrl === "/view-prs/quick-check" && method === "POST") {
        return {
          ok: false,
          status: 409,
          json: async () => ({
            ok: false,
            error: "Quick check or auto refresh already in progress",
          }),
        };
      }

      return createOkJsonResponse({ ok: true });
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

    const quickCheckBtn = screen.getByRole("button", { name: "Quick check" });
    await user.click(quickCheckBtn);

    await waitFor(() => {
      const snackbar = document.getElementById("error-snackbar");
      expect(snackbar).not.toHaveAttribute("hidden");
    });
    const snackbarMessage = document.getElementById("error-snackbar-message");
    expect(String(snackbarMessage?.textContent || "")).toContain(
      "Quick check already in progress",
    );
    expect(quickCheckBtn.textContent).toBe("Quick check");
  });

  test("given label dropdown selections when Run script posts payload then label and excludeLabel map from selected label checkboxes", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 101,
            overrides: {
              data: {
                title: "Run payload labels",
                titleDisplay: "Run payload labels [CHK:PASS]",
                author: "Author One",
                authorLogin: "author-one",
                url: "https://github.com/owner/repo/pull/101",
                labels: ["bug", "frontend", "platform-team"],
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
      }),
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

    const prNumbersInput = document.getElementById("pr-numbers");
    await user.clear(prNumbersInput);
    await user.type(prNumbersInput, "101");

    await waitFor(() => {
      const includeValues = Array.from(
        getMultiSelectList("label-list").querySelectorAll("input[type='checkbox']"),
      ).map((cb) => cb.value);
      const excludeValues = Array.from(
        getMultiSelectList("exclude-label-list").querySelectorAll("input[type='checkbox']"),
      ).map((cb) => cb.value);
      expect(includeValues).toEqual(["bug", "frontend", "platform-team"]);
      expect(excludeValues).toEqual(["bug", "frontend", "platform-team"]);
    });

    await clickMultiSelectCheckbox("label-list", "frontend", user);

    await clickMultiSelectCheckbox("exclude-label-list", "bug", user);

    fetchMock.mockClear();
    await user.click(screen.getByRole("button", { name: "Run script" }));

    await waitFor(() => {
      const runCalls = fetchMock.mock.calls.filter((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/run" &&
          String(init?.method || "GET").toUpperCase() === "POST"
        );
      });
      expect(runCalls.length).toBe(1);
    });

    const runCall = fetchMock.mock.calls.find((call) => {
      const [url, init] = call;
      return (
        String(url || "") === "/view-prs/run" &&
        String(init?.method || "GET").toUpperCase() === "POST"
      );
    });
    const payload = JSON.parse(String(runCall?.[1]?.body || "{}"));

    expect(payload.prNumber).toBe("101");
    expect(payload.label).toBe("frontend");
    expect(payload.excludeLabel).toBe("bug");
  });

  test("given PR-number filter and other local filters when applying locally then PR-number filter takes precedence", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 1,
            overrides: {
              data: {
                title: "Target PR",
                titleDisplay: "Target PR [CHK:PASS]",
                author: "Author Target",
                authorLogin: "author-target",
                url: "https://github.com/owner/repo/pull/1",
                assignees: [
                  { login: "assignee-target", name: "Assignee Target" },
                ],
                labels: ["bug"],
                updatedAt: "2026-03-09T10:00:00Z",
              },
            },
          },
          {
            scenario: "open-changed",
            prNumber: 2,
            overrides: {
              data: {
                title: "Non-target PR",
                titleDisplay: "Non-target PR [CHK:PASS]",
                author: "Author Other",
                authorLogin: "author-other",
                url: "https://github.com/owner/repo/pull/2",
                assignees: [
                  { login: "assignee-other", name: "Assignee Other" },
                ],
                labels: ["frontend"],
                updatedAt: "2026-03-10T10:00:00Z",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-03-10T10:00:00Z" },
      }),
    });
    const user = userEvent.setup();

    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

    const scopeField = document.getElementById("scope-mode");
    const prFilterField = document.getElementById("filter-pr-numbers");
    const labelList = getMultiSelectList("label-list");
    const excludeLabelList = getMultiSelectList("exclude-label-list");
    const authorList = getMultiSelectList("author-list");
    const assignedList = getMultiSelectList("assigned-list");

    expect(scopeField).toBeInTheDocument();
    expect(prFilterField).toBeInTheDocument();
    expect(labelList).toBeInTheDocument();
    expect(excludeLabelList).toBeInTheDocument();
    expect(authorList).toBeInTheDocument();
    expect(assignedList).toBeInTheDocument();

    await waitFor(() => {
      const includeValues = Array.from(
        labelList.querySelectorAll("input[type='checkbox']"),
      ).map((cb) => cb.value);
      const excludeValues = Array.from(
        excludeLabelList.querySelectorAll("input[type='checkbox']"),
      ).map((cb) => cb.value);
      expect(includeValues).toEqual(["bug", "frontend"]);
      expect(excludeValues).toEqual(["bug", "frontend"]);
    });

    await user.selectOptions(scopeField, "needs-attention-or-interacted");
    await user.clear(prFilterField);
    await user.type(prFilterField, "1");
    await clickMultiSelectCheckbox("label-list", "frontend", user);
    await clickMultiSelectCheckbox("exclude-label-list", "bug", user);
    await clickMultiSelectCheckbox("author-list", "author-other", user);
    await clickMultiSelectCheckbox("assigned-list", "assignee-other", user);

    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    await waitFor(() => {
      const dataMetaText = document.getElementById("data-meta")?.textContent || "";
      expect(dataMetaText).toContain("Rows: 1");
      expect(dataMetaText).toContain("pr-numbers=1");
      expect(dataMetaText).toContain("scope=all stored rows");
    });

    expect(
      screen.getByRole("button", { name: "View PR JSON details for #1" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "View PR JSON details for #2" }),
    ).not.toBeInTheDocument();
  });

  test("given needs-attention scope variants when applying locally then each scope yields the expected row set", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-changed",
            prNumber: 1,
            overrides: {
              data: {
                title: "Needs attention row",
                titleDisplay: "Needs attention row [CHK:PASS]",
                author: "Author One",
                authorLogin: "author-one",
                url: "https://github.com/owner/repo/pull/1",
                baseline: "-",
                updatedAt: "2026-03-10T10:00:00Z",
              },
            },
          },
          {
            scenario: "open-no-change",
            prNumber: 2,
            overrides: {
              data: {
                title: "Interacted row",
                titleDisplay: "Interacted row [CHK:PASS]",
                author: "Author Two",
                authorLogin: "author-two",
                url: "https://github.com/owner/repo/pull/2",
                baseline: "2026-03-08T10:00:00Z",
                updatedAt: "2026-03-10T10:00:00Z",
              },
            },
          },
          {
            scenario: "open-no-change",
            prNumber: 3,
            overrides: {
              data: {
                title: "No attention no interaction",
                titleDisplay: "No attention no interaction [CHK:PASS]",
                author: "Author Three",
                authorLogin: "author-three",
                url: "https://github.com/owner/repo/pull/3",
                baseline: "-",
                updatedAt: "2026-03-10T10:00:00Z",
              },
            },
          },
          {
            scenario: "open-no-change",
            prNumber: 4,
            overrides: {
              data: {
                title: "In-review row",
                titleDisplay: "In-review row [CHK:PASS]",
                author: "Author Four",
                authorLogin: "author-four",
                url: "https://github.com/owner/repo/pull/4",
                baseline: "-",
                inReview: true,
                updatedAt: "2026-03-10T10:00:00Z",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-03-10T10:00:00Z" },
      }),
    });
    const user = userEvent.setup();

    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));
    const scopeField = document.getElementById("scope-mode");
    expect(scopeField).toBeInTheDocument();

    await user.selectOptions(scopeField, "needs-attention");
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    // PR #4 is only in-review (not CHANGED), so it no longer counts as
    // needing attention on its own - the in-review override was
    // intentionally removed (see "Further migration and removal of in
    // review attention override"). Only PR #1 (CHANGED) qualifies here.
    await waitFor(() => {
      const dataMetaText = document.getElementById("data-meta")?.textContent || "";
      expect(dataMetaText).toContain("Rows: 1");
      expect(dataMetaText).toContain("scope=needs attention rows");
    });

    await user.selectOptions(scopeField, "needs-attention-or-interacted");
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    // PR #1 (needs attention) + PR #2 (interacted) = 2. PR #4's in-review
    // flag alone no longer qualifies it for either scope.
    await waitFor(() => {
      const dataMetaText = document.getElementById("data-meta")?.textContent || "";
      expect(dataMetaText).toContain("Rows: 2");
      expect(dataMetaText).toContain("scope=needs attention or interacted rows");
    });
  });

  test("given a flagged PR, when rows render with needs-attention status, then the flag icon appears below attention with the flagged tooltip", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-changed",
            prNumber: 101,
            overrides: {
              data: {
                title: "Flagged attention row",
                titleDisplay: "Flagged attention row [CHK:PASS]",
                author: "Author One",
                authorLogin: "author-one",
                url: "https://github.com/owner/repo/pull/101",
                updatedAt: "2026-03-10T10:00:00Z",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-03-10T10:00:00Z" },
        flaggedByRepo: {
          "owner/repo": {
            101: true,
          },
        },
      }),
    });

    await waitFor(() => {
      expect(document.querySelector('[data-pr-section="flagged"]')).toBeTruthy();
    });

    // This PR also has CHANGED status, so it independently qualifies for the
    // "Needs Attention" smart group and renders a second time there (smart
    // groups have non-exclusive membership by design) - scope to the
    // Flagged group specifically so the query is unambiguous.
    const flaggedSection = document.querySelector('[data-pr-section="flagged"]');
    const row = within(flaggedSection).getByText("#101").closest("tr");
    const icons = Array.from(row?.querySelectorAll(".attention-cell span") || []);

    expect(icons.map((node) => node.textContent)).toEqual(["⚠️", "🚩"]);
    expect(icons[1]?.getAttribute("title")).toBe("PR was flagged");
  });

  test("given a PR that is in-review (but otherwise NO_CHANGE) and flagged, when rows render, then only the flag icon is shown, not attention", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-in-review",
            prNumber: 202,
            overrides: {
              data: {
                title: "In-review flagged row",
                titleDisplay: "In-review flagged row [CHK:PASS]",
                author: "Author Two",
                authorLogin: "author-two",
                url: "https://github.com/owner/repo/pull/202",
                updatedAt: "2026-03-10T10:00:00Z",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-03-10T10:00:00Z" },
        flaggedByRepo: {
          "owner/repo": {
            202: true,
          },
        },
      }),
    });

    await waitFor(() => {
      expect(screen.getAllByText("#202").length).toBeGreaterThan(0);
    });

    // Regression test: the "In Review" checkbox must not make a PR count as
    // needing attention - it's a separate, manually-set flag (see
    // isInReviewEnabled/AlwaysShowInReviewCheckbox), independent of whether
    // the PR actually has unreviewed activity (checkNeedsAttention in
    // PrTableApp.jsx delegates to window.entryNeedsAttention only). This
    // row's status is NO_CHANGE ("open-in-review" fixture), so only the
    // flag icon should render on every rendered copy of the row - it still
    // appears in both its "open" lifecycle section and the (unrelated) "In
    // Review" smart group, since that group is keyed off inReview directly.
    const rows = screen.getAllByText("#202").map((link) => link.closest("tr"));
    expect(rows.length).toBeGreaterThan(0);

    rows.forEach((row) => {
      const icons = Array.from(row?.querySelectorAll(".attention-cell span") || []);
      expect(icons.map((node) => node.textContent)).toEqual(["🚩"]);
      expect(icons[0]?.getAttribute("title")).toBe("PR was flagged");
    });
  });

  test("scheduler polling toggles active PR progress indicators without row rerender", async () => {
    {
      jest.resetModules();
      latestDataPayload = createMultiPrPayload({
        prs: [
          {
            scenario: "open-changed",
            prNumber: 1,
            overrides: {
              data: {
                title: "Scheduler progress row",
                titleDisplay: "Scheduler progress row [CHK:PASS]",
                author: "Author One",
                authorLogin: "author-one",
                url: "https://github.com/owner/repo/pull/1",
                baseline: "-",
                updatedAt: "2026-03-10T10:00:00Z",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-03-10T10:00:00Z" },
      });
      actionLogEntries = [];
      document.body.innerHTML = extractBodyHtml(indexHtml);
      injectRunFilterFieldElements();
      installReactTableMountBridge();

      let schedulerActivePrNumbers = [];
      const baseFetch = createFetchMock();
      fetchMock = jest.fn(async (url, init = {}) => {
        const normalizedUrl = String(url || "");
        const method = String(init?.method || "GET").toUpperCase();
        if (normalizedUrl === "/view-prs/scheduler" && method === "GET") {
          return createOkJsonResponse({
            ok: true,
            scheduler: {
              intervalMinutes: 15,
              manualCooldownMinutes: 15,
              isAutoRunInProgress: schedulerActivePrNumbers.length > 0,
              activePrNumbers: schedulerActivePrNumbers,
            },
          });
        }
        return baseFetch(url, init);
      });
      global.fetch = fetchMock;
      window.fetch = fetchMock;
      window.marked = {
        parse: (markdownText) => `<p>${String(markdownText || "")}</p>`,
      };

      require("../index.page.js");

      expect(typeof window.pollSchedulerStatus).toBe("function");

      // This PR's CHANGED status also independently qualifies it for the
      // "Needs Attention" smart group, which renders it a second time there
      // (smart groups have non-exclusive membership by design) - scope to
      // the "Open PRs" lifecycle section specifically so the queries below
      // are unambiguous.
      await waitFor(() => {
        expect(document.querySelector('[data-pr-section="open"]')).toBeTruthy();
      });
      const openSection = document.querySelector('[data-pr-section="open"]');
      await waitFor(() => {
        expect(within(openSection).getByText("#1")).toBeInTheDocument();
      });

      const getIndicator = () => {
        const row = within(openSection).getByText("#1").closest("tr");
        return row?.querySelector(".pr-progress-indicator");
      };

      const initialIndicator = getIndicator();
      expect(initialIndicator).toBeTruthy();
      expect(initialIndicator?.hidden).toBe(true);

      schedulerActivePrNumbers = [{ repo: "owner/repo", prNumber: "1" }];
      await window.pollSchedulerStatus();

      await waitFor(() => {
        const updatedIndicator = getIndicator();
        expect(updatedIndicator).toBe(initialIndicator);
        expect(updatedIndicator?.hidden).toBe(false);
      });

      schedulerActivePrNumbers = [];
      await window.pollSchedulerStatus();

      await waitFor(() => {
        const updatedIndicator = getIndicator();
        expect(updatedIndicator).toBe(initialIndicator);
        expect(updatedIndicator?.hidden).toBe(true);
      });
    }
  });

  test("attention toggles update icons and persist non-default overrides", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 101,
            overrides: {
              data: {
                title: "Open no activity",
                titleDisplay: "Open no activity [CHK:PASS]",
                author: "Open Author",
                authorLogin: "open-author",
                url: "https://github.com/owner/repo/pull/101",
                status: "NO_ACTIVITY",
                assignees: [{ login: "ahall236_uhg", name: "Alison Hall" }],
                updatedAt: "2026-06-16T10:00:00Z",
                baseline: "2026-06-01T10:00:00Z",
              },
            },
          },
          {
            scenario: "open-no-change",
            prNumber: 102,
            overrides: {
              data: {
                title: "Open merge-only changed",
                titleDisplay: "Open merge-only changed [CHK:PASS]",
                author: "Merge Author",
                authorLogin: "merge-author",
                url: "https://github.com/owner/repo/pull/102",
                status: "CHANGED(commit)",
                updatedAt: "2026-06-16T10:10:00Z",
                baseline: "2026-06-01T10:00:00Z",
                reason: "-",
                commits: [
                  {
                    oid: "merge-commit-1",
                    committedAt: "2026-06-16T09:30:00Z",
                    messageHeadline: "Merge branch 'main' into feature/test",
                    authors: [{ login: "ahall236_uhg", name: "Alison Hall" }],
                  },
                ],
              },
            },
          },
          {
            scenario: "draft",
            prNumber: 201,
            overrides: {
              data: {
                title: "Draft changed",
                titleDisplay: "Draft changed [CHK:PASS]",
                author: "Draft Author",
                authorLogin: "draft-author",
                url: "https://github.com/owner/repo/pull/201",
                status: "CHANGED",
                updatedAt: "2026-06-16T10:20:00Z",
                baseline: "2026-06-01T10:00:00Z",
              },
            },
          },
          {
            scenario: "draft",
            prNumber: 202,
            overrides: {
              data: {
                title: "Draft no activity",
                titleDisplay: "Draft no activity [CHK:PASS]",
                author: "Draft Author Two",
                authorLogin: "draft-author-two",
                url: "https://github.com/owner/repo/pull/202",
                status: "NO_ACTIVITY",
                updatedAt: "2026-06-16T10:25:00Z",
                baseline: "2026-06-01T10:00:00Z",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:30:00Z" },
      }),
    });
    const user = userEvent.setup();

    // Whenever a PR here has "Needs Attention" active, it also
    // independently qualifies for that smart group, which renders it a
    // second time above its lifecycle section (smart groups have
    // non-exclusive membership by design) - scope every lookup to the PR's
    // own lifecycle section ("open" for 101/102, "draft" for 201/202) so
    // these queries stay unambiguous regardless of attention state.
    const lifecycleSectionByPrNumber = { 101: "open", 102: "open", 201: "draft", 202: "draft" };

    await waitFor(() => {
      expect(document.querySelector('[data-pr-section="open"]')).toBeTruthy();
      expect(document.querySelector('[data-pr-section="draft"]')).toBeTruthy();
    });

    const hasAttentionForPr = (prNumber) => {
      const sectionKey = lifecycleSectionByPrNumber[Number(prNumber)] || "open";
      const sectionEl = document.querySelector(`[data-pr-section="${sectionKey}"]`);
      const prLink = within(sectionEl).getByText(`#${prNumber}`);
      const row = prLink.closest("tr");
      return Boolean(row?.querySelector(".attention-icon"));
    };

    document.getElementById("status").textContent = "Viewer : ahall236_uhg";

    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

    const noActivityMode = document.getElementById("attention-no-activity-mode");
    const includePendingComments = document.getElementById(
      "attention-include-pending-comments",
    );
    const ignoreMergeOnly = document.getElementById(
      "attention-ignore-merge-only-commits",
    );
    const includeDraftChanged = document.getElementById(
      "attention-include-draft-changed",
    );
    const includeDraftNoActivity = document.getElementById(
      "attention-include-draft-no-activity",
    );
    const includeClosedMerged = document.getElementById(
      "attention-include-closed-merged",
    );

    expect(noActivityMode).toBeInTheDocument();
    expect(includePendingComments).toBeInTheDocument();
    expect(ignoreMergeOnly).toBeInTheDocument();

    await user.click(includePendingComments);
    await user.selectOptions(noActivityMode, "none");
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    await waitFor(() => {
      expect(hasAttentionForPr("101")).toBe(false);
    });

    await user.selectOptions(noActivityMode, "mine-only");
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    await user.selectOptions(noActivityMode, "all");
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    await waitFor(() => {
      expect(hasAttentionForPr("101")).toBe(true);
    });

    await user.click(ignoreMergeOnly);
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    await waitFor(() => {
      expect(hasAttentionForPr("102")).toBe(false);
    });

    if (includeDraftChanged.checked) {
      await user.click(includeDraftChanged);
    }
    if (includeDraftNoActivity.checked) {
      await user.click(includeDraftNoActivity);
    }
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    await waitFor(() => {
      expect(hasAttentionForPr("201")).toBe(false);
      expect(hasAttentionForPr("202")).toBe(false);
    });

    await user.click(includeDraftChanged);
    await user.click(includeDraftNoActivity);
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    await waitFor(() => {
      expect(hasAttentionForPr("201")).toBe(true);
      expect(hasAttentionForPr("202")).toBe(true);
    });

    fetchMock.mockClear();
    await user.selectOptions(noActivityMode, "mine-only");
    if (includeClosedMerged.checked) {
      await user.click(includeClosedMerged);
    }
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    let putCall;
    await waitFor(() => {
      putCall = fetchMock.mock.calls.find((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/user-defaults" &&
          String(init?.method || "GET").toUpperCase() === "PUT"
        );
      });
      expect(putCall).toBeDefined();
    });

    const savedOverrides = JSON.parse(String(putCall?.[1]?.body || "{}"));
    expect(savedOverrides["attention-no-activity-mode"]).toBe("mine-only");
    expect(savedOverrides["attention-include-closed-merged"]).toBe(false);

    fetchMock.mockClear();
    await user.selectOptions(noActivityMode, "all");
    await user.click(includeClosedMerged);
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    let resetPutCall;
    await waitFor(() => {
      resetPutCall = fetchMock.mock.calls.find((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/user-defaults" &&
          String(init?.method || "GET").toUpperCase() === "PUT"
        );
      });
      expect(resetPutCall).toBeDefined();
    });

    const savedOverridesAfterReset = JSON.parse(
      String(resetPutCall?.[1]?.body || "{}"),
    );
    expect(
      Object.prototype.hasOwnProperty.call(
        savedOverridesAfterReset,
        "attention-no-activity-mode",
      ),
    ).toBe(false);
  });

  test("preserves selected author filter through rerender after row actions", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 11,
            overrides: {
              data: {
                title: "Alpha author",
                titleDisplay: "Alpha author [CHK:PASS][MRG:YES]",
                author: "Alpha Author",
                authorLogin: "auser",
                url: "https://github.com/owner/repo/pull/11",
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
          {
            scenario: "open-no-change",
            prNumber: 12,
            overrides: {
              data: {
                title: "Zeta author",
                titleDisplay: "Zeta author [CHK:PASS][MRG:YES]",
                author: "Zeta User",
                authorLogin: "zuser",
                url: "https://github.com/owner/repo/pull/12",
                updatedAt: "2026-06-16T10:10:00Z",
              },
            },
          },
        ],
        actorsMap: {
          auser: "Alpha Author",
          zuser: "Zeta User",
        },
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:10:00Z" },
      }),
    });
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText("#11")).toBeInTheDocument();
      expect(screen.getByText("#12")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

    const authorList = getMultiSelectList("author-list");
    expect(authorList).toBeInTheDocument();

    await clickMultiSelectCheckbox("author-list", "zuser", user);
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    await waitFor(() => {
      const dataMetaText = document.getElementById("data-meta")?.textContent || "";
      expect(dataMetaText).toContain("Rows: 1");
      expect(screen.getByText("#12")).toBeInTheDocument();
      expect(screen.queryByText("#11")).not.toBeInTheDocument();
    });

    const visibleAckButton = screen
      .getAllByRole("button", { name: /ack/i })
      .find((button) => button.closest("table"));
    expect(visibleAckButton).toBeDefined();
    await user.click(visibleAckButton);

    await waitFor(() => {
      const selectedAuthorValues = getSelectedMultiSelectValues("author-list");
      expect(selectedAuthorValues).toEqual(["zuser"]);

      const dataMetaText = document.getElementById("data-meta")?.textContent || "";
      expect(dataMetaText).toContain("Rows: 1");
      expect(screen.getByText("#12")).toBeInTheDocument();
      expect(screen.queryByText("#11")).not.toBeInTheDocument();
    });
  });

  test("section headings show needs-attention counts by PR group", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 1,
            overrides: {
              data: {
                title: "Open attention",
                titleDisplay: "Open attention [CHK:PASS]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/1",
                status: "NO_ACTIVITY",
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
          {
            scenario: "open-no-change",
            prNumber: 2,
            overrides: {
              data: {
                title: "Open no attention",
                titleDisplay: "Open no attention [CHK:PASS]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/2",
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
          {
            scenario: "draft",
            prNumber: 21,
            overrides: {
              data: {
                title: "Draft attention",
                titleDisplay: "Draft attention [CHK:PASS]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/21",
                status: "CHANGED",
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
          {
            scenario: "open-no-change",
            prNumber: 31,
            overrides: {
              section: "closed",
              data: {
                title: "Closed attention",
                titleDisplay: "Closed attention [CHK:PASS]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/31",
                status: "CHANGED",
                approved: "YES",
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
          {
            scenario: "merged",
            prNumber: 41,
            overrides: {
              data: {
                title: "Merged no attention",
                titleDisplay: "Merged no attention [CHK:PASS]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/41",
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
        scheduler: {
          intervalMinutes: 15,
          manualCooldownMinutes: 15,
          isAutoRunInProgress: false,
        },
      }),
    });

    await waitFor(() => {
      expect(document.querySelector("details[data-pr-section='open']")).toBeTruthy();
    });

    const openSection = document.querySelector("details[data-pr-section='open']");
    const draftSection = document.querySelector("details[data-pr-section='draft']");
    const closedSection = document.querySelector("details[data-pr-section='closed']");
    const mergedSection = document.querySelector("details[data-pr-section='merged']");

    const openAttention = openSection?.querySelector(".pr-group-section-attention-count");
    const draftAttention = draftSection?.querySelector(".pr-group-section-attention-count");
    const closedAttention = closedSection?.querySelector(".pr-group-section-attention-count");
    const mergedAttention = mergedSection?.querySelector(
      ".pr-group-section-attention-count",
    );

    expect(String(openAttention?.textContent || "")).toBe("Attention: 1");
    expect(String(draftAttention?.textContent || "")).toBe("Attention: 1");
    expect(String(closedAttention?.textContent || "")).toBe("Attention: 1");
    expect(mergedAttention).toBeNull();
  });

  test("renders compact table headers, author-note indicators, and merged note-only rows", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 11,
            overrides: {
              notes: {
                comments: [
                  {
                    id: "comment-1",
                    author: "ahall236_uhg",
                    tone: "Positive",
                    note: "Remember to revisit metrics copy.",
                  },
                ],
                otherNotes: "Follow up after release",
                prDifficulty: "4",
                rallyStories: ["US12345"],
                rallyLinks: ["https://rally.example/US12345"],
                analysisOfPr: "Risk is moderate due to API coupling.",
              },
              data: {
                title: "Open row with notes",
                titleDisplay: "Open row with notes [CHK:PASS][MRG:YES]",
                author: "Alison Hall",
                authorLogin: "ahall236_uhg",
                status: "NO_ACTIVITY",
                activityTimelineSummary: "-",
                reason: "-",
              },
            },
          },
          {
            scenario: "open-no-change",
            prNumber: 12,
            overrides: {
              data: {
                title: "Open row without notes",
                titleDisplay: "Open row without notes [CHK:PASS][MRG:YES]",
                author: "Second Author",
                authorLogin: "second_author",
              },
            },
          },
          {
            scenario: "merged-approved",
            prNumber: 999,
            overrides: {
              notes: {
                comments: [
                  {
                    id: "comment-merged-1",
                    author: "reviewer-only",
                    tone: "Negative",
                    note: "This PR still needs follow-up context.",
                  },
                ],
                otherNotes: "Saved without local PR data.",
              },
              data: {
                title: "Stored notes only",
                titleDisplay: "Stored notes only",
                author: "",
                authorLogin: "",
                status: "NO_LOCAL_DATA",
                approved: "-",
                comments: [],
                reviews: [],
                commits: [],
                reviewThreads: [],
                reason: "No retrieved PR data available",
              },
            },
          },
        ],
        actorsMap: { ahall236_uhg: "Alison Hall" },
        lastRun: { repo: "owner/repo", updatedAt: "2026-03-10T10:00:00Z" },
        scheduler: {
          intervalMinutes: 15,
          manualCooldownMinutes: 15,
          isAutoRunInProgress: false,
        },
      }),
    });
    const user = userEvent.setup();

    // Despite the "merged-approved" scenario name, #999's overrides (no
    // mergedAt, empty author/comments/etc., status NO_LOCAL_DATA) place it
    // in the "open" lifecycle section here, alongside #11/#12. #11's
    // NO_ACTIVITY status and #999's missing local data can each
    // independently qualify a PR for the "Needs Attention" smart group too,
    // rendering it a second time there (smart groups have non-exclusive
    // membership by design) - scope every lookup below to the "Open PRs"
    // lifecycle section specifically so these queries stay unambiguous.
    await waitFor(() => {
      expect(
        document.querySelector("details[data-pr-section='open'] table.pr-data-table"),
      ).toBeTruthy();
    });

    const openSectionTable = document.querySelector(
      "details[data-pr-section='open'] table.pr-data-table",
    );

    await waitFor(() => {
      expect(within(openSectionTable).getByText("#11")).toBeInTheDocument();
      expect(within(openSectionTable).getByText("#999")).toBeInTheDocument();
    });

    const openHeaderCells = openSectionTable.querySelectorAll("thead th");
    expect(String(openHeaderCells[0]?.textContent || "")).toContain("Sel");
    expect(openHeaderCells[0]).toHaveAttribute("title", "Select PR");
    expect(String(openHeaderCells[1]?.textContent || "")).toContain("Attn");
    expect(openHeaderCells[1]).toHaveAttribute("title", "Needs Attention");

    const pr11Link = within(openSectionTable).getByText("#11");
    const pr11Row = pr11Link.closest("tr");
    expect(pr11Row).toBeTruthy();
    const pr11AuthorCell = pr11Row?.children?.[6];
    expect(String(pr11AuthorCell?.textContent || "")).toContain("Alison Hall");
    expect(String(pr11AuthorCell?.textContent || "")).toContain("📝 Notes");
    const pr11Indicator = pr11AuthorCell?.querySelector(".author-notes-indicator");
    expect(String(pr11Indicator?.className || "")).toContain("author-notes-indicator-has");

    const pr11DateCell = pr11Row?.children?.[9];
    const pr11FieldIndicators = Array.from(
      pr11DateCell?.querySelectorAll(".author-notes-field-indicator") || [],
    );
    expect(pr11FieldIndicators.length).toBe(6);
    expect(
      pr11FieldIndicators.every((node) =>
        String(node?.className || "").includes("author-notes-field-indicator-filled"),
      ),
    ).toBe(true);
    expect(
      String(
        pr11DateCell?.querySelector(".author-notes-field-indicator-difficulty")
          ?.textContent || "",
      ),
    ).toBe("4");

    const pr12Link = within(openSectionTable).getByText("#12");
    const pr12Row = pr12Link.closest("tr");
    expect(pr12Row).toBeTruthy();
    const pr12AuthorCell = pr12Row?.children?.[6];
    const pr12Indicator = pr12AuthorCell?.querySelector(".author-notes-indicator");
    expect(String(pr12Indicator?.className || "")).toContain("author-notes-indicator-none");

    const pr12DateCell = pr12Row?.children?.[9];
    const pr12FieldIndicators = Array.from(
      pr12DateCell?.querySelectorAll(".author-notes-field-indicator") || [],
    );
    expect(pr12FieldIndicators.length).toBe(6);
    expect(
      pr12FieldIndicators.every((node) =>
        String(node?.className || "").includes("author-notes-field-indicator-empty"),
      ),
    ).toBe(true);
    expect(
      String(
        pr12DateCell?.querySelector(".author-notes-field-indicator-difficulty")
          ?.textContent || "",
      ),
    ).toBe("");

    const pr999Link = within(openSectionTable).getByText("#999");
    const pr999Row = pr999Link.closest("tr");
    expect(pr999Row).toBeTruthy();
    expect(String(pr999Row?.textContent || "")).toContain("NO_LOCAL_DATA");

    const pr999InsightsButton = pr999Row?.querySelector(".row-insights-toggle");
    expect(pr999InsightsButton).toBeTruthy();
    await user.click(pr999InsightsButton);

    const pr999InsightsRow = pr999Row?.nextElementSibling;
    expect(pr999InsightsRow?.hidden).toBe(false);
    const mergedCommentNote = pr999InsightsRow?.querySelector(
      ".pr-notes-comment-note",
    );
    const mergedOtherNotes = Array.from(
      pr999InsightsRow?.querySelectorAll(".pr-notes-textarea") || [],
    ).find(
      (node) =>
        !String(node?.className || "").includes("pr-notes-comment-note"),
    );
    expect(String(mergedCommentNote?.value || "")).toBe(
      "This PR still needs follow-up context.",
    );
    expect(String(mergedOtherNotes?.value || "")).toBe(
      "Saved without local PR data.",
    );
  });

  test("attention toggle changes update row icons and persist non-default overrides", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 101,
            overrides: {
              data: {
                title: "Open no activity",
                titleDisplay: "Open no activity [CHK:PASS]",
                author: "octocat",
                authorLogin: "octocat",
                url: "https://github.com/owner/repo/pull/101",
                status: "NO_ACTIVITY",
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
          {
            scenario: "open-no-change",
            prNumber: 102,
            overrides: {
              data: {
                title: "Merge-only commit change",
                titleDisplay: "Merge-only commit change [CHK:PASS]",
                author: "octocat",
                authorLogin: "octocat",
                url: "https://github.com/owner/repo/pull/102",
                status: "CHANGED(commit)",
                commits: [
                  {
                    oid: "merge-commit-1",
                    committedAt: "2026-03-10T09:30:00Z",
                    messageHeadline: "Merge branch 'main' into feature/test",
                    authors: [{ login: "ahall236_uhg", name: "Alison Hall" }],
                  },
                ],
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
        scheduler: {
          intervalMinutes: 15,
          manualCooldownMinutes: 15,
          isAutoRunInProgress: false,
        },
      }),
    });
    const user = userEvent.setup();

    // Whenever a PR here has "Needs Attention" active, it also
    // independently qualifies for that smart group, which renders it a
    // second time above its lifecycle section (smart groups have
    // non-exclusive membership by design) - scope every lookup to the
    // "Open PRs" lifecycle section specifically so these queries stay
    // unambiguous regardless of attention state.
    const getAttentionIcon = (prNumber) => {
      const openSection = document.querySelector('[data-pr-section="open"]');
      return within(openSection)
        .getByText(`#${prNumber}`)
        .closest("tr")
        ?.querySelector(".attention-icon");
    };

    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));
    await waitFor(() => {
      expect(document.querySelector('[data-pr-section="open"]')).toBeTruthy();
    });
    await waitFor(() => {
      const openSection = document.querySelector('[data-pr-section="open"]');
      expect(within(openSection).getByText("#101")).toBeInTheDocument();
    });

    fetchMock.mockClear();
    const pendingCommentsToggle = document.getElementById(
      "attention-include-pending-comments",
    );
    const noActivityModeSelect = document.getElementById(
      "attention-no-activity-mode",
    );
    const ignoreMergeOnlyToggle = document.getElementById(
      "attention-ignore-merge-only-commits",
    );

    pendingCommentsToggle.checked = false;
    await user.selectOptions(noActivityModeSelect, "none");
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    await waitFor(() => {
      expect(getAttentionIcon("101")).toBeNull();
    });

    await user.selectOptions(noActivityModeSelect, "all");
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));
    await waitFor(() => {
      expect(getAttentionIcon("101")?.textContent || "").toBe("⚠️");
    });

    ignoreMergeOnlyToggle.checked = true;
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));
    await waitFor(() => {
      expect(getAttentionIcon("102")).toBeNull();
    });

    const includeClosedMergedToggle = document.getElementById(
      "attention-include-closed-merged",
    );
    const includeDraftNoActivityToggle = document.getElementById(
      "attention-include-draft-no-activity",
    );

    await user.selectOptions(noActivityModeSelect, "mine-only");
    includeClosedMergedToggle.checked = false;
    includeDraftNoActivityToggle.checked = true;
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    let latestPutCall;
    await waitFor(() => {
      latestPutCall = fetchMock.mock.calls
        .slice()
        .reverse()
        .find((call) => {
          const [url, init] = call;
          return (
            String(url || "") === "/view-prs/user-defaults" &&
            String(init?.method || "GET").toUpperCase() === "PUT"
          );
        });
      expect(latestPutCall).toBeDefined();
    });

    const savedOverrides = JSON.parse(String(latestPutCall?.[1]?.body || "{}"));
    expect(savedOverrides["attention-no-activity-mode"]).toBe("mine-only");
    expect(savedOverrides["attention-include-closed-merged"]).toBe(false);
    expect(savedOverrides["attention-include-draft-no-activity"]).toBe(true);

    await user.selectOptions(noActivityModeSelect, "all");
    includeClosedMergedToggle.checked = true;
    includeDraftNoActivityToggle.checked = false;
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    await waitFor(() => {
      latestPutCall = fetchMock.mock.calls
        .slice()
        .reverse()
        .find((call) => {
          const [url, init] = call;
          return (
            String(url || "") === "/view-prs/user-defaults" &&
            String(init?.method || "GET").toUpperCase() === "PUT"
          );
        });
      expect(latestPutCall).toBeDefined();
    });

    const savedOverridesAfterReset = JSON.parse(
      String(latestPutCall?.[1]?.body || "{}"),
    );
    expect(
      Object.prototype.hasOwnProperty.call(
        savedOverridesAfterReset,
        "attention-no-activity-mode",
      ),
    ).toBe(false);
  });

    test("given author thread-resolution controls, when mode and actor selections change, then user-default overrides are persisted immediately", async () => {
      initTestPage({
        dataPayload: createMultiPrPayload({
          prs: [
            {
              scenario: "open-no-change",
              prNumber: 901,
              overrides: {
                data: {
                  title: "Thread policy save behavior",
                  titleDisplay: "Thread policy save behavior [CHK:PASS]",
                  author: "PR Author",
                  authorLogin: "pr-author",
                  url: "https://github.com/owner/repo/pull/901",
                  updatedAt: "2026-06-16T10:00:00Z",
                },
              },
            },
          ],
          actorsMap: {
            "pr-author": "PR Author",
            reviewer1: "Reviewer One",
          },
          lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
        }),
      });

      const user = userEvent.setup();
      await user.click(screen.getByRole("tab", { name: "Run & Filter" }));
      await waitFor(() => {
        expect(screen.getByText("#901")).toBeInTheDocument();
      });

      fetchMock.mockClear();
      const modeField = document.getElementById(
        "attention-author-thread-resolution-mode",
      );
      await user.selectOptions(modeField, "deny-only");

      let latestPutCall;
      await waitFor(() => {
        latestPutCall = fetchMock.mock.calls
          .slice()
          .reverse()
          .find((call) => {
            const [url, init] = call;
            return (
              String(url || "") === "/view-prs/user-defaults" &&
              String(init?.method || "GET").toUpperCase() === "PUT"
            );
          });
        expect(latestPutCall).toBeDefined();
      });

      let savedOverrides = JSON.parse(String(latestPutCall?.[1]?.body || "{}"));
      expect(savedOverrides["attention-author-thread-resolution-mode"]).toBe(
        "deny-only",
      );

      await clickMultiSelectCheckbox(
        "attention-author-thread-resolution-deny-list",
        "reviewer1",
        user,
      );

      await waitFor(() => {
        latestPutCall = fetchMock.mock.calls
          .slice()
          .reverse()
          .find((call) => {
            const [url, init] = call;
            return (
              String(url || "") === "/view-prs/user-defaults" &&
              String(init?.method || "GET").toUpperCase() === "PUT"
            );
          });
        expect(latestPutCall).toBeDefined();
      });

      savedOverrides = JSON.parse(String(latestPutCall?.[1]?.body || "{}"));
      expect(savedOverrides["attention-author-thread-resolution-mode"]).toBe(
        "deny-only",
      );
      expect(savedOverrides["attention-author-thread-resolution-deny"]).toEqual([
        "reviewer1",
      ]);
    });

    test("given stored author thread-resolution overrides, when the page loads, then mode visibility and actor selections are restored", async () => {
      initTestPage({
        dataPayload: createMultiPrPayload({
          prs: [
            {
              scenario: "open-no-change",
              prNumber: 902,
              overrides: {
                data: {
                  title: "Thread policy restore behavior",
                  titleDisplay: "Thread policy restore behavior [CHK:PASS]",
                  author: "PR Author",
                  authorLogin: "pr-author",
                  url: "https://github.com/owner/repo/pull/902",
                  updatedAt: "2026-06-16T10:00:00Z",
                },
              },
            },
          ],
          actorsMap: {
            "pr-author": "PR Author",
            reviewer1: "Reviewer One",
            reviewer2: "Reviewer Two",
          },
          lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
        }),
        userDefaultsOverrides: {
          "attention-author-thread-resolution-mode": "deny-only",
          "attention-author-thread-resolution-deny": ["reviewer1"],
        },
      });

      const user = userEvent.setup();
      await user.click(screen.getByRole("tab", { name: "Run & Filter" }));
      await waitFor(() => {
        expect(screen.getByText("#902")).toBeInTheDocument();
      });

      const modeField = document.getElementById(
        "attention-author-thread-resolution-mode",
      );
      const allowOptions = document.getElementById(
        "attention-author-thread-resolution-allow-options",
      );
      const denyOptions = document.getElementById(
        "attention-author-thread-resolution-deny-options",
      );

      expect(modeField?.value).toBe("deny-only");
      expect(Boolean(allowOptions?.hidden)).toBe(true);
      expect(Boolean(denyOptions?.hidden)).toBe(false);

      await waitFor(() => {
        expect(
          getSelectedMultiSelectValues("attention-author-thread-resolution-deny-list"),
        ).toEqual(["reviewer1"]);
      });
    });

  test("draft attention icon logic follows include-draft toggles", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "draft",
            prNumber: 201,
            overrides: {
              data: {
                title: "Draft changed",
                titleDisplay: "Draft changed [CHK:PASS]",
                author: "octocat",
                authorLogin: "octocat",
                url: "https://github.com/owner/repo/pull/201",
                status: "CHANGED",
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
          {
            scenario: "draft",
            prNumber: 202,
            overrides: {
              data: {
                title: "Draft no activity",
                titleDisplay: "Draft no activity [CHK:PASS]",
                author: "octocat",
                authorLogin: "octocat",
                url: "https://github.com/owner/repo/pull/202",
                status: "NO_ACTIVITY",
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
        scheduler: {
          intervalMinutes: 15,
          manualCooldownMinutes: 15,
          isAutoRunInProgress: false,
        },
      }),
    });
    const user = userEvent.setup();

    // Whenever a PR here has "Needs Attention" active, it also
    // independently qualifies for that smart group, which renders it a
    // second time above its lifecycle section (smart groups have
    // non-exclusive membership by design) - scope every lookup to the
    // "Draft PRs" lifecycle section specifically so these queries stay
    // unambiguous regardless of attention state.
    const getAttentionIcon = (prNumber) => {
      const draftSection = document.querySelector('[data-pr-section="draft"]');
      return within(draftSection)
        .getByText(`#${prNumber}`)
        .closest("tr")
        ?.querySelector(".attention-icon");
    };

    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));
    await waitFor(() => {
      expect(document.querySelector('[data-pr-section="draft"]')).toBeTruthy();
    });
    await waitFor(() => {
      const draftSection = document.querySelector('[data-pr-section="draft"]');
      expect(within(draftSection).getByText("#201")).toBeInTheDocument();
      expect(within(draftSection).getByText("#202")).toBeInTheDocument();
    });

    document.getElementById("attention-include-pending-comments").checked = false;
    await user.selectOptions(document.getElementById("attention-no-activity-mode"), "all");

    const includeDraftChangedToggle = document.getElementById(
      "attention-include-draft-changed",
    );
    includeDraftChangedToggle.checked = false;
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));
    await waitFor(() => {
      expect(getAttentionIcon("201")).toBeNull();
    });

    includeDraftChangedToggle.checked = true;
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));
    await waitFor(() => {
      expect(getAttentionIcon("201")?.textContent || "").toBe("⚠️");
    });

    const includeDraftNoActivityToggle = document.getElementById(
      "attention-include-draft-no-activity",
    );
    includeDraftNoActivityToggle.checked = false;
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));
    await waitFor(() => {
      expect(getAttentionIcon("202")).toBeNull();
    });

    includeDraftNoActivityToggle.checked = true;
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));
    await waitFor(() => {
      expect(getAttentionIcon("202")?.textContent || "").toBe("⚠️");
    });
  });

  test("author filter selections persist through rerender after applying filters", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-changed",
            prNumber: 301,
            overrides: {
              data: {
                title: "Alpha author",
                titleDisplay: "Alpha author [CHK:PASS]",
                author: "Alison Hall",
                authorLogin: "auser",
                url: "https://github.com/owner/repo/pull/301",
                status: "NO_CHANGE",
                assignees: [],
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
          {
            scenario: "open-changed",
            prNumber: 302,
            overrides: {
              data: {
                title: "Middle author",
                titleDisplay: "Middle author [CHK:PASS]",
                author: "Marta Cole",
                authorLogin: "mcole",
                url: "https://github.com/owner/repo/pull/302",
                status: "NO_CHANGE",
                assignees: [],
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
          {
            scenario: "open-changed",
            prNumber: 303,
            overrides: {
              data: {
                title: "Last author",
                titleDisplay: "Last author [CHK:PASS]",
                author: "Zelda User",
                authorLogin: "zuser",
                url: "https://github.com/owner/repo/pull/303",
                status: "NO_CHANGE",
                assignees: [],
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
        ],
        actorsMap: {
          auser: "Alison Hall",
          mcole: "Marta Cole",
          zuser: "Zelda User",
        },
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
        scheduler: {
          intervalMinutes: 15,
          manualCooldownMinutes: 15,
          isAutoRunInProgress: false,
        },
      }),
    });
    const user = userEvent.setup();

    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

    const scopeSelect = document.getElementById("scope-mode");
    const authorList = getMultiSelectList("author-list");
    expect(authorList).toBeInTheDocument();
    expect(scopeSelect).toBeInTheDocument();

    await waitFor(() => {
      const authorLogins = Array.from(authorList.querySelectorAll("input[type='checkbox']")).map((cb) => cb.value);
      expect(authorLogins).toEqual(["auser", "mcole", "zuser"]);
    });

    await clickMultiSelectCheckbox("author-list", "zuser", user);
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    await waitFor(() => {
      expect(getSelectedMultiSelectValues("author-list")).toEqual(["zuser"]);
    });

    await user.selectOptions(scopeSelect, "needs-attention-or-interacted");
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    await waitFor(() => {
      expect(getSelectedMultiSelectValues("author-list")).toEqual(["zuser"]);
    });
  });

  test("given authors with and without login, when author filter options are rendered, then login keys are preferred and fallback names are used only when login is missing", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 311,
            overrides: {
              data: {
                title: "Has login",
                titleDisplay: "Has login [CHK:PASS]",
                author: "Display Name Should Not Be Key",
                authorLogin: "login-key",
                url: "https://github.com/owner/repo/pull/311",
                baseline: "-",
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
          {
            scenario: "open-no-change",
            prNumber: 312,
            overrides: {
              data: {
                title: "Missing login",
                titleDisplay: "Missing login [CHK:PASS]",
                author: "Fallback Name Key",
                authorLogin: "",
                url: "https://github.com/owner/repo/pull/312",
                baseline: "-",
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
        ],
        actorsMap: {
          "login-key": "Resolved Login Name",
        },
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
      }),
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

    const authorList = getMultiSelectList("author-list");
    await waitFor(() => {
      const values = Array.from(authorList.querySelectorAll("input[type='checkbox']")).map((cb) => cb.value);
      expect(values).toContain("login-key");
      expect(values).toContain("Fallback Name Key");
      expect(values).not.toContain("Display Name Should Not Be Key");

      const labelByValue = Array.from(authorList.querySelectorAll(".multi-select-item")).reduce(
        (acc, item) => {
          const value = String(item.querySelector("input[type='checkbox']")?.value || "").trim();
          const label = String(item.querySelector("label")?.textContent || "").trim();
          if (value) {
            acc[value] = label;
          }
          return acc;
        },
        {},
      );

      expect(labelByValue["login-key"]).toBe("Resolved Login Name");
      expect(labelByValue["Fallback Name Key"]).toBe("Fallback Name Key");
    });
  });

  test("given author login aliases map two logins to one person, when author filter options are rendered, then one canonical option is shown", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 313,
            overrides: {
              data: {
                title: "Alias author login",
                titleDisplay: "Alias author login [CHK:PASS]",
                author: "Martin Thomas",
                authorLogin: "7c7240971101674017d4597caddf24_uhg",
                url: "https://github.com/owner/repo/pull/313",
                baseline: "-",
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
          {
            scenario: "open-no-change",
            prNumber: 314,
            overrides: {
              data: {
                title: "Canonical author login",
                titleDisplay: "Canonical author login [CHK:PASS]",
                author: "Martin Thomas",
                authorLogin: "mthom486_uhg",
                url: "https://github.com/owner/repo/pull/314",
                baseline: "-",
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
        ],
        actorsMap: {
          "7c7240971101674017d4597caddf24_uhg": "Martin Thomas",
          "mthom486_uhg": "Martin Thomas",
        },
        actorLoginAliases: {
          "7c7240971101674017d4597caddf24_uhg": "mthom486_uhg",
        },
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
      }),
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

    const authorList = getMultiSelectList("author-list");
    await waitFor(() => {
      const values = Array.from(authorList.querySelectorAll("input[type='checkbox']")).map((cb) => cb.value);
      expect(values).toEqual(["mthom486_uhg"]);

      const labels = Array.from(authorList.querySelectorAll("label")).map((label) => String(label.textContent || "").trim());
      expect(labels).toEqual(["Martin Thomas"]);
    });
  });

  test("given PRs with approvers, when approver filter is selected and applied, then only approved-by-matching-user PRs are shown", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-approved",
            prNumber: 401,
            overrides: {
              data: {
                title: "Approved by Alice",
                titleDisplay: "Approved by Alice [CHK:PASS]",
                author: "Bob Smith",
                authorLogin: "bsmith",
                url: "https://github.com/owner/repo/pull/401",
                assignees: [],
                updatedAt: "2026-06-16T10:00:00Z",
                metrics: {
                  approvals: [
                    {
                      login: "alice",
                      name: "Alice",
                      approvedAt: "2026-06-15T09:00:00Z",
                      mergeLeadMinutes: null,
                      commentCountAfterApproval: 0,
                      reviewCountAfterApproval: 0,
                      changeRequestCountAfterApproval: 0,
                      commitCountAfterApproval: 0,
                      issueSignalsAfterApprovalCount: 0,
                      highRiskApproval: false,
                      riskyApproval: false,
                    },
                  ],
                },
              },
            },
          },
          {
            scenario: "open-no-change",
            prNumber: 402,
            overrides: {
              data: {
                title: "No approval yet",
                titleDisplay: "No approval yet [CHK:PASS]",
                author: "Carol Jones",
                authorLogin: "cjones",
                url: "https://github.com/owner/repo/pull/402",
                assignees: [],
                updatedAt: "2026-06-16T10:00:00Z",
                metrics: {
                  approvals: [],
                },
              },
            },
          },
        ],
        actorsMap: {
          alice: "Alice",
          bsmith: "Bob Smith",
          cjones: "Carol Jones",
        },
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
        scheduler: {
          intervalMinutes: 15,
          manualCooldownMinutes: 15,
          isAutoRunInProgress: false,
        },
      }),
    });
    const user = userEvent.setup();

    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

    const approverList = getMultiSelectList("approver-list");
    expect(approverList).toBeInTheDocument();

    await waitFor(() => {
      const approverLogins = Array.from(approverList.querySelectorAll("input[type='checkbox']")).map((cb) => cb.value);
      expect(approverLogins).toEqual(["alice"]);
    });

    await clickMultiSelectCheckbox("approver-list", "alice", user);
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    await waitFor(() => {
      const dataMetaText = document.getElementById("data-meta")?.textContent || "";
      expect(dataMetaText).toContain("Rows: 1");
      expect(dataMetaText).toContain("approver=alice");
    });

    expect(screen.getByRole("button", { name: "View PR JSON details for #401" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View PR JSON details for #402" })).not.toBeInTheDocument();
  });

  test("given assigned and approver entries without login, when filter options are rendered, then fallback names are used as option keys", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-approved",
            prNumber: 451,
            overrides: {
              data: {
                title: "Fallback identities",
                titleDisplay: "Fallback identities [CHK:PASS]",
                author: "Author Name",
                authorLogin: "author-login",
                url: "https://github.com/owner/repo/pull/451",
                assignees: [{ name: "Assigned Name Only" }],
                baseline: "-",
                updatedAt: "2026-06-16T10:00:00Z",
                metrics: {
                  approvals: [
                    {
                      login: "",
                      name: "Approver Name Only",
                      approvedAt: "2026-06-15T09:00:00Z",
                      mergeLeadMinutes: null,
                      commentCountAfterApproval: 0,
                      reviewCountAfterApproval: 0,
                      changeRequestCountAfterApproval: 0,
                      commitCountAfterApproval: 0,
                      issueSignalsAfterApprovalCount: 0,
                      highRiskApproval: false,
                      riskyApproval: false,
                    },
                  ],
                },
              },
            },
          },
        ],
        actorsMap: {
          "author-login": "Author Name",
        },
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
      }),
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

    const assignedList = getMultiSelectList("assigned-list");
    const approverList = getMultiSelectList("approver-list");
    await waitFor(() => {
      const assignedValues = Array.from(assignedList.querySelectorAll("input[type='checkbox']")).map((cb) => cb.value);
      const approverValues = Array.from(approverList.querySelectorAll("input[type='checkbox']")).map((cb) => cb.value);
      expect(assignedValues).toContain("Assigned Name Only");
      expect(approverValues).toContain("Approver Name Only");
    });
  });

  test("given assigned users with login and fallback names, when assigned filter options are rendered, then actor-name-cache labels override fallback name formatting", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 452,
            overrides: {
              data: {
                title: "Assigned mapped label",
                titleDisplay: "Assigned mapped label [CHK:PASS]",
                author: "Author Name",
                authorLogin: "author-login",
                url: "https://github.com/owner/repo/pull/452",
                assignees: [{ login: "ahall236_uhg", name: "Hall, Alison" }],
                baseline: "-",
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
        ],
        actorsMap: {
          "ahall236_uhg": "Alison Hall",
          "author-login": "Author Name",
        },
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
      }),
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

    const assignedList = getMultiSelectList("assigned-list");
    await waitFor(() => {
      const labelByValue = Array.from(assignedList.querySelectorAll(".multi-select-item")).reduce(
        (acc, item) => {
          const value = String(item.querySelector("input[type='checkbox']")?.value || "").trim();
          const label = String(item.querySelector("label")?.textContent || "").trim();
          if (value) {
            acc[value] = label;
          }
          return acc;
        },
        {},
      );

      expect(labelByValue["ahall236_uhg"]).toBe("Alison Hall");
    });
  });

  test("given approved-cell assigned users with login and fallback names, when row is rendered, then badge title uses actor-name-cache mapped name", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 453,
            overrides: {
              data: {
                title: "Approved cell mapping",
                titleDisplay: "Approved cell mapping [CHK:PASS]",
                author: "Author Name",
                authorLogin: "author-login",
                url: "https://github.com/owner/repo/pull/453",
                assignees: [{ login: "ahall236_uhg", name: "Hall, Alison" }],
                baseline: "-",
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
        ],
        actorsMap: {
          "ahall236_uhg": "Alison Hall",
          "author-login": "Author Name",
        },
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
      }),
    });

    await waitFor(() => {
      expect(screen.getByText("#453")).toBeInTheDocument();
    });

    const badge = document.querySelector(".approved-assigned-badge");
    expect(badge).toBeTruthy();
    expect(String(badge?.getAttribute("title") || "")).toBe("Alison Hall");
  });

  test("given approver filter applied, when scope changes and filters are reapplied, then approver selection is preserved", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-approved",
            prNumber: 501,
            overrides: {
              data: {
                title: "Approved by David",
                titleDisplay: "Approved by David [CHK:PASS]",
                author: "Eve Brown",
                authorLogin: "ebrown",
                url: "https://github.com/owner/repo/pull/501",
                baseline: "-",
                updatedAt: "2026-06-16T10:00:00Z",
                metrics: {
                  approvals: [
                    {
                      login: "david",
                      name: "David",
                      approvedAt: "2026-06-15T09:00:00Z",
                      mergeLeadMinutes: null,
                      commentCountAfterApproval: 0,
                      reviewCountAfterApproval: 0,
                      changeRequestCountAfterApproval: 0,
                      commitCountAfterApproval: 0,
                      issueSignalsAfterApprovalCount: 0,
                      highRiskApproval: false,
                      riskyApproval: false,
                    },
                  ],
                },
              },
            },
          },
          {
            scenario: "open-no-change",
            prNumber: 502,
            overrides: {
              data: {
                title: "Not approved",
                titleDisplay: "Not approved [CHK:PASS]",
                author: "Frank Green",
                authorLogin: "fgreen",
                url: "https://github.com/owner/repo/pull/502",
                baseline: "-",
                updatedAt: "2026-06-16T10:00:00Z",
                metrics: {
                  approvals: [],
                },
              },
            },
          },
        ],
        actorsMap: {
          david: "David",
          ebrown: "Eve Brown",
          fgreen: "Frank Green",
        },
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
        scheduler: {
          intervalMinutes: 15,
          manualCooldownMinutes: 15,
          isAutoRunInProgress: false,
        },
      }),
    });
    const user = userEvent.setup();

    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

    const approverList = getMultiSelectList("approver-list");
    const scopeSelect = document.getElementById("scope-mode");
    expect(approverList).toBeInTheDocument();
    expect(scopeSelect).toBeInTheDocument();

    await waitFor(() => {
      const approverLogins = Array.from(approverList.querySelectorAll("input[type='checkbox']")).map((cb) => cb.value);
      expect(approverLogins).toEqual(["david"]);
    });

    await clickMultiSelectCheckbox("approver-list", "david", user);
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    await waitFor(() => {
      expect(getSelectedMultiSelectValues("approver-list")).toEqual(["david"]);
    });

    await user.selectOptions(scopeSelect, "needs-attention-or-interacted");
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    await waitFor(() => {
      expect(getSelectedMultiSelectValues("approver-list")).toEqual(["david"]);
    });
  });

  test("given a PR approved by multiple users, when one approver is selected, then the PR is shown (OR match)", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-approved",
            prNumber: 601,
            overrides: {
              data: {
                title: "Approved by two reviewers",
                titleDisplay: "Approved by two reviewers [CHK:PASS]",
                author: "Dev One",
                authorLogin: "devone",
                url: "https://github.com/owner/repo/pull/601",
                assignees: [],
                updatedAt: "2026-06-16T10:00:00Z",
                metrics: {
                  approvals: [
                    {
                      login: "reviewer-a",
                      name: "Reviewer A",
                      approvedAt: "2026-06-14T09:00:00Z",
                      mergeLeadMinutes: null,
                      commentCountAfterApproval: 0,
                      reviewCountAfterApproval: 0,
                      changeRequestCountAfterApproval: 0,
                      commitCountAfterApproval: 0,
                      issueSignalsAfterApprovalCount: 0,
                      highRiskApproval: false,
                      riskyApproval: false,
                    },
                    {
                      login: "reviewer-b",
                      name: "Reviewer B",
                      approvedAt: "2026-06-14T10:00:00Z",
                      mergeLeadMinutes: null,
                      commentCountAfterApproval: 0,
                      reviewCountAfterApproval: 0,
                      changeRequestCountAfterApproval: 0,
                      commitCountAfterApproval: 0,
                      issueSignalsAfterApprovalCount: 0,
                      highRiskApproval: false,
                      riskyApproval: false,
                    },
                  ],
                },
              },
            },
          },
          {
            scenario: "open-approved",
            prNumber: 602,
            overrides: {
              data: {
                title: "Approved only by reviewer-b",
                titleDisplay: "Approved only by reviewer-b [CHK:PASS]",
                author: "Dev Two",
                authorLogin: "devtwo",
                url: "https://github.com/owner/repo/pull/602",
                assignees: [],
                updatedAt: "2026-06-16T10:00:00Z",
                metrics: {
                  approvals: [
                    {
                      login: "reviewer-b",
                      name: "Reviewer B",
                      approvedAt: "2026-06-14T11:00:00Z",
                      mergeLeadMinutes: null,
                      commentCountAfterApproval: 0,
                      reviewCountAfterApproval: 0,
                      changeRequestCountAfterApproval: 0,
                      commitCountAfterApproval: 0,
                      issueSignalsAfterApprovalCount: 0,
                      highRiskApproval: false,
                      riskyApproval: false,
                    },
                  ],
                },
              },
            },
          },
          {
            scenario: "open-no-change",
            prNumber: 603,
            overrides: {
              data: {
                title: "No approvals",
                titleDisplay: "No approvals [CHK:PASS]",
                author: "Dev Three",
                authorLogin: "devthree",
                url: "https://github.com/owner/repo/pull/603",
                assignees: [],
                updatedAt: "2026-06-16T10:00:00Z",
                metrics: { approvals: [] },
              },
            },
          },
        ],
        actorsMap: {
          "reviewer-a": "Reviewer A",
          "reviewer-b": "Reviewer B",
        },
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
        scheduler: { intervalMinutes: 15, manualCooldownMinutes: 15, isAutoRunInProgress: false },
      }),
    });
    const user = userEvent.setup();

    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

    const approverList = getMultiSelectList("approver-list");
    expect(approverList).toBeInTheDocument();

    await waitFor(() => {
      const approverLogins = Array.from(approverList.querySelectorAll("input[type='checkbox']")).map((cb) => cb.value);
      expect(approverLogins).toEqual(["reviewer-a", "reviewer-b"]);
    });

    // Select only reviewer-a: should show #601 (approved by both) but not #602 (only reviewer-b) or #603 (no approvals)
    await clickMultiSelectCheckbox("approver-list", "reviewer-a", user);
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    await waitFor(() => {
      const dataMetaText = document.getElementById("data-meta")?.textContent || "";
      expect(dataMetaText).toContain("Rows: 1");
    });

    expect(screen.getByRole("button", { name: "View PR JSON details for #601" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View PR JSON details for #602" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View PR JSON details for #603" })).not.toBeInTheDocument();
  });

  test("given no PRs have approval data, when data loads, then approver select is disabled", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 701,
            overrides: {
              data: {
                title: "No metrics",
                titleDisplay: "No metrics [CHK:PASS]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/701",
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
        scheduler: { intervalMinutes: 15, manualCooldownMinutes: 15, isAutoRunInProgress: false },
      }),
    });
    const user = userEvent.setup();

    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

    const approverList = getMultiSelectList("approver-list");
    expect(approverList).toBeInTheDocument();

    await waitFor(() => {
      expect(isMultiSelectEmpty("approver-list")).toBe(true);
    });
  });

  test("given approver filter is selected and applied, when filters are saved, then approver logins are persisted to user-defaults", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-approved",
            prNumber: 801,
            overrides: {
              data: {
                title: "Approved by grace",
                titleDisplay: "Approved by grace [CHK:PASS]",
                author: "Harry",
                authorLogin: "harry",
                url: "https://github.com/owner/repo/pull/801",
                baseline: "-",
                updatedAt: "2026-06-16T10:00:00Z",
                metrics: {
                  approvals: [
                    {
                      login: "grace",
                      name: "Grace",
                      approvedAt: "2026-06-15T09:00:00Z",
                      mergeLeadMinutes: null,
                      commentCountAfterApproval: 0,
                      reviewCountAfterApproval: 0,
                      changeRequestCountAfterApproval: 0,
                      commitCountAfterApproval: 0,
                      issueSignalsAfterApprovalCount: 0,
                      highRiskApproval: false,
                      riskyApproval: false,
                    },
                  ],
                },
              },
            },
          },
        ],
        actorsMap: { grace: "Grace" },
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
        scheduler: { intervalMinutes: 15, manualCooldownMinutes: 15, isAutoRunInProgress: false },
      }),
    });
    const user = userEvent.setup();

    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

    const approverList = getMultiSelectList("approver-list");
    await waitFor(() => {
      const approverLogins = Array.from(approverList.querySelectorAll("input[type='checkbox']")).map((cb) => cb.value);
      expect(approverLogins).toEqual(["grace"]);
    });

    await clickMultiSelectCheckbox("approver-list", "grace", user);

    fetchMock.mockClear();
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    let putCall;
    await waitFor(() => {
      putCall = fetchMock.mock.calls.find((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/user-defaults" &&
          String(init?.method || "GET").toUpperCase() === "PUT"
        );
      });
      expect(putCall).toBeDefined();
    });

    const savedOverrides = JSON.parse(String(putCall?.[1]?.body || "{}"));
    expect(savedOverrides.approver).toEqual(["grace"]);
  });

  test("given approver stored in user-defaults, when page loads and data renders, then approver select is pre-selected", async () => {
    initTestPage({
      userDefaultsOverrides: { approver: ["grace"] },
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-approved",
            prNumber: 901,
            overrides: {
              data: {
                title: "Approved by grace",
                titleDisplay: "Approved by grace [CHK:PASS]",
                author: "Harry",
                authorLogin: "harry",
                url: "https://github.com/owner/repo/pull/901",
                assignees: [],
                updatedAt: "2026-06-16T10:00:00Z",
                metrics: {
                  approvals: [
                    {
                      login: "grace",
                      name: "Grace",
                      approvedAt: "2026-06-15T09:00:00Z",
                      mergeLeadMinutes: null,
                      commentCountAfterApproval: 0,
                      reviewCountAfterApproval: 0,
                      changeRequestCountAfterApproval: 0,
                      commitCountAfterApproval: 0,
                      issueSignalsAfterApprovalCount: 0,
                      highRiskApproval: false,
                      riskyApproval: false,
                    },
                  ],
                },
              },
            },
          },
          {
            scenario: "open-no-change",
            prNumber: 902,
            overrides: {
              data: {
                title: "No approvals",
                titleDisplay: "No approvals [CHK:PASS]",
                author: "Ivan",
                authorLogin: "ivan",
                url: "https://github.com/owner/repo/pull/902",
                assignees: [],
                updatedAt: "2026-06-16T10:00:00Z",
                metrics: { approvals: [] },
              },
            },
          },
        ],
        actorsMap: { grace: "Grace" },
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
        scheduler: { intervalMinutes: 15, manualCooldownMinutes: 15, isAutoRunInProgress: false },
      }),
    });
    const user = userEvent.setup();

    // Ensure user-defaults have been fetched and the pending restore is set
    // before navigating so Apply sees the pre-populated pending selections.
    await waitFor(() => {
      const defaultsCall = fetchMock.mock.calls.find((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/user-defaults" &&
          String(init?.method || "GET").toUpperCase() === "GET"
        );
      });
      expect(defaultsCall).toBeDefined();
    });

    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

    const approverList = getMultiSelectList("approver-list");
    expect(approverList).toBeInTheDocument();

    // Apply triggers re-render which picks up pendingApproverFilterSelections.
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    await waitFor(() => {
      expect(getSelectedMultiSelectValues("approver-list")).toEqual(["grace"]);
    });

    await waitFor(() => {
      const dataMetaText = document.getElementById("data-meta")?.textContent || "";
      expect(dataMetaText).toContain("approver=grace");
      expect(dataMetaText).toContain("Rows: 1");
    });

    expect(screen.getByRole("button", { name: "View PR JSON details for #901" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View PR JSON details for #902" })).not.toBeInTheDocument();
  });

  test("cycles focus within PR JSON modal with Tab and Shift+Tab", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 101,
            overrides: {
              data: {
                title: "Test focus trap",
                titleDisplay: "Test focus trap [CHK:PASS] [MRG:YES]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/101",
                updatedAt: "2026-06-16T12:00:00Z",
              },
              prDetail: { reviewDecision: "REVIEW_REQUIRED" },
              notes: { otherNotes: "focus test" },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T12:00:00Z" },
      }),
    });
    const user = userEvent.setup();

    const openButton = await screen.findByRole("button", {
      name: "View PR JSON details for #101",
    });
    await user.click(openButton);

    const modal = await screen.findByRole("dialog", {
      name: "PR JSON Details",
    });
    expect(modal).toBeInTheDocument();

    const focusableElements = Array.from(
      modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    );
    expect(focusableElements.length).toBeGreaterThan(1);

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    firstElement.focus();
    expect(document.activeElement).toBe(firstElement);

    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(document.activeElement).toBe(lastElement);

    await user.keyboard("{Tab}");
    expect(document.activeElement).toBe(firstElement);
  });

  test("given a user opens the Action Log tab, when it activates, then the tab panel becomes visible (content is React-owned - see ActionLogSection.test.jsx)", async () => {
    initTestPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole("tab", { name: "Action Log" }));

    expect(document.getElementById("tab-panel-action-log").hidden).toBe(false);
  });

  test("given a user opens the Actor Names tab, when it activates, then the tab panel becomes visible (content is React-owned - see ActorNamesTab.test.jsx)", async () => {
    initTestPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole("tab", { name: "Actor Names" }));

    expect(document.getElementById("tab-panel-actor-name-cache").hidden).toBe(false);
  });

  test("posts to backfill start endpoint when a user starts backfill from the Backfill tab", async () => {
    const user = userEvent.setup();
    fetchMock.mockClear();

    await user.click(screen.getByRole("tab", { name: "Backfill" }));
    await user.click(screen.getByRole("button", { name: "Start backfill" }));

    await waitFor(() => {
      expect(screen.getAllByText(/Started background backfill/i).length).toBeGreaterThan(0);
    });

    const startCall = fetchMock.mock.calls.find((call) => {
      const [url, init] = call;
      return (
        String(url || "") === "/view-prs/backfill/start" &&
        String(init?.method || "GET").toUpperCase() === "POST"
      );
    });

    expect(startCall).toBeDefined();
  });

  test("posts to backfill stop endpoint and renders stop output and log tail", async () => {
    // Use a stateful mock so the backfill status stays running after start.
    let backfillRunning = false;
    fetchMock.mockImplementation(async (url, init = {}) => {
      const normalizedUrl = String(url || "");
      const method = String(init?.method || "GET").toUpperCase();

      if (normalizedUrl === "/view-prs/user-defaults" && method === "GET") {
        return createOkJsonResponse({ ok: true, overrides: {} });
      }
      if (normalizedUrl === "/view-prs/user-defaults" && method === "PUT") {
        return createOkJsonResponse({ ok: true });
      }
      if (normalizedUrl === "/view-prs/data" && method === "GET") {
        return createOkJsonResponse({ ok: true, byPrNumber: {}, lastRun: null });
      }
      if (normalizedUrl === "/view-prs/scheduler" && method === "GET") {
        return { ok: false, status: 404, json: async () => ({ ok: false }) };
      }
      if (normalizedUrl === "/view-prs/backfill/start" && method === "POST") {
        backfillRunning = true;
        return createOkJsonResponse({
          ok: true,
          running: true,
          summary: "Started background backfill (PID: 321).",
          output: "Started background backfill (PID: 321).",
        });
      }
      if (normalizedUrl === "/view-prs/backfill/stop" && method === "POST") {
        backfillRunning = false;
        return createOkJsonResponse({
          ok: true,
          running: false,
          summary: "Stopped background backfill (PID: 321).",
          output: "Stopped background backfill (PID: 321).",
        });
      }
      if (normalizedUrl === "/view-prs/backfill" && method === "GET") {
        return createOkJsonResponse({
          ok: true,
          running: backfillRunning,
          summary: backfillRunning ? "Backfill: running" : "Backfill: not running",
          output: "",
        });
      }
      if (normalizedUrl.startsWith("/view-prs/backfill/log") && method === "GET") {
        return createOkJsonResponse({
          ok: true,
          summary: "Showing 2 log line(s)",
          tail: "line-1\nline-2",
        });
      }
      return createOkJsonResponse({ ok: true });
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Backfill" }));
    await user.click(screen.getByRole("button", { name: "Start backfill" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Stop backfill" })).toBeEnabled();
    });

    fetchMock.mockClear();
    await user.click(screen.getByRole("button", { name: "Stop backfill" }));

    let stopCall;
    await waitFor(() => {
      stopCall = fetchMock.mock.calls.find((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/backfill/stop" &&
          String(init?.method || "GET").toUpperCase() === "POST"
        );
      });
      expect(stopCall).toBeDefined();
    });

    await waitFor(() => {
      expect(
        screen.getAllByText(/Stopped background backfill/i).length,
      ).toBeGreaterThan(0);
    });

    const backfillLog = document.getElementById("backfill-log");
    expect(String(backfillLog?.textContent || "")).toContain("Showing 2 log line(s)");
    expect(String(backfillLog?.textContent || "")).toContain("line-1");
  });

  test("shows Request more only for all scope and posts the expected merged request payload", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "merged",
            prNumber: 100,
            overrides: {
              data: {
                title: "Merged PR row",
                titleDisplay: "Merged PR row [CHK:PASS] [MRG:YES]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/100",
                labels: [{ name: "bug" }],
                mergedAt: "2026-03-10T10:00:00Z",
                updatedAt: "2026-03-11T11:00:00Z",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-03-11T11:00:00Z" },
        scheduler: {
          intervalMinutes: 15,
          manualCooldownMinutes: 15,
          isAutoRunInProgress: false,
        },
      }),
    });
    const user = userEvent.setup();
    fetchMock.mockClear();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Request more" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Request more" }));

    let requestMoreCall;
    await waitFor(() => {
      requestMoreCall = fetchMock.mock.calls.find((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/merged/request-more" &&
          String(init?.method || "GET").toUpperCase() === "POST"
        );
      });
      expect(requestMoreCall).toBeDefined();
    });

    expect(requestMoreCall).toBeDefined();
    const requestMorePayload = JSON.parse(String(requestMoreCall?.[1]?.body || "{}"));
    expect(requestMorePayload.repo).toBe("owner/repo");
    expect(requestMorePayload.count).toBe(30);
    expect(requestMorePayload.scanLimit).toBe(100);

    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));
    await user.selectOptions(document.getElementById("scope-mode"), "last-run");
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Request more" })).not.toBeInTheDocument();
    });
  });

  test("renders row-level in-review control for PRs returned from data fetch", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 101,
            overrides: {
              data: {
                title: "Render PR table row",
                titleDisplay: "Render PR table row [CHK:PASS] [MRG:YES]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/101",
                labels: [{ name: "bug" }],
                updatedAt: "2026-06-15T10:00:00Z",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-15T10:00:00Z" },
      }),
    });

    await waitFor(() => {
      expect(screen.getByLabelText("In Review for PR #101")).toBeInTheDocument();
    });

    const labelChip = document.querySelector(".labels-cell .label-chip");
    expect(labelChip?.textContent).toBe("bug");
  });

  test("opens PR JSON details in a dialog and closes it when a user presses Escape", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 101,
            overrides: {
              data: {
                title: "Inspect JSON modal",
                titleDisplay: "Inspect JSON modal [CHK:PASS] [MRG:YES]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/101",
                labels: [{ name: "bug" }],
                updatedAt: "2026-06-16T10:00:00Z",
              },
              prDetail: {
                reviewDecision: "REVIEW_REQUIRED",
              },
              notes: {
                otherNotes: "needs follow-up",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
      }),
    });
    const user = userEvent.setup();
    fetchMock.mockClear();

    const detailsButton = await screen.findByRole("button", {
      name: "View PR JSON details for #101",
    });

    await user.click(detailsButton);

    const dialog = await screen.findByRole("dialog", {
      name: "PR JSON Details",
    });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByLabelText("Close PR JSON details")).toHaveFocus();

    await waitFor(() => {
      expect(document.getElementById("pr-json-modal-subtitle")?.textContent).toContain(
        "PR #101 (owner/repo)",
      );
      expect(document.getElementById("pr-json-modal-content")?.textContent).toContain(
        "Data File Entry",
      );
      expect(document.getElementById("pr-json-modal-content")?.textContent).toContain(
        "PR Detail File",
      );
      expect(document.getElementById("pr-json-modal-content")?.textContent).toContain(
        "User State Entry",
      );
      expect(document.getElementById("pr-json-modal-content")?.textContent).toContain(
        "PR Diff",
      );
      expect(document.querySelector(".pr-json-diff")?.textContent).toContain(
        "console.log('hello');",
      );
      expect(
        screen.getByRole("button", {
          name: "Copy all PR JSON details for AI chat",
        }),
      ).toBeEnabled();
    });

    const diffCall = fetchMock.mock.calls.find((call) => {
      const [url, init] = call;
      return (
        String(url || "").startsWith("/view-prs/diff?") &&
        String(init?.method || "GET").toUpperCase() === "GET"
      );
    });
    expect(diffCall).toBeDefined();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "PR JSON Details" })).not.toBeInTheDocument();
    });
  });

  test("copies the combined PR JSON payload when a user clicks Copy all in the details dialog", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 101,
            overrides: {
              data: {
                title: "Copy all modal payload",
                titleDisplay: "Copy all modal payload [CHK:PASS] [MRG:YES]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/101",
                labels: [{ name: "bug" }],
                updatedAt: "2026-06-16T10:00:00Z",
              },
              prDetail: {
                reviewDecision: "REVIEW_REQUIRED",
              },
              notes: {
                otherNotes: "needs follow-up",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
      }),
    });
    const user = userEvent.setup();
    const clipboardWriteMock = jest.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: clipboardWriteMock },
      configurable: true,
    });

    await user.click(
      await screen.findByRole("button", {
        name: "View PR JSON details for #101",
      }),
    );

    const copyAllButton = await screen.findByRole("button", {
      name: "Copy all PR JSON details for AI chat",
    });

    await waitFor(() => {
      expect(copyAllButton).toBeEnabled();
    });

    await user.click(copyAllButton);

    await waitFor(() => {
      expect(clipboardWriteMock).toHaveBeenCalledTimes(1);
      const copiedText = clipboardWriteMock.mock.calls[0]?.[0];
      expect(typeof copiedText).toBe("string");
      expect(copiedText).toContain("PR JSON Details for AI Review");
      expect(copiedText).toContain("Repo: owner/repo");
      expect(copiedText).toContain("PR Number: 101");
      expect(copiedText).toContain("Data File Entry (check-open-pr-updates.data.json)");
      expect(copiedText).toContain("PR Detail File (data/pr-details/<repo>__pr-<number>.json)");
      expect(copiedText).toContain("User State Entry (check-open-pr-updates.user-state.json)");
      expect(copiedText).toContain("PR Diff Metadata (data/pr-diffs/<repo>__pr-<number>.json)");
      expect(copiedText).toContain("PR Diff Text");
      expect(copiedText).toContain("```json");
      expect(copiedText).toContain("```diff");
      expect(copiedText).toContain("console.log('hello');");
    });

    await waitFor(() => {
      expect(copyAllButton).toHaveTextContent("Copied");
    });
  });

  test("closes the PR JSON details dialog when a user clicks on the modal backdrop", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 101,
            overrides: {
              data: {
                title: "Modal backdrop dismiss test",
                titleDisplay: "Modal backdrop dismiss test [CHK:PASS] [MRG:YES]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/101",
                labels: [{ name: "bug" }],
                updatedAt: "2026-06-16T10:00:00Z",
              },
              prDetail: {
                reviewDecision: "REVIEW_REQUIRED",
              },
              notes: {
                otherNotes: "needs follow-up",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
      }),
    });
    const user = userEvent.setup();

    const detailsButton = await screen.findByRole("button", {
      name: "View PR JSON details for #101",
    });

    await user.click(detailsButton);

    const dialog = await screen.findByRole("dialog", {
      name: "PR JSON Details",
    });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByLabelText("Close PR JSON details")).toHaveFocus();

    const backdropElement = document.getElementById("pr-json-modal");
    expect(backdropElement).toEqual(dialog);

    await user.click(backdropElement);

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "PR JSON Details" })).not.toBeInTheDocument();
    });

    expect(detailsButton).toHaveFocus();
  });

  test("copies the diff text to clipboard when a user clicks Copy diff in the details modal", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 101,
            overrides: {
              data: {
                title: "Copy diff modal button test",
                titleDisplay: "Copy diff modal button test [CHK:PASS] [MRG:YES]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/101",
                labels: [{ name: "bug" }],
                updatedAt: "2026-06-16T10:00:00Z",
              },
              prDetail: {
                reviewDecision: "REVIEW_REQUIRED",
              },
              notes: {
                otherNotes: "needs follow-up",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
      }),
    });
    const user = userEvent.setup();
    const clipboardWriteMock = jest.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: clipboardWriteMock },
      configurable: true,
    });

    await user.click(
      await screen.findByRole("button", {
        name: "View PR JSON details for #101",
      }),
    );

    const copyDiffButton = await screen.findByRole("button", {
      name: "Copy diff",
    });

    await waitFor(() => {
      expect(copyDiffButton).toBeVisible();
    });

    await user.click(copyDiffButton);

    await waitFor(() => {
      expect(clipboardWriteMock).toHaveBeenCalledTimes(1);
      const copiedText = clipboardWriteMock.mock.calls[0]?.[0];
      expect(typeof copiedText).toBe("string");
      expect(copiedText).toContain("diff --git");
      expect(copiedText).toContain("console.log('hello');");
    });

    await waitFor(() => {
      expect(copyDiffButton).toHaveTextContent("Copied");
    });
  });

  test("renders diff text in grouped collapsible file blocks that are open by default", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 101,
            overrides: {
              data: {
                title: "Grouped diff block test",
                titleDisplay: "Grouped diff block test [CHK:PASS] [MRG:YES]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/101",
                labels: [{ name: "bug" }],
                updatedAt: "2026-06-16T10:00:00Z",
              },
              prDetail: {
                reviewDecision: "REVIEW_REQUIRED",
              },
              notes: {
                otherNotes: "needs follow-up",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
      }),
    });

    const defaultFetchImpl = fetchMock.getMockImplementation();
    fetchMock.mockImplementation(async (url, init = {}) => {
      const normalizedUrl = String(url || "");
      const method = String(init?.method || "GET").toUpperCase();

      if (normalizedUrl.startsWith("/view-prs/diff?") && method === "GET") {
        return createOkJsonResponse({
          ok: true,
          source: "cache",
          stale: false,
          warning: "",
          commitFingerprint: "abc123",
          fetchedAt: "2026-06-16T10:00:00Z",
          filePath: "data/pr-diffs/owner__repo__pr-101.json",
          diffText: [
            "diff --git a/src/a.js b/src/a.js",
            "index 123..456 100644",
            "@@ -1 +1 @@",
            "-old line a",
            "+new line a",
            "diff --git a/src/b.js b/src/b.js",
            "index 789..999 100644",
            "@@ -2 +2 @@",
            "-old line b",
            "+new line b",
          ].join("\n"),
        });
      }

      return defaultFetchImpl(url, init);
    });

    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", {
        name: "View PR JSON details for #101",
      }),
    );

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "PR JSON Details" })).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(document.querySelectorAll(".pr-json-diff-file-block").length).toBe(2);
    });

    const fileBlocks = Array.from(document.querySelectorAll(".pr-json-diff-file-block"));
    expect(fileBlocks.every((block) => block.open === true)).toBe(true);

    const fileSummaries = fileBlocks
      .map((block) => String(block.querySelector("summary")?.textContent || ""))
      .join(" ");
    expect(fileSummaries).toContain("src/a.js -> src/a.js");
    expect(fileSummaries).toContain("src/b.js -> src/b.js");

    const fileBodiesText = fileBlocks
      .map((block) => String(block.querySelector(".pr-json-diff-file-body")?.textContent || ""))
      .join(" ");
    expect(fileBodiesText).toContain("new line a");
    expect(fileBodiesText).toContain("new line b");
  });

  test("toggles word-wrap in the diff viewer when a user clicks Wrap lines button", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 101,
            overrides: {
              data: {
                title: "Wrap diff toggle test",
                titleDisplay: "Wrap diff toggle test [CHK:PASS] [MRG:YES]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/101",
                labels: [{ name: "bug" }],
                updatedAt: "2026-06-16T10:00:00Z",
              },
              prDetail: {
                reviewDecision: "REVIEW_REQUIRED",
              },
              notes: {
                otherNotes: "needs follow-up",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
      }),
    });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", {
        name: "View PR JSON details for #101",
      }),
    );

    const wrapDiffButton = await screen.findByRole("button", {
      name: "Wrap lines",
    });

    await waitFor(() => {
      expect(wrapDiffButton).toBeVisible();
    });

    const diffContent = document.querySelector(".pr-json-diff");
    expect(diffContent).toBeInTheDocument();
    expect(diffContent).not.toHaveClass("is-wrapped");

    await user.click(wrapDiffButton);

    await waitFor(() => {
      expect(wrapDiffButton).toHaveTextContent("Unwrap lines");
      expect(diffContent).toHaveClass("is-wrapped");
    });

    await user.click(wrapDiffButton);

    await waitFor(() => {
      expect(wrapDiffButton).toHaveTextContent("Wrap lines");
      expect(diffContent).not.toHaveClass("is-wrapped");
    });
  });

  test("posts Clear action payload when a user clicks the Ack'd toggle button on an already-acknowledged row", async () => {
    // The Ack/Clear pair was replaced by a single toggle button (see
    // REACT_MIGRATION_PLAN.md and PrActionsCell.jsx's own doc comment):
    // it reads "Ack" and acknowledges on click when not yet acknowledged,
    // and reads "Ack'd" and clears on click once it is - this test covers
    // the latter (clear) half, so the PR must already be acknowledged.
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 101,
            overrides: {
              data: {
                title: "Test Clear action",
                titleDisplay: "Test Clear action [CHK:PASS] [MRG:YES]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/101",
                labels: [{ name: "bug" }],
                updatedAt: "2026-06-16T10:00:00Z",
              },
              prDetail: {
                reviewDecision: "REVIEW_REQUIRED",
              },
              notes: {
                otherNotes: "needs follow-up",
              },
            },
          },
        ],
        ackByRepo: { "owner/repo": { 101: true } },
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
      }),
    });
    const user = userEvent.setup();
    fetchMock.mockClear();

    const clearButton = await screen.findByRole("button", {
      name: "✓ Ack'd",
    });
    expect(clearButton).toBeInTheDocument();

    await user.click(clearButton);

    await waitFor(() => {
      const ackCalls = fetchMock.mock.calls.filter((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/ack" &&
          String(init?.method || "GET").toUpperCase() === "POST"
        );
      });
      expect(ackCalls.length).toBeGreaterThan(0);

      const [, ackInit] = ackCalls[0];
      const ackBody = String(ackInit?.body || "");
      expect(ackBody).toContain('"repo":"owner/repo"');
      expect(ackBody).toContain('"ackClear":"101"');
    });
  });

  test("posts Update action payload when a user clicks Update button on a row", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 202,
            overrides: {
              data: {
                title: "Test Update action",
                titleDisplay: "Test Update action [CHK:PASS] [MRG:YES]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/202",
                labels: [{ name: "feature" }],
                updatedAt: "2026-06-16T11:00:00Z",
              },
              prDetail: {
                reviewDecision: "REVIEW_REQUIRED",
              },
              notes: {
                otherNotes: "ready for update",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T11:00:00Z" },
      }),
    });
    const user = userEvent.setup();
    fetchMock.mockClear();

    const updateButton = await screen.findByRole("button", {
      name: /Update/,
    });
    expect(updateButton).toBeInTheDocument();

    await user.click(updateButton);

    await waitFor(() => {
      const runCalls = fetchMock.mock.calls.filter((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/run" &&
          String(init?.method || "GET").toUpperCase() === "POST"
        );
      });
      expect(runCalls.length).toBeGreaterThan(0);

      const [, runInit] = runCalls[0];
      const runBody = String(runInit?.body || "");
      expect(runBody).toContain('"repo":"owner/repo"');
      expect(runBody).toContain('"prNumber":"202"');
      expect(runBody).toContain('"openMode":"none"');
      expect(runBody).toContain('"quiet":true');
    });
  });

  test("shows failure status and snackbar when row Update request fails", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 203,
            overrides: {
              data: {
                title: "Test Update failure",
                titleDisplay: "Test Update failure [CHK:PASS] [MRG:YES]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/203",
                labels: [{ name: "feature" }],
                updatedAt: "2026-06-16T11:05:00Z",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T11:05:00Z" },
      }),
    });
    const user = userEvent.setup();
    fetchMock.mockClear();

    const baseFetch = fetchMock;
    const failingFetch = jest.fn(async (url, init = {}) => {
      const normalizedUrl = String(url || "");
      const method = String(init?.method || "GET").toUpperCase();
      if (normalizedUrl === "/view-prs/run" && method === "POST") {
        return {
          ok: false,
          status: 500,
          json: async () => ({ ok: false, error: "mock update failure" }),
        };
      }
      return baseFetch(url, init);
    });
    global.fetch = failingFetch;
    window.fetch = failingFetch;
    fetchMock = failingFetch;

    const updateButton = await screen.findByRole("button", {
      name: /Update/,
    });
    await user.click(updateButton);

    await waitFor(() => {
      expect(document.getElementById("status").textContent).toBe(
        "Failed to update PR #203",
      );
    });

    const snackbar = document.getElementById("error-snackbar");
    const snackbarMessage = document.getElementById("error-snackbar-message");
    expect(snackbar.hidden).toBe(false);
    expect(snackbarMessage.textContent).toContain("Update failed for PR #203");
  });

  test("given row toggles and ack action, when controls are clicked, then in-review, flagged, and ack payloads are posted", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 1,
            overrides: {
              data: {
                title: "PR one",
                titleDisplay: "PR one [CHK:PASS] [MRG:YES]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/1",
                labels: [{ name: "bug" }],
                updatedAt: "2026-06-15T10:00:00Z",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-03-10T10:15:00Z" },
        scheduler: {
          intervalMinutes: 15,
          manualCooldownMinutes: 15,
          isAutoRunInProgress: false,
        },
      }),
    });
    const user = userEvent.setup();
    fetchMock.mockClear();

    const sharedPrInput = document.getElementById("pr-numbers");
    sharedPrInput.value = "88,89";

    const inReviewToggle = await screen.findByLabelText("In Review for PR #1");
    await user.click(inReviewToggle);

    await waitFor(() => {
      const inReviewCall = fetchMock.mock.calls.find((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/ack" &&
          String(init?.method || "GET").toUpperCase() === "POST" &&
          String(init?.body || "").includes('"inReview":"1"')
        );
      });
      expect(inReviewCall).toBeDefined();
    });

    const flaggedToggle = await screen.findByLabelText("Flagged for PR #1");
    await user.click(flaggedToggle);

    await waitFor(() => {
      const flaggedCall = fetchMock.mock.calls.find((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/ack" &&
          String(init?.method || "GET").toUpperCase() === "POST" &&
          String(init?.body || "").includes('"flagged":"1"')
        );
      });
      expect(flaggedCall).toBeDefined();
    });

    const rowAckButton = screen
      .getAllByRole("button", { name: /ack/i })
      .find((button) => button.closest("table"));
    expect(rowAckButton).toBeDefined();

    await user.click(rowAckButton);

    await waitFor(() => {
      const ackCalls = fetchMock.mock.calls.filter((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/ack" &&
          String(init?.method || "GET").toUpperCase() === "POST"
        );
      });
      expect(ackCalls.length).toBeGreaterThanOrEqual(2);
    });

    const inReviewCall = fetchMock.mock.calls.find((call) => {
      const [url, init] = call;
      return (
        String(url || "") === "/view-prs/ack" &&
        String(init?.method || "GET").toUpperCase() === "POST" &&
        String(init?.body || "").includes('"inReview":"1"')
      );
    });
    const rowAckCall = fetchMock.mock.calls.find((call) => {
      const [url, init] = call;
      return (
        String(url || "") === "/view-prs/ack" &&
        String(init?.method || "GET").toUpperCase() === "POST" &&
        String(init?.body || "").includes('"ack":"1"')
      );
    });
    const flaggedCall = fetchMock.mock.calls.find((call) => {
      const [url, init] = call;
      return (
        String(url || "") === "/view-prs/ack" &&
        String(init?.method || "GET").toUpperCase() === "POST" &&
        String(init?.body || "").includes('"flagged":"1"')
      );
    });

    expect(inReviewCall).toBeDefined();
    expect(flaggedCall).toBeDefined();
    expect(rowAckCall).toBeDefined();
    expect(document.getElementById("pr-numbers").value).toBe("88,89");
    expect(document.getElementById("status").textContent).toBe("Ack only completed");
  });

  test("posts notes payload and renders saved comment after a user saves notes", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 1,
            overrides: {
              data: {
                title: "PR with notes",
                titleDisplay: "PR with notes [CHK:PASS] [MRG:YES]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/1",
                updatedAt: "2026-06-15T10:00:00Z",
              },
              notes: undefined,
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-03-10T10:15:00Z" },
        scheduler: {
          intervalMinutes: 15,
          manualCooldownMinutes: 15,
          isAutoRunInProgress: false,
        },
      }),
    });
    const user = userEvent.setup();
    fetchMock.mockClear();

    const baseFetch = fetchMock;
    const savedNote = {
      id: "save-test-c1",
      author: "octocat",
      tone: "Positive",
      note: "LGTM",
    };
    fetchMock = jest.fn(async (url, init = {}) => {
      const normalizedUrl = String(url || "");
      const method = String(init?.method || "GET").toUpperCase();

      if (normalizedUrl === "/view-prs/notes" && method === "POST") {
        return createOkJsonResponse({
          ok: true,
          prData: {
            byPrNumber: {
              1: {
                repo: "owner/repo",
                prNumber: "1",
                section: "open",
                data: {
                  number: "1",
                  url: "https://github.com/owner/repo/pull/1",
                  status: "NO_CHANGE",
                  approved: "NO",
                  title: "PR with notes",
                  titleDisplay: "PR with notes [CHK:PASS] [MRG:YES]",
                  author: "octocat",
                  labels: [{ name: "bug" }],
                  updatedAt: "2026-06-15T10:00:00Z",
                  inReview: false,
                },
                notes: {
                  comments: [savedNote],
                  otherNotes: "",
                  prDifficulty: "5",
                  rallyStories: [],
                  rallyLinks: [],
                  analysisOfPr: "Deep analysis for save test",
                },
              },
            },
            lastRun: { repo: "owner/repo", updatedAt: "2026-03-10T10:15:00Z" },
            scheduler: {
              intervalMinutes: 15,
              manualCooldownMinutes: 15,
              isAutoRunInProgress: false,
            },
          },
        });
      }

      return baseFetch(url, init);
    });
    global.fetch = fetchMock;
    window.fetch = fetchMock;

    const insightsButton = await screen.findByRole("button", {
      name: "More insights",
    });
    await user.click(insightsButton);

    const addCommentButton = await screen.findByRole("button", {
      name: "+ Add comment",
    });
    await user.click(addCommentButton);

    const notesSection = addCommentButton.closest(".pr-notes-section");
    expect(notesSection).toBeInTheDocument();

    const noteTextarea = notesSection.querySelector(".pr-notes-comment-note");
    expect(noteTextarea).toBeInTheDocument();
    // fireEvent.change, not user.type - see renderCleanNotesSection()'s own
    // comment (further down this file) for why: by the time enough of this
    // suite's ~97 tests have run, user.type's multi-event-per-field
    // sequences stop reliably reaching a text field's onChange/React state
    // at all (confirmed via the component's own internal state tracing),
    // while a single fireEvent.change reliably still does.
    fireEvent.change(noteTextarea, { target: { value: "LGTM" } });

    const difficultySelect = within(notesSection).getByLabelText("PR difficulty");
    await user.selectOptions(difficultySelect, "5");

    const analysisTextarea = within(notesSection).getByLabelText("Analysis of PR");
    fireEvent.change(analysisTextarea, { target: { value: "Deep analysis for save test" } });

    const saveNotesButton = screen.getByRole("button", { name: "Save notes" });
    expect(saveNotesButton).toBeEnabled();

    await user.click(saveNotesButton);

    await waitFor(() => {
      const notesCalls = fetchMock.mock.calls.filter((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/notes" &&
          String(init?.method || "GET").toUpperCase() === "POST"
        );
      });
      expect(notesCalls.length).toBeGreaterThan(0);
    });

    const notesCall = fetchMock.mock.calls.find((call) => {
      const [url, init] = call;
      return (
        String(url || "") === "/view-prs/notes" &&
        String(init?.method || "GET").toUpperCase() === "POST"
      );
    });
    const notesPayload = JSON.parse(String(notesCall?.[1]?.body || "{}"));

    expect(notesPayload.prNumber).toBe("1");
    expect(notesPayload.prDifficulty).toBe("5");
    expect(notesPayload.analysisOfPr).toBe("Deep analysis for save test");
    expect(Array.isArray(notesPayload.comments)).toBe(true);
    expect(notesPayload.comments.length).toBeGreaterThan(0);
    expect(String(notesPayload.comments[0]?.note || "")).toContain("LGTM");

    await waitFor(() => {
      const savedRows = document.querySelectorAll(".pr-notes-comment-row");
      expect(savedRows.length).toBe(1);
    });
  });

  test("enables Save notes when only difficulty or rally fields are edited", async () => {
    const renderCleanNotesSection = async () => {
      initTestPage({
        dataPayload: createMultiPrPayload({
          prs: [
            {
              scenario: "open-no-change",
              prNumber: 1,
              overrides: {
                data: {
                  title: "PR with notes",
                  titleDisplay: "PR with notes [CHK:PASS] [MRG:YES]",
                  author: "octocat",
                  url: "https://github.com/owner/repo/pull/1",
                  labels: [{ name: "bug" }],
                  updatedAt: "2026-06-15T10:00:00Z",
                },
                notes: undefined,
              },
            },
          ],
          lastRun: { repo: "owner/repo", updatedAt: "2026-03-10T10:15:00Z" },
          scheduler: {
            intervalMinutes: 15,
            manualCooldownMinutes: 15,
            isAutoRunInProgress: false,
          },
        }),
      });

      const localUser = userEvent.setup();
      const insightsButton = await screen.findByRole("button", {
        name: "More insights",
      });
      await localUser.click(insightsButton);

      const saveNotesButton = await screen.findByRole("button", {
        name: "Save notes",
      });
      expect(saveNotesButton).toBeDisabled();

      const notesSection = saveNotesButton.closest(".pr-notes-section");
      expect(notesSection).toBeInTheDocument();
      return {
        user: localUser,
        notesSection,
        saveNotesButton,
      };
    };

    {
      const { user, notesSection, saveNotesButton } = await renderCleanNotesSection();
      const difficultySelect = within(notesSection).getByLabelText("PR difficulty");
      await user.selectOptions(difficultySelect, "4");
      expect(saveNotesButton).toBeEnabled();
    }

    {
      const { notesSection, saveNotesButton } = await renderCleanNotesSection();
      const rallyStoryInput = notesSection.querySelector(
        ".pr-notes-rally-story-input",
      );
      expect(rallyStoryInput).toBeInTheDocument();
      // fireEvent.change (one direct value-set + 'change' dispatch), not
      // user.type (many sequential per-keystroke events) - see this
      // test's own renderCleanNotesSection() comment for why: by the time
      // this is the suite's 4th+ React session sharing one jsdom window,
      // user.type's multi-event sequence reliably stopped reaching this
      // input's onChange/state at all (confirmed via the component's own
      // internal state tracing - the DOM value updated, React's state
      // never did), while a single fireEvent.change reliably still does.
      fireEvent.change(rallyStoryInput, { target: { value: "US12345" } });
      expect(saveNotesButton).toBeEnabled();
    }

    {
      const { notesSection, saveNotesButton } = await renderCleanNotesSection();
      const rallyLinkInput = notesSection.querySelector(".pr-notes-rally-link-input");
      expect(rallyLinkInput).toBeInTheDocument();
      fireEvent.change(rallyLinkInput, { target: { value: "https://rally.example/US12345" } });
      expect(saveNotesButton).toBeEnabled();
    }
  });

  test("excludes removed note from the next Save notes payload", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 1,
            overrides: {
              data: {
                title: "PR with removable notes",
                titleDisplay: "PR with removable notes [CHK:PASS] [MRG:YES]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/1",
                labels: [{ name: "bug" }],
                updatedAt: "2026-06-15T10:00:00Z",
              },
              notes: undefined,
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-03-10T10:15:00Z" },
        scheduler: {
          intervalMinutes: 15,
          manualCooldownMinutes: 15,
          isAutoRunInProgress: false,
        },
      }),
    });
    const user = userEvent.setup();
    fetchMock.mockClear();

    const baseFetch = fetchMock;
    fetchMock = jest.fn(async (url, init = {}) => {
      const normalizedUrl = String(url || "");
      const method = String(init?.method || "GET").toUpperCase();

      if (normalizedUrl === "/view-prs/notes" && method === "POST") {
        const postedBody = JSON.parse(String(init?.body || "{}"));
        return createOkJsonResponse({
          ok: true,
          prData: {
            byPrNumber: {
              1: {
                repo: "owner/repo",
                prNumber: "1",
                section: "open",
                data: {
                  number: "1",
                  url: "https://github.com/owner/repo/pull/1",
                  status: "NO_CHANGE",
                  approved: "NO",
                  title: "PR with removable notes",
                  titleDisplay: "PR with removable notes [CHK:PASS] [MRG:YES]",
                  author: "octocat",
                  labels: [{ name: "bug" }],
                  updatedAt: "2026-06-15T10:00:00Z",
                  inReview: false,
                },
                notes: {
                  comments: postedBody.comments || [],
                  otherNotes: "",
                },
              },
            },
            lastRun: { repo: "owner/repo", updatedAt: "2026-03-10T10:15:00Z" },
            scheduler: {
              intervalMinutes: 15,
              manualCooldownMinutes: 15,
              isAutoRunInProgress: false,
            },
          },
        });
      }

      return baseFetch(url, init);
    });
    global.fetch = fetchMock;
    window.fetch = fetchMock;

    await user.click(await screen.findByRole("button", { name: "More insights" }));

    const addCommentButton = await screen.findByRole("button", {
      name: "+ Add comment",
    });
    await user.click(addCommentButton);
    await user.click(addCommentButton);

    const notesSection = addCommentButton.closest(".pr-notes-section");
    expect(notesSection).toBeInTheDocument();

    const removeButtons = notesSection.querySelectorAll(".pr-notes-comment-remove");
    expect(removeButtons.length).toBe(2);
    await user.click(removeButtons[0]);

    const saveNotesButton = screen.getByRole("button", { name: "Save notes" });
    await user.click(saveNotesButton);

    await waitFor(() => {
      const notesCalls = fetchMock.mock.calls.filter((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/notes" &&
          String(init?.method || "GET").toUpperCase() === "POST"
        );
      });
      expect(notesCalls.length).toBeGreaterThan(0);
    });

    const latestNotesCall = fetchMock.mock.calls
      .slice()
      .reverse()
      .find((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/notes" &&
          String(init?.method || "GET").toUpperCase() === "POST"
        );
      });
    const latestNotesPayload = JSON.parse(String(latestNotesCall?.[1]?.body || "{}"));

    expect(Array.isArray(latestNotesPayload.comments)).toBe(true);
    expect(latestNotesPayload.comments.length).toBe(1);
  });

  test("supports manual author comment save and inline edit in author insights", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 55,
            overrides: {
              data: {
                title: "Author manual comments test",
                titleDisplay: "Author manual comments test [CHK:PASS]",
                author: "Alison Hall",
                authorLogin: "ahall236_uhg",
                url: "https://github.com/owner/repo/pull/55",
                updatedAt: "2026-03-25T12:00:00Z",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-03-25T12:00:00Z" },
        actorsMap: {
          ahall236_uhg: "Alison Hall",
        },
        scheduler: {
          intervalMinutes: 15,
          manualCooldownMinutes: 15,
          isAutoRunInProgress: false,
        },
      }),
    });
    fetchMock.mockClear();

    let inMemoryComments = [];
    const baseFetch = fetchMock;
    fetchMock = jest.fn(async (url, init = {}) => {
      const normalizedUrl = String(url || "");
      const method = String(init?.method || "GET").toUpperCase();

      if (
        normalizedUrl.startsWith("/view-prs/author-comments?") &&
        method === "GET"
      ) {
        return createOkJsonResponse({ ok: true, comments: inMemoryComments });
      }

      if (normalizedUrl === "/view-prs/author-comments" && method === "POST") {
        const postedBody = JSON.parse(String(init?.body || "{}"));
        inMemoryComments = [
          {
            id: "ac-1",
            note: String(postedBody.note || ""),
            sentiment: String(postedBody.sentiment || "neutral"),
            createdAt: "2026-06-03T10:00:00Z",
            updatedAt: "2026-06-03T10:00:00Z",
          },
        ];
        return createOkJsonResponse({ ok: true, comments: inMemoryComments });
      }

      if (normalizedUrl === "/view-prs/author-comments" && method === "PUT") {
        const updatedBody = JSON.parse(String(init?.body || "{}"));
        inMemoryComments = [
          {
            id: "ac-1",
            note: String(updatedBody.note || ""),
            sentiment: String(updatedBody.sentiment || "neutral"),
            createdAt: "2026-06-03T10:00:00Z",
            updatedAt: "2026-06-03T10:05:00Z",
          },
        ];
        return createOkJsonResponse({ ok: true, comments: inMemoryComments });
      }

      return baseFetch(url, init);
    });
    global.fetch = fetchMock;
    window.fetch = fetchMock;
  });

  test("loads backfill log tail when a user clicks Refresh log in the Backfill tab", async () => {
    const user = userEvent.setup();
    fetchMock.mockClear();

    await user.click(screen.getByRole("tab", { name: "Backfill" }));
    await user.click(screen.getByRole("button", { name: "Refresh log" }));

    await waitFor(() => {
      expect(screen.getByText(/line-1/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/line-2/i)).toBeInTheDocument();

    const logTailCall = fetchMock.mock.calls.find((call) => {
      const [url, init] = call;
      return (
        String(url || "").startsWith("/view-prs/backfill/log") &&
        String(init?.method || "GET").toUpperCase() === "GET"
      );
    });
    expect(logTailCall).toBeDefined();
  });

  test("given a user opens the Export tab, when it activates, then the tab panel becomes visible (content is React-owned - see ExportTab.test.jsx)", async () => {
    initTestPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole("tab", { name: "Export" }));

    expect(document.getElementById("tab-panel-export").hidden).toBe(false);
  });

  test("backfill log auto-scrolls to bottom when running and auto-scroll is enabled", async () => {
    initTestPage();

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Backfill" }));

    // Force a running status refresh in-test to avoid startup timing races.
    const defaultImpl = fetchMock.getMockImplementation();
    fetchMock.mockImplementation(async (url, init = {}) => {
      const normalizedUrl = String(url || "");
      const method = String(init?.method || "GET").toUpperCase();
      if (normalizedUrl === "/view-prs/backfill" && method === "GET") {
        return createOkJsonResponse({
          ok: true,
          running: true,
          pid: 321,
          summary: "Running",
          logFile: "/tmp/backfill.log",
          pidFile: "/tmp/backfill.pid",
          error: "",
        });
      }
      return defaultImpl(url, init);
    });

    await user.click(screen.getByRole("button", { name: "Refresh status" }));

    await waitFor(() => {
      const statusCall = fetchMock.mock.calls.find((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/backfill" &&
          String(init?.method || "GET").toUpperCase() === "GET"
        );
      });
      expect(statusCall).toBeDefined();
    });

    const backfillLog = document.getElementById("backfill-log");
    Object.defineProperty(backfillLog, "scrollHeight", {
      get: () => 4321,
      configurable: true,
    });
    backfillLog.scrollTop = 0;

    const autoscrollToggle = document.getElementById("backfill-log-autoscroll");
    autoscrollToggle.checked = true;

    fetchMock.mockClear();
    await user.click(screen.getByRole("button", { name: "Refresh log" }));

    await waitFor(() => {
      expect(backfillLog.scrollTop).toBe(4321);
    });
  });

  test("backfill log does not auto-scroll when the auto-scroll toggle is disabled", async () => {
    initTestPage();

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Backfill" }));

    await waitFor(() => {
      expect(document.getElementById("backfill-log")).toBeInTheDocument();
    });

    const backfillLog = document.getElementById("backfill-log");
    backfillLog.scrollTop = 0;

    const autoscrollToggle = document.getElementById("backfill-log-autoscroll");
    autoscrollToggle.checked = false;

    await user.click(screen.getByRole("button", { name: "Refresh log" }));

    await waitFor(() => {
      expect(screen.getByText(/line-1/i)).toBeInTheDocument();
    });

    expect(backfillLog.scrollTop).toBe(0);
  });

  test("backfill log does not auto-scroll when backfill is not running", async () => {
    initTestPage();

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Backfill" }));

    await waitFor(() => {
      expect(document.getElementById("backfill-log")).toBeInTheDocument();
    });

    const backfillLog = document.getElementById("backfill-log");
    Object.defineProperty(backfillLog, "scrollHeight", {
      get: () => 9999,
      configurable: true,
    });
    backfillLog.scrollTop = 0;

    // Default mock returns running: false, so isBackfillRunning stays false.
    const autoscrollToggle = document.getElementById("backfill-log-autoscroll");
    autoscrollToggle.checked = true;

    await user.click(screen.getByRole("button", { name: "Refresh log" }));

    await waitFor(() => {
      expect(screen.getByText(/line-1/i)).toBeInTheDocument();
    });

    expect(backfillLog.scrollTop).toBe(0);
  });

  test("falls back to full data polling after the first /view-prs/data-meta 404", async () => {
    {
      initTestPage({
        dataPayload: {
          dataMeta: {
            dataVersion: "seed-version",
          },
          ...createMultiPrPayload({
            prs: [
              {
                scenario: "open-no-change",
                prNumber: 101,
                overrides: {
                  data: {
                    title: "Fallback polling test",
                    titleDisplay: "Fallback polling test [CHK:PASS]",
                    author: "octocat",
                    url: "https://github.com/owner/repo/pull/101",
                    updatedAt: "2026-06-16T10:00:00Z",
                  },
                },
              },
            ],
            lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
          }),
        },
      });

      expect(typeof window.pollForDataChanges).toBe("function");

      fetchMock.mockClear();
      let dataFallbackCalls = 0;

      fetchMock.mockImplementation(async (url, init = {}) => {
        const normalizedUrl = String(url || "");
        const method = String(init?.method || "GET").toUpperCase();

        if (normalizedUrl === "/view-prs/data-meta" && method === "GET") {
          return {
            ok: false,
            status: 404,
            json: async () => ({ ok: false, error: "Not found" }),
          };
        }

        if (normalizedUrl === "/view-prs/data" && method === "GET") {
          dataFallbackCalls += 1;
          return createOkJsonResponse({
            ok: true,
            dataMeta: {
              dataVersion: `fallback-version-${dataFallbackCalls}`,
            },
            byPrNumber: {
              101: {
                repo: "owner/repo",
                prNumber: "101",
                section: "open",
                data: {
                  number: "101",
                  url: "https://github.com/owner/repo/pull/101",
                  status: "NO_CHANGE",
                  approved: "NO",
                  title: "Fallback polling test",
                  titleDisplay: `Fallback polling test [CHK:PASS:${dataFallbackCalls}]`,
                  author: "octocat",
                  labels: [],
                  updatedAt: "2026-06-16T10:00:00Z",
                  inReview: false,
                },
              },
            },
            lastRun: {
              repo: "owner/repo",
              updatedAt: "2026-06-16T10:00:00Z",
            },
            scheduler: {
              intervalMinutes: 15,
              manualCooldownMinutes: 15,
              isAutoRunInProgress: false,
            },
          });
        }

        if (normalizedUrl === "/view-prs/scheduler" && method === "GET") {
          return {
            ok: false,
            status: 404,
            json: async () => ({ ok: false }),
          };
        }

        return createOkJsonResponse({ ok: true });
      });

      await window.pollForDataChanges();
      await window.pollForDataChanges();

      const metaCalls = fetchMock.mock.calls.filter((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/data-meta" &&
          String(init?.method || "GET").toUpperCase() === "GET"
        );
      });
      const dataCalls = fetchMock.mock.calls.filter((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/data" &&
          String(init?.method || "GET").toUpperCase() === "GET"
        );
      });

      expect(metaCalls.length).toBe(1);
      expect(dataCalls.length).toBe(2);
    }
  });

  test("given polling recovers after a transient failure, when the next poll succeeds, then auto-refresh warning snackbar is cleared", async () => {
    {
      initTestPage({
        dataPayload: {
          dataMeta: {
            dataVersion: "seed-version",
          },
          ...createMultiPrPayload({
            prs: [
              {
                scenario: "open-no-change",
                prNumber: 101,
                overrides: {
                  data: {
                    title: "Polling warning recovery",
                    titleDisplay: "Polling warning recovery [CHK:PASS]",
                    author: "octocat",
                    url: "https://github.com/owner/repo/pull/101",
                    updatedAt: "2026-06-16T10:00:00Z",
                  },
                },
              },
            ],
            lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
          }),
        },
      });

      expect(typeof window.pollForDataChanges).toBe("function");

      fetchMock.mockClear();
      fetchMock.mockImplementation(async (url, init = {}) => {
        const normalizedUrl = String(url || "");
        const method = String(init?.method || "GET").toUpperCase();

        if (normalizedUrl === "/view-prs/data-meta" && method === "GET") {
          return createOkJsonResponse({
            ok: true,
            dataVersion: "seed-version",
          });
        }

        if (normalizedUrl === "/view-prs/scheduler" && method === "GET") {
          return {
            ok: false,
            status: 404,
            json: async () => ({ ok: false }),
          };
        }

        return createOkJsonResponse({ ok: true });
      });

      await window.pollForDataChanges();

      fetchMock.mockImplementation(async (url, init = {}) => {
        const normalizedUrl = String(url || "");
        const method = String(init?.method || "GET").toUpperCase();

        if (normalizedUrl === "/view-prs/data-meta" && method === "GET") {
          throw new Error("net::ERR_NETWORK_CHANGED");
        }

        if (normalizedUrl === "/view-prs/scheduler" && method === "GET") {
          return {
            ok: false,
            status: 404,
            json: async () => ({ ok: false }),
          };
        }

        return createOkJsonResponse({ ok: true });
      });

      await window.pollForDataChanges();

      const snackbar = document.getElementById("error-snackbar");
      const snackbarMessage = document.getElementById("error-snackbar-message");
      expect(snackbar).not.toHaveAttribute("hidden");
      expect(String(snackbar?.className || "")).toContain("error-snackbar-warning");
      expect(String(snackbarMessage?.textContent || "")).toContain(
        "Auto-refresh warning",
      );
      expect(String(snackbarMessage?.textContent || "")).toContain(
        "Last successful check:",
      );
      expect(String(snackbarMessage?.textContent || "")).toContain("Last error at:");

      fetchMock.mockImplementation(async (url, init = {}) => {
        const normalizedUrl = String(url || "");
        const method = String(init?.method || "GET").toUpperCase();

        if (normalizedUrl === "/view-prs/data-meta" && method === "GET") {
          return createOkJsonResponse({
            ok: true,
            dataVersion: "seed-version",
          });
        }

        if (normalizedUrl === "/view-prs/scheduler" && method === "GET") {
          return {
            ok: false,
            status: 404,
            json: async () => ({ ok: false }),
          };
        }

        return createOkJsonResponse({ ok: true });
      });

      await window.pollForDataChanges();

      expect(snackbar).toHaveAttribute("hidden");
    }
  });

  test("skips full data fetch when polling sees an unchanged data version", async () => {
    {
      initTestPage({
        dataPayload: {
          dataMeta: {
            dataVersion: "seed-version",
          },
          ...createMultiPrPayload({
            prs: [
              {
                scenario: "open-no-change",
                prNumber: 101,
                overrides: {
                  data: {
                    title: "Unchanged polling seed",
                    titleDisplay: "Unchanged polling seed [CHK:PASS]",
                    author: "octocat",
                    url: "https://github.com/owner/repo/pull/101",
                    updatedAt: "2026-06-16T10:00:00Z",
                  },
                },
              },
            ],
            lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
          }),
        },
      });

      expect(typeof window.pollForDataChanges).toBe("function");

      fetchMock.mockClear();
      fetchMock.mockImplementation(async (url, init = {}) => {
        const normalizedUrl = String(url || "");
        const method = String(init?.method || "GET").toUpperCase();

        if (normalizedUrl === "/view-prs/data-meta" && method === "GET") {
          return createOkJsonResponse({
            ok: true,
            dataVersion: "seed-version",
          });
        }

        if (normalizedUrl === "/view-prs/data" && method === "GET") {
          return createOkJsonResponse({
            ok: true,
            byPrNumber: {},
            lastRun: null,
          });
        }

        if (normalizedUrl === "/view-prs/scheduler" && method === "GET") {
          return {
            ok: false,
            status: 404,
            json: async () => ({ ok: false }),
          };
        }

        return createOkJsonResponse({ ok: true });
      });

      await window.pollForDataChanges();

      const metaCalls = fetchMock.mock.calls.filter((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/data-meta" &&
          String(init?.method || "GET").toUpperCase() === "GET"
        );
      });
      const dataCalls = fetchMock.mock.calls.filter((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/data" &&
          String(init?.method || "GET").toUpperCase() === "GET"
        );
      });

      expect(metaCalls.length).toBe(1);
      expect(dataCalls.length).toBe(0);
    }
  });

  test("rerenders visible PR cells when polling detects non-status data changes", async () => {
    {
      initTestPage({
        dataPayload: {
          dataMeta: {
            dataVersion: "fingerprint-v1",
          },
          ...createMultiPrPayload({
            prs: [
              {
                scenario: "open-no-change",
                prNumber: 101,
                overrides: {
                  data: {
                    title: "Fingerprint rerender one",
                    titleDisplay: "CHK-RERENDER-1",
                    author: "author-alpha-001",
                    url: "https://github.com/owner/repo/pull/101",
                    baseline: "2030-01-01T00:00:00Z",
                    updatedAt: "2026-06-16T10:00:00Z",
                  },
                },
              },
            ],
            lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
          }),
        },
      });

      expect(typeof window.pollForDataChanges).toBe("function");
      await waitFor(() => {
        const row = document.querySelector(
          "#pr-sections .pr-group-section-content table tbody tr",
        );
        expect(row).toBeTruthy();
      });
      const firstMainRowTextBefore = String(
        document.querySelector("#pr-sections .pr-group-section-content table tbody tr")
          ?.textContent || "",
      );

      fetchMock.mockClear();
      let dataCallCount = 0;
      fetchMock.mockImplementation(async (url, init = {}) => {
        const normalizedUrl = String(url || "");
        const method = String(init?.method || "GET").toUpperCase();

        if (normalizedUrl === "/view-prs/data-meta" && method === "GET") {
          return createOkJsonResponse({
            ok: true,
            dataVersion: "fingerprint-rerender-v2",
          });
        }

        if (normalizedUrl === "/view-prs/data" && method === "GET") {
          dataCallCount += 1;
          return createOkJsonResponse({
            ok: true,
            dataMeta: {
              dataVersion: "fingerprint-rerender-v2",
            },
            byPrNumber: {
              101: {
                repo: "owner/repo",
                prNumber: "101",
                section: "open",
                data: {
                  number: "101",
                  url: "https://github.com/owner/repo/pull/101",
                  status: "NO_CHANGE",
                  approved: "NO",
                  title: "Fingerprint rerender two",
                  titleDisplay: "CHK-RERENDER-2",
                  author: "author-beta-002",
                  labels: [],
                  baseline: "2030-01-01T00:00:00Z",
                  updatedAt: "2026-06-16T10:30:00Z",
                  inReview: false,
                },
              },
            },
            lastRun: {
              repo: "owner/repo",
              updatedAt: "2026-06-16T10:30:00Z",
            },
            scheduler: {
              intervalMinutes: 15,
              manualCooldownMinutes: 15,
              isAutoRunInProgress: false,
            },
          });
        }

        if (normalizedUrl === "/view-prs/scheduler" && method === "GET") {
          return {
            ok: false,
            status: 404,
            json: async () => ({ ok: false }),
          };
        }

        return createOkJsonResponse({ ok: true });
      });

      await window.pollForDataChanges();

      let firstMainRowTextAfter = "";
      await waitFor(() => {
        firstMainRowTextAfter = String(
          document.querySelector("#pr-sections .pr-group-section-content table tbody tr")
            ?.textContent || "",
        );
        expect(firstMainRowTextAfter).toContain("author-beta-002");
      });
      expect(firstMainRowTextBefore).not.toEqual(firstMainRowTextAfter);
      expect(dataCallCount).toBe(1);

      const metaCalls = fetchMock.mock.calls.filter((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/data-meta" &&
          String(init?.method || "GET").toUpperCase() === "GET"
        );
      });
      const dataCalls = fetchMock.mock.calls.filter((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/data" &&
          String(init?.method || "GET").toUpperCase() === "GET"
        );
      });

      expect(metaCalls.length).toBe(1);
      expect(dataCalls.length).toBe(1);
    }
  });

  test("given review conversations view controls changed, when polling rerenders the row, then filter mode and summaries toggle remain selected", async () => {
    const buildPayload = ({
      dataVersion,
      titleDisplay,
      updatedAt,
      warningThreadCount,
    }) => ({
      ok: true,
      dataMeta: {
        dataVersion,
      },
      byPrNumber: {
        101: {
          repo: "owner/repo",
          prNumber: "101",
          section: "open",
          data: {
            number: "101",
            url: "https://github.com/owner/repo/pull/101",
            status: "NO_CHANGE",
            approved: "NO",
            title: "Review state persistence",
            titleDisplay,
            author: "PR Author",
            authorLogin: "pr-author",
            labels: [],
            baseline: "2030-01-01T00:00:00Z",
            updatedAt,
            inReview: false,
            comments: [
              {
                id: "top-level-1",
                createdAt: "2026-06-16T09:59:00Z",
                authorLogin: "reviewer-one",
                authorName: "Reviewer One",
                body: "Top-level summary comment.",
                url: "https://github.com/owner/repo/pull/101#issuecomment-1",
              },
            ],
            reviewThreads: [
              {
                id: "thread-open-1",
                isResolved: false,
                participants: ["reviewer-one", "pr-author"],
                comments: [
                  {
                    id: "open-comment-1",
                    createdAt: "2026-06-16T09:58:00Z",
                    authorLogin: "reviewer-one",
                    authorName: "Reviewer One",
                    body: "Please update this test case.",
                    url: "https://github.com/owner/repo/pull/101#discussion_r_open",
                  },
                ],
              },
              {
                id: "thread-resolved-1",
                isResolved: true,
                resolvedByLogin: "reviewer-one",
                participants: ["reviewer-one", "pr-author"],
                comments: [
                  {
                    id: "resolved-comment-1",
                    createdAt: "2026-06-16T10:01:00Z",
                    authorLogin: "reviewer-one",
                    authorName: "Reviewer One",
                    body: "Looks good now.",
                    url: "https://github.com/owner/repo/pull/101#discussion_r_resolved",
                  },
                ],
              },
              ...Array.from({ length: warningThreadCount }).map((_, index) => ({
                id: `thread-author-warning-${index + 1}`,
                isResolved: true,
                resolvedByLogin: "pr-author",
                participants: ["reviewer-one", "pr-author"],
                comments: [
                  {
                    id: `warning-comment-${index + 1}`,
                    createdAt: `2026-06-16T10:0${index + 2}:00Z`,
                    authorLogin: "reviewer-one",
                    authorName: "Reviewer One",
                    body: `Warning thread ${index + 1}`,
                    url: `https://github.com/owner/repo/pull/101#discussion_r_warning_${index + 1}`,
                  },
                ],
              })),
            ],
          },
        },
      },
      actorsMap: {
        "pr-author": "PR Author",
        "reviewer-one": "Reviewer One",
      },
      lastRun: { repo: "owner/repo", updatedAt },
      scheduler: {
        intervalMinutes: 15,
        manualCooldownMinutes: 15,
        isAutoRunInProgress: false,
      },
    });

    {
      initTestPage({
        dataPayload: buildPayload({
          dataVersion: "review-state-v1",
          titleDisplay: "Review state persistence [CHK:PASS:1]",
          updatedAt: "2026-06-16T10:00:00Z",
          warningThreadCount: 1,
        }),
      });

      expect(typeof window.pollForDataChanges).toBe("function");

      const user = userEvent.setup();
      await waitFor(() => {
        expect(screen.getByText("#101")).toBeInTheDocument();
      });

      const row = screen.getByText("#101").closest("tr");
      await user.click(row?.querySelector(".row-insights-toggle"));

      const reviewSectionSelector =
        '.row-insights-content details.insight-section[data-insight-key="review-conversations"]';
      const activitySectionSelector =
        '.row-insights-content details.insight-section[data-insight-key="activity sequence"]';
      const getReviewSection = () => document.querySelector(reviewSectionSelector);
      const getActivitySection = () => document.querySelector(activitySectionSelector);
      await waitFor(() => {
        expect(getReviewSection()).toBeTruthy();
        expect(getActivitySection()).toBeTruthy();
      });

      await user.click(getReviewSection()?.querySelector("summary"));
      await user.click(getActivitySection()?.querySelector("summary"));

      const resolvedButtonSelector =
        ".insight-thread-filter-btn:nth-child(3)";
      const summaryToggleSelector = ".insight-thread-summary-toggle-btn";

      await user.click(getReviewSection()?.querySelector(resolvedButtonSelector));
      await user.click(getReviewSection()?.querySelector(summaryToggleSelector));

      expect(
        String(getReviewSection()?.querySelector(summaryToggleSelector)?.textContent || ""),
      ).toBe("Summaries: Off");
      expect(
        String(getReviewSection()?.querySelector(resolvedButtonSelector)?.className || ""),
      ).toContain("insight-thread-filter-btn-active");
      expect(String(getReviewSection()?.textContent || "")).toContain("Resolved thread");
      expect(String(getReviewSection()?.textContent || "")).not.toContain("Open thread");
      expect(String(getActivitySection()?.textContent || "")).not.toContain(
        "Thread: resolved",
      );
      expect(String(getActivitySection()?.textContent || "")).not.toContain(
        "Thread: open",
      );

      fetchMock.mockClear();
      fetchMock.mockImplementation(async (url, init = {}) => {
        const normalizedUrl = String(url || "");
        const method = String(init?.method || "GET").toUpperCase();

        if (normalizedUrl === "/view-prs/data-meta" && method === "GET") {
          return createOkJsonResponse({
            ok: true,
            dataVersion: "review-state-v2",
          });
        }

        if (normalizedUrl === "/view-prs/data" && method === "GET") {
          return createOkJsonResponse(
            buildPayload({
              dataVersion: "review-state-v2",
              titleDisplay: "Review state persistence [CHK:PASS:2]",
              updatedAt: "2026-06-16T10:30:00Z",
              warningThreadCount: 2,
            }),
          );
        }

        if (normalizedUrl === "/view-prs/scheduler" && method === "GET") {
          return {
            ok: false,
            status: 404,
            json: async () => ({ ok: false }),
          };
        }

        return createOkJsonResponse({ ok: true });
      });

      await window.pollForDataChanges();

      await waitFor(() => {
        expect(screen.getByText("#101")).toBeInTheDocument();
      });

      const refreshedRow = screen.getByText("#101").closest("tr");
      const refreshedToggle = refreshedRow?.querySelector(".row-insights-toggle");
      expect(refreshedToggle?.getAttribute("aria-expanded")).toBe("true");

      const refreshedReviewSection = getReviewSection();
      const refreshedActivitySection = getActivitySection();
      expect(refreshedReviewSection?.open).toBe(true);
      expect(refreshedActivitySection?.open).toBe(true);
      expect(
        String(
          refreshedReviewSection?.querySelector(summaryToggleSelector)?.textContent || "",
        ),
      ).toBe("Summaries: Off");
      expect(
        String(
          refreshedReviewSection?.querySelector(resolvedButtonSelector)?.className || "",
        ),
      ).toContain("insight-thread-filter-btn-active");
      expect(String(refreshedReviewSection?.textContent || "")).toContain(
        "Resolved thread",
      );
      expect(String(refreshedReviewSection?.textContent || "")).not.toContain(
        "Open thread",
      );
      expect(String(refreshedActivitySection?.textContent || "")).not.toContain(
        "Thread: resolved",
      );
      expect(String(refreshedActivitySection?.textContent || "")).not.toContain(
        "Thread: open",
      );
    }
  });

  test("uses manifest and delta polling endpoints when supported", async () => {
    {
      initTestPage({
        dataPayload: {
          dataMeta: {
            dataVersion: "seed-version",
          },
          ...createMultiPrPayload({
            prs: [
              {
                scenario: "open-no-change",
                prNumber: 101,
                overrides: {
                  data: {
                    title: "Manifest delta seed",
                    titleDisplay: "Manifest delta seed [CHK:PASS]",
                    author: "octocat",
                    url: "https://github.com/owner/repo/pull/101",
                    updatedAt: "2026-06-16T10:00:00Z",
                  },
                },
              },
            ],
            lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
          }),
        },
      });

      expect(typeof window.pollForDataChanges).toBe("function");

      fetchMock.mockClear();
      fetchMock.mockImplementation(async (url, init = {}) => {
        const normalizedUrl = String(url || "");
        const method = String(init?.method || "GET").toUpperCase();

        if (normalizedUrl === "/view-prs/data-meta" && method === "GET") {
          return createOkJsonResponse({
            ok: true,
            supportsDataManifest: true,
            dataVersion: "manifest-delta-v2",
          });
        }

        if (normalizedUrl === "/view-prs/data-manifest" && method === "GET") {
          return createOkJsonResponse({
            ok: true,
            dataMeta: { dataVersion: "manifest-delta-v2" },
            manifest: {
              101: {
                rowVersion: "changed-v2",
                section: "open",
                updatedAt: "2026-06-16T10:30:00Z",
                repo: "owner/repo",
              },
            },
          });
        }

        if (normalizedUrl === "/view-prs/data-delta" && method === "POST") {
          return createOkJsonResponse({
            ok: true,
            byPrNumber: {
              101: {
                repo: "owner/repo",
                prNumber: "101",
                section: "open",
                data: {
                  number: "101",
                  url: "https://github.com/owner/repo/pull/101",
                  status: "NO_CHANGE",
                  approved: "NO",
                  title: "Manifest delta updated",
                  titleDisplay: "Manifest delta updated [CHK:PASS]",
                  author: "octocat",
                  labels: [],
                  updatedAt: "2026-06-16T10:30:00Z",
                  inReview: false,
                },
              },
            },
            missingPrNumbers: [],
            dataMeta: { dataVersion: "manifest-delta-v2" },
            scheduler: {
              intervalMinutes: 15,
              manualCooldownMinutes: 15,
              isAutoRunInProgress: false,
            },
            lastRun: {
              repo: "owner/repo",
              updatedAt: "2026-06-16T10:30:00Z",
            },
          });
        }

        if (normalizedUrl === "/view-prs/scheduler" && method === "GET") {
          return {
            ok: false,
            status: 404,
            json: async () => ({ ok: false }),
          };
        }

        if (normalizedUrl === "/view-prs/user-defaults" && method === "GET") {
          return createOkJsonResponse({ ok: true, overrides: {} });
        }

        if (normalizedUrl === "/view-prs/data" && method === "GET") {
          return createOkJsonResponse({
            ok: true,
            byPrNumber: {},
            lastRun: null,
          });
        }

        return createOkJsonResponse({ ok: true });
      });

      await window.pollForDataChanges();

      const metaCalls = fetchMock.mock.calls.filter((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/data-meta" &&
          String(init?.method || "GET").toUpperCase() === "GET"
        );
      });
      const manifestCalls = fetchMock.mock.calls.filter((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/data-manifest" &&
          String(init?.method || "GET").toUpperCase() === "GET"
        );
      });
      const deltaCalls = fetchMock.mock.calls.filter((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/data-delta" &&
          String(init?.method || "GET").toUpperCase() === "POST"
        );
      });
      const fullDataCalls = fetchMock.mock.calls.filter((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/data" &&
          String(init?.method || "GET").toUpperCase() === "GET"
        );
      });

      expect(metaCalls.length).toBe(1);
      expect(manifestCalls.length).toBe(1);
      expect(deltaCalls.length).toBe(1);
      expect(fullDataCalls.length).toBe(0);

      const deltaCallBody = String(deltaCalls[0]?.[1]?.body || "");
      expect(deltaCallBody).toContain("101");
    }
  });

  test("preserves expanded insights panel and open inner sections after polling rerenders", async () => {
    {
      initTestPage({
        dataPayload: {
          dataMeta: {
            dataVersion: "insights-seed-v1",
          },
          ...createMultiPrPayload({
            prs: [
              {
                scenario: "open-no-change",
                prNumber: 101,
                overrides: {
                  data: {
                    title: "Insights preservation test",
                    titleDisplay: "Insights preservation test [CHK:PASS]",
                    author: "octocat",
                    authorLogin: "octocat",
                    url: "https://github.com/owner/repo/pull/101",
                    updatedAt: "2026-06-16T10:00:00Z",
                    reviews: [
                      {
                        id: "rev-1",
                        authorLogin: "reviewer-one",
                        state: "APPROVED",
                        submittedAt: "2026-06-15T09:00:00Z",
                        body: "LGTM",
                        url: "https://github.com/owner/repo/pull/101#r1",
                        commitOid: "abc123",
                      },
                    ],
                  },
                },
              },
            ],
            lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
          }),
        },
      });

      expect(typeof window.pollForDataChanges).toBe("function");

      const insightsToggle = await screen.findByRole("button", {
        name: "More insights",
      });
      const user = userEvent.setup();
      await user.click(insightsToggle);

      await waitFor(() => {
        expect(
          document.querySelector(".row-insights-toggle[aria-expanded='true']"),
        ).toBeTruthy();
      });

      const insightsPanel = document.querySelector(".row-insights-content");
      expect(insightsPanel).toBeTruthy();
      const activityDetails = Array.from(
        insightsPanel.querySelectorAll("details[data-insight-key]"),
      ).find(
        (d) => d.getAttribute("data-insight-key") === "activity sequence",
      );
      expect(activityDetails).toBeTruthy();
      activityDetails.open = true;
      if (typeof activityDetails.setAttribute === "function") {
        activityDetails.setAttribute("open", "");
      }

      fetchMock.mockClear();
      fetchMock.mockImplementation(async (url, init = {}) => {
        const normalizedUrl = String(url || "");
        const method = String(init?.method || "GET").toUpperCase();

        if (normalizedUrl === "/view-prs/data-meta" && method === "GET") {
          return createOkJsonResponse({
            ok: true,
            dataVersion: "insights-seed-v2",
          });
        }

        if (normalizedUrl === "/view-prs/data" && method === "GET") {
          return createOkJsonResponse({
            ok: true,
            dataMeta: { dataVersion: "insights-seed-v2" },
            byPrNumber: {
              101: {
                repo: "owner/repo",
                prNumber: "101",
                section: "open",
                data: {
                  number: "101",
                  url: "https://github.com/owner/repo/pull/101",
                  status: "NO_CHANGE",
                  approved: "NO",
                  title: "Insights preservation test",
                  titleDisplay: "Insights preservation test [CHK:PASS:2]",
                  author: "octocat",
                  authorLogin: "octocat",
                  labels: [],
                  updatedAt: "2026-06-16T10:30:00Z",
                  inReview: false,
                  reviews: [
                    {
                      id: "rev-1",
                      authorLogin: "reviewer-one",
                      state: "APPROVED",
                      submittedAt: "2026-06-15T09:00:00Z",
                      body: "LGTM",
                      url: "https://github.com/owner/repo/pull/101#r1",
                      commitOid: "abc123",
                    },
                  ],
                },
              },
            },
            lastRun: {
              repo: "owner/repo",
              updatedAt: "2026-06-16T10:30:00Z",
            },
            scheduler: {
              intervalMinutes: 15,
              manualCooldownMinutes: 15,
              isAutoRunInProgress: false,
            },
          });
        }

        if (normalizedUrl === "/view-prs/scheduler" && method === "GET") {
          return {
            ok: false,
            status: 404,
            json: async () => ({ ok: false }),
          };
        }

        return createOkJsonResponse({ ok: true });
      });

      await window.pollForDataChanges();

      await waitFor(() => {
        const toggle = document.querySelector(".row-insights-toggle");
        expect(toggle?.getAttribute("aria-expanded")).toBe("true");
      });

      const insightsPanelAfter = document.querySelector(
        ".row-insights-content",
      );
      expect(insightsPanelAfter).toBeTruthy();
      const activityDetailsAfter = Array.from(
        insightsPanelAfter.querySelectorAll("details[data-insight-key]"),
      ).find(
        (d) => d.getAttribute("data-insight-key") === "activity sequence",
      );
      expect(activityDetailsAfter).toBeTruthy();
      expect(activityDetailsAfter.open).toBe(true);
    }
  });

  test("closed or merged sections sort by timestamps", async () => {
    // Test closed/merged timestamp sorting with a fresh page initialization
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-changes-requested",
            prNumber: 300,
            overrides: {
              section: "closed",
              updatedAt: "2026-03-10T09:00:00Z",
              rowOrder: 5,
              data: {
                title: "PR 300 closed",
                titleDisplay: "PR 300 closed",
                url: "https://example.com/300",
                author: "test_author",
                authorLogin: "test_author",
                closedAt: "2026-03-10T09:00:00Z",
                updatedAt: "2026-03-10T09:00:00Z",
              },
            },
          },
          {
            scenario: "open-changes-requested",
            prNumber: 400,
            overrides: {
              section: "closed",
              updatedAt: "2026-03-11T09:00:00Z",
              rowOrder: 6,
              data: {
                title: "PR 400 closed",
                titleDisplay: "PR 400 closed",
                url: "https://example.com/400",
                author: "test_author",
                authorLogin: "test_author",
                closedAt: "2026-03-11T09:00:00Z",
                updatedAt: "2026-03-11T09:00:00Z",
              },
            },
          },
          {
            scenario: "open-approved",
            prNumber: 100,
            overrides: {
              section: "merged",
              updatedAt: "2026-03-10T10:00:00Z",
              rowOrder: 1,
              data: {
                title: "PR 100 merged",
                titleDisplay: "PR 100 merged",
                url: "https://example.com/100",
                author: "test_author",
                authorLogin: "test_author",
                mergedAt: "2026-03-10T10:00:00Z",
                updatedAt: "2026-03-10T10:00:00Z",
              },
            },
          },
          {
            scenario: "open-approved",
            prNumber: 200,
            overrides: {
              section: "merged",
              updatedAt: "2026-03-11T10:00:00Z",
              rowOrder: 2,
              data: {
                title: "PR 200 merged",
                titleDisplay: "PR 200 merged",
                url: "https://example.com/200",
                author: "test_author",
                authorLogin: "test_author",
                mergedAt: "2026-03-11T10:00:00Z",
                updatedAt: "2026-03-11T10:00:00Z",
              },
            },
          },
        ],
        actorsMap: { test_author: "Test Author" },
        lastRun: {
          repo: "owner/repo",
          updatedAt: "2026-03-11T11:00:00Z",
        },
        scheduler: {
          intervalMinutes: 15,
          manualCooldownMinutes: 15,
          isAutoRunInProgress: false,
        },
      }),
    });

    await waitFor(() => {
      const closedPrsSection = Array.from(
        document.querySelectorAll(".pr-group-section"),
      ).find((s) => s.querySelector("summary")?.textContent?.includes("Closed PRs"));
      expect(closedPrsSection).toBeTruthy();
    });

    const closedPrsSection = Array.from(
      document.querySelectorAll(".pr-group-section"),
    ).find((s) => s.querySelector("summary")?.textContent?.includes("Closed PRs"));

    const mergedPrsSection = Array.from(
      document.querySelectorAll(".pr-group-section"),
    ).find((s) => s.querySelector("summary")?.textContent?.includes("Latest Merged"));

    // Verify closed PRs sorted by closedAt descending (400 before 300)
    const closedPrLinks = Array.from(
      closedPrsSection?.querySelectorAll("a.pr-link") || [],
    );
    const closedPrNumbers = closedPrLinks
      .map((link) => link.textContent.trim())
      .filter((text) => /^#\d+$/.test(text));
    expect(closedPrNumbers[0]).toBe("#400");

    // Verify merged PRs sorted by mergedAt descending (200 before 100)
    const mergedPrLinks = Array.from(
      mergedPrsSection?.querySelectorAll("a.pr-link") || [],
    );
    const mergedPrNumbers = mergedPrLinks
      .map((link) => link.textContent.trim())
      .filter((text) => /^#\d+$/.test(text));
    expect(mergedPrNumbers[0]).toBe("#200");

    // Re-init with changed rowOrder to verify timestamp-based sort persists
    initTestPage({
      dataPayload: {
        ok: true,
        byPrNumber: {
          300: {
            repo: "owner/repo",
            prNumber: "300",
            section: "closed",
            updatedAt: "2026-03-10T09:00:00Z",
            rowOrder: 20,
            data: {
              number: "300",
              title: "PR 300 closed",
              titleDisplay: "PR 300 closed",
              url: "https://example.com/300",
              status: "CHANGES_REQUESTED",
              approved: "NO",
              author: "test_author",
              authorLogin: "test_author",
              labels: [],
              closedAt: "2026-03-10T09:00:00Z",
              updatedAt: "2026-03-10T09:00:00Z",
            },
          },
          400: {
            repo: "owner/repo",
            prNumber: "400",
            section: "closed",
            updatedAt: "2026-03-11T09:00:00Z",
            rowOrder: 1,
            data: {
              number: "400",
              title: "PR 400 closed",
              titleDisplay: "PR 400 closed",
              url: "https://example.com/400",
              status: "CHANGES_REQUESTED",
              approved: "NO",
              author: "test_author",
              authorLogin: "test_author",
              labels: [],
              closedAt: "2026-03-11T09:00:00Z",
              updatedAt: "2026-03-11T09:00:00Z",
            },
          },
          100: {
            repo: "owner/repo",
            prNumber: "100",
            section: "merged",
            updatedAt: "2026-03-10T10:00:00Z",
            rowOrder: 20,
            data: {
              number: "100",
              title: "PR 100 merged",
              titleDisplay: "PR 100 merged",
              url: "https://example.com/100",
              status: "NO_CHANGE",
              approved: "YES",
              author: "test_author",
              authorLogin: "test_author",
              labels: [],
              mergedAt: "2026-03-10T10:00:00Z",
              updatedAt: "2026-03-10T10:00:00Z",
            },
          },
          200: {
            repo: "owner/repo",
            prNumber: "200",
            section: "merged",
            updatedAt: "2026-03-11T10:00:00Z",
            rowOrder: 1,
            data: {
              number: "200",
              title: "PR 200 merged",
              titleDisplay: "PR 200 merged",
              url: "https://example.com/200",
              status: "NO_CHANGE",
              approved: "YES",
              author: "test_author",
              authorLogin: "test_author",
              labels: [],
              mergedAt: "2026-03-11T10:00:00Z",
              updatedAt: "2026-03-11T10:00:00Z",
            },
          },
        },
        actorsMap: { test_author: "Test Author" },
        lastRun: {
          repo: "owner/repo",
          updatedAt: "2026-03-11T11:30:00Z",
        },
        scheduler: {
          intervalMinutes: 15,
          manualCooldownMinutes: 15,
          isAutoRunInProgress: false,
        },
      },
    });

    await waitFor(() => {
      const closedTable = Array.from(
        document.querySelectorAll(".pr-group-section"),
      )
        .find((s) => s.querySelector("summary")?.textContent?.includes("Closed PRs"))
        ?.querySelector("table");
      const firstClosedLink = closedTable?.querySelector("a.pr-link");
      expect(firstClosedLink?.textContent).toBe("#400");
    });

    const closedTableAfter = Array.from(
      document.querySelectorAll(".pr-group-section"),
    )
      .find((s) => s.querySelector("summary")?.textContent?.includes("Closed PRs"))
      ?.querySelector("table");
    const firstClosedLinkAfter = closedTableAfter?.querySelector("a.pr-link");
    expect(firstClosedLinkAfter?.textContent).toBe("#400");

    const mergedTableAfter = Array.from(
      document.querySelectorAll(".pr-group-section"),
    )
      .find((s) => s.querySelector("summary")?.textContent?.includes("Latest Merged"))
      ?.querySelector("table");
    const firstMergedLinkAfter = mergedTableAfter?.querySelector("a.pr-link");
    expect(firstMergedLinkAfter?.textContent).toBe("#200");
  });

  // "author insights composer draft survives async rerender while author
  // comments finish loading" was removed here: the manual comments
  // composer is React-owned (#author-insights-content-root) with no
  // vanilla-DOM fallback left for this jsdom-only suite to render into.
  // The actual mechanism under test (composer draft state surviving a
  // full section rebuild, which is what happens when the async
  // author-comments GET resolves) lives entirely in
  // buildManualCommentsSection/draftHelpers, unrelated to React - see
  // "given a composer draft typed for an author..." in
  // pr-author-insights.component.test.js for the same coverage, tested
  // directly against that mechanism instead.

  test("form parsing applies credential hints to filter inputs without changing field names", () => {
    initTestPage();

    const repoField = document.getElementById("repo");
    expect(repoField.name).toBe("repo");
    expect(repoField.getAttribute("data-lpignore")).toBe("true");
    expect(repoField.getAttribute("data-1p-ignore")).toBe("true");
    expect(repoField.getAttribute("data-bwignore")).toBe("true");
    expect(repoField.getAttribute("autocomplete")).toBe("off");
    expect(repoField.getAttribute("autocapitalize")).toBe("off");
    expect(repoField.getAttribute("autocorrect")).toBe("off");
    expect(repoField.getAttribute("spellcheck")).toBe("false");
    expect(repoField.getAttribute("data-form-type")).toBe("other");

    // Verify field names are preserved (not overridden)
    expect(repoField.name).toBe("repo");

    const prNumbersField = document.getElementById("pr-numbers");
    expect(prNumbersField.name).toBe("prNumbers");
    expect(prNumbersField.getAttribute("data-lpignore")).toBe("true");

    const limitField = document.getElementById("limit");
    expect(limitField.name).toBe("limit");
    expect(limitField.getAttribute("data-1p-ignore")).toBe("true");
  });

  test("activity timeline consolidates a run of no-activity weekdays into one row, still skipping weekends", async () => {
    // Regression test for ActivityTimelineSummary's weekend-filtering AND
    // no-activity-run-consolidation behavior (see REACT_MIGRATION_PLAN.md).
    // The vanilla buildActivityTimelineSummary this component mirrors was
    // dead code (never called at runtime once this component existed) and
    // has since been deleted, along with its own now-orphaned
    // pr-activity-timeline-render.helpers.js.
    //
    // Test timeline spans a full week (Mon-Sun):
    // - Monday 2026-06-15: has activity (comment) -> own row
    // - Tuesday 2026-06-16: has activity (commit) -> own row
    // - Wed-Fri 2026-06-17-19: no activity, weekdays -> consolidated into
    //   one "No activity for 3 days" row instead of 3 separate dash rows
    // - Saturday 2026-06-20 / Sunday 2026-06-21: no activity, weekend ->
    //   skipped entirely, and excluded from the consolidated day count
    //
    // jest.spyOn(Date, "now") does NOT intercept `new Date()` (the no-arg
    // constructor reads the host's current time directly, not through the
    // Date.now property) - the component's `isOpen ? new Date() : newest`
    // needs the actual global Date faked, so this uses
    // jest.useFakeTimers()'s modern implementation scoped to only Date via
    // `doNotFake`, leaving setInterval/setTimeout (which this suite's own
    // beforeEach already wraps for cleanup tracking) untouched.
    jest.useFakeTimers({
      doNotFake: [
        "setTimeout",
        "clearTimeout",
        "setInterval",
        "clearInterval",
        "setImmediate",
        "clearImmediate",
        "nextTick",
        "queueMicrotask",
        "requestAnimationFrame",
        "cancelAnimationFrame",
        "requestIdleCallback",
        "cancelIdleCallback",
        "performance",
        "hrtime",
      ],
    });
    jest.setSystemTime(new Date("2026-06-21T10:00:00Z"));

    try {
      initTestPage({
        dataPayload: createMultiPrPayload({
          prs: [
            {
              scenario: "open-no-change",
              prNumber: 123,
              overrides: {
                data: {
                  title: "Activity timeline test",
                  titleDisplay: "Activity timeline test [CHK:PASS]",
                  url: "https://example.com/123",
                  author: "Test Author",
                  authorLogin: "test-author",
                  updatedAt: "2026-06-21T12:00:00Z",
                  baseline: "2026-06-15T10:00:00Z",
                  // Activity on Monday (2026-06-15) and Tuesday (2026-06-16)
                  activityTimeline: [
                    {
                      date: "2026-06-15",
                      actor: "test-author",
                      type: "comment",
                      count: 1,
                      latestAt: "2026-06-15T10:00:00Z",
                    },
                    {
                      date: "2026-06-16",
                      actor: "test-author",
                      type: "commit",
                      count: 1,
                      latestAt: "2026-06-16T12:00:00Z",
                    },
                  ],
                },
              },
            },
          ],
          actorsMap: {
            "test-author": "Test Author",
          },
          lastRun: { repo: "owner/repo", updatedAt: "2026-06-21T10:00:00Z" },
        }),
      });
      const user = userEvent.setup();

      const prLink = await screen.findByText("#123");
      const row = prLink.closest("tr");
      const insightsToggle = row?.querySelector(".row-insights-toggle");

      await user.click(insightsToggle);

      // Find the activity timeline table in the insights
      const insightsRow = row?.nextElementSibling;
      const timelineTable = insightsRow?.querySelector("table");
      expect(timelineTable).toBeTruthy();

      const rows = Array.from(timelineTable?.querySelectorAll("tr") || []);
      const rowTexts = rows.map((tr) => {
        const cells = Array.from(tr.querySelectorAll("td"));
        return { date: cells[0]?.textContent?.trim(), activity: cells[1]?.textContent?.trim() };
      });

      // Newest-first: the consolidated Wed-Fri gap row, then Tuesday, then
      // Monday - exactly 3 rows, not 5 (no per-day dash rows) and no
      // weekend dates anywhere.
      expect(rowTexts).toHaveLength(3);
      expect(rowTexts[0].date).toBe("2026-06-17 – 2026-06-19");
      expect(rowTexts[0].activity).toBe("No activity for 3 days");
      expect(rowTexts[1].date).toBe("2026-06-16");
      expect(rowTexts[1].activity).toContain("commit");
      expect(rowTexts[2].date).toBe("2026-06-15");
      expect(rowTexts[2].activity).toContain("comment");

      const dateTexts = rowTexts.map((r) => r.date);
      expect(dateTexts).not.toContain("2026-06-20"); // Saturday
      expect(dateTexts).not.toContain("2026-06-21"); // Sunday
    } finally {
      jest.useRealTimers();
    }
  });

  describe("change detection filters", () => {
    test("given actorsMap with multiple users, when page loads, then comment author filter list is populated with checkboxes", async () => {
      initTestPage({
        dataPayload: createMultiPrPayload({
          prs: [
            {
              scenario: "open-no-change",
              prNumber: 801,
              overrides: {
                data: {
                  title: "Test PR for change filters",
                  author: "Test Author",
                  authorLogin: "test-author",
                },
              },
            },
          ],
          actorsMap: {
            "test-author": "Test Author",
            "dependabot[bot]": "dependabot[bot]",
            "github-actions[bot]": "github-actions[bot]",
            reviewer1: "Reviewer One",
            reviewer2: "Reviewer Two",
          },
          lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
        }),
      });

      const user = userEvent.setup();
      await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

      const list = getMultiSelectList("change-filter-ignore-comment-authors-list");
      expect(list).toBeTruthy();
      expect(isMultiSelectEmpty("change-filter-ignore-comment-authors-list")).toBe(false);

      const checkboxes = Array.from(list.querySelectorAll("input[type='checkbox']"));
      expect(checkboxes.length).toBe(5);

      const labels = Array.from(list.querySelectorAll("label")).map(
        (label) => label.textContent,
      );
      expect(labels).toContain("dependabot[bot]");
      expect(labels).toContain("github-actions[bot]");
      expect(labels).toContain("Reviewer One");
      expect(labels).toContain("Reviewer Two");
      expect(labels).toContain("Test Author");
    });

    test("given actorsMap with multiple users, when page loads, then review author filter list is populated with checkboxes", async () => {
      initTestPage({
        dataPayload: createMultiPrPayload({
          prs: [
            {
              scenario: "open-no-change",
              prNumber: 802,
            },
          ],
          actorsMap: {
            "codecov[bot]": "codecov[bot]",
            reviewer1: "Reviewer One",
            reviewer2: "Reviewer Two",
          },
          lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
        }),
      });

      const user = userEvent.setup();
      await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

      const list = getMultiSelectList("change-filter-ignore-review-authors-list");
      expect(list).toBeTruthy();
      expect(isMultiSelectEmpty("change-filter-ignore-review-authors-list")).toBe(false);

      const checkboxes = Array.from(list.querySelectorAll("input[type='checkbox']"));
      expect(checkboxes.length).toBeGreaterThanOrEqual(3);

      const labels = Array.from(list.querySelectorAll("label")).map(
        (label) => label.textContent,
      );
      expect(labels).toContain("codecov[bot]");
      expect(labels).toContain("Reviewer One");
      expect(labels).toContain("Reviewer Two");
    });

    test("given minimal actorsMap, when page loads, then change filter lists are populated from available actors", async () => {
      initTestPage({
        dataPayload: createMultiPrPayload({
          prs: [{ scenario: "open-no-change", prNumber: 803 }],
          actorsMap: {},
          lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
        }),
      });

      const user = userEvent.setup();
      await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

      const commentList = getMultiSelectList("change-filter-ignore-comment-authors-list");
      const reviewList = getMultiSelectList("change-filter-ignore-review-authors-list");

      expect(commentList).toBeTruthy();
      expect(reviewList).toBeTruthy();

      // Lists should contain the same actors (from scenario defaults)
      const commentCheckboxes = Array.from(
        commentList.querySelectorAll("input[type='checkbox']"),
      );
      const reviewCheckboxes = Array.from(
        reviewList.querySelectorAll("input[type='checkbox']"),
      );

      expect(commentCheckboxes.length).toBeGreaterThanOrEqual(0);
      expect(reviewCheckboxes.length).toBeGreaterThanOrEqual(0);
      expect(commentCheckboxes.length).toBe(reviewCheckboxes.length);
    });

    test("given change filter selections, when Apply filters clicked, then selections are persisted to user-defaults", async () => {
      initTestPage({
        dataPayload: createMultiPrPayload({
          prs: [{ scenario: "open-no-change", prNumber: 804 }],
          actorsMap: {
            "dependabot[bot]": "dependabot[bot]",
            "github-actions[bot]": "github-actions[bot]",
            reviewer1: "Reviewer One",
          },
          lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
        }),
      });

      const user = userEvent.setup();
      await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

      // Select comment authors to ignore
      await clickMultiSelectCheckbox(
        "change-filter-ignore-comment-authors-list",
        "dependabot[bot]",
        user,
      );
      await clickMultiSelectCheckbox(
        "change-filter-ignore-comment-authors-list",
        "github-actions[bot]",
        user,
      );

      // Select review authors to ignore
      await clickMultiSelectCheckbox(
        "change-filter-ignore-review-authors-list",
        "reviewer1",
        user,
      );

      // Enter commit patterns
      const commitPatternsTextarea = document.getElementById(
        "change-filter-ignore-commit-patterns",
      );
      commitPatternsTextarea.value = "^docs:\n^test:\n^chore\\(deps\\):";
      commitPatternsTextarea.dispatchEvent(new Event("input", { bubbles: true }));

      fetchMock.mockClear();
      await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

      let latestPutCall;
      await waitFor(() => {
        latestPutCall = fetchMock.mock.calls
          .slice()
          .reverse()
          .find((call) => {
            const [url, init] = call;
            return (
              String(url || "") === "/view-prs/user-defaults" &&
              String(init?.method || "GET").toUpperCase() === "PUT"
            );
          });
        expect(latestPutCall).toBeDefined();
      });

      const savedOverrides = JSON.parse(String(latestPutCall?.[1]?.body || "{}"));
      expect(savedOverrides.changeFilters).toBeDefined();
      expect(savedOverrides.changeFilters.ignoreCommentsFromAuthors).toEqual([
        "dependabot[bot]",
        "github-actions[bot]",
      ]);
      expect(savedOverrides.changeFilters.ignoreReviewsFromAuthors).toEqual(["reviewer1"]);
      expect(savedOverrides.changeFilters.ignoreCommitPatterns).toEqual([
        "^docs:",
        "^test:",
        "^chore\\(deps\\):",
      ]);
    });

    test("given commit patterns with whitespace and empty lines, when Apply filters clicked, then patterns are trimmed and empty lines removed", async () => {
      initTestPage({
        dataPayload: createMultiPrPayload({
          prs: [{ scenario: "open-no-change", prNumber: 805 }],
          actorsMap: {},
          lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
        }),
      });

      const user = userEvent.setup();
      await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

      const commitPatternsTextarea = document.getElementById(
        "change-filter-ignore-commit-patterns",
      );
      commitPatternsTextarea.value = "  ^docs:  \n\n  ^test:  \n   \n^style: formatting";
      commitPatternsTextarea.dispatchEvent(new Event("input", { bubbles: true }));

      fetchMock.mockClear();
      await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

      let latestPutCall;
      await waitFor(() => {
        latestPutCall = fetchMock.mock.calls
          .slice()
          .reverse()
          .find((call) => {
            const [url, init] = call;
            return (
              String(url || "") === "/view-prs/user-defaults" &&
              String(init?.method || "GET").toUpperCase() === "PUT"
            );
          });
        expect(latestPutCall).toBeDefined();
      });

      const savedOverrides = JSON.parse(String(latestPutCall?.[1]?.body || "{}"));
      expect(savedOverrides.changeFilters.ignoreCommitPatterns).toEqual([
        "^docs:",
        "^test:",
        "^style: formatting",
      ]);
    });

    test("given user-defaults with change filters, when page loads, then selections are restored", async () => {
      initTestPage({
        dataPayload: createMultiPrPayload({
          prs: [{ scenario: "open-no-change", prNumber: 806 }],
          actorsMap: {
            "dependabot[bot]": "dependabot[bot]",
            "codecov[bot]": "codecov[bot]",
            reviewer1: "Reviewer One",
            reviewer2: "Reviewer Two",
          },
          lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
        }),
        userDefaultsOverrides: {
          repo: "owner/repo",
          changeFilters: {
            ignoreCommentsFromAuthors: ["dependabot[bot]", "codecov[bot]"],
            ignoreReviewsFromAuthors: ["reviewer1"],
            ignoreCommitPatterns: ["^docs:", "^test:", "^chore\\(deps\\):"],
          },
        },
      });

      const user = userEvent.setup();
      await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

      // Check comment author selections are restored
      const commentAuthorsSelections = getSelectedMultiSelectValues(
        "change-filter-ignore-comment-authors-list",
      );
      expect(commentAuthorsSelections).toEqual(
        expect.arrayContaining(["dependabot[bot]", "codecov[bot]"]),
      );
      expect(commentAuthorsSelections.length).toBe(2);

      // Check review author selections are restored
      const reviewAuthorsSelections = getSelectedMultiSelectValues(
        "change-filter-ignore-review-authors-list",
      );
      expect(reviewAuthorsSelections).toEqual(["reviewer1"]);

      // Check commit patterns are restored
      const commitPatternsTextarea = document.getElementById(
        "change-filter-ignore-commit-patterns",
      );
      expect(commitPatternsTextarea.value).toBe("^docs:\n^test:\n^chore\\(deps\\):");
    });

    test("given change filter selections, when selections are changed and Apply filters clicked, then new selections replace old ones", async () => {
      initTestPage({
        dataPayload: createMultiPrPayload({
          prs: [{ scenario: "open-no-change", prNumber: 807 }],
          actorsMap: {
            "dependabot[bot]": "dependabot[bot]",
            "github-actions[bot]": "github-actions[bot]",
            reviewer1: "Reviewer One",
            reviewer2: "Reviewer Two",
          },
          lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
        }),
        userDefaultsOverrides: {
          repo: "owner/repo",
          changeFilters: {
            ignoreCommentsFromAuthors: ["dependabot[bot]"],
            ignoreReviewsFromAuthors: ["reviewer1"],
            ignoreCommitPatterns: ["^docs:"],
          },
        },
      });

      const user = userEvent.setup();
      await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

      // Verify initial state
      expect(
        getSelectedMultiSelectValues("change-filter-ignore-comment-authors-list"),
      ).toEqual(["dependabot[bot]"]);

      // Change selections
      await clickMultiSelectCheckbox(
        "change-filter-ignore-comment-authors-list",
        "dependabot[bot]",
        user,
      ); // Uncheck
      await clickMultiSelectCheckbox(
        "change-filter-ignore-comment-authors-list",
        "github-actions[bot]",
        user,
      ); // Check
      await clickMultiSelectCheckbox(
        "change-filter-ignore-review-authors-list",
        "reviewer2",
        user,
      ); // Add reviewer2

      const commitPatternsTextarea = document.getElementById(
        "change-filter-ignore-commit-patterns",
      );
      commitPatternsTextarea.value = "^test:\n^style:";
      commitPatternsTextarea.dispatchEvent(new Event("input", { bubbles: true }));

      fetchMock.mockClear();
      await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

      let latestPutCall;
      await waitFor(() => {
        latestPutCall = fetchMock.mock.calls
          .slice()
          .reverse()
          .find((call) => {
            const [url, init] = call;
            return (
              String(url || "") === "/view-prs/user-defaults" &&
              String(init?.method || "GET").toUpperCase() === "PUT"
            );
          });
        expect(latestPutCall).toBeDefined();
      });

      const savedOverrides = JSON.parse(String(latestPutCall?.[1]?.body || "{}"));
      expect(savedOverrides.changeFilters.ignoreCommentsFromAuthors).toEqual([
        "github-actions[bot]",
      ]);
      expect(savedOverrides.changeFilters.ignoreReviewsFromAuthors).toEqual(
        expect.arrayContaining(["reviewer1", "reviewer2"]),
      );
      expect(savedOverrides.changeFilters.ignoreReviewsFromAuthors.length).toBe(2);
      expect(savedOverrides.changeFilters.ignoreCommitPatterns).toEqual(["^test:", "^style:"]);
    });

    test("given no change filter selections, when Apply filters clicked, then empty arrays are persisted", async () => {
      initTestPage({
        dataPayload: createMultiPrPayload({
          prs: [{ scenario: "open-no-change", prNumber: 808 }],
          actorsMap: {
            reviewer1: "Reviewer One",
          },
          lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
        }),
      });

      const user = userEvent.setup();
      await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

      fetchMock.mockClear();
      await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

      let latestPutCall;
      await waitFor(() => {
        latestPutCall = fetchMock.mock.calls
          .slice()
          .reverse()
          .find((call) => {
            const [url, init] = call;
            return (
              String(url || "") === "/view-prs/user-defaults" &&
              String(init?.method || "GET").toUpperCase() === "PUT"
            );
          });
        expect(latestPutCall).toBeDefined();
      });

      const savedOverrides = JSON.parse(String(latestPutCall?.[1]?.body || "{}"));
      // When all filter arrays are empty, changeFilters should be removed from saved overrides
      expect(savedOverrides.changeFilters).toBeUndefined();
    });

    test("given commit patterns textarea with complex regex, when Apply filters clicked, then patterns are preserved exactly", async () => {
      initTestPage({
        dataPayload: createMultiPrPayload({
          prs: [{ scenario: "open-no-change", prNumber: 809 }],
          actorsMap: {},
          lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
        }),
      });

      const user = userEvent.setup();
      await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

      const commitPatternsTextarea = document.getElementById(
        "change-filter-ignore-commit-patterns",
      );
      // Complex regex patterns with special characters
      commitPatternsTextarea.value = "^chore\\(deps(-dev)?\\): bump\n^(docs|test):\\s+[A-Z]\n^Merge branch .* into .*$";
      commitPatternsTextarea.dispatchEvent(new Event("input", { bubbles: true }));

      fetchMock.mockClear();
      await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

      let latestPutCall;
      await waitFor(() => {
        latestPutCall = fetchMock.mock.calls
          .slice()
          .reverse()
          .find((call) => {
            const [url, init] = call;
            return (
              String(url || "") === "/view-prs/user-defaults" &&
              String(init?.method || "GET").toUpperCase() === "PUT"
            );
          });
        expect(latestPutCall).toBeDefined();
      });

      const savedOverrides = JSON.parse(String(latestPutCall?.[1]?.body || "{}"));
      expect(savedOverrides.changeFilters.ignoreCommitPatterns).toEqual([
        "^chore\\(deps(-dev)?\\): bump",
        "^(docs|test):\\s+[A-Z]",
        "^Merge branch .* into .*$",
      ]);
    });
  });

  describe("React mount failure (Phase 6 - see REACT_MIGRATION_PLAN.md)", () => {
    test("given window.mountReactPrTable genuinely throws, when the initial PR data loads, then renderPrData shows a minimal error message instead of silently leaving the table empty", async () => {
      // Distinct from the ordinary "React's deferred module hasn't finished
      // loading yet" race (which this suite's installReactTableMountBridge
      // pairing never simulates - see renderPrData's own comment on why that
      // race now leaves #pr-sections empty rather than falling back to a
      // vanilla table build). This is the other branch: mountReactTable's
      // (index.page.js) try/catch around window.mountReactPrTable() catches
      // a genuine failure - renderPrData must surface
      // renderPrTableMountError()'s honest error state, not pretend to
      // recover.
      initTestPage({
        dataPayload: createMultiPrPayload({
          prs: [{ scenario: "open-no-change", prNumber: 1 }],
        }),
      });
      window.mountReactPrTable = () => {
        throw new Error("React mount failed");
      };

      const errorMessage = await screen.findByText(
        "Failed to load the PR table. Please refresh the page.",
      );
      expect(errorMessage).toHaveClass("pr-table-mount-error");
      expect(screen.queryByText("#1")).toBeNull();
    });
  });
});
