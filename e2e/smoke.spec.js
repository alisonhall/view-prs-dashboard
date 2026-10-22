const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Vite's dev server transforms each ES module on-demand per request rather
// than serving a pre-bundled file, so the very first page load (React,
// ReactDOM, and dozens of helper/component files, all cold) can take
// meaningfully longer on a slow/shared CI runner than on a warm local dev
// machine - confirmed via a CI trace showing the /view-prs/data fetch
// itself succeeding in 41ms with valid PR data, zero console/page errors,
// yet the table still not painted 15s later. Give CI runs a more generous
// budget; keep local runs fast-failing at the original value.
const PR_TABLE_READY_TIMEOUT_MS = process.env.CI ? 45_000 : 15_000;

// Test selectors - how this file finds elements, so the tests keep passing
// through UI redesigns that change markup and class names (they check
// behaviour, not structure):
//   1. By role and accessible name: getByRole("button", { name: "Save notes" }).
//      For form fields, getByLabel(...) - but for a <select> wrapped in its
//      <label>, getByRole("combobox", { name }): getByLabel matches the
//      label's raw text, which includes every option. Pass exact: true -
//      names otherwise match case-insensitive substrings ("Allow..." is
//      inside "Do not allow...").
//   2. By visible text or placeholder, when an element has no useful role.
//   3. data-testid only when nothing semantic fits - e.g. a button whose
//      visible name changes while it works ("Quick check" -> "Checking...").
//   Never by CSS class, element id, DOM structure or xpath, except inside a
//   named helper below (one place to change if that markup changes).
// When a UI change needs a new hook, add an accessible name to the component
// (it helps assistive tech too) rather than a class or id.
// Hidden elements: getByRole skips them unless includeHidden: true; getByLabel,
// getByText and getByTitle find them anyway. Use includeHidden where the
// element can be collapsed or in an inactive tab when the test looks for it.
// Note accessible names are computed for hidden elements here, but not by
// Testing Library in jest.

// The PR tables live in the "Pull requests" region (#pr-sections). Their
// sections start collapsed, so rows are often hidden - hence includeHidden
// for "has the table rendered yet?", matching the old
// waitForSelector(..., { state: "attached" }).
const prTables = (page) => page.getByRole("region", { name: "Pull requests", exact: true });
const waitForPrTable = (page) =>
  prTables(page)
    .getByRole("row", { includeHidden: true })
    .first()
    .waitFor({ state: "attached", timeout: PR_TABLE_READY_TIMEOUT_MS });
// The <summary> that opens a multi-select filter dropdown, given its list
// (a named group). <summary> has no standard role, so this one helper holds
// the structural lookup - the place to change if the dropdown markup does.
const filterDropdownSummary = (list) => list.locator("xpath=ancestor::details[1]/summary");
// A PR section (a <details> named by its title, e.g. "Open PRs").
const prSection = (page, title) =>
  prTables(page).getByRole("group", { name: title, exact: true, includeHidden: true });
// PR N's insights toggle in either state ("More insights for PR #N" /
// "Hide insights for PR #N"), so a locator still matches after a click.
const insightsToggleFor = (scope, prNumber) =>
  scope.getByRole("button", { name: new RegExp(`^(More|Hide) insights for PR #${prNumber}$`) });
const prNumberFromLabel = (label) => String(label || "").match(/#(\d+)$/)[1];
// The first visible "More insights" toggle, pinned to its PR.
const firstInsightsToggle = async (page) => {
  const label = await prTables(page)
    .getByRole("button", { name: /^More insights for PR #\d+$/ })
    .first()
    .getAttribute("aria-label");
  return insightsToggleFor(prTables(page), prNumberFromLabel(label)).first();
};
// The insights row under PR N's expanded toggle, in the same table. Found by
// name ("Insights for PR #N"), hidden included: its own `hidden` is what
// the tests check, and its section may be collapsed.
const insightsRowUnderExpandedToggle = async (page) => {
  const expanded = prTables(page)
    .getByRole("button", { name: /^Hide insights for PR #\d+$/, includeHidden: true })
    .first();
  await expect(expanded).toBeAttached();
  const prNumber = prNumberFromLabel(await expanded.getAttribute("aria-label"));
  const table = prTables(page)
    .getByRole("table", { includeHidden: true })
    .filter({ has: page.getByRole("button", { name: `Hide insights for PR #${prNumber}`, exact: true, includeHidden: true }) })
    .first();
  return table.getByRole("row", { name: `Insights for PR #${prNumber}`, exact: true, includeHidden: true });
};

// Test-only bridge removal (see WINDOW_BRIDGE_ELIMINATION_PLAN.md): makes a
// real "new data" poll, so the auto-render-blocking tests no longer fake a
// deferred poll through window.setPendingAutoRenderPayload. Rewrites the
// e2e server's data file (playwright.config.js exports its temp dir in
// VIEW_PRS_E2E_TEMP_DIR) with a marker field in one PR's `data`. The poll
// only queues PRs whose content changed (the per-PR manifest), so touching
// the mtime alone isn't enough; nothing renders the marker. The server is
// shared by every test, so the original bytes are put back after the test
// (afterEach below), pass or fail. Pages under test open with ?dataPollMs=
// so the poll runs within a second, not 30 s.
const pendingServerDataRestores = [];
const changeServerData = async (page) => {
  const readVersion = async () => (await (await page.request.get("/view-prs/data-meta")).json()).dataVersion;
  // Only ever the e2e run's own temp copy - never real state.
  const tempDir = path.resolve(String(process.env.VIEW_PRS_E2E_TEMP_DIR || ""));
  if (!process.env.VIEW_PRS_E2E_TEMP_DIR || !tempDir.startsWith(path.resolve(os.tmpdir()) + path.sep)) {
    throw new Error(`changeServerData: VIEW_PRS_E2E_TEMP_DIR must be a temp dir, got "${process.env.VIEW_PRS_E2E_TEMP_DIR}"`);
  }
  const dataFile = path.join(tempDir, "check-open-pr-updates.data.json");
  const original = fs.readFileSync(dataFile, "utf8");
  pendingServerDataRestores.push(() => fs.writeFileSync(dataFile, original));
  const data = JSON.parse(original);
  data.byPrNumber["3"].data = { ...data.byPrNumber["3"].data, e2eDataChangeMarker: Date.now() };
  const before = await readVersion();
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
  expect(await readVersion()).not.toBe(before);
};
test.afterEach(() => {
  while (pendingServerDataRestores.length) pendingServerDataRestores.pop()();
});

/**
 * Real-browser smoke tests for the hybrid vanilla/React PR table.
 *
 * These exist to catch the class of bug jsdom cannot see: broken static
 * asset paths (404s), missing charset handling (mojibake), and anything
 * that only shows up once a real browser actually loads and paints the
 * page. They intentionally do not re-test interaction logic already
 * covered by the jsdom suite in `src/ui/integration-tests` - keep this
 * file small.
 */

// Waits for the view-filter save triggered by the action just before the
// call to finish. Since this suite's webServer is one long-lived process
// shared by every test (see playwright.config.js's isolation comment), a
// test that ends before its own PUT lands can silently change what a
// *later*, unrelated test sees on its own fresh page load.
//
// Window-bridge elimination Phase 6 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
// this used to call window.persistViewFilterOptionOverrides to force the save;
// that bridge is gone, so it now waits for the app's real save instead.
// FilterStateProvider's 150ms debounced effect is the only trigger. A bare
// "wait for *a* PUT" listener is unreliable: the effect also re-saves once
// after the mount-time restore, so such a listener can match that earlier
// write. Instead: (1) wait 200ms on a timer *inside the page*. Page timers
// fire in due order, so the debounce (due 150ms after the action, which was
// already dispatched) has fired by then, even on a lagging page. (2) Then wait
// until no /view-prs/user-defaults request is in flight and none has
// started or finished for USER_DEFAULTS_QUIET_MS. That covers the gap
// between a save's GET and its PUT (see FilterStateProvider's
// persistViewFilterOptions).
//
// In-flight requests are tracked as a Set of Request objects, cleared whenever
// the main frame navigates: a request the old document had in flight when a
// test reloads (e.g. the restore's own save) is cancelled with the document,
// and Playwright reports neither requestfinished nor requestfailed for it - a
// plain counter stayed stuck above zero and the wait never ended.
const USER_DEFAULTS_QUIET_MS = 100;
const userDefaultsTrackers = new WeakMap();
const trackUserDefaultsRequests = (page) => {
  const tracker = { inFlight: new Set(), lastActivityAt: 0 };
  const isUserDefaults = (request) => new URL(request.url()).pathname === "/view-prs/user-defaults";
  const onDone = (request) => {
    if (!tracker.inFlight.delete(request)) return;
    tracker.lastActivityAt = Date.now();
  };
  page.on("request", (request) => {
    if (!isUserDefaults(request)) return;
    tracker.inFlight.add(request);
    tracker.lastActivityAt = Date.now();
  });
  page.on("requestfinished", onDone);
  page.on("requestfailed", onDone);
  page.on("framenavigated", (frame) => {
    if (frame !== page.mainFrame()) return;
    tracker.inFlight.clear();
    tracker.lastActivityAt = Date.now();
  });
  userDefaultsTrackers.set(page, tracker);
};
const waitForFilterPersist = async (page) => {
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 200)));
  const tracker = userDefaultsTrackers.get(page);
  await expect
    .poll(() => tracker.inFlight.size === 0 && Date.now() - tracker.lastActivityAt >= USER_DEFAULTS_QUIET_MS, {
      intervals: [25],
    })
    .toBe(true);
};

// "Apply existing GitHub label to selected PR(s)" (the admin dropdown, not
// the payload-derived #label-list filter - see that field's own test
// comment further down) is the one feature in this whole suite with no
// fixture/isolation story: refreshAvailableRepoLabels() (index.page.js)
// hits GET /view-prs/labels, which shells out to the real `gh label list`
// CLI (src/server/app.js's listRepoLabels) against whatever repo is
// configured - there is no GH_TOKEN or network access to github.com in
// CI, so every real run 500s. That 500 is otherwise harmless (the vanilla
// code already treats it as best-effort and leaves the dropdown showing
// "No labels found for this repo"), but this suite's own
// collectPageErrors() below asserts zero failed requests/console errors
// per test, so left unmocked, EVERY test failed this exact way once the
// suite got far enough to stop hanging - not a React timing bug, a
// missing fixture for a genuinely external dependency. Stub it here,
// suite-wide, the same way playwright.config.js's isolatedEnv keeps every
// other feature off real external/production state.
const mockRepoLabelsRoute = (page) =>
  page.route("**/view-prs/labels?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, repo: "octocat/hello-world", labels: [] }),
    }),
  );

const collectPageErrors = (page) => {
  const consoleErrors = [];
  const failedRequests = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));
  page.on("response", (res) => {
    if (res.status() >= 400) failedRequests.push(`${res.status()} ${res.url()}`);
  });
  return { consoleErrors, failedRequests };
};

test.beforeEach(async ({ page }) => {
  trackUserDefaultsRequests(page);
  await mockRepoLabelsRoute(page);
});

