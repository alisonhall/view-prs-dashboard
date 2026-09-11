const { test, expect } = require("@playwright/test");

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

// "Apply filters (local)" persists via a fire-and-forget PUT
// (`void persistViewFilterOptionOverrides()` in index.page.js) - it
// doesn't block the click handler, so a fixed `waitForTimeout` after
// clicking is a race: real webServer/network latency can make the PUT
// land after the next step already ran. Since this suite's webServer is
// one long-lived process shared by every test (see playwright.config.js's
// isolation comment), a persisted value a test leaves behind by ending
// before its own PUT actually completed doesn't just risk flaking that
// test - it can silently change what a *later*, unrelated test sees on
// its own fresh page load. Wait for the real response instead.
const clickApplyFiltersAndWaitForPersist = async (page) => {
  const [response] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/view-prs/user-defaults") && res.request().method() === "PUT",
    ),
    page.getByRole("button", { name: "Apply filters (local)" }).click(),
  ]);
  return response;
};

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

test("page loads, PR table renders, and no requests or console calls fail", async ({ page }) => {
  const { consoleErrors, failedRequests } = collectPageErrors(page);

  await page.goto("/");
  await page.waitForSelector("#pr-sections tr", { state: "attached", timeout: 15_000 });

  const rowCount = await page.locator("#pr-sections tr").count();
  expect(rowCount).toBeGreaterThan(0);

  // data-meta should show the applied-filters summary, not be stuck on the
  // initial "Loading..." placeholder (regression guard: the React render
  // path used to skip the vanilla pipeline step that sets this text).
  await expect(page.locator("#data-meta")).not.toHaveText("Loading...");

  expect(failedRequests).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("non-ASCII glyphs render correctly (charset regression guard)", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector("#pr-sections tr", { state: "attached", timeout: 15_000 });

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
  await page.waitForSelector("#pr-sections tr", { state: "attached", timeout: 15_000 });

  // Flagged/in-review checkboxes live in the smart groups, open by default.
  const checkbox = page
    .locator('#pr-sections input[type="checkbox"][aria-label^="In Review for PR"]:visible')
    .first();
  await expect(checkbox).toHaveCount(1);
  const before = await checkbox.isChecked();
  await checkbox.click();
  await expect(checkbox).toHaveJSProperty("checked", !before);

  const insightsToggle = page.locator(".row-insights-toggle:visible").first();
  await insightsToggle.click();
  await expect(insightsToggle).toHaveAttribute("aria-expanded", "true");

  expect(consoleErrors).toEqual([]);
});

test("lifecycle section expand/collapse and tab switching work", async ({ page }) => {
  const { consoleErrors } = collectPageErrors(page);

  await page.goto("/");
  await page.waitForSelector("#pr-sections tr", { state: "attached", timeout: 15_000 });

  const openSection = page.locator('[data-pr-section="open"]');
  await expect(openSection).toHaveJSProperty("open", false);
  await openSection.locator("summary").click();
  await expect(openSection).toHaveJSProperty("open", true);

  await page.getByRole("tab", { name: "Review statistics" }).click();
  await expect(page.locator("#tab-panel-review-stats")).toBeVisible();

  await page.getByRole("tab", { name: "Author Insights" }).click();
  await expect(page.locator("#tab-panel-author-insights")).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

test("Run & Filter dropdowns populate from loaded PR data", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector("#pr-sections tr", { state: "attached", timeout: 15_000 });

  await page.getByRole("tab", { name: "Run & Filter" }).click();

  const authorOptionCount = await page.locator("#author-list input[type='checkbox']").count();
  expect(authorOptionCount).toBeGreaterThan(0);
});

test("Apply filters (local) actually filters the rendered table, not just the summary line", async ({ page }) => {
  // Regression test: the React rendering path used to always show every
  // stored PR for the repo, completely ignoring "Apply filters (local)" -
  // only the data-meta summary text reflected the filter, because vanilla
  // computed the filtered set but never told React about it. This only
  // showed up in a real browser: jsdom-based tests never exercise the
  // React rendering path at all (window.ReactMountBridge doesn't exist
  // there), so this bug was invisible to the full jsdom suite.
  await page.goto("/");
  await page.waitForSelector("#pr-sections tr", { state: "attached", timeout: 15_000 });

  await expect(page.locator("#pr-sections")).toContainText("Add welcome banner");
  await expect(page.locator("#pr-sections")).toContainText("Fix flaky test");

  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.locator("#filter-pr-numbers").fill("1");
  await clickApplyFiltersAndWaitForPersist(page);
  await page.getByRole("tab", { name: "PR data" }).click();

  await expect(page.locator("#data-meta")).toContainText("Rows: 1");
  await expect(page.locator("#pr-sections")).toContainText("Add welcome banner");
  await expect(page.locator("#pr-sections")).not.toContainText("Fix flaky test");

  // Clear and re-persist, so this test's filter doesn't hide PR #2/#3 from
  // whatever unrelated test happens to load next against this suite's one
  // shared webServer - restored filters now actually re-apply on load
  // (see setNativeValueAndDispatch in index.page.js), so a leftover
  // persisted filter here isn't just cosmetic for the next test anymore.
  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.locator("#filter-pr-numbers").fill("");
  await clickApplyFiltersAndWaitForPersist(page);
});

test("Request more merged PRs button renders (lives outside the React-owned table)", async ({ page }) => {
  // Regression test: this button is a static sibling of #pr-sections,
  // toggled by the vanilla pipeline - it used to only be appended as part
  // of building the vanilla <table> markup, a step skipped entirely when
  // React renders the table, so the button was simply absent in the real
  // (React) UI despite the default scope ("all stored rows") making it
  // eligible to show.
  await page.goto("/");
  await page.waitForSelector("#pr-sections tr", { state: "attached", timeout: 15_000 });

  await expect(page.locator("#merged-request-more-btn")).toBeVisible();
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
  await page.waitForSelector("#pr-sections tr", { state: "attached", timeout: 15_000 });

  // Checks the `hidden` DOM property directly (not Playwright's
  // toBeVisible/toBeHidden) because this test verifies the React prop
  // wiring, not whether a human could currently see the row - PR #1 can
  // legitimately be sitting inside a collapsed lifecycle section
  // (collapsed by default, and its exact section/smart-group membership
  // can shift as other tests in this suite toggle its flagged/in-review
  // state against the same shared dev server) without that being a
  // regression in this feature.
  const pr1Indicator = page.locator('[data-pr-number="1"] .pr-progress-indicator').first();
  await expect(pr1Indicator).toHaveJSProperty("hidden", true);

  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent("pr-active-progress-update", { detail: { activePrNumbers: ["1"] } }),
    );
  });

  await expect(pr1Indicator).toHaveJSProperty("hidden", false);
});

