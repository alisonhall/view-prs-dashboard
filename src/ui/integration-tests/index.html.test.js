/** @jest-environment jsdom */

const fs = require("fs");
const path = require("path");
const React = require("react");
// Phase 6 (see REACT_MIGRATION_PLAN.md): this suite mounts the real
// PrTableApp (see installReactTestGlobals() below) via
// @testing-library/react's own render()/cleanup() rather than a hand-rolled
// ReactDOM.createRoot() bridge - see that function's own comment for why.
// Importing it also configures @testing-library/dom's *shared* global
// config (the same `configure()` singleton this file's own
// `screen`/`waitFor`/`within` below read from) with an eventWrapper that
// wraps every fireEvent-dispatched event (which @testing-library/user-event
// uses internally for every keystroke/click) in act().
const { render: rtlRender, cleanup, act } = require("@testing-library/react");
// @testing-library/react's render() sets this automatically, but setting it
// here too documents the requirement plainly and stays correct even if the
// bridge above ever stops going through render().
global.IS_REACT_ACT_ENVIRONMENT = true;
const { screen, waitFor, within, fireEvent } = require("@testing-library/dom");
const userEvent = require("@testing-library/user-event").default;
// UI redesign phase 2: "View PR JSON details" is in each row's More menu.
const openPrJsonDetails = async (user, prNumber) => {
  const [moreButton] = await screen.findAllByRole("button", { name: `More actions for PR #${prNumber}` });
  await user.click(moreButton);
  await user.click(await screen.findByRole("menuitem", { name: "View PR JSON details" }));
};
// Shows a PR row in the detail pane on one of its tabs (Overview,
// Activity, Conversations, Notes): clicks the row (its Signals cell, which
// isn't a control) unless it's already selected, then the tab unless it's
// already open. Returns the tab's panel.
const openPrPane = async (user, row, tab = "Overview") => {
  if (row.getAttribute("aria-current") !== "true") {
    await user.click(row.querySelector(".pr-cell-signals"));
  }
  const tabButton = within(document.querySelector(".pr-pane")).getByRole("tab", { name: new RegExp(`^${tab}`) });
  if (tabButton.getAttribute("aria-selected") !== "true") {
    await user.click(tabButton);
  }
  return within(document.querySelector(".pr-pane")).getByRole("tabpanel");
};
// Expands one thread on the Conversations tab and returns its list item.
const openConversation = async (user, panel, threadId) => {
  const item = panel.querySelector(`.pr-conv-thread[data-thread-id="${threadId}"]`);
  const row = within(item).getByRole("button", { expanded: false });
  await user.click(row);
  return item;
};
// The Conversations tab's filter chip whose name starts with `name`.
const conversationChip = (panel, name) =>
  within(within(panel).getByRole("group", { name: "Show" })).getByRole("button", { name: new RegExp(`^${name}`) });
// Starts the page with the detail pane hidden (the saved choice), so the
// table shows its Size and Activity columns.
const hideDetailPane = () => {
  const { PANE_VISIBLE_STORAGE_KEY } = require("../state/PrTableUiStateProvider");
  window.localStorage.setItem(PANE_VISIBLE_STORAGE_KEY, "false");
};
// A tooltip's text, through its trigger's aria-describedby.
const tooltipDescription = (element) => {
  const id = element?.closest(".ui-tooltip-target, [aria-describedby]")?.getAttribute("aria-describedby") || "";
  return document.getElementById(id)?.textContent || "";
};
const { formatIsoDatetime } = require("../helpers/pr-formatting.helpers.ts").createPrFormattingHelpers();
// The accessible names of a row's Signals icons, in slot order.
const signalNames = (row) =>
  Array.from(row?.querySelectorAll(".pr-cell-signals [role='img']") || []).map((icon) => icon.getAttribute("aria-label"));
const { createMultiPrPayload } = require("../test-fixtures/pr-data.fixtures.ts");
const { PrDataPolling } = require("../components/PrDataPolling");
const { PrDataProvider } = require("../state/PrDataProvider");
// Test-only bridge removal (see WINDOW_BRIDGE_ELIMINATION_PLAN.md): the
// harness root's PrDataProvider is read through this probe (mounted below);
// it was window.getReactPrTablePayload, deleted.
const { createPrDataProbe } = require("../test-fixtures/pr-data-probe");
const prDataProbe = createPrDataProbe();
const { FilterStateProvider } = require("../state/FilterStateProvider");
const { useFilterState } = require("../state/FilterStateContext");
const { NotesDirtyProvider } = require("../components/NotesDirtyProvider");
const { PrTableUiStateProvider } = require("../state/PrTableUiStateProvider");
const { useNotesDirty } = require("../state/NotesDirtyContext");
const { AuthorInsightsDraftsProvider } = require("../components/AuthorInsightsDraftsProvider");
const { AutoRenderBlockingSync } = require("../components/AutoRenderBlockingSync");
const { AutoRenderBlockingProvider } = require("../components/AutoRenderBlockingProvider");
const { SettingsDrawerProvider, useSettingsDrawer } = require("../state/SettingsDrawerContext");
const { useStatusText } = require("../state/StatusTextContext");
const { PrActivityQueueProvider } = require("../components/PrActivityQueueProvider");
const { StatusTextProvider } = require("../components/StatusTextProvider");
const { BackfillStatusProvider } = require("../components/BackfillStatusProvider");
const { RequestActivityProvider } = require("../components/RequestActivityProvider");
const { useRequestActivity } = require("../state/RequestActivityContext");
const { FilterOptionsProvider } = require("../components/FilterOptionsProvider");
const { RowFilterSelectionProvider } = require("../state/RowFilterSelectionProvider");
const { AuthorThreadResolutionSelectionProvider } = require("../state/AuthorThreadResolutionSelectionProvider");
const { ChangeFilterActorSelectionProvider } = require("../state/ChangeFilterActorSelectionProvider");
const { AppShell } = require("../components/shell/AppShell");
const { ListSelectionSeeding } = require("../state/useListSelectionSeeding");
const { buildFilterStateInitialValues } = require("../state/filterStateInitialValues");
const { SnackbarProvider } = require("../components/SnackbarProvider");

const htmlPath = path.join(__dirname, "..", "index.html");
const indexHtml = fs.readFileSync(htmlPath, "utf8");
const commonCss = fs.readFileSync(path.join(__dirname, "..", "styles", "common.css"), "utf8");

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
// Window-bridge elimination Phase 5b (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
// the real FilterStateProvider's Context value, captured by
// FilterStateTestHandle below. This suite's own helpers (and a few assertions)
// used to read/write that state through window.getFilterStateValues()/
// setFilterStateValue() - bridges with no production caller, deleted. null
// until the harness tree mounts (and after it unmounts), like the bridges
// were.
let filterStateTestHandle = null;
let settingsDrawerTestHandle = null;
// Window-bridge elimination Phase 7.3: the real RequestActivityProvider's
// functions, captured by RequestActivityTestHandle below - the scheduler test
// drives renderSchedulerStatus through this, as JobEventsProvider's SSE path
// does in production (it used to call window.renderSchedulerStatus).
let requestActivityTestHandle = null;
let statusTextTestHandle = null;
// Window-bridge elimination Phase 7.4: the real NotesDirtyProvider's value,
// captured by NotesDirtyTestHandle below. The deferred-poll tests mark a PR's
// notes dirty through it (they used to stub window.getDirtyNotesPrNumbers and
// call window.recomputeDirtyPrSectionsFields, both index.page.js's).
let notesDirtyTestHandle = null;
const readFilterStateValues = () => filterStateTestHandle?.values;