test("page loads, PR table renders, and no requests or console calls fail", async ({ page }) => {
  const { consoleErrors, failedRequests } = collectPageErrors(page);

  await page.goto("/");
  await waitForPrTable(page);

  const rowCount = await prTables(page).getByRole("row", { includeHidden: true }).count();
  expect(rowCount).toBeGreaterThan(0);

  // data-meta should show the applied-filters summary, not be stuck on the
  // initial "Loading..." placeholder (regression guard: the React render
  // path used to skip the vanilla pipeline step that sets this text).
  await expect(page.getByRole("region", { name: "PR data summary", exact: true, includeHidden: true })).not.toHaveText("Loading...");

  expect(failedRequests).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("non-ASCII glyphs render correctly (charset regression guard)", async ({ page }) => {
  await page.goto("/");
  await waitForPrTable(page);

  // A missing <meta charset="utf-8"> makes the browser guess the page's
  // encoding, turning multi-byte UTF-8 glyphs (the CSS dropdown-arrow
  // content, activity icons) into mojibake. Assert the actual charset the
  // browser resolved, rather than any specific glyph, since glyph shape
  // also depends on font availability in the runner.
  const charset = await page.evaluate(() => document.characterSet);
  expect(charset.toUpperCase()).toBe("UTF-8");
});

test("checkbox toggle and More insights expand work", async ({ page }) => {
  const { consoleErrors } = collectPageErrors(page);

  await page.goto("/");
  await waitForPrTable(page);

  // Flagged/in-review checkboxes live in the smart groups, open by default.
  const checkbox = prTables(page).getByRole("checkbox", { name: /^In Review for PR #/ }).first();
  await expect(checkbox).toHaveCount(1);
  const before = await checkbox.isChecked();
  await checkbox.click();
  await expect(checkbox).toHaveJSProperty("checked", !before);

  const insightsToggle = await firstInsightsToggle(page);
  await insightsToggle.click();
  await expect(insightsToggle).toHaveAttribute("aria-expanded", "true");

  expect(consoleErrors).toEqual([]);
});

test("lifecycle section expand/collapse and tab switching work", async ({ page }) => {
  const { consoleErrors } = collectPageErrors(page);

  await page.goto("/");
  await waitForPrTable(page);

  const openSection = prSection(page, "Open PRs");
  await expect(openSection).toHaveJSProperty("open", false);
  await openSection.getByText("Open PRs", { exact: true }).click();
  await expect(openSection).toHaveJSProperty("open", true);

  await page.getByRole("tab", { name: "Review statistics" }).click();
  await expect(page.getByRole("tabpanel", { name: "Review statistics", exact: true, includeHidden: true })).toBeVisible();

  await page.getByRole("tab", { name: "Author Insights" }).click();
  await expect(page.getByRole("tabpanel", { name: "Author Insights", exact: true, includeHidden: true })).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

test("Run & Filter dropdowns populate from loaded PR data", async ({ page }) => {
  await page.goto("/");
  await waitForPrTable(page);

  await page.getByRole("tab", { name: "Run & Filter" }).click();

  const authorOptionCount = await page.getByRole("group", { name: "Filter by PR author(s)", exact: true, includeHidden: true }).getByRole("checkbox", { includeHidden: true }).count();
  expect(authorOptionCount).toBeGreaterThan(0);
});

test("typing a PR-number filter actually filters the rendered table in a real browser, not just the summary line", async ({ page }) => {
  // Regression test, now with a different trigger: the React rendering
  // path used to always show every stored PR for the repo, completely
  // ignoring the local filter - only the data-meta summary text reflected
  // it, because vanilla computed the filtered set but never told React
  // about it. This only showed up in a real browser: jsdom-based tests
  // never exercise the React rendering path at all (window.ReactMountBridge
  // doesn't exist there), so this bug was invisible to the full jsdom
  // suite. Phase H.26 (see REACT_MIGRATION_PLAN.md, "Remaining-effort
  // audit", cluster 1): "Apply filters (local)" (the button this test
  // used to click to trigger the filter) is deleted outright - filtering
  // is fully live now, confirmed by an empirical check that this exact
  // test still passes with that bridge stubbed to a no-op.
  await page.goto("/");
  await waitForPrTable(page);

  await expect(prTables(page)).toContainText("Add welcome banner");
  await expect(prTables(page)).toContainText("Fix flaky test");

  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByLabel("Filter by PR number(s)", { exact: true }).fill("1");
  await waitForFilterPersist(page);
  await page.getByRole("tab", { name: "PR data" }).click();

  await expect(page.getByRole("region", { name: "PR data summary", exact: true, includeHidden: true })).toContainText("Rows: 1");
  await expect(prTables(page)).toContainText("Add welcome banner");
  await expect(prTables(page)).not.toContainText("Fix flaky test");

  // Clear and re-persist, so this test's filter doesn't hide PR #2/#3 from
  // whatever unrelated test happens to load next against this suite's one
  // shared webServer - restored filters now actually re-apply on load
  // (see setNativeValueAndDispatch in index.page.js), so a leftover
  // persisted filter here isn't just cosmetic for the next test anymore.
  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByLabel("Filter by PR number(s)", { exact: true }).fill("");
  await waitForFilterPersist(page);
});

test("Request more merged PRs button renders (lives outside the React-owned table)", async ({ page }) => {
  // Regression test: this button is a static sibling of #pr-sections,
  // toggled by the vanilla pipeline - it used to only be appended as part
  // of building the vanilla <table> markup, a step skipped entirely when
  // React renders the table, so the button was simply absent in the real
  // (React) UI despite the default scope ("all stored rows") making it
  // eligible to show.
  await page.goto("/");
  await waitForPrTable(page);

  await expect(page.getByRole("button", { name: "Request more", exact: true })).toBeVisible();
});

test("scheduler-driven active-PR progress indicator reaches the React-rendered row", async ({ page }) => {
  // Regression test: applyActivePrProgressIndicators (fired from the
  // scheduler-status poll loop, independent of the main data render) used
  // to reach into #pr-sections and flip a .pr-progress-indicator span's
  // `hidden` property directly - which only works when vanilla itself
  // built that markup. Once React owns #pr-sections, that direct DOM
  // manipulation has nothing to reach (or risks fighting React's own
  // reconciliation), so the spinner never showed. It's now dispatched as a
  // 'pr-active-progress-update' CustomEvent that PrTableApp listens for.
  await page.goto("/");
  await waitForPrTable(page);

  // Checks the `hidden` DOM property directly (not Playwright's
  // toBeVisible/toBeHidden) because this test verifies the React prop
  // wiring, not whether a human could currently see the row - PR #1 can
  // legitimately be sitting inside a collapsed lifecycle section
  // (collapsed by default, and its exact section/smart-group membership
  // can shift as other tests in this suite toggle its flagged/in-review
  // state against the same shared dev server) without that being a
  // regression in this feature.
  const pr1Indicator = prTables(page).getByTitle("PR #1 update in progress", { exact: true }).first();
  await expect(pr1Indicator).toHaveJSProperty("hidden", true);

  await page.evaluate(() => {
    // activePrNumbers entries are { repo, prNumber } pairs, not bare
    // numbers - PR numbers are only unique within a repo, and the
    // scheduler can have several repos' PRs active at once (see app.js's
    // buildActivePrKey).
    window.dispatchEvent(
      new CustomEvent("pr-active-progress-update", {
        detail: { activePrNumbers: [{ repo: "octocat/hello-world", prNumber: "1" }] },
      }),
    );
  });

  await expect(pr1Indicator).toHaveJSProperty("hidden", false);
});

test("editing a PR Notes field in the real React-owned row holds back a real data poll until the edit is undone", async ({ page }) => {
  // Regression test for Phase 7, sub-phase 7.5 (see REACT_MIGRATION_PLAN.md):
  // NotesSection.jsx used to report an unsaved edit via a
  // data-has-unsaved-notes DOM attribute, scanned by vanilla
  // pr-auto-render-unsaved.helpers.js. It's NotesDirtyProvider's React state
  // now, which AutoRenderBlockingSync turns into the auto-render-blocking
  // state (window-bridge elimination Phase 7.4). Test-only bridge removal:
  // this used to read window.getDirtyNotesPrNumbers; it now checks the real
  // outcome - a real poll (changeServerData) is held back while the field
  // is dirty, and applied once the edit is undone and the field blurred.
  await page.goto("/?dataPollMs=300");
  await waitForPrTable(page);
  const indicator = page.getByRole("status", { name: "Auto update paused", exact: true, includeHidden: true });

  const insightsToggle = await firstInsightsToggle(page);
  await insightsToggle.click();
  await expect(insightsToggle).toHaveAttribute("aria-expanded", "true");

  const notesSection = prTables(page).getByRole("group", { name: /^Notes for PR #\d+$/ }).first();
  const prNumber = prNumberFromLabel(await notesSection.getAttribute("aria-label"));
  const notesTextarea = notesSection.getByPlaceholder("Other notes...");
  await expect(notesTextarea).toBeVisible();
  const originalValue = await notesTextarea.inputValue();

  await notesTextarea.fill(`${originalValue}a note left during this test`);
  await changeServerData(page);
  await expect(indicator).toBeVisible();
  await expect(page.getByRole("button", { name: `#${prNumber}`, exact: true })).toBeVisible();

  // Undo the edit (notes are only saved by an explicit Save) and blur the
  // field: the held-back poll applies and the indicator goes away.
  await notesTextarea.fill(originalValue);
  await notesTextarea.blur();
  await expect(indicator).toBeHidden();
});

test("typing character-by-character into the Rally stories/links inputs keeps every keystroke", async ({ page }) => {
  // Regression coverage for a real bug only a real browser could catch:
  // index.page.js's recomputeDirtyOnEvent (deleted in window-bridge
  // elimination Phase 7.4 - the blocking state is now recomputed in
  // AutoRenderBlockingSync's effect, after React commits) was attached to
  // #pr-sections - the same DOM node React's own table root mounts into -
  // and was registered in initPage(), before React ever mounts, so it
  // fired *before* React's own delegated listener for the same native
  // "input" event (same-node listeners fire in registration order).
  // Calling recomputeDirtyPrSectionsFields() synchronously from there (as
  // it used to, for every INPUT keystroke - TEXTAREA was already
  // debounced) triggers a React state update (AutoRenderBlockingProvider's
  // bump()) *before* React's own event handling for that same native
  // event starts, so React doesn't batch it - it flushes synchronously,
  // reconciling the controlled Rally stories/links input back to its
  // pre-keystroke value before React's own onChange ever runs. Each
  // keystroke was silently dropped - .fill() didn't catch this (jsdom's
  // event delegation model doesn't reproduce the real listener-ordering
  // race either), only real per-keystroke typing in a real browser does.
  await page.goto("/");
  await waitForPrTable(page);

  const insightsToggle = await firstInsightsToggle(page);
  await insightsToggle.click();
  await expect(insightsToggle).toHaveAttribute("aria-expanded", "true");

  const rallyStoryInput = prTables(page).getByRole("group", { name: "Rally stories", exact: true }).getByRole("textbox").first();
  await expect(rallyStoryInput).toBeVisible();
  await rallyStoryInput.click();
  await rallyStoryInput.pressSequentially("US12345");
  await expect(rallyStoryInput).toHaveValue("US12345");
  await rallyStoryInput.fill("");

  const rallyLinkInput = prTables(page).getByRole("group", { name: "Rally links", exact: true }).getByRole("textbox").first();
  await rallyLinkInput.click();
  await rallyLinkInput.pressSequentially("https://rally.example/US12345");
  await expect(rallyLinkInput).toHaveValue("https://rally.example/US12345");
  await rallyLinkInput.fill("");
});

test("selecting an option in the Notes section's author/tone/difficulty dropdowns actually applies it", async ({ page }) => {
  // Regression coverage for the same root cause as the Rally stories/
  // links keystroke bug above, on recomputeDirtyOnEvent's "change"/"click"
  // branches instead of "input" - a native <select> fires only "change"
  // (no "input"), and clicking the closed <select> to open its dropdown
  // is itself a "click" on a .pr-notes-* element, both of which this
  // listener used to handle synchronously, before React's own delegated
  // listener on the same #pr-sections node got a chance to run.
  await page.goto("/");
  await waitForPrTable(page);

  const insightsToggle = await firstInsightsToggle(page);
  await insightsToggle.click();
  await expect(insightsToggle).toHaveAttribute("aria-expanded", "true");

  const notesSection = prTables(page).getByRole("group", { name: /^Notes for PR #\d+$/ }).first();

  const difficultySelect = notesSection.getByRole("combobox", { name: "PR difficulty", exact: true });
  await expect(difficultySelect).toBeVisible();
  const originalDifficulty = await difficultySelect.inputValue();
  const targetDifficulty = originalDifficulty === "4" ? "2" : "4";
  await difficultySelect.selectOption(targetDifficulty);
  await expect(difficultySelect).toHaveValue(targetDifficulty);
  await difficultySelect.selectOption(originalDifficulty);
  await expect(difficultySelect).toHaveValue(originalDifficulty);

  await notesSection.getByRole("button", { name: "+ Add comment" }).click();
  const toneSelect = notesSection.getByRole("combobox", { name: "Comment 1 tone", exact: true });
  await expect(toneSelect).toHaveValue("Neutral");
  await toneSelect.selectOption("Negative");
  await expect(toneSelect).toHaveValue("Negative");

  const authorSelect = notesSection.getByRole("combobox", { name: "Comment 1 author", exact: true });
  const authorOptionCount = await authorSelect.getByRole("option", { includeHidden: true }).count();
  if (authorOptionCount > 1) {
    const secondOptionValue = await authorSelect.getByRole("option", { includeHidden: true }).nth(1).getAttribute("value");
    await authorSelect.selectOption(secondOptionValue);
    await expect(authorSelect).toHaveValue(secondOptionValue);
  }
  await notesSection.getByRole("button", { name: /^Remove comment / }).first().click();
});

test("clicking an 'Auto update paused' chip for a PR switches back to the PR data tab and focuses that PR's unsaved Notes save button", async ({ page }) => {
  // Regression/coverage test for Phase G.1 (see REACT_MIGRATION_PLAN.md):
  // AutoRenderBlockedLinks.jsx's chips used to call window.navigateToPrInTable/
  // window.navigateToAuthorInsights directly - both are real hooks now
  // (state/useNavigateToPrInTable.jsx/useNavigateToAuthorInsights.jsx). No
  // existing e2e spec drove these chips directly before this test - the 2
  // "View in table" specs elsewhere in this file exercise a different,
  // sibling implementation (AuthorInsightsPrLink.jsx's "View in table" button).
  // Test-only bridge removal: opens with ?dataPollMs= and makes a real held-back
  // poll (changeServerData) instead of window.setPendingAutoRenderPayload.
  await page.goto("/?dataPollMs=300");
  await waitForPrTable(page);

  // PR #1 may also render in a smart group (membership is non-exclusive -
  // see the "non-exclusive membership" tests elsewhere in this suite/
  // PrTableApp.test.jsx), but which smart groups it currently qualifies
  // for can shift depending on what an earlier test in this shared-webServer
  // suite left behind (e.g. an In Review toggle) - scope to its own
  // lifecycle section specifically, which is stable, and open that
  // section first (same pattern as the "lifecycle section expand/collapse"
  // test elsewhere in this file - sections default to collapsed).
  const openSection = prSection(page, "Open PRs");
  if (!(await openSection.evaluate((el) => el.open))) {
    await openSection.getByText("Open PRs", { exact: true }).click();
  }
  const insightsToggle = insightsToggleFor(prSection(page, "Open PRs"), 1);
  await insightsToggle.click();
  await expect(insightsToggle).toHaveAttribute("aria-expanded", "true");

  // Scoped to the "open" section specifically (not just [data-pr-number="1"])
  // for the same non-exclusive-smart-group reason as insightsToggle above -
  // PR #1's row (and its own Notes section) can render twice.
  const notesTextarea = prSection(page, "Open PRs")
    .getByRole("group", { name: "Notes for PR #1", exact: true })
    .getByPlaceholder("Other notes...");
  await expect(notesTextarea).toBeVisible();
  const originalValue = await notesTextarea.inputValue();
  await notesTextarea.fill(`${originalValue}a note left during this test`);

  // The "Auto update paused" indicator (and its chips) only shows once a
  // real poll's fresh data has actually been held back, not merely because
  // a field is dirty (AutoRenderBlockingProvider.jsx's `isBlocked` needs
  // both). Clicking the "Author Insights" tab below blurs the dirty textarea,
  // but the field is still dirty, so the poll stays held back.
  await changeServerData(page);
  await expect(page.getByRole("status", { name: "Auto update paused", exact: true, includeHidden: true })).toBeVisible();

  // Switch away from the PR data tab - the row/Notes section stay mounted
  // underneath (only the panel's `hidden` attribute changes), so the dirty
  // state survives. Proves the chip click actually switches back, not
  // that the tab was already active.
  await page.getByRole("tab", { name: "Author Insights" }).click();
  await expect(page.getByRole("tabpanel", { name: "Author Insights", exact: true, includeHidden: true })).toBeVisible();

  const chip = page.getByRole("button", { name: "#1", exact: true });
  await expect(chip).toBeVisible();
  await chip.click();

  await expect(page.getByRole("tabpanel", { name: "PR data", exact: true, includeHidden: true })).toBeVisible();
  await expect(insightsToggle).toHaveAttribute("aria-expanded", "true");
  const saveButton = prSection(page, "Open PRs")
    .getByRole("group", { name: "Notes for PR #1", exact: true })
    .getByRole("button", { name: "Save notes", exact: true });
  await expect(saveButton).toBeFocused();

  // Undo the edit: with the field clean (and not focused - the save button
  // has focus), the held-back poll applies and the indicator goes away.
  await notesTextarea.fill(originalValue);
  await notesTextarea.blur();
  await expect(page.getByRole("status", { name: "Auto update paused", exact: true, includeHidden: true })).toBeHidden();
});

test("bulk Ack/Apply-label from the Run & Filter tab shows a busy indicator on every affected row", async ({ page }) => {
  // Regression test for a real UX gap: pr-ack-label-actions.helpers.js's
  // runAckAction (bulk operations submitted via the Run & Filter tab's
  // "#pr-numbers" field, as opposed to a single row's own Ack button)
  // previously gave no visible per-row feedback at all while a multi-PR
  // request was in flight - only the single-row withPrBusy wrapper in
  // PrTableApp.jsx lit up a row's spinner. Tenth follow-up (see
  // REACT_MIGRATION_PLAN.md, "Remaining-effort audit"): markPrBusy/
  // clearPrBusy are reached via usePrActivityQueue() directly now, not a
  // window.markPrsBusy/clearPrsBusy bridge - this test drives the real
  // Ack workflow through the UI (not a direct function call) so it still
  // proves the real wiring end to end, with the POST delayed just long
  // enough to observe the in-flight state before it resolves.
  await page.goto("/");
  await waitForPrTable(page);

  const pr1Indicator = prTables(page).getByTitle("PR #1 update in progress", { exact: true }).first();
  const pr2Indicator = prTables(page).getByTitle("PR #2 update in progress", { exact: true }).first();
  await expect(pr1Indicator).toHaveJSProperty("hidden", true);
  await expect(pr2Indicator).toHaveJSProperty("hidden", true);

  await page.route("**/view-prs/ack", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.getByRole("tab", { name: "Run & Filter" }).click();
  // #repo lives inside the collapsed "Run Script options (rarely changed)"
  // <details> - open it before filling, same as the other tests in this
  // file that touch fields in that group. Filled explicitly (not relying
  // on its usual persisted-default value) so this test doesn't depend on
  // an earlier test in this shared-webServer suite having already
  // persisted it.
  await page.getByText("Run Script options (rarely changed)").click();
  await page.getByLabel("Repo (owner/name)", { exact: true }).fill("octocat/hello-world");
  await page.getByLabel("PR number(s) (comma-separated)", { exact: true }).fill("1,2");
  await page.getByRole("button", { name: "Apply ack only" }).click();

  await expect(pr1Indicator).toHaveJSProperty("hidden", false);
  await expect(pr2Indicator).toHaveJSProperty("hidden", false);

  await expect(pr1Indicator).toHaveJSProperty("hidden", true);
  await expect(pr2Indicator).toHaveJSProperty("hidden", true);
});

// A dedicated real-browser reproduction of the "queued, not yet started"
// sub-state (PrActivityQueueProvider.jsx's markPrQueued/clearPrQueued,
// PrNumberCell.jsx's .pr-progress-indicator--queued) used to live here too,
// driven via the now-deleted window.markPrsQueued/markPrsBusy bridges.
// Tenth follow-up (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit"):
// reproducing it faithfully through only the 3 PRs this fixture provides
// would mean engineering a PR-number list that lands a specific PR number
// in a chunk beyond pr-ack-label-actions.helpers.js's own CONCURRENCY_LIMIT
// (3 chunks in flight at once) while never appearing in an earlier
// in-flight chunk - fragile and tightly coupled to that implementation
// constant, for coverage two other layers already provide faithfully:
// PrNumberCell.test.jsx proves the queued-vs-active dot renders correctly
// from props alone, and PrActivityQueueProvider.test.jsx/PrTableApp.test.jsx
// (jest) prove the exact "active wins over queued" exclusion rule at the
// Context level, including via a real multi-chunk begin/in-flight/done/
// finish flow. Not reconstructed here.

test("'View in table' from Author Insights actually expands the insights row content", async ({ page }) => {
  // Regression test: vanilla's navigateToPrInTable finds the PR's row and
  // directly flips `.hidden`/textContent on the insights <tr> and toggle
  // button. Under React that left the toggle button claiming
  // aria-expanded="true" while the insights row stayed hidden (React's own
  // expandedInsights state never changed), so the click looked like it
  // worked but revealed nothing. It now dispatches
  // 'pr-navigate-to-insights' for PrTableApp to handle via its own state.
  await page.goto("/");
  await waitForPrTable(page);

  await page.getByRole("tab", { name: "Author Insights" }).click();
  const tableLink = page.getByRole("button", { name: "View in table", exact: true }).first();
  await tableLink.waitFor();
  await tableLink.click();

  const insightsRow = await insightsRowUnderExpandedToggle(page);
  await expect(insightsRow).toHaveJSProperty("hidden", false);
});

test("React-owned PR-number filter input survives a persisted-value restore on page load", async ({ page }) => {
  // Regression test: index.page.js's restoreUiOptionOverrides() fetches a
  // persisted filter value and can resolve *before* react-app.jsx (a
  // Vite-bundled ES module, slower to load than a small same-origin JSON
  // fetch) finishes mounting - if it wins that race, it sets the value on
  // the static fallback <input>, which mounting then wiped out by
  // rendering with an empty initialValue. Also covers the reverse
  // ordering (React mounts first, restore arrives after) via
  // index.page.js's setText() helper, which now goes through the native
  // value setter + dispatches a real 'input' event instead of a plain
  // `.value = ...` assignment, so a controlled React input's state stays
  // in sync however external code writes to it after mount.
  await page.goto("/");
  await waitForPrTable(page);

  await page.getByRole("tab", { name: "Run & Filter" }).click();
  const input = page.getByLabel("Filter by PR number(s)", { exact: true });
  await input.fill("1");
  await waitForFilterPersist(page);

  await page.reload();
  await waitForPrTable(page);
  await page.getByRole("tab", { name: "Run & Filter" }).click();

  await expect(page.getByLabel("Filter by PR number(s)", { exact: true })).toHaveValue("1");

  // Clear it and leave that persisted too, so this test's filter doesn't
  // hide PR #2/#3 from whatever unrelated test happens to load next
  // against this suite's one shared webServer.
  await page.getByLabel("Filter by PR number(s)", { exact: true }).fill("");
  await waitForFilterPersist(page);
});

test("React-owned scope <select> survives a persisted-value restore, and selecting still applies filters", async ({ page }) => {
  // Same restore-race class as the PR-number filter test above, this time
  // for a <select> (Phase 2's second slice) - confirms the fix generalizes
  // beyond <input>. <select> elements need a native 'change' event
  // dispatched (not just 'input') for React to notice an externally-set
  // value; see setNativeValueAndDispatch in index.page.js.
  await page.goto("/");
  await waitForPrTable(page);

  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.selectOption("#scope-mode", "last-run");
  await waitForFilterPersist(page);

  await page.reload();
  await waitForPrTable(page);
  await page.getByRole("tab", { name: "Run & Filter" }).click();

  await expect(page.getByLabel("View scope", { exact: true })).toHaveValue("last-run");

  // Confirm the restored control still works, not just its displayed value,
  // and leave scope back at the "all" default so this test's persisted
  // state doesn't affect whatever unrelated test happens to load next
  // against this suite's one shared webServer.
  await page.selectOption("#scope-mode", "all");
  await waitForFilterPersist(page);
  await expect(page.getByRole("region", { name: "PR data summary", exact: true, includeHidden: true })).toContainText("scope=all stored rows");
});

test("React-owned checkbox survives a persisted-value restore, and toggling still applies filters", async ({ page }) => {
  // Same restore-race class as the two tests above, this time for a
  // checkbox (Phase 2's third slice, first checkbox conversion) - confirms
  // the pattern generalizes to checkboxes too. index.page.js's
  // setCheckbox() calls element.click() when the persisted value differs
  // from the current `checked` state (a real click, not a `.checked =`
  // assignment) - that's what a controlled React checkbox needs to notice
  // an externally-driven change.
  await page.goto("/");
  await waitForPrTable(page);

  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByText("Advanced visibility and attention rules").click();
  const checkbox = page.getByLabel("Always show PRs In Review", { exact: true });
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  await waitForFilterPersist(page);

  await page.reload();
  await waitForPrTable(page);
  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByText("Advanced visibility and attention rules").click();

  await expect(page.getByLabel("Always show PRs In Review", { exact: true })).toBeChecked();

  // Confirm the restored control still works, and leave it back at the
  // unchecked default so this test's persisted state doesn't affect
  // whatever unrelated test happens to load next against this suite's one
  // shared webServer.
  await page.getByLabel("Always show PRs In Review", { exact: true }).uncheck();
  await waitForFilterPersist(page);
  await expect(page.getByLabel("Always show PRs In Review", { exact: true })).not.toBeChecked();
});

test("React-owned Needs Attention rule controls (select + checkbox batch) survive a persisted restore together", async ({ page }) => {
  // One representative test for the whole "Needs Attention rules" batch
  // (AttentionNoActivityModeSelect + 5x AttentionRuleCheckbox) rather than
  // one test per field - same pattern/fixes already covered individually
  // above, this confirms they also work correctly when several such
  // controls restore together on the same page load and a field NOT in
  // the persisted overrides correctly keeps its own default.
  await page.goto("/");
  await waitForPrTable(page);

  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByText("Advanced visibility and attention rules").click();

  await page.selectOption("#attention-no-activity-mode", "none");
  await page.getByLabel("Mark PRs with my pending (unsubmitted) comments", { exact: true }).uncheck();
  await page.getByLabel("Apply NO_ACTIVITY attention rules to draft PRs", { exact: true }).check();
  await waitForFilterPersist(page);

  await page.reload();
  await waitForPrTable(page);
  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByText("Advanced visibility and attention rules").click();

  await expect(page.getByLabel("NO_ACTIVITY handling", { exact: true })).toHaveValue("none");
  await expect(page.getByLabel("Mark PRs with my pending (unsubmitted) comments", { exact: true })).not.toBeChecked();
  await expect(page.getByLabel("Apply NO_ACTIVITY attention rules to draft PRs", { exact: true })).toBeChecked();
  // Untouched field - should still show its unpersisted default (checked).
  await expect(page.getByLabel("Include closed/merged sections in attention logic", { exact: true })).toBeChecked();

  // Reset everything back to defaults so this test's persisted state
  // doesn't affect whatever unrelated test loads next.
  await page.selectOption("#attention-no-activity-mode", "all");
  await page.getByLabel("Mark PRs with my pending (unsubmitted) comments", { exact: true }).check();
  await page.getByLabel("Apply NO_ACTIVITY attention rules to draft PRs", { exact: true }).uncheck();
  await waitForFilterPersist(page);
});

test("changing a React-owned filter auto-applies without clicking \"Apply filters (local)\"", async ({ page }) => {
  // Regression test for a bug that affected every field converted in this
  // Phase 2 slice at once, not just one: index.page.js attaches its
  // "change" -> debouncedApplyFilters (and persist) listeners directly to
  // each field via addEventListener, early during page load - before
  // react-app.jsx's deferred module has mounted. ReactDOM.createRoot().render()
  // then creates a *fresh* DOM node for that field, silently orphaning the
  // listener that was attached to the old static/fallback node. Every
  // other test in this file that checks filtering clicks the "Apply
  // filters (local)" button explicitly, which has its own separate click
  // handler unaffected by this - so this bug went uncaught until scope-mode
  // was changed with nothing but selectOption(). Fixed by delegating these
  // listeners on the stable <form id="run-script-form"> ancestor (never
  // replaced by React) instead of on each field directly - the native
  // "change" event still bubbles up to the form regardless of which side
  // rendered the field that changed.
  await page.goto("/");
  await waitForPrTable(page);

  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await expect(page.getByRole("region", { name: "PR data summary", exact: true, includeHidden: true })).toContainText("scope=all stored rows");

  await page.selectOption("#scope-mode", "last-run");
  await expect(page.getByRole("region", { name: "PR data summary", exact: true, includeHidden: true })).toContainText("scope=last run rows");

  // Reset so this test's change doesn't affect whatever loads next. This
  // change also fires its own auto-persist PUT (FilterStateProvider's debounced
  // persistence watcher) debounced 150ms behind the one from
  // "last-run" above - wait for it to actually land (same reasoning as
  // waitForFilterPersist above) so this test can't leak a
  // stale scope-mode value into whatever unrelated test loads next against
  // this suite's one shared webServer.
  const [persistResponse] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/view-prs/user-defaults") && res.request().method() === "PUT",
    ),
    page.selectOption("#scope-mode", "all"),
  ]);
  expect(persistResponse.ok()).toBe(true);
  await expect(page.getByRole("region", { name: "PR data summary", exact: true, includeHidden: true })).toContainText("scope=all stored rows");
});

test("typing a PR-number filter updates the rendered React table live, with no \"Apply filters (local)\" click at all", async ({ page }) => {
  // Phase 7 (see REACT_MIGRATION_PLAN.md, "live filtering"): filterPrNumbers
  // was already Context-backed (FilterStateProvider) before this change,
  // but only the data-meta summary and a 150ms-debounced vanilla
  // re-render ever reflected it - the React table itself only updated via
  // the vanilla pipeline's imperatively-pushed visiblePrNumbers, on the
  // SAME debounce. This proves useVisiblePrNumbers() now reads
  // filterPrNumbers reactively too, same as the multi-select test above.
  await page.goto("/");
  await waitForPrTable(page);

  await expect(prTables(page)).toContainText("Add welcome banner");
  await expect(prTables(page)).toContainText("Fix flaky test");

  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByLabel("Filter by PR number(s)", { exact: true }).fill("1");

  await page.getByRole("tab", { name: "PR data" }).click();
  await expect(prTables(page)).toContainText("Add welcome banner");
  await expect(prTables(page)).not.toContainText("Fix flaky test");

  // Reset so this test's filter doesn't hide PRs from whatever unrelated
  // test happens to load next against this suite's one shared webServer -
  // clearing is ALSO live, same as filling above.
  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByLabel("Filter by PR number(s)", { exact: true }).fill("");
  await page.getByRole("tab", { name: "PR data" }).click();
  await expect(prTables(page)).toContainText("Fix flaky test");
});

test("checking a row-filtering multi-select (label) filters the rendered table live, with no \"Apply filters (local)\" click at all", async ({ page }) => {
  // Phase 7 (see REACT_MIGRATION_PLAN.md, "live filtering"): the 5
  // row-filtering multi-selects (include/exclude label, author, assigned,
  // approver) used to only take effect once "Apply filters (local)" was
  // explicitly clicked - their checked-state lived purely in
  // MultiSelectCheckboxList's own local component state, with no Context
  // mirror for a reactive derivation to read. Now mirrored into
  // RowFilterSelectionContext, feeding useVisiblePrNumbers() directly -
  // this test proves the table updates the instant a checkbox is checked,
  // never clicking Apply filters at all (contrast with the test above this
  // one, and "Apply filters (local) actually filters the rendered table",
  // which both still use the click for their own unrelated fields).
  await page.goto("/");
  await waitForPrTable(page);

  await expect(prTables(page)).toContainText("Add welcome banner");
  await expect(prTables(page)).toContainText("Fix flaky test");

  await page.getByRole("tab", { name: "Run & Filter" }).click();
  const labelDropdownSummary = filterDropdownSummary(page.getByRole("group", { name: "Filter by label name(s)", exact: true, includeHidden: true }));
  await labelDropdownSummary.click();

  const labelList = page.getByRole("group", { name: "Filter by label name(s)", exact: true, includeHidden: true });
  await labelList.getByLabel("enhancement", { exact: true }).check();

  await page.getByRole("tab", { name: "PR data" }).click();
  await expect(prTables(page)).toContainText("Add welcome banner");
  await expect(prTables(page)).not.toContainText("Fix flaky test");

  // Reset so this test's filter doesn't hide PRs from whatever unrelated
  // test happens to load next against this suite's one shared webServer -
  // uncheck is ALSO live, same as the check above, so the table should
  // show every PR again immediately too. Phase H.26 (see
  // REACT_MIGRATION_PLAN.md, "Remaining-effort audit", cluster 1):
  // label-list now auto-persists on change too (it never did before -
  // "Apply filters (local)" was its only persist trigger) - wait for the
  // clear to actually land, or a slow-to-complete fire-and-forget PUT
  // from this uncheck can race the next test's own page load.
  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await labelDropdownSummary.click();
  await labelList.getByLabel("enhancement", { exact: true }).uncheck();
  await waitForFilterPersist(page);
  await page.getByRole("tab", { name: "PR data" }).click();
  await expect(prTables(page)).toContainText("Fix flaky test");
});

test("the \"Applied filters\" chip/summary text updates live too, with no \"Apply filters (local)\" click at all", async ({ page }) => {
  // Phase 7 (see REACT_MIGRATION_PLAN.md, "live filtering" follow-up): the
  // chip/summary text used to only update via index.page.js's vanilla
  // pipeline, pushed into React through a window.renderReactFilterSummary
  // bridge - <AppliedFilterSummaryLive> (react-app.jsx) now derives this
  // text itself, reactively, via useAppliedFilterSummary(). This test
  // proves both the PR-number filter and a multi-select update the chip
  // text immediately, matching the table itself (see the two tests above).
  await page.goto("/");
  await waitForPrTable(page);

  await page.getByRole("tab", { name: "Run & Filter" }).click();

  const summary = page.getByRole("region", { name: "Applied filters summary", exact: true, includeHidden: true });
  await expect(summary).toContainText("repo=");
  await expect(summary).toContainText("scope=all stored rows");

  await page.getByLabel("Filter by PR number(s)", { exact: true }).fill("1");
  await expect(summary).toContainText("pr-numbers=1");
  await expect(summary).toContainText("Rows: 1");

  await page.getByLabel("Filter by PR number(s)", { exact: true }).fill("");

  const labelDropdownSummary = filterDropdownSummary(page.getByRole("group", { name: "Filter by label name(s)", exact: true, includeHidden: true }));
  await labelDropdownSummary.click();
  await page.getByRole("group", { name: "Filter by label name(s)", exact: true, includeHidden: true }).getByLabel("enhancement", { exact: true }).check();
  await expect(summary).toContainText("label=enhancement");

  // Reset so this test's filter doesn't hide PRs from whatever unrelated
  // test happens to load next against this suite's one shared webServer.
  // Phase H.26 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
  // cluster 1): label-list now auto-persists on change (it never did
  // before - "Apply filters (local)" was its only persist trigger) - wait
  // for the clear to actually land, or a slow-to-complete fire-and-forget
  // PUT from this uncheck can race the next test's own page load and
  // leave "enhancement" checked there instead.
  await page.getByRole("group", { name: "Filter by label name(s)", exact: true, includeHidden: true }).getByLabel("enhancement", { exact: true }).uncheck();
  await waitForFilterPersist(page);
});

test("a removable filter chip appears above the table for each non-default filter, and its \"x\" clears that one filter", async ({ page }) => {
  // Regression coverage for TableFilterChips.jsx/useTableFilterChips.jsx:
  // unlike the "Applied filters" summary (Run & Filter tab, tested above),
  // these chips live above the table itself (Data Views tab) and are each
  // individually removable - clicking a chip's "x" must clear just that
  // filter, both in the originating control and in the table's own live
  // rendering, without a page reload or an "Apply filters" click.
  await page.goto("/");
  await waitForPrTable(page);

  const chips = page.getByRole("group", { name: "Applied table filters", exact: true, includeHidden: true });
  await expect(chips).toBeEmpty();

  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByLabel("Filter by PR number(s)", { exact: true }).fill("1");

  await page.getByRole("tab", { name: "PR data" }).click();
  await expect(chips).toContainText("PR #: 1");
  await expect(prTables(page)).toContainText("Add welcome banner");
  await expect(prTables(page)).not.toContainText("Fix flaky test");

  await chips.getByRole("button", { name: "Remove filter: PR #: 1" }).click();

  await expect(chips).toBeEmpty();
  await expect(prTables(page)).toContainText("Fix flaky test");

  // Phase H.26 follow-up (see REACT_MIGRATION_PLAN.md, "Remaining-effort
  // audit", cluster 1): same as the label chip below - a chip's "x"
  // clears via a direct Context update, not a native "change" event, so
  // it never fires index.page.js's own vanilla auto-persist-on-change
  // listeners. FilterStateProvider.jsx's own debounced Context-level
  // watcher (added as a follow-up fix, once this exact gap was found)
  // *does* still catch it, 150ms later - forcing it immediately here just
  // keeps this test from needing to wait that out. See the dedicated
  // "survives a reload with no manual persist trigger" test below for
  // proof the debounced watcher alone is sufficient, unaided.
  await waitForFilterPersist(page);

  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await expect(page.getByLabel("Filter by PR number(s)", { exact: true })).toHaveValue("");

  // A checked label filter gets its own chip too, removable the same way.
  const labelDropdownSummary = filterDropdownSummary(page.getByRole("group", { name: "Filter by label name(s)", exact: true, includeHidden: true }));
  await labelDropdownSummary.click();
  await page.getByRole("group", { name: "Filter by label name(s)", exact: true, includeHidden: true }).getByLabel("enhancement", { exact: true }).check();

  await page.getByRole("tab", { name: "PR data" }).click();
  await expect(chips).toContainText("Label: enhancement");

  await chips.getByRole("button", { name: "Remove filter: Label: enhancement" }).click();
  await expect(chips).toBeEmpty();

  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await labelDropdownSummary.click();
  await expect(page.getByRole("group", { name: "Filter by label name(s)", exact: true, includeHidden: true }).getByLabel("enhancement", { exact: true })).not.toBeChecked();

  // Phase H.26 follow-up (see REACT_MIGRATION_PLAN.md, "Remaining-effort
  // audit", cluster 1): a chip's "x" clears the filter via a direct
  // Context update (useTableFilterChips.jsx's own onRemove), not a
  // native "change" event on the checkbox - the earlier .check() above
  // already persisted "enhancement" via the vanilla auto-persist-on-change
  // listener, but this chip-driven clear never fires that listener to
  // persist the rollback; forced immediately here so this test doesn't
  // leave a stale "enhancement" override for whatever unrelated test
  // loads next (FilterStateProvider.jsx's own debounced watcher would
  // also catch this, 150ms later - see the dedicated test below).
  await waitForFilterPersist(page);
});

test("removing a filter chip persists the clear on its own, with no explicit persist call at all", async ({ page }) => {
  // Regression coverage for a real bug found during Phase H.26's own code
  // review (see REACT_MIGRATION_PLAN.md): deleting the "Apply filters
  // (local)" button removed the only persist trigger for a filter
  // chip's "x", since useTableFilterChips.jsx's onRemove clears the
  // filter via a direct Context update (setValue/toggle), never a native
  // DOM "change" event - the vanilla auto-persist-on-change listeners
  // (index.page.js) can't see that. Fixed by reinstating a debounced
  // Context-level watcher in FilterStateProvider.jsx, this time correctly
  // pointed at persistViewFilterOptions (the old, deleted
  // debouncedApplyFilters effect called the wrong, now-dead "apply"
  // function). Every other test in this file that removes a chip waits
  // for the save via waitForFilterPersist - this one deliberately does
  // NOT, to prove the production fix holds up entirely unaided, the way a
  // real user's click actually would.
  await page.goto("/");
  await waitForPrTable(page);

  await page.getByRole("tab", { name: "Run & Filter" }).click();
  const labelDropdownSummary = filterDropdownSummary(page.getByRole("group", { name: "Filter by label name(s)", exact: true, includeHidden: true }));
  await labelDropdownSummary.click();
  await page.getByRole("group", { name: "Filter by label name(s)", exact: true, includeHidden: true }).getByLabel("enhancement", { exact: true }).check();
  await waitForFilterPersist(page);

  await page.getByRole("tab", { name: "PR data" }).click();
  const chips = page.getByRole("group", { name: "Applied table filters", exact: true, includeHidden: true });
  await expect(chips).toContainText("Label: enhancement");

  // Set up the response listener BEFORE the click, not after - the
  // debounced watcher's own PUT can land well inside the 150ms window
  // once the click itself returns, and waitForResponse only ever sees
  // responses that occur after it starts listening.
  const persistResponse = page.waitForResponse(
    (res) => res.url().includes("/view-prs/user-defaults") && res.request().method() === "PUT",
  );
  await chips.getByRole("button", { name: "Remove filter: Label: enhancement" }).click();
  await expect(chips).toBeEmpty();

  // No explicit persist call here at all - this is
  // FilterStateProvider.jsx's own debounced Context-level watcher firing
  // entirely on its own, the same way a real user's click would trigger
  // it with no test-only help.
  await persistResponse;

  await page.reload();
  await waitForPrTable(page);
  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await labelDropdownSummary.click();
  await expect(page.getByRole("group", { name: "Filter by label name(s)", exact: true, includeHidden: true }).getByLabel("enhancement", { exact: true })).not.toBeChecked();
});

test("React-owned change-filter \"use built-in merge pattern\" checkbox auto-persists on change and survives a restore", async ({ page }) => {
  // Regression coverage for the last checkbox converted (see
  // REACT_MIGRATION_PLAN.md): toggling it fires a real PUT to
  // /view-prs/user-defaults on its own, without clicking "Apply filters
  // (local)" (gone entirely now, Phase H.26) - persistence for every
  // field here, this one included, is owned by FilterStateProvider.jsx's
  // own debounced Context-level watcher, not a per-field special case
  // any more.
  await page.goto("/");
  await waitForPrTable(page);

  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByText("Advanced visibility and attention rules").click();

  const checkbox = page.getByLabel("Use built-in merge commit filter (merges from main/origin/main)", { exact: true });
  await expect(checkbox).toBeChecked();

  // waitForFilterPersist, not a bare "wait for *a* PUT" listener: the
  // debounced watcher also re-persists once right after the mount-time
  // restore (see that helper's own comment), so a bare URL/method match
  // could resolve against that unrelated, earlier write instead of this one.
  await checkbox.uncheck();
  await waitForFilterPersist(page);

  await page.reload();
  await waitForPrTable(page);
  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByText("Advanced visibility and attention rules").click();

  await expect(page.getByLabel("Use built-in merge commit filter (merges from main/origin/main)", { exact: true })).not.toBeChecked();

  // Reset so this test's persisted state doesn't affect whatever unrelated
  // test happens to load next against this suite's one shared webServer.
  await page.getByLabel("Use built-in merge commit filter (merges from main/origin/main)", { exact: true }).check();
  await waitForFilterPersist(page);
});

test("React-owned \"ignore commit patterns\" textarea auto-persists on change and survives a restore", async ({ page }) => {
  // Regression coverage for the only <textarea> converted so far (see
  // REACT_MIGRATION_PLAN.md) - a real PUT fires on blur/change alone,
  // without clicking "Apply filters (local)" (gone entirely now, Phase
  // H.26). Also confirms restoreUiOptionOverrides's fix for this field
  // specifically: it used to assign `textarea.value = ...` directly
  // instead of going through setText's native-setter-plus-event helper,
  // which would silently fail to notify a controlled React textarea.
  await page.goto("/");
  await waitForPrTable(page);

  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByText("Advanced visibility and attention rules").click();

  const textarea = page.getByLabel("Ignore commits matching patterns (regex, one per line)", { exact: true });
  await expect(textarea).toHaveValue("");
  await textarea.fill("^docs:\n^test:");

  // waitForFilterPersist, not a bare "wait for *a* PUT" listener:
  // FilterStateProvider.jsx's debounced watcher also re-persists once right
  // after the mount-time restore (see that helper's own comment).
  await textarea.blur();
  await waitForFilterPersist(page);

  await page.reload();
  await waitForPrTable(page);
  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByText("Advanced visibility and attention rules").click();

  await expect(page.getByLabel("Ignore commits matching patterns (regex, one per line)", { exact: true })).toHaveValue("^docs:\n^test:");

  // Reset so this test's persisted state doesn't affect whatever unrelated
  // test happens to load next against this suite's one shared webServer.
  const restoredTextarea = page.getByLabel("Ignore commits matching patterns (regex, one per line)", { exact: true });
  await restoredTextarea.fill("");
  await restoredTextarea.blur();
  await waitForFilterPersist(page);
});

test("React-owned Run Script options (text inputs, select, checkboxes) survive a persisted restore together", async ({ page }) => {
  // Same restore-race class as the "Needs Attention rules" batch test
  // above, this time for the "Run Script options (rarely changed)" fields
  // (ContextRunScriptTextInput x5 - repo/limit/merged-limit/jobs/pr-numbers,
  // OpenModeSelect, FilterCheckbox x3). These
  // fields have no "change" listener of their own - they're only ever read
  // via .value/.checked when the real "Run script" button is clicked (see
  // persistRunScriptOptionOverrides in index.page.js) - so unlike the
  // scope-mode/attention-rule fields, there's no live auto-apply behavior
  // to verify here, just that mounting doesn't clobber a value
  // restoreUiOptionOverrides() already wrote (or vice versa). Persists
  // directly via the same /view-prs/user-defaults PUT the real "Run
  // script" button would send, rather than clicking that button, since
  // clicking it would actually kick off the (heavy, real-GH-API) backing
  // script.
  await page.goto("/");
  await waitForPrTable(page);

  // PUT /view-prs/user-defaults replaces the whole overrides object (see
  // writeUserDefaults in view-prs-data-routes.js) rather than merging - GET
  // the current overrides first and merge locally, exactly like the real
  // persistUiOptionOverrides does, so this doesn't clobber whatever other
  // fields happen to be persisted at this point in the shared suite.
  await page.evaluate(async () => {
    const current = await (await fetch("/view-prs/user-defaults")).json();
    await fetch("/view-prs/user-defaults", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(current?.overrides || {}),
        repo: "octocat/hello-world",
        limit: "50",
        "merged-limit": "10",
        jobs: "3",
        "pr-numbers": "912,921",
        "open-mode": "changed",
        "ack-changed": true,
        "show-reason": false,
        quiet: true,
      }),
    });
  });

  await page.reload();
  await waitForPrTable(page);
  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByText("Run Script options (rarely changed)").click();

  await expect(page.getByLabel("Repo (owner/name)", { exact: true })).toHaveValue("octocat/hello-world");
  await expect(page.getByLabel("Open PR limit", { exact: true })).toHaveValue("50");
  await expect(page.getByLabel("Merged PR limit", { exact: true })).toHaveValue("10");
  await expect(page.getByLabel("Parallel jobs", { exact: true })).toHaveValue("3");
  await expect(page.getByLabel("PR number(s) (comma-separated)", { exact: true })).toHaveValue("912,921");
  await expect(page.getByLabel("Open mode", { exact: true })).toHaveValue("changed");
  await expect(page.getByLabel("Ack all CHANGED non-draft PRs from this run", { exact: true })).toBeChecked();
  await expect(page.getByLabel("Show CHANGED reason in status", { exact: true })).not.toBeChecked();
  await expect(page.getByLabel("Quiet mode (hide run metadata header)", { exact: true })).toBeChecked();

  // Reset back to defaults so this test's persisted state doesn't affect
  // whatever unrelated test happens to load next against this suite's one
  // shared webServer. Wait for the restore's own debounced save to land
  // first: it reads the overrides (still holding this test's values) and
  // writes them back merged, so if its read raced ahead of the reset below
  // and its write landed after, it would put "pr-numbers": "912,921" back -
  // seen leaking into the bulk-select PR-numbers test.
  await waitForFilterPersist(page);
  await page.evaluate(async () => {
    const current = await (await fetch("/view-prs/user-defaults")).json();
    const overrides = { ...(current?.overrides || {}) };
    for (const key of ["repo", "limit", "merged-limit", "jobs", "pr-numbers", "open-mode", "ack-changed", "show-reason", "quiet"]) {
      delete overrides[key];
    }
    await fetch("/view-prs/user-defaults", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(overrides),
    });
  });
});

test("all 6 React-portaled non-credential-hint fields get their credential-manager-suppressing attributes in a real page load", async ({ page }) => {
  // Window-bridge elimination Phase 7.5: the inputs now render these
  // attributes themselves (NON_CREDENTIAL_INPUT_PROPS), so the race below
  // can't happen any more; this keeps checking the attributes in a real
  // browser. History - originally a regression test for a real race: applyNonCredentialFieldHints()
  // (index.page.js) is called once, synchronously, from initPage() -
  // which runs to completion before react-app.jsx's own module graph has
  // necessarily finished loading, so these fields (all React-portaled -
  // repo/limit/merged-limit/jobs/pr-numbers via
  // ContextRunScriptTextInput.jsx, filter-pr-numbers via
  // PrNumberFilterInput.jsx) may not exist in the DOM yet on that first
  // pass. jest's own integration suite (index.html.test.js) can't catch a
  // regression here - its test harness injects the equivalent markup
  // synchronously, before initPage() ever runs, so the race never
  // manifests there. Only a real browser load exercises the actual
  // timing. Fixed by re-running applyNonCredentialFieldHints() once more
  // on 'viewprs:react-ready', same pattern already used for the backfill
  // status badges/log text bridges. Covers every id in
  // NON_CREDENTIAL_HINT_FIELD_IDS, not just the "Run Script options"
  // group, since the fix re-runs the whole function, not a per-field list.
  await page.goto("/");
  await waitForPrTable(page);

  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByText("Run Script options (rarely changed)").click();

  for (const fieldLabel of [
    "Repo (owner/name)",
    "Open PR limit",
    "Merged PR limit",
    "Parallel jobs",
    "PR number(s) (comma-separated)",
    "Filter by PR number(s)",
  ]) {
    const field = page.getByLabel(fieldLabel, { exact: true });
    await expect(field).toHaveAttribute("autocomplete", "off");
    await expect(field).toHaveAttribute("data-lpignore", "true");
  }
});

test("a row's bulk-select checkbox writes into the Run tab's real PR-numbers input", async ({ page }) => {
  // Regression test for Phase 7's "#pr-numbers" migration (see
  // REACT_MIGRATION_PLAN.md) - PrSelectionCell.jsx's checkbox used to read/
  // write this field through its own one-off window.getSelectedPrNumbers/
  // updateSelectedPrNumbers bridge; it now reads/writes the exact same
  // FilterStateProvider Context value the "PR number(s)" text input itself
  // is backed by (ContextRunScriptTextInput.jsx). Exercises the real
  // entanglement that deferred this migration for several prior sessions:
  // a checkbox click must land in the real "#pr-numbers" <input> (not just
  // an in-memory value disconnected from it), since a subsequent "Run
  // script" submission reads it via native FormData, not React.
  await page.goto("/");
  await waitForPrTable(page);

  // PR #1 can legitimately be sitting inside one or more currently-
  // collapsed lifecycle/smart-group sections (collapsed by default, and
  // it can appear in more than one - e.g. "open" and "in-review" - at
  // once; its exact membership can shift as other tests in this
  // shared-webServer suite toggle its flagged/in-review state) - force
  // every matching ancestor <details> open directly rather than hunting
  // for the right summary to click, same reasoning the other "PR #1 might
  // be collapsed" tests in this file document.
  await prTables(page)
    .getByRole("checkbox", { name: "Select PR #1", exact: true, includeHidden: true })
    .evaluateAll((checkboxes) => {
      checkboxes.forEach((checkbox) => {
        checkbox.closest("details").open = true;
      });
    });

  const selectCheckbox = prTables(page).getByRole("checkbox", { name: "Select PR #1", exact: true }).first();
  await expect(selectCheckbox).not.toBeChecked();

  await selectCheckbox.check();

  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByText("Run Script options (rarely changed)").click();
  await expect(page.getByLabel("PR number(s) (comma-separated)", { exact: true })).toHaveValue("1");
});

test("typing PR numbers into the Run tab's PR-numbers field checks and unchecks the matching row checkboxes", async ({ page }) => {
  // Window-bridge elimination Phase 5 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
  // the reverse direction of the test above. PrSelectionCell used to read the
  // field once (defaultChecked) through window.getFilterStateValues(), so
  // editing the field never touched an already-rendered row's checkbox. It now
  // subscribes to that one field through a per-key store, so the checkbox
  // follows the field. The single-row assertions run in a real browser against
  // the real React-owned #pr-numbers input.
  await page.goto("/");
  await waitForPrTable(page);

  await prTables(page)
    .getByRole("checkbox", { name: "Select PR #1", exact: true, includeHidden: true })
    .evaluateAll((checkboxes) => {
      checkboxes.forEach((checkbox) => {
        checkbox.closest("details").open = true;
      });
    });
  const selectCheckbox = prTables(page).getByRole("checkbox", { name: "Select PR #1", exact: true }).first();
  await expect(selectCheckbox).not.toBeChecked();

  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByText("Run Script options (rarely changed)").click();
  const prNumbers = page.getByLabel("PR number(s) (comma-separated)", { exact: true });

  await prNumbers.fill("1");
  await expect(selectCheckbox).toBeChecked();

  // Unrelated numbers around it: PR #1 stays selected.
  await prNumbers.fill("999, 1, 998");
  await expect(selectCheckbox).toBeChecked();

  await prNumbers.fill("999");
  await expect(selectCheckbox).not.toBeChecked();

  // And the original direction still works from this state.
  await prNumbers.fill("");
  await selectCheckbox.check();
  await expect(prNumbers).toHaveValue("1");
});

test("the PR JSON modal opens and renders real JSON for a real row", async ({ page }) => {
  // Regression test for Phase 7's safeJsonStringify/getPerPrUserStateFromPayload/
  // DEFAULT_REPO migration (see REACT_MIGRATION_PLAN.md) - PrJsonModal.jsx
  // used to read all 3 off window.*; it now imports them directly. jest
  // coverage already exercises each piece in isolation with mocked
  // payloads - this proves the real, wired-together button click still
  // opens the modal and renders well-formed JSON in a real browser.
  await page.goto("/");
  await waitForPrTable(page);

  await prTables(page)
    .getByRole("checkbox", { name: "Select PR #1", exact: true, includeHidden: true })
    .evaluateAll((checkboxes) => {
      checkboxes.forEach((checkbox) => {
        checkbox.closest("details").open = true;
      });
    });

  await prTables(page).getByRole("button", { name: "View PR JSON details for #1", exact: true }).first().click();

  const dataFileJson = page.getByRole("dialog").getByRole("region", { name: "Data File Entry", exact: true });
  await expect(dataFileJson).toBeVisible();
  await expect(dataFileJson).not.toHaveText("Loading data file entry...");
  const jsonText = await dataFileJson.textContent();
  const parsed = JSON.parse(jsonText);
  expect(parsed.file).toBe("check-open-pr-updates.data.json");
  expect(parsed.entry).not.toBeNull();

  const userStateJson = page.getByRole("dialog").getByRole("region", { name: "User State Entry", exact: true });
  const userStateParsed = JSON.parse(await userStateJson.textContent());
  expect(userStateParsed.file).toBe("check-open-pr-updates.user-state.json");
  expect(Object.keys(userStateParsed.entry).sort()).toEqual(
    ["ackByRepo", "inReviewByRepo", "notesByPrNumber", "reverifyByRepo"].sort(),
  );

  await page.getByRole("button", { name: "Close PR JSON details" }).click();
  await expect(dataFileJson).not.toBeVisible();
});

test("the Run tab's apply-label dropdown and a row's own apply-label dropdown share the same real labels list", async ({ page }) => {
  // Regression test for Phase 7's RepoLabelsProvider migration (see
  // REACT_MIGRATION_PLAN.md) - window.updateReactApplyLabelOptions (a push
  // into AppRoot's own local state, feeding only the Run tab's dropdown)
  // and window.getAvailableRepoLabels (a pull PrActionsCell.jsx read on
  // every render) used to be two entirely separate bridges for the same
  // underlying list; this proves one real fetch now reaches both real,
  // already-mounted consumers through the one new Context.
  await page.goto("/");
  await waitForPrTable(page);

  // Override the suite-wide empty-labels mock (test.beforeEach, above)
  // just for this test - Playwright matches the most recently registered
  // handler for an overlapping pattern first.
  await page.route("**/view-prs/labels?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, repo: "octocat/hello-world", labels: [{ name: "bug" }, { name: "enhancement" }] }),
    }),
  );

  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByRole("button", { name: "↻ Labels", exact: true }).click();

  const runFilterSelect = page.getByLabel("Apply existing GitHub label to selected PR(s)", { exact: true });
  await expect(runFilterSelect.getByRole("option", { includeHidden: true })).toHaveCount(3);
  await expect(runFilterSelect.getByRole("option", { name: "bug", exact: true, includeHidden: true })).toHaveCount(1);

  // PR #1's own fixture already carries the "enhancement" label (see
  // e2e/fixtures/data.json) - its row select correctly excludes that one
  // (PrActionsCell.jsx's own existing-label filter), leaving just "bug" +
  // the placeholder, proving both the shared-Context wiring and the
  // per-row exclusion logic together.
  await prTables(page)
    .getByRole("checkbox", { name: "Select PR #1", exact: true, includeHidden: true })
    .evaluateAll((checkboxes) => {
      checkboxes.forEach((checkbox) => {
        checkbox.closest("details").open = true;
      });
    });
  const rowSelect = prTables(page).getByRole("combobox", { name: "Add label to PR #1", exact: true }).first();
  await expect(rowSelect.getByRole("option", { includeHidden: true })).toHaveCount(2);
  await expect(rowSelect.getByRole("option", { name: "bug", exact: true, includeHidden: true })).toHaveCount(1);
  await expect(rowSelect.getByRole("option", { name: "enhancement", exact: true, includeHidden: true })).toHaveCount(0);
});

test("a failed In Review toggle reverts the checkbox back to its real state, instead of leaving it stuck on the click", async ({ page }) => {
  // Regression test for ROADMAP.md's documented bug ("checkbox's on-failure
  // revert ... currently dead code in the React path", fixed in
  // react-callbacks.helpers.js's handleCheckboxChange) - PrActionsCell.jsx's
  // checkbox is a fully controlled input with no local optimistic state, so
  // a failed toggle used to leave it showing the user's clicked (wrong)
  // state until some unrelated future re-render. Forces the real
  // POST /view-prs/ack call to fail, confirming the checkbox now snaps back
  // on its own right away.
  await page.goto("/");
  await waitForPrTable(page);

  await prTables(page)
    .getByRole("checkbox", { name: "Select PR #1", exact: true, includeHidden: true })
    .evaluateAll((checkboxes) => {
      checkboxes.forEach((checkbox) => {
        checkbox.closest("details").open = true;
      });
    });

  const checkbox = prTables(page).getByRole("checkbox", { name: "In Review for PR #1", exact: true }).first();
  const before = await checkbox.isChecked();

  await page.route("**/view-prs/ack", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: "simulated failure for this test" }),
    }),
  );

  await checkbox.click();
  // The click's own native DOM toggle happens immediately; the app's async
  // round-trip (even against a mocked route) still takes a tick - wait for
  // it to settle back to the pre-click value rather than asserting
  // immediately, which would just catch the transient optimistic state.
  await expect(checkbox).toHaveJSProperty("checked", before);
});