test("'View in table' from Author Insights actually expands the insights row content", async ({ page }) => {
  // Regression test: vanilla's navigateToPrInTable finds the PR's row and
  // directly flips `.hidden`/textContent on the insights <tr> and toggle
  // button. Under React that left the toggle button claiming
  // aria-expanded="true" while the insights row stayed hidden (React's own
  // expandedInsights state never changed), so the click looked like it
  // worked but revealed nothing. It now dispatches
  // 'pr-navigate-to-insights' for PrTableApp to handle via its own state.
  await page.goto("/");
  await page.waitForSelector("#pr-sections tr", { state: "attached", timeout: 15_000 });

  await page.getByRole("tab", { name: "Author Insights" }).click();
  const tableLink = page.locator(".author-insights-table-link").first();
  await tableLink.waitFor();
  await tableLink.click();

  const expandedToggle = page.locator('.row-insights-toggle[aria-expanded="true"]').first();
  await expect(expandedToggle).toBeAttached();
  const insightsRow = expandedToggle.locator(
    "xpath=ancestor::tr[1]/following-sibling::tr[contains(@class,'insights-row')][1]",
  );
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
  await page.waitForSelector("#pr-sections tr", { state: "attached", timeout: 15_000 });

  await page.getByRole("tab", { name: "Run & Filter" }).click();
  const input = page.locator("#filter-pr-numbers");
  await input.fill("1");
  await clickApplyFiltersAndWaitForPersist(page);

  await page.reload();
  await page.waitForSelector("#pr-sections tr", { state: "attached", timeout: 15_000 });
  await page.getByRole("tab", { name: "Run & Filter" }).click();

  await expect(page.locator("#filter-pr-numbers")).toHaveValue("1");

  // Clear it and leave that persisted too, so this test's filter doesn't
  // hide PR #2/#3 from whatever unrelated test happens to load next
  // against this suite's one shared webServer.
  await page.locator("#filter-pr-numbers").fill("");
  await clickApplyFiltersAndWaitForPersist(page);
});

