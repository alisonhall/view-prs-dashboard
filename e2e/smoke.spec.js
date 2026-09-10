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