test("React-owned label multi-select renders options from payload data and filtering by a checked label still works", async ({ page }) => {
  // Regression test for the first (and so far only) converted multi-select
  // dropdown - a structurally different case from every other Phase 2
  // field: its *options* are rebuilt from the PR payload on every data
  // (re)load (see MultiSelectCheckboxList.jsx and
  // renderReactMultiSelectList in react-app.jsx), not just seeded once at
  // mount. React mounts directly into the existing #label-list container
  // (no wrapper span needed, unlike every static-option field converted so
  // far), so the pre-existing "change" listener delegated on that
  // container (see index.page.js, added before any of Phase 2 existed)
  // keeps working unmodified - this test also confirms that by actually
  // filtering, not just checking the checkbox's visual state.
  await page.goto("/");
  await waitForPrTable(page);

  await expect(prTables(page)).toContainText("Add welcome banner");
  await expect(prTables(page)).toContainText("Fix flaky test");

  await page.getByRole("tab", { name: "Run & Filter" }).click();
  // updateMultiSelectSummary (pr-filter-panel.helpers.js) always
  // re-derives the summary's base text as everything before the first "(",
  // which strips the "(s)" from the original "Filter by label name(s)"
  // markup the very first time it runs (pre-existing behavior, unrelated
  // to this conversion) - the on-screen text is "Filter by label name"
  // from then on, not the initial HTML's "(s)".
  const labelDropdownSummary = filterDropdownSummary(page.getByRole("group", { name: "Filter by label name(s)", exact: true, includeHidden: true }));
  await labelDropdownSummary.click();

  const labelList = page.getByRole("group", { name: "Filter by label name(s)", exact: true, includeHidden: true });
  await expect(labelList.getByRole("checkbox", { includeHidden: true })).toHaveCount(3);
  await expect(labelList).toContainText("enhancement");
  await expect(labelList).toContainText("bug");
  await expect(labelList).toContainText("dependencies");

  await labelList.getByLabel("enhancement", { exact: true }).check();
  await waitForFilterPersist(page);

  await expect(prTables(page)).toContainText("Add welcome banner");
  await expect(prTables(page)).not.toContainText("Fix flaky test");

  // Regression test for a real bug this conversion introduced (caught by
  // this exact reload, not by any jsdom test): renderPrData's React path
  // calls the vanilla filter-population pipeline *twice* per data load
  // (prDataTabOrchestrator's own side effect, then
  // populateFilterDropdownsForCurrentPayload right after, to cover the
  // React path's skipTableRender bypass). Both calls read "currently
  // checked" checkboxes from the DOM to seed the next render's selections.
  // Plain `root.render()` doesn't commit synchronously (React 18 batches
  // it) - without wrapping it in flushSync (see renderReactMultiSelectList
  // in react-app.jsx), the second call's DOM read saw the first call's
  // pre-commit (stale/unchecked) state and clobbered the just-restored
  // "enhancement" selection back to unchecked before this reload's first
  // paint. Confirmed by temporarily removing flushSync and seeing this
  // exact assertion fail.
  await page.reload();
  await waitForPrTable(page);
  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await labelDropdownSummary.click();
  await expect(labelList.getByLabel("enhancement", { exact: true })).toBeChecked();

  // Reset so this test's filter doesn't hide PRs from whatever unrelated
  // test happens to load next against this suite's one shared webServer.
  await labelList.getByLabel("enhancement", { exact: true }).uncheck();
  await waitForFilterPersist(page);
});