test("React-owned scope <select> survives a persisted-value restore, and selecting still applies filters", async ({ page }) => {
  // Same restore-race class as the PR-number filter test above, this time
  // for a <select> (Phase 2's second slice) - confirms the fix generalizes
  // beyond <input>. <select> elements need a native 'change' event
  // dispatched (not just 'input') for React to notice an externally-set
  // value; see setNativeValueAndDispatch in index.page.js.
  await page.goto("/");
  await page.waitForSelector("#pr-sections tr", { state: "attached", timeout: 15_000 });

  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.selectOption("#scope-mode", "last-run");
  await clickApplyFiltersAndWaitForPersist(page);

  await page.reload();
  await page.waitForSelector("#pr-sections tr", { state: "attached", timeout: 15_000 });
  await page.getByRole("tab", { name: "Run & Filter" }).click();

  await expect(page.locator("#scope-mode")).toHaveValue("last-run");

  // Confirm the restored control still works, not just its displayed value,
  // and leave scope back at the "all" default so this test's persisted
  // state doesn't affect whatever unrelated test happens to load next
  // against this suite's one shared webServer.
  await page.selectOption("#scope-mode", "all");
  await clickApplyFiltersAndWaitForPersist(page);
  await expect(page.locator("#data-meta")).toContainText("scope=all stored rows");
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
  await page.waitForSelector("#pr-sections tr", { state: "attached", timeout: 15_000 });

  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByText("Advanced visibility and attention rules").click();
  const checkbox = page.locator("#always-show-in-review");
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  await clickApplyFiltersAndWaitForPersist(page);

  await page.reload();
  await page.waitForSelector("#pr-sections tr", { state: "attached", timeout: 15_000 });
  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByText("Advanced visibility and attention rules").click();

  await expect(page.locator("#always-show-in-review")).toBeChecked();

  // Confirm the restored control still works, and leave it back at the
  // unchecked default so this test's persisted state doesn't affect
  // whatever unrelated test happens to load next against this suite's one
  // shared webServer.
  await page.locator("#always-show-in-review").uncheck();
  await clickApplyFiltersAndWaitForPersist(page);
  await expect(page.locator("#always-show-in-review")).not.toBeChecked();
});

test("React-owned Needs Attention rule controls (select + checkbox batch) survive a persisted restore together", async ({ page }) => {
  // One representative test for the whole "Needs Attention rules" batch
  // (AttentionNoActivityModeSelect + 5x AttentionRuleCheckbox) rather than
  // one test per field - same pattern/fixes already covered individually
  // above, this confirms they also work correctly when several such
  // controls restore together on the same page load and a field NOT in
  // the persisted overrides correctly keeps its own default.
  await page.goto("/");
  await page.waitForSelector("#pr-sections tr", { state: "attached", timeout: 15_000 });

  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByText("Advanced visibility and attention rules").click();

  await page.selectOption("#attention-no-activity-mode", "none");
  await page.locator("#attention-include-pending-comments").uncheck();
  await page.locator("#attention-include-draft-no-activity").check();
  await clickApplyFiltersAndWaitForPersist(page);

  await page.reload();
  await page.waitForSelector("#pr-sections tr", { state: "attached", timeout: 15_000 });
  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByText("Advanced visibility and attention rules").click();

  await expect(page.locator("#attention-no-activity-mode")).toHaveValue("none");
  await expect(page.locator("#attention-include-pending-comments")).not.toBeChecked();
  await expect(page.locator("#attention-include-draft-no-activity")).toBeChecked();
  // Untouched field - should still show its unpersisted default (checked).
  await expect(page.locator("#attention-include-closed-merged")).toBeChecked();

  // Reset everything back to defaults so this test's persisted state
  // doesn't affect whatever unrelated test loads next.
  await page.selectOption("#attention-no-activity-mode", "all");
  await page.locator("#attention-include-pending-comments").check();
  await page.locator("#attention-include-draft-no-activity").uncheck();
  await clickApplyFiltersAndWaitForPersist(page);
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
  await page.waitForSelector("#pr-sections tr", { state: "attached", timeout: 15_000 });

  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await expect(page.locator("#data-meta")).toContainText("scope=all stored rows");

  await page.selectOption("#scope-mode", "last-run");
  await expect(page.locator("#data-meta")).toContainText("scope=last run rows");

  // Reset so this test's change doesn't affect whatever loads next.
  await page.selectOption("#scope-mode", "all");
  await expect(page.locator("#data-meta")).toContainText("scope=all stored rows");
});