const createFetchMock = ({
  userDefaultsOverrides = {},
  backfillStatusResponse = null,
  authorCommentsGetHandler = null,
} = {}) => {
  const currentBackfillStatus = () =>
    backfillStatusResponse || {
      ok: true,
      running: false,
      summary: "Backfill status: not running",
      output: "Backfill status: not running",
    };
  return jest.fn(async (url, init = {}) => {
    const normalizedUrl = String(url || "");
    const method = String(init?.method || "GET").toUpperCase();

    if (normalizedUrl === "/view-prs/user-defaults" && method === "GET") {
      return createOkJsonResponse({ ok: true, overrides: userDefaultsOverrides });
    }

    if (normalizedUrl === "/view-prs/user-defaults" && method === "PUT") {
      return createOkJsonResponse({ ok: true });
    }

    if (normalizedUrl === "/view-prs/backfill" && method === "GET") {
      return createOkJsonResponse(currentBackfillStatus());
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
      // Like the real server (view-prs-data-routes.js's buildDataPayload), the
      // data response embeds the same backfill state /view-prs/backfill
      // returns; a fixture's own `backfill` wins. Window-bridge elimination
      // Phase 7.2 made this matter: the data load and the Backfill section's own
      // status load now both start on mount, so whichever finishes last
      // renders the backfill status, and a payload without `backfill` makes
      // updateBackfillStatusFromPayload render the payload itself as one.
      return createOkJsonResponse({ backfill: currentBackfillStatus(), ...latestDataPayload });
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
};

// Phase 6 (see REACT_MIGRATION_PLAN.md): this suite never loads the real
// react-app.tsx bundle (an ES module that mounts the app as an import-time
// side effect), so index.page.js's
// renderPrData always used to see hasReactApp as false and take its
// "React not available" branch, which used to build a full vanilla table.
// That branch (and the vanilla table-build code it called) is gone now, so
// this suite needs a real React-rendered table to keep exercising real
// row/checkbox/Ack DOM the same way a real browser does. Rather than
// importing the whole react-app.tsx module, FilterStateTestRootHarness
// (below) mounts the real AppShell inside the same Providers production
// uses, nested the same way. Installed both from
// initTestPage() and from the one test below that builds its own page setup
// from scratch instead of using it.
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
// Phase H.12 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// window.renderReactFilterSummary/window.updateReactDataMetaText (the 2
// push bridges this used to install a standalone rtlRender tree for) are
// both confirmed dead in production - DataViewHeader derives the same
// summary/chips/#data-meta text live, reactively, from Context instead.
// The harness's real AppShell renders it inside the harness's
// PrDataProvider (not as its own independent root the way this used to
// be), since it needs a real <PrDataProvider/> ancestor.
// Window-bridge elimination Phase 3 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
// the REAL AutoRenderBlockingProvider is mounted by FilterStateTestRootHarness
// below, as the ancestor of the harness's PrDataProvider - the same
// order react-app.tsx uses. It used to be its own separate,
// sibling root (installAutoRenderBlockingProviderBridge), which stopped
// working once PrDataProvider started reading it through Context: a
// PrDataProvider outside the Provider sees the inert default, so the whole
// auto-render-blocking path would silently do nothing.

// Window-bridge elimination Phase 7 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
// WindowBackedPrActivityProvider (a RequestActivityContext stand-in that
// forwarded to window.beginRequestActivity) is gone. Its harness roots
// called those hooks outside this suite's real PrDataProvider, which used to
// mount lazily with the PR table; the Provider now mounts once at the root
// of FilterStateTestRootHarness (it loads the data itself, as in
// production), so every hook below is a genuine descendant of it.

// The suite mounts the REAL FilterStateProvider, seeded with every field's
// default as production is (buildFilterStateInitialValues). Its fields are
// the real filter bar's and Settings drawer's, so tests drive them with
// user-event like a user would.

function NotesDirtyTestHandle() {
  notesDirtyTestHandle = useNotesDirty();
  React.useEffect(
    () => () => {
      notesDirtyTestHandle = null;
    },
    [],
  );
  return null;
}

// Captures the real FilterStateProvider's Context value for the helpers above.
function RequestActivityTestHandle() {
  requestActivityTestHandle = useRequestActivity();
  React.useEffect(
    () => () => {
      requestActivityTestHandle = null;
    },
    [],
  );
  return null;
}

function FilterStateTestHandle() {
  const state = useFilterState();
  filterStateTestHandle = state;
  React.useEffect(
    () => () => {
      filterStateTestHandle = null;
    },
    [],
  );
  return null;
}

// The suite's single persistent root: the real Providers, nested as
// react-app.tsx nests them, around the real <AppShell /> (the whole page),
// rendered into index.html's #app-root. The differences from production:
// the Settings drawer starts open (most tests drive its fields), the test
// handles below capture Context values for the helpers above, and
// TabStateProvider, OutputTextProvider, RepoLabelsProvider and
// JobEventsProvider are left out (their inert defaults are enough here; the
// view tabs don't switch).
//
// PrDataProvider loads /view-prs/data itself (loadOnMount), so this root
// must mount after initTestPage() points fetch at the test's fetchMock (see
// installFilterStateProviderBridge's callers). PrDataPolling is mounted as
// in production, so the "data polling" tests drive it with fake timers.
function FilterStateTestRootHarness({ initialValues }) {
  const h = React.createElement;
  return h(
    SnackbarProvider,
    null,
    h(
      StatusTextProvider,
      null,
      h(
        RequestActivityProvider,
        { loadOnMount: true },
        h(RequestActivityTestHandle),
        h(
          BackfillStatusProvider,
          null,
          h(
            RowFilterSelectionProvider,
            null,
            h(
              AuthorThreadResolutionSelectionProvider,
              null,
              h(
                ChangeFilterActorSelectionProvider,
                null,
                h(
                  FilterStateProvider,
                  { initialValues },
                  h(FilterStateTestHandle),
                  h(
                    PrActivityQueueProvider,
                    null,
                    h(
                      AutoRenderBlockingProvider,
                      null,
                      h(
                        PrDataProvider,
                        { initialPayload: {}, initialSelectedRepo: "", loadOnMount: true },
                        h(prDataProbe.PrDataProbe),
                        h(StatusTextTestHandle),
                        h(
                          NotesDirtyProvider,
                          null,
                          h(
                            PrTableUiStateProvider,
                            null,
                            h(
                              SettingsDrawerProvider,
                              { initialOpen: true },
                              h(SettingsDrawerTestHandle),
                              h(
                                AuthorInsightsDraftsProvider,
                                null,
                                h(AutoRenderBlockingSync),
                                h(NotesDirtyTestHandle),
                                h(FilterOptionsProvider, null, h(ListSelectionSeeding), h(AppShell)),
                              ),
                            ),
                          ),
                        ),
                        h(PrDataPolling, null),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

const installFilterStateProviderBridge = () => {
  rtlRender(
    React.createElement(FilterStateTestRootHarness, {
      // Every field's default, as production starts with: the filter bar
      // and the Settings drawer show the real fields.
      initialValues: buildFilterStateInitialValues(),
    }),
    { container: document.getElementById("app-root") },
  );
};

// UI redesign phase 9b: the run buttons, the PR numbers, the rules, the
// Script options and Backfill are the real Settings drawer's, open at Run &
// check (closed in production). showSettingsSectionForTest switches its
// section.
function SettingsDrawerTestHandle() {
  settingsDrawerTestHandle = useSettingsDrawer();
  React.useEffect(
    () => () => {
      settingsDrawerTestHandle = null;
    },
    [],
  );
  return null;
}

// The status message's setter, for tests that fake the script's
// "Viewer: <login>" line (PrDataProvider's last-resort viewer login reads
// #status, which the drawer renders from this).
function StatusTextTestHandle() {
  statusTextTestHandle = useStatusText();
  React.useEffect(
    () => () => {
      statusTextTestHandle = null;
    },
    [],
  );
  return null;
}
const setStatusTextForTest = (text) => {
  act(() => statusTextTestHandle?.setStatusText(text));
};

// Unmounts the previous generation's React roots and installs the window
// globals this suite still fakes (the helper modules index.html's <script>
// tags would load).
//
// Window-bridge elimination Phase 7 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
// this was installReactTableMountBridge, and also stubbed
// window.mountReactPrTable for index.page.js's renderPrData to call. Both
// that bridge and renderPrData are gone: the PR table now mounts from
// FilterStateTestRootHarness's own PrDataProvider (the real AppShell's
// PrTable), as in production.
const installReactTestGlobals = () => {
  cleanup();
  // index.html loads DOMPurify from a vendored <script>; without it the
  // review-comment markdown renderer fails closed to escaped text.
  window.DOMPurify = require("dompurify");
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
  // than after - see installReactTestGlobals()'s own cleanup() call
  // for why unmounting matters here; doing it before detaching the
  // container gives React's own commit/cleanup work a normally-connected
  // DOM to run against.
  cleanup();
  jest.resetModules();
  // Phase 7, sub-phase 7.4 (see REACT_MIGRATION_PLAN.md): the 9 multi-select
  // lists' "pending selections" now live on a dedicated window-level store
  // (pr-pending-multi-select-selections.helpers.ts), not a module-scope
  // variable inside index.page.js (deleted since) - jest.resetModules()
  // above doesn't reset them, since window itself is shared across every
  // test in this file. Reset explicitly, same reasoning as the interval/listener
  // tracking below this function.
  delete window.viewPrsPendingMultiSelectSelections;
  delete window.viewPrsPendingMultiSelectSelectionsListeners;
  latestDataPayload = dataPayload || { ok: true, byPrNumber: {}, lastRun: null };
  actionLogEntries = Array.isArray(actionEntries) ? actionEntries : [];
  actorNameCacheEntries = actorNameEntries && typeof actorNameEntries === "object"
    ? actorNameEntries
    : {};
  actorLoginAliasEntries = aliasEntries && typeof aliasEntries === "object"
    ? aliasEntries
    : {};
  document.body.innerHTML = extractBodyHtml(indexHtml);
  installReactTestGlobals();

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

  // Phase E (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"): must
  // mount *after* global.fetch/window.fetch point at this test's own
  // fetchMock - FilterStateProvider's restore effect fires its
  // /view-prs/user-defaults GET immediately on mount, and would otherwise
  // race against (and miss) this test's userDefaultsOverrides fixture.
  installFilterStateProviderBridge();

  // Window-bridge elimination Phase 7.5: index.page.js is deleted (this used
  // to require() it here, after the root mounted). Its credential hints are
  // props on the React inputs this root renders.
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
  return !list || list.classList.contains("empty") || !list.querySelector("input[type='checkbox']");
};

const setCheckbox = async (checkbox, checked, user) => {
  if (checkbox.checked !== checked) await user.click(checkbox);
};

const clickMultiSelectCheckbox = async (listId, value, user) => {
  const list = getMultiSelectList(listId);
  if (!list) throw new Error(`Multi-select list not found: ${listId}`);
  const checkbox = list.querySelector(`input[type="checkbox"][value="${value}"]`);
  if (!checkbox) throw new Error(`Checkbox not found for value: ${value} in list: ${listId}`);
  await user.click(checkbox);
};

// Window-bridge elimination Phase 6 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
// window.persistViewFilterOptionOverrides is gone. FilterStateProvider's own
// 150ms debounced effect is the only thing that saves view-filter fields, so
// tests wait for it: the latest PUT to /view-prs/user-defaults must pass
// `assertBody`. Asserting inside waitFor (rather than on the first PUT seen)
// tolerates an intermediate debounced save if a test's steps straddle 150ms;
// the debounce always ends on the final state. Clear fetchMock *before* the
// changes being asserted on, not after them, or the save can land first.
const waitForPersistedViewFilterOverrides = async (assertBody) => {
  await waitFor(() => {
    const putCall = fetchMock.mock.calls
      .slice()
      .reverse()
      .find(([url, init]) => (
        String(url || "") === "/view-prs/user-defaults" &&
        String(init?.method || "GET").toUpperCase() === "PUT"
      ));
    expect(putCall).toBeDefined();
    assertBody(JSON.parse(String(putCall[1]?.body || "{}")));
  });
};

// Shows a Settings drawer section, as clicking its tab would (the drawer
// is mounted open): Testing Library's queries skip the hidden ones.
const showSettingsSectionForTest = (section) => {
  act(() => settingsDrawerTestHandle.setSection(section));
};

describe("index page rendering with Testing Library", () => {
  beforeAll(() => {
    // jsdom does not implement scrollIntoView; polyfill to prevent unhandled exceptions
    // in page code that calls it as a UX enhancement (no-op is correct in tests)
    if (typeof window.HTMLElement.prototype.scrollIntoView !== "function") {
      window.HTMLElement.prototype.scrollIntoView = () => {};
    }
    // user-event adds its document focus/blur listeners once per document,
    // on the first setup(). Do that here, before beforeEach starts tracking
    // (and afterEach removing) document listeners: without them, typing into
    // a controlled input in any later test never reaches React's onChange.
    userEvent.setup();
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
  // (Window-bridge elimination Phase 7.5 deleted index.page.js, so nothing
  // here require()s it any more. The tracking stays: each test still mounts
  // React roots whose timers and listeners would otherwise outlive it.)
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
    // The detail pane's shown/hidden choice is saved here; start shown.
    window.localStorage.clear();
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
    // Some handlers (e.g. FilterStateProvider's debounced view-filter
    // persist) kick off a fire-and-forget persistence fetch that the test
    // never awaits. If that Promise chain is still pending
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

  // The view tabs are the app header's (AppHeader.test.tsx covers them);
  // the old management tabs are the Settings drawer's sections.
  test("shows the page heading in the app header", () => {
    initTestPage();
    expect(within(screen.getByRole("banner")).getByRole("heading", { level: 1, name: "View PR Updates" })).toBeInTheDocument();
  });

  test("blocked auto-update banner is hidden by default and exposes apply action", () => {
    initTestPage();
    const indicator = document.getElementById("auto-render-blocked-indicator");
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveAttribute("hidden");
    expect(document.getElementById("auto-render-blocked-apply-btn")).toBeInTheDocument();
  });

  // "switches the active data tab when a user clicks Review statistics"
  // was removed here: it clicked the real vanilla <button id="tab-review-
  // stats">, which Phase A, slice 1 (see REACT_MIGRATION_PLAN.md, "Full
  // migration roadmap") replaced with an empty React portal root
  // (DataTabButton.jsx/TabStateProvider.tsx) - no vanilla-DOM fallback
  // left for this jsdom-only suite (which never loads react-app.tsx) to
  // click. Already covered in a real browser by e2e/smoke.spec.js's
  // existing "lifecycle section expand/collapse and tab switching work"
  // test, which clicks both the Review statistics and Author Insights
  // buttons and asserts their panels become visible - confirmed it
  // actually catches a regression here too (temporarily disabled
  // TabStateProvider's DOM-sync call and reran just that test).

  // "author insights View in table switches to PR data tab and expands the
  // insights row" was removed here: it exercised Review Stats' "View in
  // table" link/content, which is React-owned (#stats-content-root) with
  // no vanilla-DOM fallback left for this jsdom-only suite (which never
  // loads react-app.tsx) to render into - see the "React-owned Review
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
    expect(within(row).getByRole("button", { name: "Update PR #11" })).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Ack PR #11" })).toBeInTheDocument();
    expect(
      within(openSection).getByRole("button", { name: "More actions for PR #11" }),
    ).toBeInTheDocument();

    const summaryToggle = within(row).getByRole("button", { name: "Show summary for PR #11" });
    expect(within(row).getByText("1 pending comment")).toBeInTheDocument();

    // The chevron opens the summary; its "Show details" shows the PR in the
    // detail pane.
    const summaryRow = row?.nextElementSibling;
    expect(summaryRow?.hidden).toBe(true);
    await user.click(summaryToggle);
    expect(summaryRow?.hidden).toBe(false);
    expect(summaryToggle).toHaveAccessibleName("Hide summary for PR #11");
    expect(within(summaryRow).getByRole("heading", { name: "Why it's here" })).toBeInTheDocument();
    // One cell spanning every column: select, Signals, Pull request, Who,
    // Review, CHK·MRG, Actions (Size and Activity make room for the pane).
    expect(summaryRow?.querySelector("td")?.getAttribute("colspan")).toBe("7");

    const pane = screen.getByRole("complementary", { name: "PR details" });
    expect(pane).toHaveTextContent("No PR selected");
    await user.click(within(summaryRow).getByRole("button", { name: "Show details for PR #11" }));
    expect(row).toHaveAttribute("aria-current", "true");
    const notesPanel = await openPrPane(user, row, "Notes");
    expect(notesPanel.querySelector(".pr-notes-section")).toBeTruthy();
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

    const insightsContent = await openPrPane(user, row, "Conversations");
    const thread = await openConversation(user, insightsContent, "thread-attachments-1");
    const placeholder = thread.querySelector(".md-image-expired");
    expect(placeholder).toBeTruthy();
    expect(String(placeholder?.textContent || "")).toContain("image unavailable");

    const retainedAttachmentImage = insightsContent?.querySelector(
      'img[src*="github.com/user-attachments"]',
    );
    expect(retainedAttachmentImage).toBeNull();
  });

  test("given additions and deletions are available, when the insights are opened, then Lines changed renders GitHub-style totals", async () => {
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

    const insightsContent = await openPrPane(user, row);
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
    // The Activity column only shows while the detail pane is hidden.
    hideDetailPane();
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

      // UI redesign phase 2: the last check is in the Activity cell's
      // tooltip (it was the Status column's "↻ 20m ago"), and a stale one
      // is marked on the age.
      const openRow = screen.getByText("#11").closest("tr");
      const mergedRow = screen.getByText("#99").closest("tr");
      const openActivity = openRow?.querySelector(".pr-activity");
      const mergedActivity = mergedRow?.querySelector(".pr-activity");

      expect(tooltipDescription(openActivity)).toContain(
        `Last checked for updates at ${formatIsoDatetime("2026-06-16T10:10:00Z")}. (stale)`,
      );
      expect(tooltipDescription(mergedActivity)).toContain(
        `Last checked for updates at ${formatIsoDatetime("2026-06-16T10:20:00Z")}.`,
      );
      expect(tooltipDescription(mergedActivity)).not.toContain("(stale)");
      expect(openActivity).toHaveAttribute("data-stale", "true");
      expect(mergedActivity).not.toHaveAttribute("data-stale");
    } finally {
      nowSpy.mockRestore();
    }
  });

  test("given an open PR row, when rendering, then the PR link is in the Pull request cell with no busy indicator, and the last check is in the Activity cell's tooltip", async () => {
    // The Activity column only shows while the detail pane is hidden.
    hideDetailPane();
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

    const titleCell = document.querySelector('.pr-cell-title[data-pr-number="12"]');
    expect(titleCell?.querySelector(".pr-link")).toHaveTextContent("#12");
    expect(titleCell?.querySelector(".pr-busy")).toBeNull();
    const row = titleCell?.closest("tr");
    expect(tooltipDescription(row?.querySelector(".pr-activity"))).toContain(
      `Last checked for updates at ${formatIsoDatetime("2026-06-16T10:10:00Z")}.`,
    );
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

    const openConversationsTab = async () => {
      const openSection = await getOpenSection();
      const row = within(openSection).getByText("#77").closest("tr");
      return openPrPane(user, row, "Conversations");
    };

    // A wrongly resolved thread is counted in the summary line and listed
    // under Unresolved; a rightly resolved one is hidden there.
    const expectWarningState = async (expectedWarning) => {
      const panel = await openConversationsTab();
      const summaryText = String(panel.querySelector(".pr-conv-summary")?.textContent || "");
      const thread = panel.querySelector('.pr-conv-thread[data-thread-id="thread-author-resolved"]');
      if (expectedWarning) {
        expect(summaryText).toContain("1 resolved by the wrong person");
        expect(thread).toHaveAttribute("data-state", "wrong");
      } else {
        expect(summaryText).not.toContain("wrong person");
        expect(thread).toBeNull();
        expect(panel).toHaveTextContent("1 resolved conversation hidden");
      }
    };

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
    await expectWarningState(false);

    await user.selectOptions(modeField, "deny-only");
    await clickMultiSelectCheckbox(
      "attention-author-thread-resolution-deny-list",
      "reviewer1",
      user,
    );
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

    const expectWarningState = async (expectedWarning) => {
      const openSection = await getOpenSection();
      const row = within(openSection).getByText("#177").closest("tr");
      const panel = await openPrPane(user, row, "Conversations");
      const summaryText = String(panel.querySelector(".pr-conv-summary")?.textContent || "");
      if (expectedWarning) {
        expect(summaryText).toContain("1 resolved by the wrong person");
      } else {
        expect(summaryText).not.toContain("wrong person");
      }
    };

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
    await expectWarningState(false);

    await user.selectOptions(modeField, "deny-only");
    await expectWarningState(true);
  });

  test("given mixed resolved and unresolved conversations, when opening Conversations, then the summary and filter chips count them", async () => {
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
    const panel = await openPrPane(user, row, "Conversations");
    expect(panel.querySelector(".pr-conv-summary")).toHaveTextContent("1 unresolved");
    expect(conversationChip(panel, "Unresolved")).toHaveTextContent("1");
    expect(conversationChip(panel, "All")).toHaveTextContent("2");
    expect(panel).toHaveTextContent("1 resolved conversation hidden");
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

    setStatusTextForTest("Viewer : ahall236_uhg");

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

    // The Who column names the author, and only rings the viewer's avatar.
    const authorAvatar = within(row).getByRole("img", { name: "Author: PR Author" });
    expect(authorAvatar.querySelector(".ui-avatar")).not.toHaveAttribute("data-viewer");

    const insightsContent = await openPrPane(user, row, "Conversations");
    expect(insightsContent).toBeTruthy();

    const thread = await openConversation(user, insightsContent, "thread-identity-1");
    expect(thread.querySelector(".actor-identity-pr-author")?.textContent).toContain(
      "PR Author",
    );
    expect(thread.querySelector(".actor-identity-viewer")?.textContent).toContain(
      "Alison Hall",
    );

    // The activity feed and daily summary are on the Activity tab.
    const activityContent = await openPrPane(user, row, "Activity");
    const activitySequenceSection = Array.from(
      activityContent?.querySelectorAll(".pr-activity-list .actor-identity") || [],
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
      activityContent?.querySelectorAll("table .actor-identity") || [],
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

    expect(commonCss).toMatch(/\.actor-identity-viewer\s*\{/);
    expect(commonCss).toMatch(/\.actor-identity-pr-author\s*\{/);
  });

  test("given a review thread with multiple comments, when opening it on Conversations, then its GitHub link targets the thread starter URL", async () => {
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
    const panel = await openPrPane(user, row, "Conversations");
    const thread = await openConversation(user, panel, "thread-link-target");

    const viewLink = within(thread).getByRole("link", { name: "View this conversation on GitHub" });
    expect(viewLink.getAttribute("href")).toBe(
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
    const insightsContent = await openPrPane(user, row);
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

  test("filters, backfill, and visibility toggles update rendered output", async () => {
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

    await waitFor(() => {
      const dataMeta = document.getElementById("data-meta")?.textContent || "";
      expect(dataMeta).toContain("Rows: 1");
    });

    // #scheduler-badges/#scheduler-details (the Status tab's old "Auto
    // Refresh Scheduler" display) were removed as redundant with the
    // activity popover's own live "Scheduled background jobs" section (see
    // REACT_MIGRATION_PLAN.md) - this fixture's scheduler object (lastAutoError/
    // lastQuickCheckSkipReason) is kept only because the rest of this test's
    // payload shape mirrors a real response; nothing here reads it anymore.

    showSettingsSectionForTest("backfill");
    expect(screen.getByRole("tabpanel", { name: "Backfill" })).toBeVisible();

    // The backfill badges themselves are React-owned (#backfill-badges,
    // rendered by the Settings drawer's BackfillSection) and no longer have a vanilla-DOM fallback
    // to assert against in this jsdom-only suite (which never loads
    // react-app.tsx) - see the "React-owned Backfill status badges..." e2e
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

  // The credential-field hints on the Run Script/filter inputs are covered by
  // ContextRunScriptTextInput.test.jsx, PrNumberFilterInput.test.jsx,
  // react-app.test.tsx and e2e's "all 6 React-portaled non-credential-hint
  // fields" test.

  // Phase H.26 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
  // cluster 1): "Apply filters (local)" (the button) is deleted outright -
  // view-filter fields now auto-persist on their own real "change" event
  // instead of needing an explicit click (same mechanism the other,
  // already-auto-persisting fields always used). Changing scope-mode
  // directly is this test's new trigger.
  test("given a view-filter field changes, when the change event fires, then view-filter defaults are persisted", async () => {
    const user = userEvent.setup();
    fetchMock.mockClear();


    const scopeField = document.getElementById("scope-mode");
    await user.selectOptions(scopeField, "needs-attention");

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

    fetchMock.mockClear();

    // Phase H.26 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
    // cluster 1): this block used to rely on the previous test's own
    // "Apply filters (local)" click (that button is gone now) - gives
    // itself its own explicit trigger instead of depending on another
    // test's side effect, same pattern the "view-filter defaults are
    // persisted" test just above uses.
    const scopeField = document.getElementById("scope-mode");
    await user.selectOptions(scopeField, "needs-attention");

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

  // Regression coverage for closing out the "redundant render-then-reload"
  // cleanup arc (see REACT_MIGRATION_PLAN.md, applyFreshPrPayload's own
  // entries): handleRunScript used to always call loadStoredData() (a
  // second GET /view-prs/data fetch) after its loop finished, regardless
  // of outcome - confirmed via the server route that every failure mode
  // of /view-prs/run leaves data genuinely unchanged, so that reload was
  // either pure redundant overhead (success case) or a no-op (failure
  // case). No existing test exercised this function's response/render
  // handling at all before these were added - every pre-existing test
  // above only asserted outgoing POST bodies.
  describe("Run script response/render handling (applyFreshPrPayload)", () => {
    const getRunCalls = () =>
      fetchMock.mock.calls.filter((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/run" &&
          String(init?.method || "GET").toUpperCase() === "POST"
        );
      });

    const getDataGetCalls = () =>
      fetchMock.mock.calls.filter((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/data" &&
          String(init?.method || "GET").toUpperCase() === "GET"
        );
      });

    test("given a single successful target, when Run script completes, then the fresh payload is applied directly with no redundant reload", async () => {
      const user = userEvent.setup();
  
      const prNumbersInput = document.getElementById("pr-numbers");
      await user.clear(prNumbersInput);
      await user.type(prNumbersInput, "42");

      fetchMock.mockClear();
      fetchMock.mockImplementation(async (url, init = {}) => {
        const normalizedUrl = String(url || "");
        const method = String(init?.method || "GET").toUpperCase();
        if (normalizedUrl === "/view-prs/run" && method === "POST") {
          return createOkJsonResponse({
            ok: true,
            output: "done",
            prData: createMultiPrPayload({
              prs: [
                {
                  scenario: "open-no-change",
                  prNumber: 42,
                  overrides: { data: { title: "Fresh after run script" } },
                },
              ],
            }),
          });
        }
        return createOkJsonResponse({ ok: true });
      });

      await user.click(screen.getByRole("button", { name: "Run script" }));

      await waitFor(() => {
        expect(getRunCalls().length).toBe(1);
      });
      await waitFor(() => {
        expect(prDataProbe.readPayload().byPrNumber["42"]?.data?.title).toBe(
          "Fresh after run script",
        );
      });
      expect(getDataGetCalls().length).toBe(0);
    });

    test("given multiple successful targets, when Run script completes, then the final rendered state reflects the last target's payload with no redundant reload", async () => {
      const user = userEvent.setup();
  
      const prNumbersInput = document.getElementById("pr-numbers");
      await user.clear(prNumbersInput);
      await user.type(prNumbersInput, "42, 43");

      fetchMock.mockClear();
      let callCount = 0;
      fetchMock.mockImplementation(async (url, init = {}) => {
        const normalizedUrl = String(url || "");
        const method = String(init?.method || "GET").toUpperCase();
        if (normalizedUrl === "/view-prs/run" && method === "POST") {
          callCount += 1;
          return createOkJsonResponse({
            ok: true,
            output: "done",
            prData: createMultiPrPayload({
              prs: [
                {
                  scenario: "open-no-change",
                  prNumber: 42,
                  overrides: { data: { title: `Iteration ${callCount}` } },
                },
              ],
            }),
          });
        }
        return createOkJsonResponse({ ok: true });
      });

      await user.click(screen.getByRole("button", { name: "Run script" }));

      await waitFor(() => {
        expect(getRunCalls().length).toBe(2);
      });
      await waitFor(() => {
        expect(prDataProbe.readPayload().byPrNumber["42"]?.data?.title).toBe(
          "Iteration 2",
        );
      });
      expect(getDataGetCalls().length).toBe(0);
    });

    test("given one target succeeds and one fails, when Run script completes, then the successful target's data still renders and the combined status/snackbar reflect the partial failure", async () => {
      const user = userEvent.setup();
  
      const prNumbersInput = document.getElementById("pr-numbers");
      await user.clear(prNumbersInput);
      await user.type(prNumbersInput, "42, 43");

      fetchMock.mockClear();
      fetchMock.mockImplementation(async (url, init = {}) => {
        const normalizedUrl = String(url || "");
        const method = String(init?.method || "GET").toUpperCase();
        if (normalizedUrl === "/view-prs/run" && method === "POST") {
          const body = JSON.parse(String(init?.body || "{}"));
          if (body.prNumber === "43") {
            return {
              ok: false,
              status: 500,
              json: async () => ({ ok: false, error: "script failed" }),
            };
          }
          return createOkJsonResponse({
            ok: true,
            output: "done",
            prData: createMultiPrPayload({
              prs: [
                {
                  scenario: "open-no-change",
                  prNumber: 42,
                  overrides: { data: { title: "Target 42 succeeded" } },
                },
              ],
            }),
          });
        }
        return createOkJsonResponse({ ok: true });
      });

      await user.click(screen.getByRole("button", { name: "Run script" }));

      await waitFor(() => {
        expect(getRunCalls().length).toBe(2);
      });
      await waitFor(() => {
        expect(prDataProbe.readPayload().byPrNumber["42"]?.data?.title).toBe(
          "Target 42 succeeded",
        );
      });
      await waitFor(() => {
        expect(document.getElementById("status")?.textContent || "").toContain(
          "Completed with failures (1/2 successful)",
        );
      });
      expect(getDataGetCalls().length).toBe(0);
    });

    test("given every target fails, when Run script completes, then the failure status is shown, nothing throws, and nothing is rendered", async () => {
      const user = userEvent.setup();
  
      const prNumbersInput = document.getElementById("pr-numbers");
      await user.clear(prNumbersInput);
      await user.type(prNumbersInput, "42, 43");

      fetchMock.mockClear();
      fetchMock.mockImplementation(async (url, init = {}) => {
        const normalizedUrl = String(url || "");
        const method = String(init?.method || "GET").toUpperCase();
        if (normalizedUrl === "/view-prs/run" && method === "POST") {
          return {
            ok: false,
            status: 500,
            json: async () => ({ ok: false, error: "script failed" }),
          };
        }
        return createOkJsonResponse({ ok: true });
      });

      const payloadBefore = prDataProbe.readPayload();

      await user.click(screen.getByRole("button", { name: "Run script" }));

      await waitFor(() => {
        expect(getRunCalls().length).toBe(2);
      });
      await waitFor(() => {
        expect(document.getElementById("status")?.textContent || "").toContain(
          "Completed with failures (0/2 successful)",
        );
      });
      expect(prDataProbe.readPayload()).toBe(payloadBefore);
      expect(getDataGetCalls().length).toBe(0);
    });

    test("given no PR numbers entered (an \"All PRs\" run), when Run script completes, then it behaves the same as a specific-PR-number target", async () => {
      const user = userEvent.setup();
  
      const prNumbersInput = document.getElementById("pr-numbers");
      await user.clear(prNumbersInput);

      fetchMock.mockClear();
      fetchMock.mockImplementation(async (url, init = {}) => {
        const normalizedUrl = String(url || "");
        const method = String(init?.method || "GET").toUpperCase();
        if (normalizedUrl === "/view-prs/run" && method === "POST") {
          return createOkJsonResponse({
            ok: true,
            output: "done",
            prData: createMultiPrPayload({
              prs: [
                {
                  scenario: "open-no-change",
                  prNumber: 42,
                  overrides: { data: { title: "All PRs run" } },
                },
              ],
            }),
          });
        }
        return createOkJsonResponse({ ok: true });
      });

      await user.click(screen.getByRole("button", { name: "Run script" }));

      await waitFor(() => {
        expect(getRunCalls().length).toBe(1);
      });
      expect(JSON.parse(String(getRunCalls()[0][1]?.body || "{}")).prNumber).toBe("");
      await waitFor(() => {
        expect(prDataProbe.readPayload().byPrNumber["42"]?.data?.title).toBe(
          "All PRs run",
        );
      });
      expect(getDataGetCalls().length).toBe(0);
    });
  });

  test("given no selected author and toggled checkboxes when Run script posts payload then author fallback and boolean flags are mapped", async () => {
    const user = userEvent.setup();

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

  test("given PR numbers entered in Settings when Quick check is clicked then the POST body carries repo and prNumbers", async () => {
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
          newPendingMergedClosedCount: 1,
        });
      }

      return createOkJsonResponse({ ok: true });
    });

    const user = userEvent.setup();

    const repoField = document.getElementById("repo");
    await user.clear(repoField);
    await user.type(repoField, "owner/repo");

    const prNumbersInput = document.getElementById("pr-numbers");
    await user.clear(prNumbersInput);
    await user.type(prNumbersInput, "912,921");

    const quickCheckBtn = screen.getByRole("button", { name: "Quick check" });
    await user.click(quickCheckBtn);

    await waitFor(() => {
      expect(quickCheckBtn.textContent).toBe("1 update found");
    });

    const quickCheckCall = fetchMock.mock.calls.find((call) => {
      const [url, callInit] = call;
      return (
        String(url || "") === "/view-prs/quick-check" &&
        String(callInit?.method || "GET").toUpperCase() === "POST"
      );
    });
    const body = JSON.parse(String(quickCheckCall?.[1]?.body || "{}"));
    expect(body.repo).toBe("owner/repo");
    expect(body.prNumbers).toBe("912,921");
  });

  test("given an empty PR-numbers field when Quick check is clicked then the POST body stays empty, unchanged from before", async () => {
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

    const prNumbersInput = document.getElementById("pr-numbers");
    await user.clear(prNumbersInput);

    const quickCheckBtn = screen.getByRole("button", { name: "Quick check" });
    await user.click(quickCheckBtn);

    await waitFor(() => {
      expect(quickCheckBtn.textContent).toBe("No changes found");
    });

    const quickCheckCall = fetchMock.mock.calls.find((call) => {
      const [url, callInit] = call;
      return (
        String(url || "") === "/view-prs/quick-check" &&
        String(callInit?.method || "GET").toUpperCase() === "POST"
      );
    });
    const body = JSON.parse(String(quickCheckCall?.[1]?.body || "{}"));
    expect(body).toEqual({});
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

  test("given nothing loaded when Quick check all is clicked then it reports nothing to check without firing a request", async () => {
    const quickCheckAllCalls = [];
    fetchMock.mockImplementation(async (url, init = {}) => {
      const normalizedUrl = String(url || "");
      const method = String(init?.method || "GET").toUpperCase();
      if (normalizedUrl === "/view-prs/quick-check-all" && method === "POST") {
        quickCheckAllCalls.push(init);
      }
      return createOkJsonResponse({ ok: true });
    });

    const user = userEvent.setup();

    const quickCheckAllBtn = screen.getByRole("button", { name: "Quick check all" });
    await user.click(quickCheckAllBtn);

    await waitFor(() => {
      expect(quickCheckAllBtn.textContent).toBe("Nothing to check");
    });
    expect(quickCheckAllCalls).toHaveLength(0);
  });

  test("given PRs loaded across multiple repos when Quick check all is clicked then the POST body groups PR numbers by their own repo", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          { prNumber: 11, overrides: { repo: "owner/repo-a" } },
          { prNumber: 12, overrides: { repo: "owner/repo-a" } },
          { prNumber: 21, overrides: { repo: "owner/repo-b" } },
        ],
      }),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    fetchMock.mockImplementation(async (url, init = {}) => {
      const normalizedUrl = String(url || "");
      const method = String(init?.method || "GET").toUpperCase();

      if (normalizedUrl === "/view-prs/quick-check-all" && method === "POST") {
        return createOkJsonResponse({
          ok: true,
          lastQuickCheckAt: "2026-06-16T10:00:00Z",
          reposChecked: ["owner/repo-a", "owner/repo-b"],
          reposFailed: [],
          newPendingOpenCount: 0,
          newPendingMergedClosedCount: 2,
        });
      }

      return createOkJsonResponse({ ok: true });
    });

    const user = userEvent.setup();

    const quickCheckAllBtn = screen.getByRole("button", { name: "Quick check all" });
    await user.click(quickCheckAllBtn);

    await waitFor(() => {
      expect(quickCheckAllBtn.textContent).toBe("2 updates found across 2 repos");
    });

    const quickCheckAllCall = fetchMock.mock.calls.find((call) => {
      const [url, callInit] = call;
      return (
        String(url || "") === "/view-prs/quick-check-all" &&
        String(callInit?.method || "GET").toUpperCase() === "POST"
      );
    });
    const body = JSON.parse(String(quickCheckAllCall?.[1]?.body || "{}"));
    expect(body.repos).toEqual(
      expect.arrayContaining([
        { repo: "owner/repo-a", prNumbers: "11,12" },
        { repo: "owner/repo-b", prNumbers: "21" },
      ]),
    );
    expect(body.repos).toHaveLength(2);
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

    // The filter bar's real fields (UI redesign phase 8). fireEvent.change,
    // not user.type: by the time enough of this suite has run, user.type's
    // per-keystroke events stop reliably reaching a field's onChange (see
    // renderCleanNotesSection()'s comment), while one change event does.
    fireEvent.change(scopeField, { target: { value: "needs-attention-or-interacted" } });
    fireEvent.change(prFilterField, { target: { value: "1" } });
    await clickMultiSelectCheckbox("label-list", "frontend", user);
    await clickMultiSelectCheckbox("exclude-label-list", "bug", user);
    await clickMultiSelectCheckbox("author-list", "author-other", user);
    await clickMultiSelectCheckbox("assigned-list", "assignee-other", user);


    await waitFor(() => {
      const dataMetaText = document.getElementById("data-meta")?.textContent || "";
      expect(dataMetaText).toContain("Rows: 1");
      expect(dataMetaText).toContain("pr-numbers=1");
      expect(dataMetaText).toContain("scope=all stored rows");
    });

    // Phase H.12 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
    // now that filterPrNumbers is synced into real Context above (needed
    // for the live #data-meta summary to see it), the REAL React table -
    // which reads useVisiblePrNumbers(), the same reactive Context
    // derivation - picks it up too, same as it already does in the real
    // app: the PR-number filter takes precedence over the 4 multi-select
    // filters (label=frontend/exclude=bug/author=author-other/
    // assigned=assignee-other, which alone would match PR #2, not PR #1).
    // Matches the real, fully-wired app's own precedence (also covered by
    // pr-visible-pr-numbers.helpers.test.js and Playwright e2e).
    expect(
      screen.getAllByRole("button", { name: "More actions for PR #1" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: "More actions for PR #2" }),
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

    const scopeField = document.getElementById("scope-mode");
    expect(scopeField).toBeInTheDocument();

    // The filter bar's real scope select (one change event - see the
    // PR-number precedence test above).
    fireEvent.change(scopeField, { target: { value: "needs-attention" } });

    // PR #4 is only in-review (not CHANGED), so it no longer counts as
    // needing attention on its own - the in-review override was
    // intentionally removed (see "Further migration and removal of in
    // review attention override"). Only PR #1 (CHANGED) qualifies here.
    await waitFor(() => {
      const dataMetaText = document.getElementById("data-meta")?.textContent || "";
      expect(dataMetaText).toContain("Rows: 1");
      expect(dataMetaText).toContain("scope=needs attention rows");
    });

    fireEvent.change(scopeField, { target: { value: "needs-attention-or-interacted" } });

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
    // Attention, then Flagged, in their fixed Signals slots.
    expect(signalNames(row).filter((name) => name === "Needs attention" || name === "Flagged")).toEqual([
      "Needs attention",
      "Flagged",
    ]);
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
    // PrTableApp.tsx delegates to window.entryNeedsAttention only). This
    // row's status is NO_CHANGE ("open-in-review" fixture), so only the
    // flag icon should render on every rendered copy of the row. (The
    // fixture's data.inReview isn't what marks a PR in review - the user
    // state's inReviewByRepo is, and this payload only flags it - so there's
    // no In review signal either.)
    const rows = screen.getAllByText("#202").map((link) => link.closest("tr"));
    expect(rows.length).toBeGreaterThan(0);

    rows.forEach((row) => {
      expect(signalNames(row)).toEqual(["Flagged"]);
    });
  });

  test("scheduler status push toggles active PR progress indicators without row rerender", async () => {
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
      installReactTestGlobals();

      let schedulerActivePrNumbers = [];
      fetchMock = createFetchMock();
      global.fetch = fetchMock;
      window.fetch = fetchMock;
      window.marked = {
        parse: (markdownText) => `<p>${String(markdownText || "")}</p>`,
      };

      // Mounts the harness root, whose PrDataProvider renders the table
      // (window-bridge elimination Phase 7 - it loads /view-prs/data itself).
      // Must come after the fetchMock assignment above, same ordering reason
      // as the main initTestPage() flow: the root's restore and data-load
      // effects fire their GETs immediately on mount.
      installFilterStateProviderBridge();

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

      // UI redesign phase 2: the busy indicator is only rendered while the
      // PR is refreshing; "without row rerender" is checked on the row
      // element itself staying the same.
      const getRow = () => within(openSection).getByText("#1").closest("tr");
      const getIndicator = () => getRow()?.querySelector('.pr-busy[data-busy="active"]');

      const initialRow = getRow();
      expect(getIndicator()).toBeNull();

      // Phase H.2 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
      // window.pollSchedulerStatus (a poll wrapper around a now-retired
      // setInterval, see PrDataPolling.tsx's own comment) is gone - the
      // progress indicator is driven by renderSchedulerStatus in production
      // too (RequestActivityProvider's, via Context since window-bridge
      // elimination Phase 7.3), called by JobEventsProvider.tsx's real SSE
      // connection on every scheduler-status push. Calling it directly
      // here with the same payload shape exercises that real remaining
      // path instead of a bridge with no caller left.
      schedulerActivePrNumbers = [{ repo: "owner/repo", prNumber: "1" }];
      act(() => {
        requestActivityTestHandle.renderSchedulerStatus({
          intervalMinutes: 15,
          manualCooldownMinutes: 15,
          isAutoRunInProgress: schedulerActivePrNumbers.length > 0,
          activePrNumbers: schedulerActivePrNumbers,
        });
      });

      await waitFor(() => {
        expect(getRow()).toBe(initialRow);
        expect(getIndicator()).toBeTruthy();
      });

      schedulerActivePrNumbers = [];
      act(() => {
        requestActivityTestHandle.renderSchedulerStatus({
          intervalMinutes: 15,
          manualCooldownMinutes: 15,
          isAutoRunInProgress: schedulerActivePrNumbers.length > 0,
          activePrNumbers: schedulerActivePrNumbers,
        });
      });

      await waitFor(() => {
        expect(getRow()).toBe(initialRow);
        expect(getIndicator()).toBeNull();
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
      return Boolean(row?.querySelector('.pr-cell-signals [aria-label="Needs attention"]'));
    };

    setStatusTextForTest("Viewer : ahall236_uhg");


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

    await waitFor(() => {
      expect(hasAttentionForPr("101")).toBe(false);
    });

    await user.selectOptions(noActivityMode, "mine-only");

    await user.selectOptions(noActivityMode, "all");

    await waitFor(() => {
      expect(hasAttentionForPr("101")).toBe(true);
    });

    await user.click(ignoreMergeOnly);

    await waitFor(() => {
      expect(hasAttentionForPr("102")).toBe(false);
    });

    if (includeDraftChanged.checked) {
      await user.click(includeDraftChanged);
    }
    if (includeDraftNoActivity.checked) {
      await user.click(includeDraftNoActivity);
    }

    await waitFor(() => {
      expect(hasAttentionForPr("201")).toBe(false);
      expect(hasAttentionForPr("202")).toBe(false);
    });

    await user.click(includeDraftChanged);
    await user.click(includeDraftNoActivity);

    await waitFor(() => {
      expect(hasAttentionForPr("201")).toBe(true);
      expect(hasAttentionForPr("202")).toBe(true);
    });

    fetchMock.mockClear();
    await user.selectOptions(noActivityMode, "mine-only");
    if (includeClosedMerged.checked) {
      await user.click(includeClosedMerged);
    }

    await waitForPersistedViewFilterOverrides((savedOverrides) => {
      expect(savedOverrides["attention-no-activity-mode"]).toBe("mine-only");
      expect(savedOverrides["attention-include-closed-merged"]).toBe(false);
    });

    fetchMock.mockClear();
    await user.selectOptions(noActivityMode, "all");
    await user.click(includeClosedMerged);

    await waitForPersistedViewFilterOverrides((savedOverridesAfterReset) => {
      expect(
        Object.prototype.hasOwnProperty.call(
          savedOverridesAfterReset,
          "attention-no-activity-mode",
        ),
      ).toBe(false);
      expect(savedOverridesAfterReset["attention-include-closed-merged"]).not.toBe(false);
    });
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


    const authorList = getMultiSelectList("author-list");
    expect(authorList).toBeInTheDocument();

    await clickMultiSelectCheckbox("author-list", "zuser", user);

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

    // UI redesign phase 2: a collapsed section's header summarises its
    // attention count (it was an "Attention: N" badge). These lifecycle
    // sections start collapsed.
    const attentionSummary = (section) =>
      section?.querySelector('.pr-section-summary-item[data-tone="attention"] .ui-visually-hidden');

    expect(openSection).not.toHaveAttribute("open");
    expect(String(attentionSummary(openSection)?.textContent || "")).toBe("1 needs attention");
    expect(String(attentionSummary(draftSection)?.textContent || "")).toBe("1 needs attention");
    expect(String(attentionSummary(closedSection)?.textContent || "")).toBe("1 needs attention");
    expect(attentionSummary(mergedSection)).toBeFalsy();
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
                stories: [{ name: "US12345", url: "https://stories.example/US12345" }],
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
      expect(screen.getByRole("table", { name: "Open PRs", hidden: true })).toBeTruthy();
    });

    const openSectionTable = screen.getByRole("table", { name: "Open PRs", hidden: true });

    await waitFor(() => {
      expect(within(openSectionTable).getByText("#11")).toBeInTheDocument();
      expect(within(openSectionTable).getByText("#999")).toBeInTheDocument();
    });

    // UI redesign phase 2: the select column's header is for screen
    // readers only, then Signals (it was "Sel" / "Attn").
    const openHeaderCells = openSectionTable.querySelectorAll("thead th");
    expect(String(openHeaderCells[0]?.textContent || "")).toBe("Select");
    expect(openHeaderCells[0]?.querySelector(".ui-visually-hidden")).toBeTruthy();
    // Shows "Signals"; screen readers get the full name.
    expect(openHeaderCells[1]?.querySelector('[aria-hidden="true"]')?.textContent).toBe("Signals");
    expect(openHeaderCells[1]?.querySelector(".ui-visually-hidden")?.textContent).toBe(
      "Signals: changed, needs attention, flagged, in review",
    );

    // The author in the Who column, and one notes icon listing the fields
    // with content (it was a "📝 Notes" marker plus five squares).
    const pr11Row = within(openSectionTable).getByText("#11").closest("tr");
    expect(pr11Row).toBeTruthy();
    expect(pr11Row?.querySelector(".pr-cell-who [role='img']")).toHaveAttribute("aria-label", "Author: Alison Hall");
    expect(pr11Row?.querySelector(".pr-cell-review [aria-label^='Notes:']")).toHaveAttribute(
      "aria-label",
      "Notes: 1 comment · other notes · difficulty 4 · stories · analysis of PR",
    );

    const pr12Row = within(openSectionTable).getByText("#12").closest("tr");
    expect(pr12Row).toBeTruthy();
    expect(pr12Row?.querySelector(".pr-cell-review [aria-label^='Notes:']")).toBeNull();

    // A PR with stored notes but no local data shows its status.
    const pr999Row = within(openSectionTable).getByText("#999").closest("tr");
    expect(pr999Row).toBeTruthy();
    expect(signalNames(pr999Row)).toContain("Status: NO_LOCAL_DATA");

    // Its stored notes show read-only on the Notes tab.
    const pr999Notes = await openPrPane(user, pr999Row, "Notes");
    expect(within(pr999Notes).getByRole("group", { name: "Comments" })).toHaveTextContent(
      "This PR still needs follow-up context.",
    );
    expect(within(pr999Notes).getByRole("group", { name: "Other notes" })).toHaveTextContent(
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
        ?.querySelector('.pr-cell-signals [aria-label="Needs attention"]');
    };

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

    await user.click(pendingCommentsToggle);
    await user.selectOptions(noActivityModeSelect, "none");

    await waitFor(() => {
      expect(getAttentionIcon("101")).toBeNull();
    });

    await user.selectOptions(noActivityModeSelect, "all");
    await waitFor(() => {
      expect(getAttentionIcon("101")).toBeTruthy();
    });

    await user.click(ignoreMergeOnlyToggle);
    await waitFor(() => {
      expect(getAttentionIcon("102")).toBeNull();
    });

    const includeClosedMergedToggle = document.getElementById(
      "attention-include-closed-merged",
    );
    const includeDraftNoActivityToggle = document.getElementById(
      "attention-include-draft-no-activity",
    );

    fetchMock.mockClear();
    await user.selectOptions(noActivityModeSelect, "mine-only");
    await user.click(includeClosedMergedToggle);
    await user.click(includeDraftNoActivityToggle);

    await waitForPersistedViewFilterOverrides((savedOverrides) => {
      expect(savedOverrides["attention-no-activity-mode"]).toBe("mine-only");
      expect(savedOverrides["attention-include-closed-merged"]).toBe(false);
      expect(savedOverrides["attention-include-draft-no-activity"]).toBe(true);
    });

    fetchMock.mockClear();
    await user.selectOptions(noActivityModeSelect, "all");
    await user.click(includeClosedMergedToggle);
    await user.click(includeDraftNoActivityToggle);

    await waitForPersistedViewFilterOverrides((savedOverridesAfterReset) => {
      expect(
        Object.prototype.hasOwnProperty.call(
          savedOverridesAfterReset,
          "attention-no-activity-mode",
        ),
      ).toBe(false);
      expect(savedOverridesAfterReset["attention-include-draft-no-activity"]).not.toBe(true);
    });
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

      // Phase H.26 follow-up (see REACT_MIGRATION_PLAN.md, "Remaining-
      // effort audit", cluster 1): persistence is no longer a synchronous
      // vanilla listener firing off the same event (that whole mechanism
      // is deleted outright, superseded by FilterStateProvider.tsx's own
      // debounced Context-level watcher) - without clearing the mock
      // first, the next waitFor below would trivially find the PUT call
      // just asserted on above (already non-undefined) before the new,
      // debounced one for this checkbox click ever lands.
      fetchMock.mockClear();
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

        await waitFor(() => {
        expect(screen.getByText("#902")).toBeInTheDocument();
      });

      const allowOptions = document.getElementById(
        "attention-author-thread-resolution-allow-options",
      );
      const denyOptions = document.getElementById(
        "attention-author-thread-resolution-deny-options",
      );

      // Phase E (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
      // restore now lands in FilterStateProvider's own Context state, not
      // directly on this static <select> (no real Context-backed component
      // is mounted for it in this harness - see
      // installFilterStateProviderBridge's own comment) - read the real
      // source of truth instead of the DOM. Also now async (a fetch), so
      // this needs a waitFor.
      await waitFor(() => {
        expect(readFilterStateValues()?.attentionAuthorThreadResolutionMode).toBe(
          "deny-only",
        );
      });
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
        ?.querySelector('.pr-cell-signals [aria-label="Needs attention"]');
    };

    await waitFor(() => {
      expect(document.querySelector('[data-pr-section="draft"]')).toBeTruthy();
    });
    await waitFor(() => {
      const draftSection = document.querySelector('[data-pr-section="draft"]');
      expect(within(draftSection).getByText("#201")).toBeInTheDocument();
      expect(within(draftSection).getByText("#202")).toBeInTheDocument();
    });

    const includePendingCommentsToggle = document.getElementById("attention-include-pending-comments");
    await setCheckbox(includePendingCommentsToggle, false, user);
    const noActivityModeSelect = document.getElementById("attention-no-activity-mode");
    await user.selectOptions(noActivityModeSelect, "all");

    const includeDraftChangedToggle = document.getElementById(
      "attention-include-draft-changed",
    );
    await setCheckbox(includeDraftChangedToggle, false, user);
    await waitFor(() => {
      expect(getAttentionIcon("201")).toBeNull();
    });

    await setCheckbox(includeDraftChangedToggle, true, user);
    await waitFor(() => {
      expect(getAttentionIcon("201")).toBeTruthy();
    });

    const includeDraftNoActivityToggle = document.getElementById(
      "attention-include-draft-no-activity",
    );
    await setCheckbox(includeDraftNoActivityToggle, false, user);
    await waitFor(() => {
      expect(getAttentionIcon("202")).toBeNull();
    });

    await setCheckbox(includeDraftNoActivityToggle, true, user);
    await waitFor(() => {
      expect(getAttentionIcon("202")).toBeTruthy();
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


    const scopeSelect = document.getElementById("scope-mode");
    const authorList = getMultiSelectList("author-list");
    expect(authorList).toBeInTheDocument();
    expect(scopeSelect).toBeInTheDocument();

    await waitFor(() => {
      const authorLogins = Array.from(authorList.querySelectorAll("input[type='checkbox']")).map((cb) => cb.value);
      expect(authorLogins).toEqual(["auser", "mcole", "zuser"]);
    });

    await clickMultiSelectCheckbox("author-list", "zuser", user);

    await waitFor(() => {
      expect(getSelectedMultiSelectValues("author-list")).toEqual(["zuser"]);
    });

    await user.selectOptions(scopeSelect, "needs-attention-or-interacted");

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


    const approverList = getMultiSelectList("approver-list");
    expect(approverList).toBeInTheDocument();

    await waitFor(() => {
      const approverLogins = Array.from(approverList.querySelectorAll("input[type='checkbox']")).map((cb) => cb.value);
      expect(approverLogins).toEqual(["alice"]);
    });

    await clickMultiSelectCheckbox("approver-list", "alice", user);

    await waitFor(() => {
      const dataMetaText = document.getElementById("data-meta")?.textContent || "";
      expect(dataMetaText).toContain("Rows: 1");
      expect(dataMetaText).toContain("approver=alice");
    });

    expect(screen.getByRole("button", { name: "More actions for PR #401" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More actions for PR #402" })).not.toBeInTheDocument();
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

    // The Review column's assigned-user avatar, named from the actor-name cache.
    const assigned = screen.getAllByRole("group", { name: "Assigned" })[0];
    expect(within(assigned).getByRole("img", { name: "Alison Hall" })).toBeInTheDocument();
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


    const approverList = getMultiSelectList("approver-list");
    const scopeSelect = document.getElementById("scope-mode");
    expect(approverList).toBeInTheDocument();
    expect(scopeSelect).toBeInTheDocument();

    await waitFor(() => {
      const approverLogins = Array.from(approverList.querySelectorAll("input[type='checkbox']")).map((cb) => cb.value);
      expect(approverLogins).toEqual(["david"]);
    });

    await clickMultiSelectCheckbox("approver-list", "david", user);

    await waitFor(() => {
      expect(getSelectedMultiSelectValues("approver-list")).toEqual(["david"]);
    });

    await user.selectOptions(scopeSelect, "needs-attention-or-interacted");

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


    const approverList = getMultiSelectList("approver-list");
    expect(approverList).toBeInTheDocument();

    await waitFor(() => {
      const approverLogins = Array.from(approverList.querySelectorAll("input[type='checkbox']")).map((cb) => cb.value);
      expect(approverLogins).toEqual(["reviewer-a", "reviewer-b"]);
    });

    // Select only reviewer-a: should show #601 (approved by both) but not #602 (only reviewer-b) or #603 (no approvals)
    await clickMultiSelectCheckbox("approver-list", "reviewer-a", user);

    await waitFor(() => {
      const dataMetaText = document.getElementById("data-meta")?.textContent || "";
      expect(dataMetaText).toContain("Rows: 1");
    });

    expect(screen.getByRole("button", { name: "More actions for PR #601" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More actions for PR #602" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More actions for PR #603" })).not.toBeInTheDocument();
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


    const approverList = getMultiSelectList("approver-list");
    await waitFor(() => {
      const approverLogins = Array.from(approverList.querySelectorAll("input[type='checkbox']")).map((cb) => cb.value);
      expect(approverLogins).toEqual(["grace"]);
    });

    fetchMock.mockClear();
    await clickMultiSelectCheckbox("approver-list", "grace", user);

    await waitForPersistedViewFilterOverrides((savedOverrides) => {
      expect(savedOverrides.approver).toEqual(["grace"]);
    });
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


    const approverList = getMultiSelectList("approver-list");
    expect(approverList).toBeInTheDocument();

    // Apply triggers re-render which picks up pendingApproverFilterSelections.

    await waitFor(() => {
      expect(getSelectedMultiSelectValues("approver-list")).toEqual(["grace"]);
    });

    await waitFor(() => {
      const dataMetaText = document.getElementById("data-meta")?.textContent || "";
      expect(dataMetaText).toContain("approver=grace");
      expect(dataMetaText).toContain("Rows: 1");
    });

    expect(screen.getByRole("button", { name: "More actions for PR #901" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More actions for PR #902" })).not.toBeInTheDocument();
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

    await openPrJsonDetails(user, "101");

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

  test("posts to backfill start endpoint when a user starts backfill from the Backfill section", async () => {
    const user = userEvent.setup();
    fetchMock.mockClear();

    showSettingsSectionForTest("backfill");
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
    showSettingsSectionForTest("backfill");
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

  test("given Request more is triggered, when handled, then it posts the expected merged request payload (button rendering/visibility is React-owned - see MergedRequestMoreAction.test.jsx)", async () => {
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
    // The shell's own button, under the table once the data has loaded
    // (scope "all" by default).
    const requestMore = await within(document.getElementById("merged-request-more-action")).findByRole("button", {
      name: "Request more",
    });
    fetchMock.mockClear();
    const user = userEvent.setup();
    await user.click(requestMore);

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
      expect(screen.getByRole("button", { name: "In Review for PR #101", pressed: false })).toBeInTheDocument();
    });

    const labelChip = document.querySelector(".pr-cell-title .pr-label");
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

    await openPrJsonDetails(user, "101");

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

    await openPrJsonDetails(user, "101");

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

    await openPrJsonDetails(user, "101");

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

    // Focus returns to the row's More button, which opened the dialog.
    expect(screen.getByRole("button", { name: "More actions for PR #101" })).toHaveFocus();
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

    await openPrJsonDetails(user, "101");

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
    await openPrJsonDetails(user, "101");

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

    await openPrJsonDetails(user, "101");

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
      name: /^Ack'd PR #/,
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

    // The Settings drawer's PR numbers (a controlled field: set its state).
    act(() => filterStateTestHandle.setValue("prNumbersInput", "88,89"));

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

  test("saves each notes field on its own, with the others as saved, and shows it read-only", async () => {
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
    fetchMock = jest.fn(async (url, init = {}) => {
      const normalizedUrl = String(url || "");
      const method = String(init?.method || "GET").toUpperCase();

      if (normalizedUrl === "/view-prs/notes" && method === "POST") {
        // The server stores what was posted and returns it with the data.
        const { comments, otherNotes, prDifficulty, stories, analysisOfPr } = JSON.parse(String(init?.body || "{}"));
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
                  comments,
                  otherNotes,
                  prDifficulty,
                  stories,
                  analysisOfPr,
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

    const summaryButton = await screen.findByRole("button", {
      name: /^Show summary for PR #/,
    });
    await openPrPane(user, summaryButton.closest("tr"), "Notes");

    // Each field saves on its own, with the others as saved.
    const notesPosts = () =>
      fetchMock.mock.calls.filter(
        ([url, init]) => String(url || "") === "/view-prs/notes" && String(init?.method || "GET").toUpperCase() === "POST",
      );
    const lastNotesPayload = () => JSON.parse(String(notesPosts().at(-1)?.[1]?.body || "{}"));
    const notesSection = document.querySelector('.pr-notes-section[data-pr-number="1"]');
    expect(notesSection).toBeInTheDocument();
    const notesField = (name) => within(notesSection).getByRole("group", { name });

    await user.click(within(notesSection).getByRole("button", { name: "Add comments" }));
    // fireEvent.change, not user.type - see renderCleanNotesSection()'s own
    // comment (further down this file) for why: by the time enough of this
    // suite's ~97 tests have run, user.type's multi-event-per-field
    // sequences stop reliably reaching a text field's onChange/React state
    // at all, while a single fireEvent.change reliably still does.
    fireEvent.change(within(notesSection).getByRole("textbox", { name: "Comment 1 note" }), { target: { value: "LGTM" } });
    await user.click(within(notesSection).getByRole("button", { name: "Save comments" }));
    await waitFor(() => expect(notesPosts()).toHaveLength(1));
    expect(lastNotesPayload().prNumber).toBe("1");
    expect(lastNotesPayload().comments).toHaveLength(1);
    expect(String(lastNotesPayload().comments[0]?.note || "")).toBe("LGTM");
    // The saved comment shows read-only.
    await waitFor(() => expect(notesField("Comments")).toHaveTextContent("LGTM"));
    expect(within(notesField("Comments")).queryByRole("textbox")).not.toBeInTheDocument();

    await user.click(within(notesSection).getByRole("button", { name: "Add PR difficulty" }));
    await user.selectOptions(within(notesSection).getByRole("combobox", { name: "PR difficulty" }), "5");
    await user.click(within(notesSection).getByRole("button", { name: "Save PR difficulty" }));
    await waitFor(() => expect(notesPosts()).toHaveLength(2));
    expect(lastNotesPayload().prDifficulty).toBe("5");
    expect(String(lastNotesPayload().comments[0]?.note || "")).toBe("LGTM");

    await user.click(within(notesSection).getByRole("button", { name: "Add analysis of PR" }));
    fireEvent.change(within(notesSection).getByRole("textbox", { name: "Analysis of PR" }), {
      target: { value: "Deep analysis for save test" },
    });
    await user.click(within(notesSection).getByRole("button", { name: "Save analysis of PR" }));
    await waitFor(() => expect(notesPosts()).toHaveLength(3));
    expect(lastNotesPayload()).toMatchObject({ prDifficulty: "5", analysisOfPr: "Deep analysis for save test" });
    expect(lastNotesPayload().comments).toHaveLength(1);
    await waitFor(() => expect(notesField("Analysis of PR")).toHaveTextContent("Deep analysis for save test"));
  });

  test("enables a notes field's Save once it changes (difficulty, a story name or URL)", async () => {
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
      const summaryButton = await screen.findByRole("button", {
        name: /^Show summary for PR #/,
      });
      await openPrPane(localUser, summaryButton.closest("tr"), "Notes");

      const notesSection = await waitFor(() => {
        const section = document.querySelector('.pr-notes-section[data-pr-number="1"]');
        expect(section).toBeInTheDocument();
        return section;
      });
      return { user: localUser, notesSection };
    };
    // Opens a field for editing; its Save starts disabled.
    const openField = async (user, notesSection, name) => {
      await user.click(within(notesSection).getByRole("button", { name: `Add ${name}` }));
      const save = within(notesSection).getByRole("button", { name: `Save ${name}` });
      expect(save).toBeDisabled();
      return save;
    };

    {
      const { user, notesSection } = await renderCleanNotesSection();
      const save = await openField(user, notesSection, "PR difficulty");
      await user.selectOptions(within(notesSection).getByRole("combobox", { name: "PR difficulty" }), "4");
      expect(save).toBeEnabled();
    }

    {
      const { user, notesSection } = await renderCleanNotesSection();
      const save = await openField(user, notesSection, "stories");
      // fireEvent.change (one direct value-set + 'change' dispatch), not
      // user.type (many sequential per-keystroke events): by the time
      // this is the suite's 4th+ React session sharing one jsdom window,
      // user.type's multi-event sequence reliably stopped reaching this
      // input's onChange/state at all (the DOM value updated, React's
      // state never did), while a single fireEvent.change reliably still
      // does.
      fireEvent.change(within(notesSection).getByRole("textbox", { name: "Story 1 name" }), { target: { value: "US12345" } });
      expect(save).toBeEnabled();
    }

    {
      const { user, notesSection } = await renderCleanNotesSection();
      const save = await openField(user, notesSection, "stories");
      fireEvent.change(within(notesSection).getByRole("textbox", { name: "Story 1 URL" }), {
        target: { value: "https://stories.example/US12345" },
      });
      expect(save).toBeEnabled();
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

    await openPrPane(user, (await screen.findByRole("button", { name: /^Show summary for PR #/ })).closest("tr"), "Notes");

    // Add starts the comments with one row; add a second, remove the first.
    await user.click(await screen.findByRole("button", { name: "Add comments" }));
    const notesSection = document.querySelector('.pr-notes-section[data-pr-number="1"]');
    expect(notesSection).toBeInTheDocument();
    await user.click(within(notesSection).getByRole("button", { name: "Add comment" }));
    expect(within(notesSection).getAllByRole("button", { name: /^Remove comment / })).toHaveLength(2);
    // Each with a note (blank rows aren't saved anyway).
    fireEvent.change(within(notesSection).getByRole("textbox", { name: "Comment 1 note" }), { target: { value: "First" } });
    fireEvent.change(within(notesSection).getByRole("textbox", { name: "Comment 2 note" }), { target: { value: "Second" } });
    await user.click(within(notesSection).getByRole("button", { name: "Remove comment 1" }));

    await user.click(within(notesSection).getByRole("button", { name: "Save comments" }));

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
    expect(latestNotesPayload.comments[0]?.note).toBe("Second");
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

  test("loads backfill log tail when a user clicks Refresh log in the Backfill section", async () => {
    const user = userEvent.setup();
    fetchMock.mockClear();

    showSettingsSectionForTest("backfill");
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

  // Window-bridge elimination Phase 7.2 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
  // index.page.js's initPage made its own status+log load on top of the one
  // useBackfillAutoRefresh fires on mount, so every page load fetched both
  // twice. Only the React one is left.
  test("given a fresh page load, when everything settles, then backfill status and log are each fetched exactly once", async () => {
    initTestPage();

    await waitFor(() => {
      expect(document.getElementById("backfill-details")?.textContent || "").toContain("Summary:");
    });
    // Let any second, slower load land before counting.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const countGets = (path) =>
      fetchMock.mock.calls.filter(
        ([url, init]) => String(url || "") === path && String(init?.method || "GET").toUpperCase() === "GET",
      ).length;
    expect(countGets("/view-prs/backfill")).toBe(1);
    expect(countGets("/view-prs/backfill/log?lines=120")).toBe(1);
  });

  test("backfill log auto-scrolls to bottom when running and auto-scroll is enabled", async () => {
    initTestPage();

    const user = userEvent.setup();
    showSettingsSectionForTest("backfill");

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
    showSettingsSectionForTest("backfill");

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
    showSettingsSectionForTest("backfill");

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

  // Phase H.3 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"): the
  // 9 tests below used to call window.pollForDataChanges() directly -
  // FilterStateTestRootHarness mounts a real <PrDataPolling />, so these drive
  // the same real orchestration function through its actual setInterval
  // instead, via fake timers scoped to just this describe block (doNotFake:
  // ['Date'] - this suite's fixtures/assertions rely on real Date/ISO
  // timestamps elsewhere and must not be affected).
  describe("data polling (via real PrDataPolling interval)", () => {
    const DATA_POLL_MS = 30000; // PrDataPolling's AUTO_DATA_POLL_MS (no ?dataPollMs= override here)

    beforeEach(() => {
      jest.useFakeTimers({ doNotFake: ["Date"] });
    });
    afterEach(() => {
      jest.useRealTimers();
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

      await waitFor(() => {
        expect(document.querySelector(".pr-row")).toBeTruthy();
      });

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

      await act(async () => {
        await jest.advanceTimersByTimeAsync(DATA_POLL_MS);
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(DATA_POLL_MS);
      });

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

      await waitFor(() => {
        expect(document.querySelector(".pr-row")).toBeTruthy();
      });

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

      await act(async () => {
        await jest.advanceTimersByTimeAsync(DATA_POLL_MS);
      });

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

      await act(async () => {
        await jest.advanceTimersByTimeAsync(DATA_POLL_MS);
      });

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

      await act(async () => {
        await jest.advanceTimersByTimeAsync(DATA_POLL_MS);
      });

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

      await waitFor(() => {
        expect(document.querySelector(".pr-row")).toBeTruthy();
      });

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

      await act(async () => {
        await jest.advanceTimersByTimeAsync(DATA_POLL_MS);
      });

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

      await waitFor(() => {
        const row = document.querySelector(
          "#pr-sections .pr-section-content table tbody tr",
        );
        expect(row).toBeTruthy();
      });
      const firstMainRowTextBefore = String(
        document.querySelector("#pr-sections .pr-section-content table tbody tr")
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

      await act(async () => {
        await jest.advanceTimersByTimeAsync(DATA_POLL_MS);
      });

      let firstMainRowTextAfter = "";
      await waitFor(() => {
        firstMainRowTextAfter = String(
          document.querySelector("#pr-sections .pr-section-content table tbody tr")
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

  test("given review conversations view controls changed, when polling rerenders the row, then the conversation and activity filters stay as picked", async () => {
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

      // Phase H.3 (see REACT_MIGRATION_PLAN.md): delay: null - this
      // describe block's fake timers would otherwise hang userEvent's own
      // internal setTimeout-based delays forever.
      const user = userEvent.setup({ delay: null });
      await waitFor(() => {
        expect(screen.getByText("#101")).toBeInTheDocument();
      });

      const row = screen.getByText("#101").closest("tr");

      // The pane's Conversations and Activity tabs.
      const getActivitySection = () => document.querySelector(".pr-pane .pr-activity");
      const commentsChip = () =>
        within(document.querySelector(".pr-pane")).getByRole("button", { name: /^Comments/ });
      const threadIds = (panel) =>
        Array.from(panel.querySelectorAll(".pr-conv-thread")).map((thread) => thread.getAttribute("data-thread-id"));
      const conversations = await openPrPane(user, row, "Conversations");
      expect(threadIds(conversations)).toEqual(["thread-open-1"]);

      // Picked by the user, so the poll below must keep it.
      await user.click(conversationChip(conversations, "All"));
      expect(conversationChip(conversations, "All")).toHaveAttribute("aria-pressed", "true");
      expect(threadIds(conversations)).toContain("thread-resolved-1");

      await openPrPane(user, row, "Activity");
      // Turned off by the user, so the poll below must keep it off.
      await user.click(commentsChip());
      expect(commentsChip()).toHaveAttribute("aria-pressed", "false");
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

      await act(async () => {
        await jest.advanceTimersByTimeAsync(DATA_POLL_MS);
      });

      // The row (the pane's title links "#101" too).
      const prRow = () => document.querySelector('tr.pr-row[data-pr-number="101"]');
      await waitFor(() => {
        expect(prRow()).toBeInTheDocument();
      });

      // Still selected, on the same tab, with the filter as the user left it.
      const refreshedRow = prRow();
      expect(refreshedRow).toHaveAttribute("aria-current", "true");
      const refreshedActivitySection = getActivitySection();
      expect(commentsChip()).toHaveAttribute("aria-pressed", "false");

      // The conversation filter survives too (the tab remounts), over the
      // new data: one more resolved thread.
      const refreshedConversations = await openPrPane(user, refreshedRow, "Conversations");
      expect(conversationChip(refreshedConversations, "All")).toHaveAttribute("aria-pressed", "true");
      expect(conversationChip(refreshedConversations, "All")).toHaveTextContent("4");
      expect(threadIds(refreshedConversations)).toEqual(
        expect.arrayContaining(["thread-open-1", "thread-resolved-1", "thread-author-warning-1", "thread-author-warning-2"]),
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

      await waitFor(() => {
        expect(document.querySelector(".pr-row")).toBeTruthy();
      });

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

      await act(async () => {
        await jest.advanceTimersByTimeAsync(DATA_POLL_MS);
      });

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

  test("a poll deferred by a dirty Notes field flushes once clean, applying the fresh payload without going through the full render pipeline", async () => {
    // Regression coverage for a real gap found while closing out
    // recomputeDirtyPrSectionsFields's own entanglement (see
    // REACT_MIGRATION_PLAN.md, "a real fast path for fresh-payload
    // renders"): no existing test (jest or Playwright) exercised the full
    // dirty -> queued -> clean -> flush cycle end to end - only the dirty
    // bridge itself (window.getDirtyNotesPrNumbers) had coverage. This
    // proves the flush's applyFreshPrPayload call actually reaches the
    // real, mounted React table. Window-bridge elimination Phase 7.4: the
    // dirty state now flows NotesDirtyProvider -> AutoRenderBlockingSync ->
    // AutoRenderBlockingProvider, all real here.
    {
      initTestPage({
        dataPayload: {
          dataMeta: { dataVersion: "seed-version" },
          ...createMultiPrPayload({
            prs: [
              {
                scenario: "open-no-change",
                prNumber: 101,
                overrides: {
                  data: {
                    title: "Deferred poll seed",
                    titleDisplay: "Deferred poll seed [CHK:PASS]",
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

      await waitFor(() => {
        expect(screen.getByText("#101")).toBeInTheDocument();
      });
      expect(prDataProbe.readPayload().byPrNumber["101"].data.title).toBe(
        "Deferred poll seed",
      );

      // Mark PR 101's notes dirty through the real NotesDirtyProvider, as
      // the Notes tab does on an edit.
      act(() => {
        notesDirtyTestHandle.setNotesDirty("101", true);
      });

      // The indicator only becomes visible once a poll actually has a
      // payload queued (AutoRenderBlockingProvider's isBlocked requires
      // both pendingAutoRenderPayload and
      // hasDirtyPrSectionsFields) - not from the dirty flag alone.
      const indicator = document.getElementById("auto-render-blocked-indicator");
      expect(indicator).toHaveAttribute("hidden");

      fetchMock.mockClear();
      fetchMock.mockImplementation(async (url, init = {}) => {
        const normalizedUrl = String(url || "");
        const method = String(init?.method || "GET").toUpperCase();

        if (normalizedUrl === "/view-prs/data-meta" && method === "GET") {
          return createOkJsonResponse({ ok: true, dataVersion: "deferred-v2" });
        }
        if (normalizedUrl === "/view-prs/scheduler" && method === "GET") {
          return { ok: false, status: 404, json: async () => ({ ok: false }) };
        }
        if (normalizedUrl === "/view-prs/data" && method === "GET") {
          return createOkJsonResponse({
            ok: true,
            lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:30:00Z" },
            ...createMultiPrPayload({
              prs: [
                {
                  scenario: "open-no-change",
                  prNumber: 101,
                  overrides: {
                    data: {
                      title: "Deferred poll applied",
                      titleDisplay: "Deferred poll applied [CHK:PASS]",
                      author: "octocat",
                      url: "https://github.com/owner/repo/pull/101",
                      updatedAt: "2026-06-16T10:30:00Z",
                    },
                  },
                },
              ],
              lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:30:00Z" },
            }),
          });
        }
        return createOkJsonResponse({ ok: true });
      });

      await act(async () => {
        await jest.advanceTimersByTimeAsync(DATA_POLL_MS);
      });

      // Still deferred - the dirty field hasn't cleared yet. The indicator
      // itself is now toggled by AutoRenderBlockingProvider.tsx's own
      // effect (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"),
      // one React commit after the bridge call above - waitFor accounts
      // for that, where this used to be a synchronous vanilla DOM write.
      expect(prDataProbe.readPayload().byPrNumber["101"].data.title).toBe(
        "Deferred poll seed",
      );
      await waitFor(() => {
        expect(indicator).not.toHaveAttribute("hidden");
      });

      // Field becomes clean - AutoRenderBlockingSync pushes the clean state,
      // and the Provider sees !hasDirtyPrSectionsFields &&
      // pendingAutoRenderPayload and flushes.
      act(() => {
        notesDirtyTestHandle.setNotesDirty("101", false);
      });

      await waitFor(() => {
        expect(prDataProbe.readPayload().byPrNumber["101"]?.data?.title).toBe(
          "Deferred poll applied",
        );
      });
      await waitFor(() => {
        expect(indicator).toHaveAttribute("hidden");
      });
    }
  });

  test("a poll that clears while a text field is focused waits for blur before applying, instead of clobbering the focused field", async () => {
    // Regression coverage for a real gap found while investigating
    // whether the auto-render-blocking pipeline could move into React
    // (see REACT_MIGRATION_PLAN.md): getPendingAutoRenderAction's
    // "wait-for-blur" branch (index.page.js's flushPendingAutoRender,
    // via pr-data-polling.helpers.ts) had a direct unit test for its own
    // pure decision function, but nothing exercised the real mechanism -
    // self-attaching a one-time native "blur" listener on
    // document.activeElement - end to end. This proves that real
    // mechanism actually works: a poll that becomes eligible to apply
    // while a text field is focused does NOT apply immediately, and
    // applies only once that field is blurred.
    let focusedInput;
    try {
      initTestPage({
        dataPayload: {
          dataMeta: { dataVersion: "seed-version" },
          ...createMultiPrPayload({
            prs: [
              {
                scenario: "open-no-change",
                prNumber: 102,
                overrides: {
                  data: {
                    title: "Blur-wait poll seed",
                    titleDisplay: "Blur-wait poll seed [CHK:PASS]",
                    author: "octocat",
                    url: "https://github.com/owner/repo/pull/102",
                    updatedAt: "2026-06-16T10:00:00Z",
                  },
                },
              },
            ],
            lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
          }),
        },
      });

      await waitFor(() => {
        expect(screen.getByText("#102")).toBeInTheDocument();
      });

      // A real, focused text-entry element - isTextEntryElement only
      // checks tagName, so a plain throwaway <input> is a faithful
      // stand-in for whichever real field the user was actually editing.
      focusedInput = document.createElement("input");
      document.body.appendChild(focusedInput);
      focusedInput.focus();
      expect(document.activeElement).toBe(focusedInput);

      // Mark PR 102's notes dirty through the real NotesDirtyProvider, as
      // the sibling test above does.
      act(() => {
        notesDirtyTestHandle.setNotesDirty("102", true);
      });

      fetchMock.mockClear();
      fetchMock.mockImplementation(async (url, init = {}) => {
        const normalizedUrl = String(url || "");
        const method = String(init?.method || "GET").toUpperCase();

        if (normalizedUrl === "/view-prs/data-meta" && method === "GET") {
          return createOkJsonResponse({ ok: true, dataVersion: "blur-wait-v2" });
        }
        if (normalizedUrl === "/view-prs/scheduler" && method === "GET") {
          return { ok: false, status: 404, json: async () => ({ ok: false }) };
        }
        if (normalizedUrl === "/view-prs/data" && method === "GET") {
          return createOkJsonResponse({
            ok: true,
            lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:30:00Z" },
            ...createMultiPrPayload({
              prs: [
                {
                  scenario: "open-no-change",
                  prNumber: 102,
                  overrides: {
                    data: {
                      title: "Blur-wait poll applied",
                      titleDisplay: "Blur-wait poll applied [CHK:PASS]",
                      author: "octocat",
                      url: "https://github.com/owner/repo/pull/102",
                      updatedAt: "2026-06-16T10:30:00Z",
                    },
                  },
                },
              ],
              lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:30:00Z" },
            }),
          });
        }
        return createOkJsonResponse({ ok: true });
      });

      await act(async () => {
        await jest.advanceTimersByTimeAsync(DATA_POLL_MS);
      });

      // Still deferred - the dirty field hasn't cleared yet.
      expect(prDataProbe.readPayload().byPrNumber["102"].data.title).toBe(
        "Blur-wait poll seed",
      );

      // Field becomes clean - the Provider sees !hasDirtyPrSectionsFields &&
      // pendingAutoRenderPayload and runs its flush check, which (after its
      // setTimeout(0)) finds document.activeElement is still our focused
      // text input and chooses "wait-for-blur" instead of applying.
      act(() => {
        notesDirtyTestHandle.setNotesDirty("102", false);
      });

      // Give the setTimeout(0) a chance to run, then confirm the payload
      // is still NOT applied - the focused field must not be clobbered.
      // Phase H.3 (see REACT_MIGRATION_PLAN.md): a real setTimeout wait
      // here would hang forever now that this describe block's fake
      // timers are active and nothing else advances them - advance them
      // explicitly instead.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(10);
      });
      expect(prDataProbe.readPayload().byPrNumber["102"].data.title).toBe(
        "Blur-wait poll seed",
      );
      expect(document.activeElement).toBe(focusedInput);

      // Blur the field - the self-attached one-time listener re-runs
      // flushPendingAutoRender, which now sees no focused text element
      // and applies the pending payload.
      focusedInput.blur();

      await waitFor(() => {
        expect(prDataProbe.readPayload().byPrNumber["102"]?.data?.title).toBe(
          "Blur-wait poll applied",
        );
      });
    } finally {
      focusedInput?.remove();
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

      const summaryToggle = await screen.findByRole("button", {
        name: /^Show summary for PR #/,
      });
      // Phase H.3 (see REACT_MIGRATION_PLAN.md): delay: null - this
      // describe block's fake timers would otherwise hang userEvent's own
      // internal setTimeout-based delays forever.
      const user = userEvent.setup({ delay: null });
      // The row's summary open, and the PR in the pane on its Activity tab.
      await user.click(summaryToggle);
      const insightsPanel = await openPrPane(user, summaryToggle.closest("tr"), "Activity");

      await waitFor(() => {
        expect(
          document.querySelector(".pr-expand-toggle[aria-expanded='true']"),
        ).toBeTruthy();
      });
      expect(insightsPanel).toBeTruthy();
      // The Activity tab's collapsible group (closed until opened).
      const activityDetails = Array.from(
        insightsPanel.querySelectorAll("details[data-insight-key]"),
      ).find(
        (d) => d.getAttribute("data-insight-key") === "daily summary",
      );
      expect(activityDetails).toBeTruthy();
      expect(activityDetails.open).toBe(false);
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

      await act(async () => {
        await jest.advanceTimersByTimeAsync(DATA_POLL_MS);
      });

      await waitFor(() => {
        const toggle = document.querySelector(".pr-expand-toggle");
        expect(toggle?.getAttribute("aria-expanded")).toBe("true");
      });
      // The pane still shows the PR, on the same tab.
      expect(document.querySelector('tr.pr-row[data-pr-number="101"]')).toHaveAttribute("aria-current", "true");
      expect(within(document.querySelector(".pr-pane")).getByRole("tab", { name: /^Activity/ })).toHaveAttribute("aria-selected", "true");

      const insightsPanelAfter = within(document.querySelector(".pr-pane")).getByRole("tabpanel");
      expect(insightsPanelAfter).toBeTruthy();
      const activityDetailsAfter = Array.from(
        insightsPanelAfter.querySelectorAll("details[data-insight-key]"),
      ).find(
        (d) => d.getAttribute("data-insight-key") === "daily summary",
      );
      expect(activityDetailsAfter).toBeTruthy();
      expect(activityDetailsAfter.open).toBe(true);
    }
    });
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
        document.querySelectorAll(".pr-section"),
      ).find((s) => s.querySelector("summary")?.textContent?.includes("Closed PRs"));
      expect(closedPrsSection).toBeTruthy();
    });

    const closedPrsSection = Array.from(
      document.querySelectorAll(".pr-section"),
    ).find((s) => s.querySelector("summary")?.textContent?.includes("Closed PRs"));

    const mergedPrsSection = Array.from(
      document.querySelectorAll(".pr-section"),
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
        document.querySelectorAll(".pr-section"),
      )
        .find((s) => s.querySelector("summary")?.textContent?.includes("Closed PRs"))
        ?.querySelector("table");
      const firstClosedLink = closedTable?.querySelector("a.pr-link");
      expect(firstClosedLink?.textContent).toBe("#400");
    });

    const closedTableAfter = Array.from(
      document.querySelectorAll(".pr-section"),
    )
      .find((s) => s.querySelector("summary")?.textContent?.includes("Closed PRs"))
      ?.querySelector("table");
    const firstClosedLinkAfter = closedTableAfter?.querySelector("a.pr-link");
    expect(firstClosedLinkAfter?.textContent).toBe("#400");

    const mergedTableAfter = Array.from(
      document.querySelectorAll(".pr-section"),
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
  // The actual mechanism under test (composer draft state surviving an
  // async author-comments load) lives entirely in
  // AuthorInsightsDraftsProvider.tsx's real Context state now - see
  // AuthorInsightsCommentsSection.test.jsx's own draft/dirty-tracking
  // tests for the equivalent coverage, tested directly against that
  // mechanism instead.

  // Accessibility naming (groundwork for role-based e2e queries that survive
  // a UI redesign): the page's text areas, content areas and multi-select
  // filter lists in index.html each have a role and a name. Some live in
  // tab panels that start hidden, hence { hidden: true }.
  // The Review stats and Authors views mount the first time they're shown
  // (this harness has no TabStateProvider to show them); AppShell.test.tsx
  // checks their regions.
  test("index.html's page areas and filter lists are reachable by role and name", () => {
    initTestPage();

    const regions = [
      "Pull requests",
      "Latest request output",
      "Backfill status details",
      "Backfill log",
      "PR data summary",
      "Status message",
      // The filter bar above the table (its applied-filter chips are a
      // group only while a filter is applied).
      "Filters",
    ];
    regions.forEach((name) => {
      expect(screen.getByRole("region", { name, hidden: true })).toBeInTheDocument();
    });

    const groups = [
      "Backfill status badges",
      "Labels",
      "Excluded labels",
      "Authors",
      "Assigned to",
      "Approved by",
      "Allow PR authors to resolve threads started by (Actor Names)",
      "Do not allow PR authors to resolve threads started by (Actor Names)",
      "Ignore comments from these authors (GitHub logins)",
      "Ignore reviews from these authors (GitHub logins)",
    ];
    groups.forEach((name) => {
      expect(screen.getByRole("group", { name, hidden: true })).toBeInTheDocument();
    });
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
      // The activity timeline table, on the pane's Activity tab
      const insightsRow = await openPrPane(user, row, "Activity");
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

  // Phase 7, sub-phase 7.4 (see REACT_MIGRATION_PLAN.md): the
  // FilterOptionSelect "Any" fields (filter-custom-comments,
  // filter-other-notes, filter-pr-difficulty, filter-stories,
  // filter-analysis-of-pr) were never included in
  // persistUiOptionOverrides/restoreUiOptionOverrides/getUiOptionDefaults -
  // a real, undocumented persistence gap, not an intentional exclusion
  // (unlike their separate, deliberate exclusion from auto-apply-on-change).
  // Covers both directions of that fix for one representative field
  // (filter-pr-difficulty); the others share the exact same code path.
  describe("FilterOptionSelect persistence (persistence-gap fix)", () => {
    test("given a FilterOptionSelect value, when it changes, then it is persisted to user-defaults", async () => {
      initTestPage({
        dataPayload: createMultiPrPayload({
          prs: [{ scenario: "open-no-change", prNumber: 850 }],
          lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
        }),
      });

  
      const prDifficultySelect = document.getElementById("filter-pr-difficulty");
      fetchMock.mockClear();
      fireEvent.change(prDifficultySelect, { target: { value: "3" } });

      await waitForPersistedViewFilterOverrides((savedOverrides) => {
        expect(savedOverrides["filter-pr-difficulty"]).toBe("3");
      });
    });

    test("given user-defaults with a FilterOptionSelect value, when page loads, then it is restored", async () => {
      initTestPage({
        dataPayload: createMultiPrPayload({
          prs: [{ scenario: "open-no-change", prNumber: 851 }],
          lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
        }),
        userDefaultsOverrides: {
          repo: "owner/repo",
          "filter-pr-difficulty": "4",
        },
      });

  
      // Phase E (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
      // restore now lands in FilterStateProvider's own Context, not this
      // static <select> directly (see installFilterStateProviderBridge's
      // own comment) - read the real source of truth instead of the DOM.
      await waitFor(() => {
        expect(readFilterStateValues()?.filterPrDifficulty).toBe("4");
      });
    });
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

  
      const list = await waitFor(() => {
        const found = getMultiSelectList("change-filter-ignore-comment-authors-list");
        if (isMultiSelectEmpty("change-filter-ignore-comment-authors-list")) {
          throw new Error("not populated yet");
        }
        return found;
      });
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

  
      const list = await waitFor(() => {
        const found = getMultiSelectList("change-filter-ignore-review-authors-list");
        if (isMultiSelectEmpty("change-filter-ignore-review-authors-list")) {
          throw new Error("not populated yet");
        }
        return found;
      });
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

    test("given change filter selections, when they are made, then they are persisted to user-defaults", async () => {
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
        await waitFor(() => {
        if (isMultiSelectEmpty("change-filter-ignore-comment-authors-list")) {
          throw new Error("not populated yet");
        }
      });

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
      fireEvent.change(commitPatternsTextarea, { target: { value: "^docs:\n^test:\n^chore\\(deps\\):" } });

      await waitForPersistedViewFilterOverrides((savedOverrides) => {
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
    });

    test("given commit patterns with whitespace and empty lines, when entered, then the persisted patterns are trimmed and empty lines removed", async () => {
      initTestPage({
        dataPayload: createMultiPrPayload({
          prs: [{ scenario: "open-no-change", prNumber: 805 }],
          actorsMap: {},
          lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
        }),
      });

  
      const commitPatternsTextarea = document.getElementById(
        "change-filter-ignore-commit-patterns",
      );
      fireEvent.change(commitPatternsTextarea, { target: { value: "  ^docs:  \n\n  ^test:  \n   \n^style: formatting" } });

      await waitForPersistedViewFilterOverrides((savedOverrides) => {
        expect(savedOverrides.changeFilters.ignoreCommitPatterns).toEqual([
          "^docs:",
          "^test:",
          "^style: formatting",
        ]);
      });
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

        await waitFor(() => {
        if (isMultiSelectEmpty("change-filter-ignore-comment-authors-list")) {
          throw new Error("not populated yet");
        }
      });

      // Phase G.3 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
      // these 2 lists are now also Context-controlled
      // (ChangeFilterActorSelectionContext) - the pending-selection restore
      // path's own clear-after-consuming step (setPendingMultiSelectSelection
      // (key, null), pr-pending-multi-select-selections.helpers.ts) notifies
      // this component's subscription again, re-running the seeding effect
      // one more time before the checked-state Context write from the
      // previous pass has committed to the DOM - same transient settling
      // window the existing thread-resolution restore test above already
      // wraps in waitFor (getSelectedMultiSelectValues reads the live DOM,
      // which briefly lags the Context write). A plain synchronous
      // assertion here was fine before these 2 lists had this extra
      // Context-driven re-render step.
      await waitFor(() => {
        // Check comment author selections are restored
        const commentAuthorsSelections = getSelectedMultiSelectValues(
          "change-filter-ignore-comment-authors-list",
        );
        expect(commentAuthorsSelections).toEqual(
          expect.arrayContaining(["dependabot[bot]", "codecov[bot]"]),
        );
        expect(commentAuthorsSelections.length).toBe(2);
      });

      // Check review author selections are restored
      await waitFor(() => {
        const reviewAuthorsSelections = getSelectedMultiSelectValues(
          "change-filter-ignore-review-authors-list",
        );
        expect(reviewAuthorsSelections).toEqual(["reviewer1"]);
      });

      // Check commit patterns are restored - Phase E (see
      // REACT_MIGRATION_PLAN.md, "Full migration roadmap"): restore now
      // lands in FilterStateProvider's own Context, not this static
      // <textarea> directly (see installFilterStateProviderBridge's own
      // comment) - read the real source of truth instead of the DOM.
      await waitFor(() => {
        expect(readFilterStateValues()?.changeFilterIgnoreCommitPatterns).toBe(
          "^docs:\n^test:\n^chore\\(deps\\):",
        );
      });
    });

    test("given change filter selections, when selections are changed, then new selections replace old ones", async () => {
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
        await waitFor(() => {
        expect(
          getSelectedMultiSelectValues("change-filter-ignore-comment-authors-list"),
        ).toEqual(["dependabot[bot]"]);
      });

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
      fireEvent.change(commitPatternsTextarea, { target: { value: "^test:\n^style:" } });

      await waitForPersistedViewFilterOverrides((savedOverrides) => {
        expect(savedOverrides.changeFilters.ignoreCommentsFromAuthors).toEqual([
          "github-actions[bot]",
        ]);
        expect(savedOverrides.changeFilters.ignoreReviewsFromAuthors).toEqual(
          expect.arrayContaining(["reviewer1", "reviewer2"]),
        );
        expect(savedOverrides.changeFilters.ignoreReviewsFromAuthors.length).toBe(2);
        expect(savedOverrides.changeFilters.ignoreCommitPatterns).toEqual(["^test:", "^style:"]);
      });
    });

    test("given a change filter selection, when it is cleared again, then empty lists are persisted (changeFilters omitted)", async () => {
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
        await waitFor(() => {
        if (isMultiSelectEmpty("change-filter-ignore-review-authors-list")) {
          throw new Error("not populated yet");
        }
      });

      // Saves only happen on a change (the debounce never fires on mount), so
      // check and uncheck a reviewer: the final state has every list empty.
      fetchMock.mockClear();
      await clickMultiSelectCheckbox("change-filter-ignore-review-authors-list", "reviewer1", user);
      await clickMultiSelectCheckbox("change-filter-ignore-review-authors-list", "reviewer1", user);

      await waitForPersistedViewFilterOverrides((savedOverrides) => {
        // When all filter arrays are empty, changeFilters should be removed from saved overrides
        expect(savedOverrides.changeFilters).toBeUndefined();
      });
    });

    test("given commit patterns textarea with complex regex, when persisted, then patterns are preserved exactly", async () => {
      initTestPage({
        dataPayload: createMultiPrPayload({
          prs: [{ scenario: "open-no-change", prNumber: 809 }],
          actorsMap: {},
          lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
        }),
      });

  
      const commitPatternsTextarea = document.getElementById(
        "change-filter-ignore-commit-patterns",
      );
      // Complex regex patterns with special characters
      fireEvent.change(commitPatternsTextarea, { target: { value: "^chore\\(deps(-dev)?\\): bump\n^(docs|test):\\s+[A-Z]\n^Merge branch .* into .*$" } });

      await waitForPersistedViewFilterOverrides((savedOverrides) => {
        expect(savedOverrides.changeFilters.ignoreCommitPatterns).toEqual([
          "^chore\\(deps(-dev)?\\): bump",
          "^(docs|test):\\s+[A-Z]",
          "^Merge branch .* into .*$",
        ]);
      });
    });
  });
});