test("React-owned exclude-label/author/assigned/approver multi-selects render from payload data and survive a persisted restore together", async ({ page }) => {
  // One representative test for the remaining four multi-selects converted
  // alongside label-list (same MultiSelectCheckboxList/flushSync bridge -
  // see gotcha #4 in REACT_MIGRATION_PLAN.md), rather than one test per
  // field, following the same "batch" pattern as the Needs Attention rule
  // controls test above. Confirms both that options render from the PR
  // payload (author/assigned/approver derive display names differently
  // from label/exclude-label - via actorsMap - so this isn't guaranteed by
  // the label-list test alone) and that a persisted selection survives a
  // reload (the exact case gotcha #4's flushSync fix was needed for).
  await page.goto("/");
  await waitForPrTable(page);

  await page.getByRole("tab", { name: "Run & Filter" }).click();

  const excludeLabelList = page.getByRole("group", { name: "Exclude by label name(s)", exact: true, includeHidden: true });
  const authorList = page.getByRole("group", { name: "Filter by PR author(s)", exact: true, includeHidden: true });
  const assignedList = page.getByRole("group", { name: "Filter by Assigned user(s)", exact: true, includeHidden: true });
  const approverList = page.getByRole("group", { name: "Filter by PR approver(s)", exact: true, includeHidden: true });
  // useMultiSelectDropdownClosing (AppRoot; was index.page.js's
  // setupMultiSelectDropdownClosing until window-bridge elimination Phase 7.5) closes
  // every OTHER open <details class="multi-select-dropdown"> on any click
  // outside it - opening one dropdown, leaving it open, and then opening
  // the next closes the first, so each dropdown must be (re-)opened
  // immediately before the interaction that needs it visible.
  const openDropdown = (list) => filterDropdownSummary(list).click();

  await openDropdown(excludeLabelList);
  await expect(excludeLabelList.getByRole("checkbox", { includeHidden: true })).toHaveCount(3);

  await openDropdown(authorList);
  await expect(authorList.getByRole("checkbox", { includeHidden: true })).toHaveCount(3);
  // Display names come from resolveActorDisplayName, which resolves via a
  // server-side actor-name-cache learned from *any* occurrence of a login
  // (assignee/approver/author alike) - since this fixture also lists
  // "octocat" as an assignee named "The Octocat" and "hubot" as an
  // approver named "Hubot", the author list shows those learned display
  // names too, not the raw logins.
  await expect(authorList).toContainText("The Octocat");
  await expect(authorList).toContainText("Hubot");

  await openDropdown(assignedList);
  await expect(assignedList.getByRole("checkbox", { includeHidden: true })).toHaveCount(1);
  await expect(assignedList).toContainText("The Octocat");

  await openDropdown(approverList);
  await expect(approverList.getByRole("checkbox", { includeHidden: true })).toHaveCount(2);
  await expect(approverList).toContainText("The Octocat");
  await expect(approverList).toContainText("Hubot");

  // Persist directly via the same /view-prs/user-defaults PUT "Apply
  // filters (local)" would send, rather than checking all four boxes and
  // clicking that button. These four categories AND together (see
  // persistUiOptionOverrides/applyLocalFilters in index.page.js) and
  // restoring now actually re-applies them on load (see gotcha #2), so
  // every selection below deliberately points at PR #1 (the only PR in
  // this fixture with a "The Octocat" author, assignee, *and* approver) -
  // any mismatched combination would filter every row out and leave no
  // <tr> for the reload-and-restore checks below to wait on.
  await page.evaluate(async () => {
    const current = await (await fetch("/view-prs/user-defaults")).json();
    await fetch("/view-prs/user-defaults", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(current?.overrides || {}),
        "exclude-label": "bug",
        author: ["octocat"],
        assigned: ["octocat"],
        approver: ["octocat"],
      }),
    });
  });

  await page.reload();
  await waitForPrTable(page);
  await page.getByRole("tab", { name: "Run & Filter" }).click();

  await openDropdown(excludeLabelList);
  await expect(excludeLabelList.getByLabel("bug", { exact: true })).toBeChecked();
  await openDropdown(authorList);
  await expect(authorList.getByLabel("The Octocat", { exact: true })).toBeChecked();
  await openDropdown(assignedList);
  await expect(assignedList.getByLabel("The Octocat", { exact: true })).toBeChecked();
  await openDropdown(approverList);
  await expect(approverList.getByLabel("The Octocat", { exact: true })).toBeChecked();

  // Reset so this test's filters don't affect whatever unrelated test
  // happens to load next against this suite's one shared webServer. Wait for
  // the restore's own debounced save to land first - it would otherwise be
  // able to write these restored filters back after the reset (see the
  // Run Script options test above).
  await waitForFilterPersist(page);
  await page.evaluate(async () => {
    const current = await (await fetch("/view-prs/user-defaults")).json();
    const overrides = { ...(current?.overrides || {}) };
    for (const key of ["exclude-label", "author", "assigned", "approver"]) {
      delete overrides[key];
    }
    await fetch("/view-prs/user-defaults", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(overrides),
    });
  });
});

