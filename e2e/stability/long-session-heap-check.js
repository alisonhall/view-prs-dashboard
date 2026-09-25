/**
 * Long-session stability check (see REACT_MIGRATION_PLAN.md, Phase 4).
 *
 * A single load (the existing "Memory usage" row in "Performance Targets")
 * only proves a *fresh* page is cheap - it says nothing about whether the
 * heap grows unboundedly as a real user keeps the tab open and keeps
 * interacting (event listeners never cleaned up, React roots never
 * unmounted, closures retaining stale payload state, etc.). This drives a
 * real browser through many cycles of real interactions against an
 * isolated server (same env-var isolation pattern as playwright.config.js
 * - never touches real data/*.json) and samples the JS heap via the
 * Chrome DevTools Protocol, forcing a GC pass before each sample so a
 * reading reflects retained memory rather than not-yet-collected garbage.
 *
 * Standalone script (not a `.spec.js`/`.test.js` file), so `npx playwright
 * test` never picks it up - it's deliberately long-running and not meant
 * to gate every CI run. Run via `npm run stability:heap-check`, or
 * directly: `node e2e/stability/long-session-heap-check.js [--cycles=200]
 * [--sample-every=10] [--dataset-size=40]`.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { chromium } = require("@playwright/test");

const REPO_ROOT = path.resolve(__dirname, "..", "..");

function parseArgs(argv) {
  const args = { cycles: 200, sampleEvery: 10, datasetSize: 40 };
  argv.forEach((arg) => {
    const match = arg.match(/^--([a-z-]+)=(\d+)$/);
    if (!match) return;
    const key = match[1];
    const value = Number(match[2]);
    if (key === "cycles") args.cycles = value;
    if (key === "sample-every") args.sampleEvery = value;
    if (key === "dataset-size") args.datasetSize = value;
  });
  return args;
}

const REPO = "owner/repo";

function buildDataset(n) {
  const byPrNumber = {};
  for (let i = 1; i <= n; i += 1) {
    byPrNumber[String(i)] = {
      prNumber: String(i),
      repo: REPO,
      section: i % 4 === 0 ? "closed" : i % 3 === 0 ? "merged" : "open",
      updatedAt: "2026-01-01T00:00:00Z",
      rowOrder: i,
      data: {
        number: String(i),
        title: `PR title ${i}`,
        titleDisplay: `PR title ${i} [CHK:PASS][MRG:YES]`,
        url: `https://github.com/${REPO}/pull/${i}`,
        mergedAt: "",
        closedAt: "",
        sourceUpdatedAt: "2026-01-01T00:00:00Z",
        sourceFingerprint: `fp:${i}`,
        sourceBranch: `feature/${i}`,
        targetBranch: "main",
        checkState: "PASS",
        mergeState: "YES",
        labels: [i % 5 === 0 ? "bug" : "enhancement"],
        author: `author-${i % 10}`,
        authorLogin: `author-${i % 10}`,
        viewerLogin: "stability-viewer",
        status: "NO_CHANGE",
        approved: "NO",
        approvalCount: "0",
        inReview: "false",
        approvers: [{ login: `approver-${i % 8}`, name: `Approver ${i % 8}` }],
        requestedReviewers: [],
        assignees: [{ login: `assignee-${i % 6}`, name: `Assignee ${i % 6}` }],
        openConversationCount: "0",
        viewedFilesCount: "1",
        changedFilesCount: "1",
        additions: "10",
        deletions: "2",
        viewedFilesSummary: "1/1 viewed",
        comments: [],
        reviews: [],
        commits: [],
      },
    };
  }
  return { byPrNumber, lastRun: { repo: REPO, updatedAt: "2026-01-01T00:00:00Z" } };
}

async function waitForServer(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return true;
    } catch (_e) {
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Server at ${url} did not become ready in time`);
}

// One cycle of real, representative interactions - chosen to cover the
// render paths most likely to leak (event listeners, React root updates,
// closures over stale payload state), not to be exhaustive of every
// interaction in the app. See the plan's own reasoning for this mix.
async function runInteractionCycle(page, cycleIndex) {
  // Toggle an in-review checkbox on the first visible row - the cheapest
  // way to exercise a real render/update per cycle (real click -> real
  // POST /view-prs/ack -> real renderPrData update), without waiting on
  // AUTO_DATA_POLL_MS's real interval.
  const checkbox = page
    .locator('#pr-sections input[type="checkbox"][aria-label^="In Review for PR"]:visible')
    .first();
  if (await checkbox.count()) {
    await checkbox.click();
    await page.waitForTimeout(50);
  }

  if (cycleIndex % 5 === 0) {
    await page.getByRole("tab", { name: "Review statistics" }).click();
    await page.getByRole("tab", { name: "Author Insights" }).click();
    await page.getByRole("tab", { name: "PR data" }).click();
  }

  if (cycleIndex % 10 === 0) {
    // "Run & Filter" is a separate (management) tab group from the
    // PR data/Review stats/Author Insights "Data Views" tabs switched
    // above - #filter-pr-numbers/#label-list are only visible once it's
    // selected.
    await page.getByRole("tab", { name: "Run & Filter" }).click();

    const filterInput = page.locator("#filter-pr-numbers");
    await filterInput.fill("1");
    await filterInput.fill("");

    const labelSummary = page
      .locator("#label-list")
      .locator("xpath=ancestor::details[1]/summary");
    if (await labelSummary.count()) {
      await labelSummary.click();
      const firstLabelCheckbox = page
        .locator("#label-list input[type='checkbox']")
        .first();
      if (await firstLabelCheckbox.count()) {
        await firstLabelCheckbox.click();
        await firstLabelCheckbox.click();
      }
      await labelSummary.click();
    }
  }
}

function summarize(samples) {
  const quartileSize = Math.max(1, Math.floor(samples.length / 4));
  const firstQuartile = samples.slice(0, quartileSize);
  const lastQuartile = samples.slice(-quartileSize);
  const mean = (arr) => arr.reduce((sum, s) => sum + s.jsHeapUsedSize, 0) / arr.length;
  const startMean = mean(firstQuartile);
  const endMean = mean(lastQuartile);
  const ratio = endMean / startMean;
  return { startMean, endMean, ratio };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(
    `Long-session heap check: ${args.cycles} cycles, sampling every ${args.sampleEvery}, ${args.datasetSize} PRs`,
  );

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "view-prs-stability-"));
  fs.mkdirSync(path.join(tempDir, "backups"), { recursive: true });
  fs.writeFileSync(
    path.join(tempDir, "check-open-pr-updates.data.json"),
    JSON.stringify(buildDataset(args.datasetSize)),
  );
  fs.writeFileSync(
    path.join(tempDir, "check-open-pr-updates.user-state.json"),
    JSON.stringify({
      notesByPrNumber: {},
      ackByRepo: {},
      reverifyByRepo: {},
      flaggedByRepo: {},
      inReviewByRepo: {},
    }),
  );

  const isolatedEnv = {
    ...process.env,
    NODE_ENV: "test",
    VIEW_PRS_DATA_FILE: path.join(tempDir, "check-open-pr-updates.data.json"),
    VIEW_PRS_USER_STATE_FILE: path.join(tempDir, "check-open-pr-updates.user-state.json"),
    DATA_DIR: tempDir,
    VIEW_PRS_SCHEDULER_FILE: path.join(tempDir, "scheduler.json"),
    VIEW_PRS_ACTION_LOG_FILE: path.join(tempDir, "action-log.json"),
    VIEW_PRS_AUTHOR_COMMENTS_FILE: path.join(tempDir, "author-comments.json"),
    VIEW_PRS_ACTOR_NAME_CACHE_FILE: path.join(tempDir, "actor-name-cache.json"),
    VIEW_PRS_ACTOR_LOGIN_ALIASES_FILE: path.join(tempDir, "actor-login-aliases.json"),
    VIEW_PRS_BACKUP_DIR: path.join(tempDir, "backups"),
    VIEW_PRS_PR_DIFF_DIR: path.join(tempDir, "pr-diffs"),
    VIEW_PRS_PR_DETAIL_DIR: path.join(tempDir, "pr-details"),
    VIEW_PRS_USER_DEFAULTS_FILE: path.join(tempDir, "user-defaults.json"),
    VIEW_PRS_BACKFILL_PID_FILE: path.join(tempDir, "backfill-missing.pid"),
    VIEW_PRS_BACKFILL_LOG_FILE: path.join(tempDir, "backfill-missing.log"),
    VIEW_PRS_DISABLE_SCHEDULER_STARTUP: "1",
  };

  const serverProc = spawn("node", ["src/server/server.js"], {
    cwd: REPO_ROOT,
    env: isolatedEnv,
    stdio: "ignore",
  });
  const viteProc = spawn("npx", ["vite", "--port", "3458"], {
    cwd: REPO_ROOT,
    env: isolatedEnv,
    stdio: "ignore",
  });

  let browser;
  try {
    await waitForServer("http://localhost:9000/view-prs/data", 30000);
    await waitForServer("http://localhost:3458/", 30000);

    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto("http://localhost:3458/");
    await page.waitForSelector("#pr-sections tr", { state: "attached", timeout: 15000 });

    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    await cdp.send("HeapProfiler.enable");

    const sample = async (cycle) => {
      await cdp.send("HeapProfiler.collectGarbage");
      const { metrics } = await cdp.send("Performance.getMetrics");
      const jsHeapUsedSize = metrics.find((m) => m.name === "JSHeapUsedSize")?.value ?? 0;
      return { cycle, timestampMs: Date.now(), jsHeapUsedSize };
    };

    const samples = [await sample(0)];
    console.log(`cycle=0 heapMB=${(samples[0].jsHeapUsedSize / 1e6).toFixed(2)}`);

    for (let cycle = 1; cycle <= args.cycles; cycle += 1) {
      await runInteractionCycle(page, cycle);

      if (cycle % args.sampleEvery === 0) {
        const s = await sample(cycle);
        samples.push(s);
        console.log(`cycle=${cycle} heapMB=${(s.jsHeapUsedSize / 1e6).toFixed(2)}`);
      }
    }

    const { startMean, endMean, ratio } = summarize(samples);
    console.log("\n=== VERDICT ===");
    console.log(`Samples: ${samples.length}`);
    console.log(`First-quartile mean heap: ${(startMean / 1e6).toFixed(2)}MB`);
    console.log(`Last-quartile mean heap: ${(endMean / 1e6).toFixed(2)}MB`);
    console.log(`Ratio (end / start): ${ratio.toFixed(2)}x`);
    if (ratio > 1.5) {
      console.log(
        "Heap grew notably across the run - worth a closer look (longer run, more cycles, or heap snapshot diffing) before concluding it's a real leak vs one-run noise.",
      );
    } else {
      console.log("Heap stayed roughly flat across the run - no signal of a leak at this cycle count.");
    }
  } finally {
    if (browser) await browser.close();
    serverProc.kill();
    viteProc.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
