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
  await page.getByRole("button", { name: "Apply filters (local)" }).click();
  await page.getByRole("tab", { name: "PR data" }).click();

  await expect(page.locator("#data-meta")).toContainText("Rows: 1");
  await expect(page.locator("#pr-sections")).toContainText("Add welcome banner");
  await expect(page.locator("#pr-sections")).not.toContainText("Fix flaky test");
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