test("React-owned thread-resolution allow/deny and change-filter ignore-author multi-selects render and survive a persisted restore", async ({ page }) => {
  // Covers the last four multi-selects converted (see REACT_MIGRATION_PLAN.md):
  // unlike every list in the batch test above, these are built directly in
  // index.page.js's own renderActorOptionsList/renderChangeFilterActorList
  // (not pr-filter-panel.helpers.js), which is a different call site
  // feeding the same MultiSelectCheckboxList/flushSync bridge - this test
  // confirms the conversion works from that call site too, not just that
  // the bridge itself works (already proven above).
  await page.goto("/");
  await waitForPrTable(page);

  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByText("Advanced visibility and attention rules").click();

  // The allow/deny lists are only visible while their <details> wrapper is
  // shown, which updateAuthorThreadResolutionRuleVisibility ties to the
  // mode select's value (see the dedicated test for that behavior below) -
  // switch modes to reveal each list in turn.
  const allowList = page.getByRole("group", { name: "Allow PR authors to resolve threads started by (Actor Names)", exact: true, includeHidden: true });
  const denyList = page.getByRole("group", { name: "Do not allow PR authors to resolve threads started by (Actor Names)", exact: true, includeHidden: true });
  const ignoreCommentAuthorsList = page.getByRole("group", { name: "Ignore comments from these authors (GitHub logins)", exact: true, includeHidden: true });
  const ignoreReviewAuthorsList = page.getByRole("group", { name: "Ignore reviews from these authors (GitHub logins)", exact: true, includeHidden: true });
  const openDropdown = (list) => filterDropdownSummary(list).click();

  await page.selectOption("#attention-author-thread-resolution-mode", "allow-only");
  await expect(allowList.getByRole("checkbox", { includeHidden: true })).toHaveCount(3);
  await expect(allowList).toContainText("The Octocat");

  await page.selectOption("#attention-author-thread-resolution-mode", "deny-only");
  await expect(denyList.getByRole("checkbox", { includeHidden: true })).toHaveCount(3);
  await expect(denyList).toContainText("Hubot");

  await openDropdown(ignoreCommentAuthorsList);
  await expect(ignoreCommentAuthorsList.getByRole("checkbox", { includeHidden: true })).toHaveCount(3);
  await openDropdown(ignoreReviewAuthorsList);
  await expect(ignoreReviewAuthorsList.getByRole("checkbox", { includeHidden: true })).toHaveCount(3);

  // Persist directly via the same /view-prs/user-defaults shape
  // restoreUiOptionOverrides expects (allow/deny are top-level array keys;
  // the change-filter lists nest under "changeFilters" - see
  // restoreUiOptionOverrides in index.page.js), rather than driving all
  // four through checkbox clicks: the allow/deny lists are mutually
  // exclusive in the UI (only one mode's list is visible at a time), so
  // there's no single mode that would let a real click reach both.
  await page.evaluate(async () => {
    const current = await (await fetch("/view-prs/user-defaults")).json();
    await fetch("/view-prs/user-defaults", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(current?.overrides || {}),
        "attention-author-thread-resolution-allow": ["octocat"],
        "attention-author-thread-resolution-deny": ["hubot"],
        changeFilters: {
          ...(current?.overrides?.changeFilters || {}),
          ignoreCommentsFromAuthors: ["octocat"],
          ignoreReviewsFromAuthors: ["hubot"],
        },
      }),
    });
  });

  await page.reload();
  await waitForPrTable(page);
  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByText("Advanced visibility and attention rules").click();

  await page.selectOption("#attention-author-thread-resolution-mode", "allow-only");
  await expect(allowList.getByLabel("The Octocat", { exact: true })).toBeChecked();
  await page.selectOption("#attention-author-thread-resolution-mode", "deny-only");
  await expect(denyList.getByLabel("Hubot", { exact: true })).toBeChecked();
  await openDropdown(ignoreCommentAuthorsList);
  await expect(ignoreCommentAuthorsList.getByLabel("The Octocat", { exact: true })).toBeChecked();
  await openDropdown(ignoreReviewAuthorsList);
  await expect(ignoreReviewAuthorsList.getByLabel("Hubot", { exact: true })).toBeChecked();

  // Reset so this test's overrides don't affect whatever unrelated test
  // happens to load next against this suite's one shared webServer. Order
  // matters here: the mode select auto-persists on every "change" (see
  // the special-case branch for its id in index.page.js's delegated
  // listener) as a fire-and-forget PUT - and that auto-persist re-reads
  // ALL fields' LIVE DOM state (persistViewFilterOptionOverrides ->
  // getSelectedAuthorThreadResolutionAllowLogins, a real checkbox query),
  // not just the mode itself. Found via a later regression test
  // (e2e/smoke.spec.js's "no React-portaled status/log panel..." test)
  // catching this exact leftover: the explicit delete-PUT used to run
  // *before* selectOption(..., "allow-all") - but "octocat"'s checkbox was
  // still checked live in the DOM (only the manual delete-PUT had cleared
  // the *server* record), so that selectOption's own auto-persist
  // immediately clobbered the deletion right back to
  // `["octocat"]`/`["hubot"]`, leaking into whatever test loaded next.
  // Fixed by making the explicit delete-PUT the truly last step, waiting
  // for the mode-select's own auto-persist to land first.
  await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/view-prs/user-defaults") && res.request().method() === "PUT",
    ),
    page.selectOption("#attention-author-thread-resolution-mode", "allow-all"),
  ]);
  const [finalCleanupResponse] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/view-prs/user-defaults") && res.request().method() === "PUT",
    ),
    page.evaluate(async () => {
      const current = await (await fetch("/view-prs/user-defaults")).json();
      const overrides = { ...(current?.overrides || {}) };
      delete overrides["attention-author-thread-resolution-allow"];
      delete overrides["attention-author-thread-resolution-deny"];
      if (overrides.changeFilters) {
        delete overrides.changeFilters.ignoreCommentsFromAuthors;
        delete overrides.changeFilters.ignoreReviewsFromAuthors;
      }
      await fetch("/view-prs/user-defaults", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(overrides),
      });
    }),
  ]);
  expect(finalCleanupResponse.ok()).toBe(true);
});