test("React-owned change-filter \"use built-in merge pattern\" checkbox auto-persists on change and survives a restore", async ({ page }) => {
  // Regression coverage for the last checkbox converted (see
  // REACT_MIGRATION_PLAN.md): unlike the plain debouncedApplyOnChangeIds
  // fields, this one had (and still has) its own special-case persist
  // behavior - toggling it fires a real PUT to /view-prs/user-defaults
  // immediately, without clicking "Apply filters (local)" - so it needed
  // its own branch added to the delegated #run-script-form listener
  // (gotcha #3) rather than just joining the existing
  // debouncedApplyOnChangeIds set, which only re-filters and does not
  // persist. This test's first assertion (a real PUT firing on toggle
  // alone) is exactly what a direct, un-delegated addEventListener left on
  // the fallback node would silently fail to do once React replaced it.
  await page.goto("/");
  await page.waitForSelector("#pr-sections tr", { state: "attached", timeout: 15_000 });

  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByText("Advanced visibility and attention rules").click();

  const checkbox = page.locator("#change-filter-use-builtin-merge-pattern");
  await expect(checkbox).toBeChecked();

  await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/view-prs/user-defaults") && res.request().method() === "PUT",
    ),
    checkbox.uncheck(),
  ]);

  await page.reload();
  await page.waitForSelector("#pr-sections tr", { state: "attached", timeout: 15_000 });
  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByText("Advanced visibility and attention rules").click();

  await expect(page.locator("#change-filter-use-builtin-merge-pattern")).not.toBeChecked();

  // Reset so this test's persisted state doesn't affect whatever unrelated
  // test happens to load next against this suite's one shared webServer.
  await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/view-prs/user-defaults") && res.request().method() === "PUT",
    ),
    page.locator("#change-filter-use-builtin-merge-pattern").check(),
  ]);
});

test("React-owned \"ignore commit patterns\" textarea auto-persists on change and survives a restore", async ({ page }) => {
  // Regression coverage for the only <textarea> converted so far (see
  // REACT_MIGRATION_PLAN.md) - same special-case auto-persist-on-change
  // shape as the "Use built-in merge pattern" checkbox above (a real PUT
  // fires on blur/change alone, without clicking "Apply filters
  // (local)"), so it needed the same gotcha #3 delegated-listener branch.
  // Also confirms restoreUiOptionOverrides's fix for this field
  // specifically: it used to assign `textarea.value = ...` directly
  // instead of going through setText's native-setter-plus-event helper,
  // which would silently fail to notify a controlled React textarea.
  await page.goto("/");
  await page.waitForSelector("#pr-sections tr", { state: "attached", timeout: 15_000 });

  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByText("Advanced visibility and attention rules").click();

  const textarea = page.locator("#change-filter-ignore-commit-patterns");
  await expect(textarea).toHaveValue("");
  await textarea.fill("^docs:\n^test:");

  await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/view-prs/user-defaults") && res.request().method() === "PUT",
    ),
    textarea.blur(),
  ]);

  await page.reload();
  await page.waitForSelector("#pr-sections tr", { state: "attached", timeout: 15_000 });
  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByText("Advanced visibility and attention rules").click();

  await expect(page.locator("#change-filter-ignore-commit-patterns")).toHaveValue("^docs:\n^test:");

  // Reset so this test's persisted state doesn't affect whatever unrelated
  // test happens to load next against this suite's one shared webServer.
  const restoredTextarea = page.locator("#change-filter-ignore-commit-patterns");
  await restoredTextarea.fill("");
  await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/view-prs/user-defaults") && res.request().method() === "PUT",
    ),
    restoredTextarea.blur(),
  ]);
});