test("React-owned plain-metadata filter selects (PR difficulty, etc.) actually filter the table", async ({ page }) => {
  // Covers the six "Any (with/without)"-style selects (custom comments,
  // other notes, PR difficulty, Rally stories, Rally links, analysis of
  // PR) converted via the generic FilterOptionSelect component - see
  // REACT_MIGRATION_PLAN.md. Unlike almost every other Phase 2 field,
  // none of these ever had a vanilla "change" listener or a persisted
  // override (only read via .value when "Apply filters (local)" is
  // clicked), so there's no restore-race or event-delegation regression to
  // guard here.
  //
  // This also covers a real, pre-existing bug found and fixed alongside
  // this conversion (not caused by it, but caught while testing it):
  // deriveFilterPipelineState (pr-filter-pipeline.helpers.js) used to read
  // customComments/otherNotes/prDifficulty/rallyStories/rallyLinks/
  // analysisOfPr off its input but never forward them into
  // buildRowFilterCriteria, so rowMatchesUiFilters always saw empty-string
  // criteria for all six fields regardless of what was selected - `git
  // log` showed "prDifficulty" had never appeared in that file's history,
  // confirming this predated any Phase 2 work. Fixed by forwarding all six
  // through. PR #1's fixture note (prDifficulty: "3") is the one
  // differentiator among the three fixture PRs.
  await page.goto("/");
  await waitForPrTable(page);

  await expect(prTables(page)).toContainText("Add welcome banner");
  await expect(prTables(page)).toContainText("Fix flaky test");

  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.selectOption("#filter-pr-difficulty", "3");
  await waitForFilterPersist(page);

  await expect(prTables(page)).toContainText("Add welcome banner");
  await expect(prTables(page)).not.toContainText("Fix flaky test");

  // Reset so this test's filter doesn't hide PRs from whatever unrelated
  // test happens to load next against this suite's one shared webServer.
  await page.selectOption("#filter-pr-difficulty", "");
  await waitForFilterPersist(page);
});

test("PR author thread resolution policy select shows/hides its dependent allow/deny lists live, without a page reload", async ({ page }) => {
  // Regression coverage for updateAuthorThreadResolutionRuleVisibility()
  // (index.page.js), which is wired to this select's own "change" event
  // (via the same delegated-on-the-form mechanism as the test above) and
  // toggles two sibling <details> elements' `hidden`/`open` state based on
  // the selected mode. This select has genuinely different dependent UI
  // from every other Phase 2 field converted so far, so it gets its own
  // dedicated interaction test rather than folding into the batch test.
  await page.goto("/");
  await waitForPrTable(page);

  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByText("Advanced visibility and attention rules").click();

  const allowOptions = page.getByRole("group", { name: "Thread-resolution allow-list options", exact: true, includeHidden: true });
  const denyOptions = page.getByRole("group", { name: "Thread-resolution deny-list options", exact: true, includeHidden: true });
  await expect(allowOptions).toBeHidden();
  await expect(denyOptions).toBeHidden();

  await page.selectOption("#attention-author-thread-resolution-mode", "allow-only");
  await expect(allowOptions).toBeVisible();
  await expect(denyOptions).toBeHidden();

  await page.selectOption("#attention-author-thread-resolution-mode", "deny-only");
  await expect(allowOptions).toBeHidden();
  await expect(denyOptions).toBeVisible();

  await page.selectOption("#attention-author-thread-resolution-mode", "allow-all");
  await expect(allowOptions).toBeHidden();
  await expect(denyOptions).toBeHidden();
});

test("React-owned Review Stats controls render, respond to changes, and survive an unrelated stats re-render", async ({ page }) => {
  // Phase 3 (see REACT_MIGRATION_PLAN.md): the first slice of the Review
  // Stats tab converted to React. renderStatsView (index.page.js) used to
  // rebuild the controls from scratch (via `host.innerHTML = ""`) on
  // *every* stats render, the same discard-and-rebuild shape the old
  // vanilla multi-select lists had before Phase 2 converted those - so
  // mirroring Phase 1's #pr-sections approach, renderStatsView was changed
  // to never touch #stats-controls-root once React has mounted into it,
  // only the sibling #stats-content-root. This test's second half is the
  // actual regression guard: it sets a control value, forces a stats
  // re-render for a completely unrelated reason (switching tabs and
  // applying an unrelated filter), and confirms the value survived - if
  // renderStatsView still rebuilt the controls container, this would
  // reset the control back to its own default.
  await page.goto("/");
  await waitForPrTable(page);
  await page.getByRole("tab", { name: "Review statistics" }).click();

  const controlsRoot = page.getByRole("group", { name: "Review statistics controls", exact: true, includeHidden: true });
  for (const name of ["Sort by", "Filter"]) {
    await expect(controlsRoot.getByRole("combobox", { name, exact: true })).toHaveCount(1);
  }
  for (const name of ["Min comments", "Top reviewers", "Start date", "End date"]) {
    await expect(controlsRoot.getByLabel(name, { exact: true })).toHaveCount(1);
  }

  const sortSelect = page.getByRole("combobox", { name: "Sort by", exact: true, includeHidden: true });
  await expect(sortSelect).toHaveValue("riskyApprovals");
  await sortSelect.selectOption("reviews");
  await expect(sortSelect).toHaveValue("reviews");

  const minCommentsInput = page.getByLabel("Min comments", { exact: true });
  await minCommentsInput.fill("4");
  await minCommentsInput.blur();
  await expect(minCommentsInput).toHaveValue("4");

  // Tag the actual DOM node (not just its displayed value, which vanilla's
  // createStatsControls() would also get right since it reads from the
  // same underlying statsViewState - only a survived DOM node reference
  // proves renderStatsView didn't tear the React-mounted subtree down and
  // let vanilla silently rebuild an equivalent-looking replacement).
  await sortSelect.evaluate((node) => {
    node.dataset.e2eIdentityMarker = "still-the-same-node";
  });

  // Force an unrelated stats re-render: switch to Run & Filter, apply a
  // local filter (which re-renders the whole PR data view, including
  // review stats), then come back.
  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByLabel("Filter by PR number(s)", { exact: true }).fill("1");
  await waitForFilterPersist(page);
  await page.getByRole("tab", { name: "PR data" }).click();
  await page.getByRole("tab", { name: "Review statistics" }).click();

  await expect(page.getByRole("combobox", { name: "Sort by", exact: true, includeHidden: true })).toHaveValue("reviews");
  await expect(page.getByLabel("Min comments", { exact: true })).toHaveValue("4");
  await expect(page.getByRole("combobox", { name: "Sort by", exact: true, includeHidden: true })).toHaveAttribute(
    "data-e2e-identity-marker",
    "still-the-same-node",
  );

  // Reset so this test's filter/stats state doesn't affect whatever
  // unrelated test happens to load next against this suite's one shared
  // webServer.
  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByLabel("Filter by PR number(s)", { exact: true }).fill("");
  await waitForFilterPersist(page);
});

test("React-owned Review Stats content renders cards/table and \"View in table\" navigates to the React-owned PR table correctly", async ({ page }) => {
  // Phase 3 (see REACT_MIGRATION_PLAN.md): the second slice of the Review
  // Stats tab converted to React - <ReviewStatsContent /> (summary cards,
  // chart visuals wrapper, reviewer table, trend note), replacing
  // pr-review-stats-summary.component.js's renderStatsSummaryAndTable().
  //
  // This is also a real regression fix, not just a port: the vanilla
  // "View in table" button (on a card's expandable sources) built its own
  // ad hoc DOM-navigation logic inline, directly mutating `.hidden`/
  // textContent on the PR table's insights row - exactly the kind of
  // direct mutation that does nothing once React owns that row (the same
  // bug class Author Insights' own "View in table" button already hit and
  // was fixed for, via a 'pr-navigate-to-insights' CustomEvent - see
  // state/useNavigateToPrInTable.jsx). Review
  // Stats' button was never fixed the same way; this conversion routes it
  // through that same already-React-safe helper instead of rebuilding the
  // broken version a third time.
  await page.goto("/");
  await waitForPrTable(page);
  await page.getByRole("tab", { name: "Review statistics" }).click();

  // "Filtered rows" only counts every row unconditionally when there's no
  // active date-range filter (see buildReviewerStats in
  // pr-review-stats-aggregation.helpers.js) - statsViewState defaults to a
  // recent start date that excludes this fixture's Jan 2026 PRs, so clear
  // it to get a predictable count.
  const startDateInput = page.getByLabel("Start date", { exact: true });
  await startDateInput.fill("");
  await startDateInput.blur();

  const contentRoot = page.getByRole("region", { name: "Review statistics", exact: true, includeHidden: true });
  for (const cardName of ["Filtered rows", "Comments on others' PRs", "Approvals", "Comment usefulness"]) {
    await expect(contentRoot.getByRole("group", { name: cardName, exact: true })).toBeVisible();
  }

  const filteredRowsCard = contentRoot.getByRole("group", { name: "Filtered rows", exact: true });
  await expect(filteredRowsCard.getByText("3", { exact: true })).toBeVisible();

  await filteredRowsCard.getByText(/^Show sources \(/).click();
  const viewInTableButton = filteredRowsCard.getByRole("button", { name: "View in table", exact: true }).first();
  await expect(viewInTableButton).toBeVisible();
  await viewInTableButton.click();

  // Regression assertion: this used to silently do nothing under a
  // React-owned PR table (the insights row never actually expanded, even
  // though the vanilla code "succeeded" at finding the link and
  // scrolling to it) - now it both switches tabs and expands the row.
  // Checks the toggle's aria-expanded and the insights row's `hidden` DOM
  // property directly (not Playwright's toBeVisible/toBeHidden), the same
  // pattern the sibling Author Insights "View in table" test above uses
  // and for the same reason: PR #1 can legitimately end up inside a
  // currently-collapsed lifecycle/smart-group section depending on what
  // earlier tests in this shared-webServer suite did to its flagged/
  // in-review state, without that being a regression in this feature.
  await expect(page.getByRole("tabpanel", { name: "PR data", exact: true, includeHidden: true })).toBeVisible();
  const insightsRow = await insightsRowUnderExpandedToggle(page);
  await expect(insightsRow).toHaveJSProperty("hidden", false);
});

test("React-owned Author Insights selector renders options, changes the selected author, and survives an unrelated re-render", async ({ page }) => {
  // Phase 3 (see REACT_MIGRATION_PLAN.md), then Track C: the Author
  // Insights tab's "Author" selector converted to React, then (Track C)
  // switched from an incrementing-`key` remount (needed while it held its
  // own local `useState` seeded from a pushed prop) to a plain
  // Context-controlled input - `payload`/`selectedAuthorLogin` are read
  // live from PrDataContext on every render, so there's no local state to
  // go stale and nothing to force-remount anymore. The DOM node itself is
  // now expected to be stable across an unrelated re-render (same as the
  // Review Stats controls test's identity check), unlike when this test
  // was first written. The real regression this guards is structural:
  // renderAuthorInsights (pr-author-insights.component.js) used to rebuild
  // the selector via the *same* `host.innerHTML = ""` that rebuilt every
  // other section - if that still covered #author-insights-selector-root,
  // the static container React mounted into would be destroyed and
  // recreated on the next render, leaving react-app.jsx's mount holding a
  // reference to a detached node - the selector would silently vanish from
  // the page after any unrelated re-render, not just fail to preserve a
  // value.
  await page.goto("/");
  await waitForPrTable(page);
  await page.getByRole("tab", { name: "Author Insights" }).click();

  const select = page.getByRole("combobox", { name: "Author", exact: true, includeHidden: true });
  await expect(select).toBeVisible();
  const optionCount = await select.getByRole("option", { includeHidden: true }).count();
  expect(optionCount).toBeGreaterThan(1);

  await select.selectOption({ index: 1 });
  const selectedValue = await select.inputValue();
  await expect(page.getByText(/^Showing insights for /)).toBeVisible();

  // Force an unrelated author-insights re-render: switch to Run & Filter,
  // apply an unrelated local filter (which re-renders the whole PR data
  // view, including author insights via the same pipeline as review
  // stats), then come back.
  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByLabel("Filter by PR number(s)", { exact: true }).fill("1");
  await waitForFilterPersist(page);
  await page.getByRole("tab", { name: "PR data" }).click();
  await page.getByRole("tab", { name: "Author Insights" }).click();

  await expect(select).toBeVisible();
  await expect(select).toHaveValue(selectedValue);

  // Reset so this test's filter doesn't affect whatever unrelated test
  // happens to load next against this suite's one shared webServer.
  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByLabel("Filter by PR number(s)", { exact: true }).fill("");
  await waitForFilterPersist(page);
});

test("React-owned Author Insights \"created PRs\" section updates on author switch and survives an unrelated re-render", async ({ page }) => {
  // Phase 3 (see REACT_MIGRATION_PLAN.md): the Author Insights tab's "PRs
  // created by this author" section converted to React
  // (<AuthorCreatedPrsSection />, wrapping the existing vanilla DOM
  // builder via a ref rather than reimplementing its several helper
  // dependencies in JSX - same choice as Review Stats' chart visuals).
  //
  // The first assertion here is a real regression this conversion could
  // have introduced and didn't catch until manual browser testing:
  // switching authors calls renderAuthorInsights again with the *same*
  // `rows` array reference (authorInsightsState.latestRows, unchanged),
  // so a naive `useEffect(..., [rows])` dependency would never re-run and
  // the section would keep showing the previously-selected author's PRs.
  // Fixed by mounting with an incrementing `key` on every update call
  // (forcing a fresh mount, not just a prop diff) - same shape as
  // AuthorInsightsSelector.
  await page.goto("/");
  await waitForPrTable(page);
  await page.getByRole("tab", { name: "Author Insights" }).click();

  const createdRoot = page.getByRole("region", { name: "Author's created PRs", exact: true, includeHidden: true });
  await expect(createdRoot.getByRole("heading", { name: "PRs created by this author", exact: true })).toBeVisible();

  const select = page.getByRole("combobox", { name: "Author", exact: true, includeHidden: true });
  const optionCount = await select.getByRole("option", { includeHidden: true }).count();
  expect(optionCount).toBeGreaterThan(1);

  const textForEachAuthor = [];
  for (let i = 0; i < optionCount; i++) {
    await select.selectOption({ index: i });
    textForEachAuthor.push(await createdRoot.textContent());
  }
  // Every author's fixture PR is different, so the section's content must
  // actually change each time, not get stuck on whichever author was
  // selected first.
  expect(new Set(textForEachAuthor).size).toBe(optionCount);

  // Select PR #1's own author before filtering the table down to PR #1 -
  // renderAuthorInsights resets the selected author to the first
  // remaining option whenever the current selection isn't among the
  // authors left after a filter, so filtering to PR #1 while a
  // *different* author was selected would legitimately change the
  // selection for reasons unrelated to what this test is guarding
  // against. Selecting PR #1's author first keeps the selection stable
  // across the filter, so any change in the section afterward is
  // actually the regression this test exists to catch.
  await select.selectOption({ label: "The Octocat" });
  const pr1AuthorText = await createdRoot.textContent();

  // Force an unrelated author-insights re-render: switch to Run & Filter,
  // apply an unrelated local filter, then come back - the created-PRs
  // container must still be present and showing the same author's PRs
  // (not vanished, per the container-split fix's own regression class -
  // see the sibling Author Insights selector test above for the same
  // class of bug caught the same way).
  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByLabel("Filter by PR number(s)", { exact: true }).fill("1");
  await waitForFilterPersist(page);
  await page.getByRole("tab", { name: "PR data" }).click();
  await page.getByRole("tab", { name: "Author Insights" }).click();

  await expect(createdRoot.getByRole("heading", { name: "PRs created by this author", exact: true })).toBeVisible();
  await expect(createdRoot).toHaveText(pr1AuthorText);

  // Reset so this test's filter doesn't affect whatever unrelated test
  // happens to load next against this suite's one shared webServer.
  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByLabel("Filter by PR number(s)", { exact: true }).fill("");
  await waitForFilterPersist(page);
});

test("React-owned Author Insights header updates on author switch and survives an unrelated re-render", async ({ page }) => {
  // Phase 3 (see REACT_MIGRATION_PLAN.md): the "Showing insights for
  // <author>" header converted to React (<AuthorInsightsHeader />, mounted
  // into #author-insights-header-root, same container-split approach as
  // the selector/created-PRs sections). The regression this guards against
  // is the same structural one those tests guard against: renderAuthorInsights
  // used to rebuild every section (including this header) via the same
  // `host.innerHTML = ""` that rebuilt #author-insights-content-root - if
  // that coverage regressed to include #author-insights-header-root again,
  // the mounted React root's container would be destroyed on the next
  // render and the header would vanish after any unrelated re-render.
  await page.goto("/");
  await waitForPrTable(page);
  await page.getByRole("tab", { name: "Author Insights" }).click();

  const headerRoot = page.getByRole("region", { name: "Selected author", exact: true, includeHidden: true });
  const header = headerRoot.getByText(/^Showing insights for /);
  await expect(header).toBeVisible();

  const select = page.getByRole("combobox", { name: "Author", exact: true, includeHidden: true });
  const optionCount = await select.getByRole("option", { includeHidden: true }).count();
  expect(optionCount).toBeGreaterThan(1);

  const textForEachAuthor = [];
  for (let i = 0; i < optionCount; i++) {
    await select.selectOption({ index: i });
    textForEachAuthor.push(await header.textContent());
  }
  // Every author's name is different, so the header's text must actually
  // change each time, not get stuck on whichever author was selected first.
  expect(new Set(textForEachAuthor).size).toBe(optionCount);

  await select.selectOption({ label: "The Octocat" });
  const headerText = await header.textContent();

  // Force an unrelated author-insights re-render: switch to Run & Filter,
  // apply an unrelated local filter, then come back.
  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByLabel("Filter by PR number(s)", { exact: true }).fill("1");
  await waitForFilterPersist(page);
  await page.getByRole("tab", { name: "PR data" }).click();
  await page.getByRole("tab", { name: "Author Insights" }).click();

  await expect(header).toBeVisible();
  await expect(header).toHaveText(headerText);

  // Reset so this test's filter doesn't affect whatever unrelated test
  // happens to load next against this suite's one shared webServer.
  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByLabel("Filter by PR number(s)", { exact: true }).fill("");
  await waitForFilterPersist(page);
});

test("React-owned Author Insights PR-linked notes section survives an unrelated re-render", async ({ page }) => {
  // Phase 3 (see REACT_MIGRATION_PLAN.md): the "PR-linked custom comments
  // and sentiment" section converted to React (<AuthorInsightsNotesSection />,
  // mounted into #author-insights-notes-root, wrapping the existing
  // vanilla DOM builder via a ref - same choice as the created-PRs
  // section, since it depends on the same PR-link/meta-formatting
  // helpers). Unlike the created-PRs section, this component receives a
  // freshly-computed `selectedAuthor` object as a prop on every render
  // (see AuthorInsightsNotesSection.jsx's own comment), so it needs no
  // incrementing `key` - a plain effect dependency array already re-runs
  // on every author switch. This test guards the same structural
  // container-split regression as the header/selector/created-PRs tests:
  // the section must not vanish after an unrelated re-render.
  await page.goto("/");
  await waitForPrTable(page);
  await page.getByRole("tab", { name: "Author Insights" }).click();

  const notesRoot = page.getByRole("region", { name: "Author's PR notes", exact: true, includeHidden: true });
  await expect(notesRoot.getByRole("heading", { name: "PR-linked custom comments and sentiment", exact: true })).toBeVisible();
  await expect(notesRoot).toContainText("PR-linked custom comments and sentiment");

  // Force an unrelated author-insights re-render: switch to Run & Filter,
  // apply an unrelated local filter, then come back.
  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByLabel("Filter by PR number(s)", { exact: true }).fill("1");
  await waitForFilterPersist(page);
  await page.getByRole("tab", { name: "PR data" }).click();
  await page.getByRole("tab", { name: "Author Insights" }).click();

  await expect(notesRoot.getByRole("heading", { name: "PR-linked custom comments and sentiment", exact: true })).toBeVisible();
  await expect(notesRoot).toContainText("PR-linked custom comments and sentiment");

  // Reset so this test's filter doesn't affect whatever unrelated test
  // happens to load next against this suite's one shared webServer.
  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByLabel("Filter by PR number(s)", { exact: true }).fill("");
  await waitForFilterPersist(page);
});

test("React-owned Author Insights manual comments composer can save and edit a comment, and survives an unrelated re-render", async ({ page }) => {
  // Phase 3 (see REACT_MIGRATION_PLAN.md): the "Manual author comments"
  // composer/list converted to React (<AuthorInsightsCommentsSection />,
  // reusing #author-insights-content-root, wrapping the existing vanilla
  // builder via a ref - same choice as the created-PRs/notes sections).
  // This is the highest-risk conversion in Author Insights: it owns
  // mutable draft state and issues real save/edit POST requests (against
  // this suite's isolated per-run DATA_DIR, not real data - see
  // playwright.config.js). The save/edit round-trip below exercises those
  // side effects end-to-end, not just static rendering; the final section
  // exercises the same structural container-split regression the
  // header/notes/created-PRs tests guard against.
  await page.goto("/");
  await waitForPrTable(page);
  await page.getByRole("tab", { name: "Author Insights" }).click();

  const select = page.getByRole("combobox", { name: "Author", exact: true, includeHidden: true });
  await select.selectOption({ label: "The Octocat" });

  const commentsRoot = page.getByRole("region", { name: "Author comments", exact: true, includeHidden: true });
  const textarea = commentsRoot.getByPlaceholder("Add a manual comment about this author...");
  const saveButton = commentsRoot.getByRole("button", { name: "Save comment", exact: true });

  const noteText = `e2e manual comment ${Date.now()}`;
  await textarea.fill(noteText);
  await saveButton.click();

  // The save success handler immediately triggers a full renderAuthorInsights
  // re-render (rebuilding this section from scratch, including the status
  // span), so "Saved." is too ephemeral to reliably observe here - the
  // saved comment actually showing up in the rebuilt list is the real proof
  // the save round-trip worked.
  const item = commentsRoot.getByRole("listitem").filter({ hasText: noteText });
  await expect(item).toBeVisible();

  // Edit the just-saved comment.
  await item.getByRole("button", { name: "Edit", exact: true }).click();
  const editedText = `${noteText} (edited)`;
  const editTextarea = item.getByRole("textbox");
  await editTextarea.fill(editedText);
  await item.getByRole("button", { name: "Save changes", exact: true }).click();

  const editedItem = commentsRoot.getByRole("listitem").filter({ hasText: editedText });
  await expect(editedItem).toBeVisible();

  // Force an unrelated author-insights re-render: switch to Run & Filter,
  // apply an unrelated local filter, then come back - the comments
  // container must not vanish, and the saved comment must still be there.
  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByLabel("Filter by PR number(s)", { exact: true }).fill("1");
  await waitForFilterPersist(page);
  await page.getByRole("tab", { name: "PR data" }).click();
  await page.getByRole("tab", { name: "Author Insights" }).click();

  await expect(commentsRoot.getByRole("heading", { name: "Manual author comments", exact: true })).toBeVisible();
  await expect(commentsRoot.getByRole("listitem").filter({ hasText: editedText })).toBeVisible();

  // Reset so this test's filter doesn't affect whatever unrelated test
  // happens to load next against this suite's one shared webServer.
  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByLabel("Filter by PR number(s)", { exact: true }).fill("");
  await waitForFilterPersist(page);
});

test("typing in the Author Insights manual comment composer isn't blocked by a synchronous dirty-fields recompute", async ({ page }) => {
  // Regression coverage for a real lag bug: AuthorInsightsDraftsProvider's
  // bump() used to call window.recomputeDirtyPrSectionsFields?.() -  a real
  // scan plus a DOM re-render of #auto-render-blocked-pr-links - directly
  // inside updateComposerDraft/updateEditDraft, the same synchronous call
  // stack as the composer textarea's own per-keystroke local setState.
  // React batches both into one commit, so it couldn't paint the typed
  // character until that whole handler (including the recompute) finished -
  // every keystroke was visibly delayed. Deferred to a useEffect instead
  // (same pattern NotesDirtyProvider.jsx's own write path already used
  // correctly), so the recompute runs after React has already painted.
  await page.goto("/");
  await waitForPrTable(page);
  await page.getByRole("tab", { name: "Author Insights" }).click();
  await expect(page.getByRole("tabpanel", { name: "Author Insights", exact: true, includeHidden: true })).toBeVisible();

  const composer = page.getByPlaceholder("Add a manual comment about this author...");
  await expect(composer).toBeVisible();
  await composer.click();

  const start = Date.now();
  await composer.pressSequentially("regression check", { delay: 0 });
  const elapsedMs = Date.now() - start;
  await expect(composer).toHaveValue("regression check");
  // Generous ceiling (not a tight perf assertion) - this is here to catch
  // a reintroduced synchronous-recompute-in-the-hot-path regression, which
  // was ~2.4x slower than the fixed version even against this suite's tiny
  // fixture dataset, not to pin down exact timing.
  expect(elapsedMs).toBeLessThan(2000);

  await composer.fill("");
});

test("typing an unsaved Author Insights comment draft holds back a real data poll until the draft is cleared", async ({ page }) => {
  // Regression test for Phase 7 (see REACT_MIGRATION_PLAN.md): the Author
  // Insights manual-comment composer/edit drafts used to live only in a
  // vanilla module-scope object, read by pr-auto-render-blocking.helpers.js's
  // getBlockingAuthorInsightsLogins to decide whether a background poll
  // must be deferred instead of silently discarding an unsaved comment
  // draft. They're AuthorInsightsDraftsProvider Context state now, read by
  // AutoRenderBlockingSync (window-bridge elimination Phase 7.4). Test-only
  // bridge removal: this used to read window.getAuthorInsightsDraftsSnapshot;
  // it now checks the real outcome - a real poll (changeServerData) is
  // held back, with an "Author:" chip, until the draft is cleared.
  await page.goto("/?dataPollMs=300");
  await waitForPrTable(page);
  await page.getByRole("tab", { name: "Author Insights" }).click();
  const indicator = page.getByRole("status", { name: "Auto update paused", exact: true, includeHidden: true });

  const select = page.getByRole("combobox", { name: "Author", exact: true, includeHidden: true });
  await select.selectOption({ label: "The Octocat" });

  const textarea = page.getByRole("region", { name: "Author comments", exact: true, includeHidden: true }).getByPlaceholder("Add a manual comment about this author...");
  await textarea.fill("an unsaved draft left during this test");
  await changeServerData(page);
  await expect(indicator).toBeVisible();
  await expect(page.getByRole("button", { name: "Author: The Octocat" })).toBeVisible();

  // Clear it back out (drafts are client-side; nothing to restore on the
  // server) and blur: the held-back poll applies and the indicator goes away.
  await textarea.fill("");
  await textarea.blur();
  await expect(indicator).toBeHidden();
});

test("React-owned Backfill status badges render and survive a status refresh", async ({ page }) => {
  // Phase 3 (see REACT_MIGRATION_PLAN.md): the Backfill tab's status badges
  // converted to React (<BackfillBadges />, mounted directly into the
  // existing #backfill-badges container - no container-split needed since
  // that div isn't shared with anything else, unlike every Author Insights
  // conversion). Only exercises the read-only status GET (tab activation
  // and "Refresh status" both just reload status - this test never starts
  // or stops the actual backfill process).
  await page.goto("/");
  await page.getByRole("tab", { name: "Backfill" }).click();

  const badgeHost = page.getByRole("group", { name: "Backfill status badges", exact: true, includeHidden: true });
  const badges = badgeHost.getByText(/^Backfill: /);
  await expect(badges.first()).toBeVisible();
  await expect(badges.first()).toHaveText(/Backfill: (running|stopped)/);

  // Refresh status - a real GET request against this suite's isolated
  // per-run server, not a destructive action - and confirm the badges are
  // still there afterward (not vanished, the structural regression class
  // every other Phase 3 conversion's own tests guard against).
  await page.getByRole("button", { name: "Refresh status", exact: true }).click();
  await expect(badges.first()).toBeVisible();
  await expect(badges.first()).toHaveText(/Backfill: (running|stopped)/);
});

test("the Backfill tab's details and log text replace their loading placeholders from BackfillStatusProvider's state", async ({ page }) => {
  // Window-bridge elimination Phase 4 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
  // the badges, details text and log text moved out of AppRoot's local state
  // into <BackfillStatusProvider />, which AppRoot reads back via Context for
  // the #backfill-details / #backfill-log portals. jsdom covers the Provider
  // and each consumer separately; this proves the real wired path, from a
  // real status GET through the Provider's state into the real DOM. Only the
  // read-only status/log GETs run - the backfill process is never started.
  await page.goto("/");
  await page.getByRole("tab", { name: "Backfill" }).click();

  await expect(page.getByRole("region", { name: "Backfill status details", exact: true, includeHidden: true })).not.toHaveText("Loading backfill status...");
  await expect(page.getByRole("region", { name: "Backfill status details", exact: true, includeHidden: true })).not.toHaveText("");
  await expect(page.getByRole("region", { name: "Backfill log", exact: true, includeHidden: true })).not.toHaveText("Loading backfill log...");
  await expect(page.getByRole("region", { name: "Backfill log", exact: true, includeHidden: true })).not.toHaveText("");

  // The log's "Refresh log" button is enabled from the Provider's button state.
  await expect(page.getByRole("button", { name: "Refresh log", exact: true, includeHidden: true })).toBeEnabled();
});

test("opening the Backfill tab and leaving it idle does not trigger a status/log refetch loop", async ({ page }) => {
  // useBackfillTabAutoRefresh lists useBackfillActions()'s
  // triggerBackfillTabLoad as an effect dependency and re-fetches whenever
  // that function's identity changes while the tab is visible - and each
  // fetch updates state that re-renders its caller. So a single unstable
  // dependency anywhere in the provider chain would turn this tab into a
  // request loop. jsdom pins the identity (useBackfillActions.test.jsx); this
  // proves it from the network side in a real browser. Read-only GETs only.
  const counts = { status: 0, log: 0 };
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.method() !== "GET") return;
    if (url.pathname === "/view-prs/backfill") counts.status += 1;
    if (url.pathname === "/view-prs/backfill/log") counts.log += 1;
  });

  await page.goto("/");
  await page.getByRole("tab", { name: "Backfill" }).click();
  await expect(page.getByRole("region", { name: "Backfill status details", exact: true, includeHidden: true })).not.toHaveText("Loading backfill status...");

  // Sit idle long enough that a loop would pile up dozens of requests.
  await page.waitForTimeout(3000);

  // A page load plus one tab activation: a handful at most, never a stream.
  expect(counts.status).toBeGreaterThan(0);
  expect(counts.status).toBeLessThanOrEqual(5);
  expect(counts.log).toBeLessThanOrEqual(5);
});