test("React-owned Run Script options (text inputs, select, checkboxes) survive a persisted restore together", async ({ page }) => {
  // Same restore-race class as the "Needs Attention rules" batch test
  // above, this time for the "Run Script options (rarely changed)" fields
  // (RunScriptTextInput x4, OpenModeSelect, FilterCheckbox x3). These
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
  await page.waitForSelector("#pr-sections tr", { state: "attached", timeout: 15_000 });

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
        "open-mode": "changed",
        "ack-changed": true,
        "show-reason": false,
        quiet: true,
      }),
    });
  });

  await page.reload();
  await page.waitForSelector("#pr-sections tr", { state: "attached", timeout: 15_000 });
  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByText("Run Script options (rarely changed)").click();

  await expect(page.locator("#repo")).toHaveValue("octocat/hello-world");
  await expect(page.locator("#limit")).toHaveValue("50");
  await expect(page.locator("#merged-limit")).toHaveValue("10");
  await expect(page.locator("#jobs")).toHaveValue("3");
  await expect(page.locator("#open-mode")).toHaveValue("changed");
  await expect(page.locator("#ack-changed")).toBeChecked();
  await expect(page.locator("#show-reason")).not.toBeChecked();
  await expect(page.locator("#quiet")).toBeChecked();

  // Reset back to defaults so this test's persisted state doesn't affect
  // whatever unrelated test happens to load next against this suite's one
  // shared webServer.
  await page.evaluate(async () => {
    const current = await (await fetch("/view-prs/user-defaults")).json();
    const overrides = { ...(current?.overrides || {}) };
    for (const key of ["repo", "limit", "merged-limit", "jobs", "open-mode", "ack-changed", "show-reason", "quiet"]) {
      delete overrides[key];
    }
    await fetch("/view-prs/user-defaults", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(overrides),
    });
  });
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
  await page.waitForSelector("#pr-sections tr", { state: "attached", timeout: 15_000 });

  await expect(page.locator("#pr-sections")).toContainText("Add welcome banner");
  await expect(page.locator("#pr-sections")).toContainText("Fix flaky test");

  await page.getByRole("tab", { name: "Run & Filter" }).click();
  // updateMultiSelectSummary (pr-filter-panel.component.js) always
  // re-derives the summary's base text as everything before the first "(",
  // which strips the "(s)" from the original "Filter by label name(s)"
  // markup the very first time it runs (pre-existing behavior, unrelated
  // to this conversion) - the on-screen text is "Filter by label name"
  // from then on, not the initial HTML's "(s)".
  const labelDropdownSummary = page.locator("#label-list").locator("xpath=ancestor::details[1]/summary");
  await labelDropdownSummary.click();

  const labelList = page.locator("#label-list");
  await expect(labelList.locator("input[type='checkbox']")).toHaveCount(3);
  await expect(labelList).toContainText("enhancement");
  await expect(labelList).toContainText("bug");
  await expect(labelList).toContainText("dependencies");

  await labelList.getByLabel("enhancement", { exact: true }).check();
  await clickApplyFiltersAndWaitForPersist(page);

  await expect(page.locator("#pr-sections")).toContainText("Add welcome banner");
  await expect(page.locator("#pr-sections")).not.toContainText("Fix flaky test");

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
  await page.waitForSelector("#pr-sections tr", { state: "attached", timeout: 15_000 });
  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await labelDropdownSummary.click();
  await expect(labelList.getByLabel("enhancement", { exact: true })).toBeChecked();

  // Reset so this test's filter doesn't hide PRs from whatever unrelated
  // test happens to load next against this suite's one shared webServer.
  await labelList.getByLabel("enhancement", { exact: true }).uncheck();
  await clickApplyFiltersAndWaitForPersist(page);
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
  await page.waitForSelector("#pr-sections tr", { state: "attached", timeout: 15_000 });

  await page.getByRole("tab", { name: "Run & Filter" }).click();

  const excludeLabelList = page.locator("#exclude-label-list");
  const authorList = page.locator("#author-list");
  const assignedList = page.locator("#assigned-list");
  const approverList = page.locator("#approver-list");
  // setupMultiSelectDropdownClosing (pr-filter-panel.component.js) closes
  // every OTHER open <details class="multi-select-dropdown"> on any click
  // outside it - opening one dropdown, leaving it open, and then opening
  // the next closes the first, so each dropdown must be (re-)opened
  // immediately before the interaction that needs it visible.
  const openDropdown = (list) => list.locator("xpath=ancestor::details[1]/summary").click();

  await openDropdown(excludeLabelList);
  await expect(excludeLabelList.locator("input[type='checkbox']")).toHaveCount(3);

  await openDropdown(authorList);
  await expect(authorList.locator("input[type='checkbox']")).toHaveCount(3);
  // Display names come from resolveActorDisplayName, which resolves via a
  // server-side actor-name-cache learned from *any* occurrence of a login
  // (assignee/approver/author alike) - since this fixture also lists
  // "octocat" as an assignee named "The Octocat" and "hubot" as an
  // approver named "Hubot", the author list shows those learned display
  // names too, not the raw logins.
  await expect(authorList).toContainText("The Octocat");
  await expect(authorList).toContainText("Hubot");

  await openDropdown(assignedList);
  await expect(assignedList.locator("input[type='checkbox']")).toHaveCount(1);
  await expect(assignedList).toContainText("The Octocat");

  await openDropdown(approverList);
  await expect(approverList.locator("input[type='checkbox']")).toHaveCount(2);
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
  await page.waitForSelector("#pr-sections tr", { state: "attached", timeout: 15_000 });
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
  // happens to load next against this suite's one shared webServer.
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
  // (not pr-filter-panel.component.js), which is a different call site
  // feeding the same MultiSelectCheckboxList/flushSync bridge - this test
  // confirms the conversion works from that call site too, not just that
  // the bridge itself works (already proven above).
  await page.goto("/");
  await page.waitForSelector("#pr-sections tr", { state: "attached", timeout: 15_000 });

  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByText("Advanced visibility and attention rules").click();

  // The allow/deny lists are only visible while their <details> wrapper is
  // shown, which updateAuthorThreadResolutionRuleVisibility ties to the
  // mode select's value (see the dedicated test for that behavior below) -
  // switch modes to reveal each list in turn.
  const allowList = page.locator("#attention-author-thread-resolution-allow-list");
  const denyList = page.locator("#attention-author-thread-resolution-deny-list");
  const ignoreCommentAuthorsList = page.locator("#change-filter-ignore-comment-authors-list");
  const ignoreReviewAuthorsList = page.locator("#change-filter-ignore-review-authors-list");
  const openDropdown = (list) => list.locator("xpath=ancestor::details[1]/summary").click();

  await page.selectOption("#attention-author-thread-resolution-mode", "allow-only");
  await expect(allowList.locator("input[type='checkbox']")).toHaveCount(3);
  await expect(allowList).toContainText("The Octocat");

  await page.selectOption("#attention-author-thread-resolution-mode", "deny-only");
  await expect(denyList.locator("input[type='checkbox']")).toHaveCount(3);
  await expect(denyList).toContainText("Hubot");

  await openDropdown(ignoreCommentAuthorsList);
  await expect(ignoreCommentAuthorsList.locator("input[type='checkbox']")).toHaveCount(3);
  await openDropdown(ignoreReviewAuthorsList);
  await expect(ignoreReviewAuthorsList.locator("input[type='checkbox']")).toHaveCount(3);

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
  await page.waitForSelector("#pr-sections tr", { state: "attached", timeout: 15_000 });
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
  // listener) as a fire-and-forget PUT, so each selectOption call above
  // already queued its own persist of whatever mode was selected at the
  // time - reset the mode *last* and explicitly wait for that PUT to land
  // (clickApplyFiltersAndWaitForPersist's same reasoning), or an earlier
  // in-flight persist could resolve after this block's own PUT and
  // silently leave a non-default mode persisted for the next test.
  await page.evaluate(async () => {
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
  });
  await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/view-prs/user-defaults") && res.request().method() === "PUT",
    ),
    page.selectOption("#attention-author-thread-resolution-mode", "allow-all"),
  ]);
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
  await page.waitForSelector("#pr-sections tr", { state: "attached", timeout: 15_000 });

  await expect(page.locator("#pr-sections")).toContainText("Add welcome banner");
  await expect(page.locator("#pr-sections")).toContainText("Fix flaky test");

  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.selectOption("#filter-pr-difficulty", "3");
  await clickApplyFiltersAndWaitForPersist(page);

  await expect(page.locator("#pr-sections")).toContainText("Add welcome banner");
  await expect(page.locator("#pr-sections")).not.toContainText("Fix flaky test");

  // Reset so this test's filter doesn't hide PRs from whatever unrelated
  // test happens to load next against this suite's one shared webServer.
  await page.selectOption("#filter-pr-difficulty", "");
  await clickApplyFiltersAndWaitForPersist(page);
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
  await page.waitForSelector("#pr-sections tr", { state: "attached", timeout: 15_000 });

  await page.getByRole("tab", { name: "Run & Filter" }).click();
  await page.getByText("Advanced visibility and attention rules").click();

  const allowOptions = page.locator("#attention-author-thread-resolution-allow-options");
  const denyOptions = page.locator("#attention-author-thread-resolution-deny-options");
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