test("Action Log tab loads its entries on its very first visit, not just on a second one", async ({ page }) => {
  // Deferred-items follow-up, item 5 (see REACT_MIGRATION_PLAN.md):
  // ActionLogSection is now lazy-loaded, mounting only once this tab is
  // first activated - pr-management-tabs.helpers.js's tab-click handler
  // calls window.triggerActionLogLoad?.() synchronously on click, which
  // used to work because the component (and its bridge) was always
  // eagerly mounted well before any click. Lazily mounting it broke that:
  // the click's trigger call fired before the async chunk/component had
  // mounted to register the bridge, so it silently no-op'd - the fetch
  // this test waits for simply never happened, forever, on a real first
  // visit. (Asserting the *rendered text* instead would not have caught
  // this: "No actions logged yet." is shown both when the log is
  // genuinely empty and when it was never fetched at all - the same text
  // either way.) No jsdom unit test could catch this - it's a real
  // mount-timing race, not logic - which is exactly why this suite exists.
  // Fixed by having the component load itself on mount instead of relying
  // solely on the external trigger; this guards against a regression.
  await page.goto("/");

  const [response] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/view-prs/action-log") && res.request().method() === "GET",
    ),
    page.getByRole("tab", { name: "Action Log" }).click(),
  ]);
  expect(response.ok()).toBe(true);
});

test("the Run tab's output panel shows a real run's output from OutputTextProvider, replacing the placeholder", async ({ page }) => {
  // Window-bridge elimination Phase 3c (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
  // the output text lives in <OutputTextProvider />, which AppRoot reads back
  // via Context to render #output's portal. jsdom covers the Provider and each
  // hook separately; this proves the real wired path lands in the real
  // #output element in a real browser, in place of the static placeholder
  // rather than appended to it. Test-only bridge removal: this used to write
  // through window.updateReactOutputText (deleted); it now clicks the real
  // "Run script" button, with /view-prs/run intercepted so no script runs.
  // Asserts only on the stdout text, which appears however many PRs the
  // (shared-server, possibly persisted) PR-numbers field targets.
  await page.route("**/view-prs/run", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, output: "hello from an intercepted run" }),
    }),
  );
  await page.goto("/");
  await waitForPrTable(page);

  const output = page.getByRole("region", { name: "Latest request output", exact: true, includeHidden: true });
  await expect(output).toHaveText("Run the script to see output");

  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByRole("button", { name: "Run script" }).click();

  await expect(output).toContainText("hello from an intercepted run");
  await expect(output).not.toContainText("Run the script to see output");
});

test("no React-portaled status/log panel shows its old static placeholder text stuck onto the real content", async ({ page }) => {
  // Deferred-items follow-up (full vanilla-to-React sweep, see
  // REACT_MIGRATION_PLAN.md): found via manual verification while
  // converting the 7 vanilla `.textContent =` status/log panels -
  // `createPortal(children, container)` does NOT clear a target's
  // pre-existing content the way the old `.textContent =` write did, so
  // every one of these (plus 2 already-converted containers from an
  // earlier migration phase, #stats-content-root and
  // #author-insights-content-root, found to have the identical bug) used
  // to render as e.g. "Loading...Applied filters: ..." - the real content
  // stuck directly onto the end of the stale static placeholder text
  // index.html never cleared before React mounted. Fixed by emptying each
  // container's static markup. The existing "page loads..." test's
  // `not.toHaveText("Loading...")` check (line ~98) would NOT have caught
  // this specific bug - an exact-string mismatch check still passes
  // against "Loading...Applied filters: ..." since that isn't equal to
  // the literal string "Loading..." either.
  //
  // Checking a plain "doesn't start with the placeholder" would be wrong
  // here: for panels like #status/#output, the placeholder text ("Not
  // run"/"Run the script to see output") is the CORRECT, unchanged value
  // on a fresh page load where no action has run yet - that's not the bug,
  // it's this container simply not having anything new to show. The actual
  // bug signature is the placeholder text appearing as a PREFIX of a
  // LONGER string (real content stuck onto its end) - so this only flags
  // a placeholder that's present but the text isn't *exactly* that
  // placeholder (i.e. something got appended after it).
  await page.goto("/");
  await waitForPrTable(page);

  const assertNoStalePrefix = async (locator, placeholder) => {
    const text = await locator.textContent();
    const hasStuckPlaceholder = text !== placeholder && Boolean(text?.startsWith(placeholder));
    expect(hasStuckPlaceholder).toBe(false);
  };

  await assertNoStalePrefix(page.getByRole("region", { name: "PR data summary", exact: true, includeHidden: true }), "Loading...");
  await assertNoStalePrefix(page.getByRole("region", { name: "Status message", exact: true, includeHidden: true }), "Not run");
  await assertNoStalePrefix(page.getByRole("region", { name: "Latest request output", exact: true, includeHidden: true }), "Run the script to see output");

  await page.getByRole("tab", { name: "Backfill" }).click();
  await assertNoStalePrefix(page.getByRole("region", { name: "Backfill status details", exact: true, includeHidden: true }), "Loading backfill status...");
  await assertNoStalePrefix(page.getByRole("region", { name: "Backfill log", exact: true, includeHidden: true }), "Loading backfill log...");

  await page.getByRole("tab", { name: "Review statistics" }).click();
  await assertNoStalePrefix(page.getByRole("region", { name: "Review statistics", exact: true, includeHidden: true }), "Loading...");

  await page.getByRole("tab", { name: "Author Insights" }).click();
  await assertNoStalePrefix(page.getByRole("region", { name: "Author comments", exact: true, includeHidden: true }), "Loading...");

  // Deferred-items follow-up item 7 (multi-select summary counts/empty
  // class) hit the identical bug: the <summary class="multi-select-summary">
  // elements' own static base-label text wasn't cleared before
  // MultiSelectCheckboxList.jsx started portaling its own copy in.
  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await assertNoStalePrefix(
    filterDropdownSummary(page.getByRole("group", { name: "Filter by label name(s)", exact: true, includeHidden: true })),
    "Filter by label name(s)",
  );
  await assertNoStalePrefix(
    filterDropdownSummary(page.getByRole("group", { name: "Allow PR authors to resolve threads started by (Actor Names)", exact: true, includeHidden: true })),
    "Allow PR authors to resolve threads started by (Actor Names)",
  );
});

test("Actor Names tab loads its mappings on its very first visit, not just on a second one", async ({ page }) => {
  // Same class of bug, and same reasoning for asserting on the network
  // request rather than rendered text, as the Action Log test above - for
  // ActorNamesTab's window.triggerActorNameCacheLoad bridge.
  await page.goto("/");

  const [cacheResponse, aliasResponse] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/view-prs/actor-name-cache") && res.request().method() === "GET",
    ),
    page.waitForResponse(
      (res) => res.url().includes("/view-prs/actor-login-aliases") && res.request().method() === "GET",
    ),
    page.getByRole("tab", { name: "Actor Names" }).click(),
  ]);
  expect(cacheResponse.ok()).toBe(true);
  expect(aliasResponse.ok()).toBe(true);
});

test("Export tab's field catalog and Preview JSON produce a real export payload from real page data", async ({ page }) => {
  // Phase 7 (see REACT_MIGRATION_PLAN.md): getExportFieldCatalog/
  // getVisiblePrNumbersFromSectionsHost/buildExportPayload used to be
  // exposed on window by index.page.js - ExportTab.jsx now builds and
  // calls all 3 directly (pr-export.helpers.js). This tab had zero prior
  // e2e coverage of any kind (confirmed by grep) - this is the only real-
  // browser check that the catalog/preview actually work end-to-end
  // against real page data, not a mocked window.* bridge.
  await page.goto("/");
  await waitForPrTable(page);

  await page.getByRole("tab", { name: "Export" }).click();
  const fieldList = page.getByRole("group", { name: "Export fields", exact: true, includeHidden: true });
  await expect(fieldList.getByRole("checkbox", { includeHidden: true })).not.toHaveCount(0);

  await page.getByRole("button", { name: "Preview JSON" }).click();

  const statusText = page.getByRole("tabpanel", { name: "Export", exact: true, includeHidden: true }).getByRole("region", { name: "Export status", exact: true, includeHidden: true });
  await expect(statusText).toHaveText(/Prepared export JSON for \d+ visible PRs?\./);

  const previewText = await page.getByRole("region", { name: "Export preview", exact: true, includeHidden: true }).textContent();
  const exportPayload = JSON.parse(previewText);
  expect(exportPayload.prCount).toBeGreaterThan(0);
  expect(Array.isArray(exportPayload.prs)).toBe(true);
  expect(exportPayload.prs).toHaveLength(exportPayload.prCount);
  expect(exportPayload.prs[0]).toHaveProperty("prNumber");
});

test("Snackbar shows a real failure as an error and a real poll failure as a warning, closes, and clears when polling recovers", async ({ page }) => {
  // Deferred-items follow-up (full vanilla-to-React sweep, see
  // REACT_MIGRATION_PLAN.md): the snackbar is fully React-owned
  // (Snackbar.jsx/SnackbarProvider.jsx). Test-only bridge removal: this used
  // to call window.showErrorNotification/showWarningNotification (deleted);
  // it now drives both variants through real app paths, with requests
  // intercepted. The auto-dismiss timer (no production caller passes a
  // non-zero duration explicitly) is covered by SnackbarProvider.test.jsx.
  await page.goto("/?dataPollMs=300");
  await waitForPrTable(page);
  const snackbar = page.getByRole("alert", { includeHidden: true });
  const message = page.getByRole("alert", { includeHidden: true });
  await expect(snackbar).toBeHidden();

  // Error: a failed "Run script" request (useRunScript shows a persistent error).
  await page.route("**/view-prs/run", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: "simulated run failure" }),
    }),
  );
  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByRole("button", { name: "Run script" }).click();
  await expect(snackbar).toBeVisible();
  await expect(snackbar).not.toHaveClass(/error-snackbar-warning/);
  await expect(message).toContainText("Request failed for:");

  await page.getByRole("button", { name: "Close notification", exact: true }).click();
  await expect(snackbar).toBeHidden();

  // Warning: a failing background poll (PrDataProvider's showPollFailureWarning),
  // cleared by the next successful poll (markPollSuccess).
  await page.route("**/view-prs/data-meta", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: "simulated poll failure" }),
    }),
  );
  await expect(snackbar).toBeVisible();
  await expect(snackbar).toHaveClass(/error-snackbar-warning/);
  await expect(message).toContainText("Auto-refresh warning");
  await expect(message).toContainText("simulated poll failure");

  await page.unroute("**/view-prs/data-meta");
  await expect(snackbar).toBeHidden();
});

test("the activity drawer opens, connects over real SSE (not the jsdom-faked EventSource), and shows all sections", async ({ page }) => {
  // Activity drawer feature (see REACT_MIGRATION_PLAN.md) - a real gap this
  // closes: every other test for this feature (JobEventsProvider.test.jsx,
  // ActivityDrawer.test.jsx, etc.) runs under jsdom with a hand-rolled fake
  // EventSource - none of them prove a real browser's actual EventSource
  // can open GET /view-prs/events through the real server, let alone
  // through Vite's dev proxy (vite.config.js forwards /view-prs to
  // localhost:9000 - never previously exercised for a streaming response
  // in this suite, only ordinary fetch/JSON routes).
  //
  // Placed deliberately BEFORE "Trigger auto run and Quick check..." below:
  // every test in this suite shares one long-lived server process
  // (playwright.config.js), and that test's own "Trigger auto run" click
  // starts a real auto-refresh that - with no real GitHub network/auth in
  // whatever environment runs this suite - can stay "in progress" for a
  // long time afterward (the button itself only waits for the fire-and-
  // forget POST to respond, not for the job to finish). Running this test
  // first guarantees a clean, idle scheduler state to assert against.
  const { consoleErrors, failedRequests } = collectPageErrors(page);

  await page.goto("/");
  await waitForPrTable(page);

  await page.getByRole("button", { name: /Activity/ }).click();
  const activityPanel = page.getByRole("region", { name: "Activity panel", exact: true });
  await expect(activityPanel.getByText("Scheduled background jobs")).toBeVisible();
  await expect(activityPanel.getByRole("heading", { name: "Backfill" })).toBeVisible();
  await expect(activityPanel.getByText("In-flight user actions")).toBeVisible();

  // No "connecting/reconnecting/offline/unsupported" banner should still be
  // showing a few seconds after open - the real EventSource must have
  // actually reached `open`, not be stuck retrying or unsupported.
  await expect(activityPanel.getByRole("status", { name: "Connection status", exact: true })).toHaveCount(0, { timeout: 10000 });

  // Matched by each row's own label specifically (not the row's full text
  // content) - the Quick check row's "Waiting on auto refresh..." copy
  // would otherwise ambiguously match a loose "Auto refresh" text filter.
  for (const jobLabel of ["Auto refresh", "Quick check", "Merged/closed drain"]) {
    await expect(
      activityPanel.getByRole("group", { name: jobLabel, exact: true }),
    ).toBeVisible();
  }

  // Closing via Escape (not just the close button) - see ActivityDrawer.jsx.
  await page.keyboard.press("Escape");
  await expect(page.getByText("Scheduled background jobs")).toBeHidden();

  expect(failedRequests.filter((entry) => entry.includes("/view-prs/events"))).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("clicking Quick check pushes a real 'running' state into the drawer over SSE, not a poll", async ({ page }) => {
  // Also placed before "Trigger auto run and Quick check..." below, for
  // the same shared-server reason as the test above - this one would
  // otherwise see quickCheck immediately skipped (isAutoRunInProgress
  // already true from that other test), never reaching "Running" at all.
  //
  // Deliberately does NOT wait for the quick check to actually finish -
  // the underlying script shells out to `gh`, which can hang for a long
  // time (or indefinitely) with no real GitHub network/auth available in
  // whatever environment runs this suite. runViewPrsQuickCheck's own
  // "start" SSE emit fires synchronously, right after its in-memory guards
  // pass and before any of that network work begins (see app.js) - waiting
  // only for "Running" to appear proves the same real push end-to-end
  // without depending on how long (or whether) the job itself completes.
  await page.goto("/");
  await waitForPrTable(page);

  await page.getByRole("button", { name: /Activity/ }).click();
  const quickCheckRow = page
    .getByRole("region", { name: "Activity panel", exact: true })
    .getByRole("group", { name: "Quick check", exact: true });
  await expect(quickCheckRow.getByRole("status")).toHaveText("Idle");

  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByTestId("quick-check-button").click();

  await expect(quickCheckRow.getByRole("status")).toHaveText("Running", {
    timeout: 10000,
  });
});

test("Trigger auto run and Quick check buttons click, show a transient state, and settle back to enabled", async ({ page }) => {
  // Deferred-items follow-up (full vanilla-to-React sweep, see
  // REACT_MIGRATION_PLAN.md): both buttons are now React-owned
  // (TriggerAutoRunButton.jsx/QuickCheckButton.jsx), replacing
  // index.page.js's own direct `btn.disabled`/`.textContent` mutation - no
  // e2e coverage existed for either button before this conversion.
  await page.goto("/");
  await waitForPrTable(page);

  const triggerBtn = page.getByTestId("trigger-auto-run-button");
  await expect(triggerBtn).toHaveText("Trigger auto run");
  await triggerBtn.click();
  await expect(triggerBtn).toHaveText("Trigger auto run", { timeout: 5000 });
  await expect(triggerBtn).toBeEnabled();

  await page.getByRole("tab", { name: "Run & Filter" }).click();
  const quickCheckBtn = page.getByTestId("quick-check-button");
  await expect(quickCheckBtn).toHaveText("Quick check");
  await quickCheckBtn.click();
  await expect(quickCheckBtn).toBeEnabled({ timeout: 5000 });
});
