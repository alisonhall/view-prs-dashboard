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
 * to gate every CI run. Exits 1 when the heap grows more than
 * MAX_GROWTH_RATIO, or when the page never fetched one of the server data
 * changes (see below). Runs on demand in CI via the "Heap stability"
 * workflow (.github/workflows/heap-stability.yml, Actions tab -> Run
 * workflow). Run locally via `npm run stability:heap-check`, or
 * directly: `node e2e/stability/long-session-heap-check.js [--cycles=200]
 * [--sample-every=10] [--dataset-size=40] [--data-change-every=1]`.
 *
 * Each cycle also (every --data-change-every cycles; 0 disables) rewrites
 * the server's data file with ~10% of PRs changed and waits for the page's
 * own poll to fetch it. Interactions alone never deliver a fresh payload
 * from the server, so they could not catch the leak that retained one full
 * payload per data change (the Chrome/Edge "Error code: 5" crash, see
 * REACT_MIGRATION_PLAN.md) - real tabs get one on every auto-refresh and
 * every other tab's write. The data poll interval is shortened in the page
 * so this doesn't wait 30s per change.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { chromium } = require("@playwright/test");

const REPO_ROOT = path.resolve(__dirname, "..", "..");

function parseArgs(argv) {
  const args = { cycles: 200, sampleEvery: 10, datasetSize: 40, dataChangeEvery: 1 };
  argv.forEach((arg) => {
    const match = arg.match(/^--([a-z-]+)=(\d+)$/);
    if (!match) return;
    const key = match[1];
    const value = Number(match[2]);
    if (key === "cycles") args.cycles = value;
    if (key === "sample-every") args.sampleEvery = value;
    if (key === "dataset-size") args.datasetSize = value;
    if (key === "data-change-every") args.dataChangeEvery = value;
  });
  return args;
}

const REPO = "owner/repo";
const DATA_POLL_MS = 300;
// Last-quartile mean heap over first-quartile mean above this exits 1.
// Measured on the default run: 1.11x with the payload-chaining leak fixed,
// 1.72x with it (see REACT_MIGRATION_PLAN.md).
const MAX_GROWTH_RATIO = 1.5;

// `generation` 0 is the initial dataset. Each later generation changes a
// different ~10% of PRs (new timestamp, fingerprint and title), so the
// page's poll sees a real delta to fetch and render, like a real refresh.
function buildDataset(n, generation = 0) {
  const byPrNumber = {};
  for (let i = 1; i <= n; i += 1) {
    const changed = generation > 0 && (i + generation) % 10 === 0;
    const version = changed ? generation : 0;
    const updatedAt = new Date(Date.UTC(2026, 0, 1) + version * 60000).toISOString();
    byPrNumber[String(i)] = {
      prNumber: String(i),
      repo: REPO,
      section: i % 4 === 0 ? "closed" : i % 3 === 0 ? "merged" : "open",
      updatedAt,
      rowOrder: i,
      data: {
        number: String(i),
        title: `PR title ${i} v${version}`,
        titleDisplay: `PR title ${i} [CHK:PASS][MRG:YES]`,
        url: `https://github.com/${REPO}/pull/${i}`,
        mergedAt: "",
        closedAt: "",
        sourceUpdatedAt: updatedAt,
        sourceFingerprint: `fp:${i}:${version}`,
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
  return {
    byPrNumber,
    lastRun: { repo: REPO, updatedAt: new Date(Date.UTC(2026, 0, 1) + generation * 60000).toISOString() },
  };
}

// Writes the next generation and waits for the page's own poll to fetch
// it (the delta endpoint, or the full-data fallback). Returns false if no
// fetch arrived in time, so a run that silently stopped exercising this
// path fails instead of passing as "flat".
async function applyServerDataChange(page, dataFile, datasetSize, generation) {
  const fetched = page
    .waitForResponse(
      (res) => ["/view-prs/data", "/view-prs/data-delta"].includes(new URL(res.url()).pathname),
      { timeout: 10000 },
    )
    .then(() => true, () => false);
  fs.writeFileSync(dataFile, JSON.stringify(buildDataset(datasetSize, generation)));
  const ok = await fetched;
  // Let the render that follows the fetch commit before the next step.
  await page.waitForTimeout(100);
  return ok;
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
  const prTables = page.getByRole("region", { name: "Pull requests", exact: true });

  // Toggle In review on the first visible row - the cheapest way to
  // exercise a real render/update per cycle (real click -> real POST
  // /view-prs/ack -> real payload update), without waiting on the data
  // poll's interval. (A toggle button since the UI redesign's phase 2; the
  // checkbox this used to look for no longer exists.)
  const inReview = prTables.getByRole("button", { name: /^In Review for PR #/ }).first();
  if (await inReview.count()) {
    await inReview.click();
    await page.waitForTimeout(50);
  }

  // The detail pane (UI_REDESIGN_PLAN.md, phase 4): ↓ from the first PR
  // link selects that row, or the next one when it's already selected, so
  // each cycle swaps the PR the pane shows and remounts its content; the
  // tab changes in turn too.
  const firstLink = prTables.getByRole("table").first().getByRole("link", { name: /^#\d+$/ }).first();
  if (await firstLink.count()) {
    await firstLink.focus();
    await page.keyboard.press("ArrowDown");
    const tabName = ["Overview", "Activity", "Conversations", "Notes"][cycleIndex % 4];
    const tab = prTables.getByRole("complementary").getByRole("tab", { name: new RegExp(`^${tabName}`) });
    if (await tab.count()) {
      await tab.click();
    }
  }

  if (cycleIndex % 5 === 0) {
    await page.getByRole("tab", { name: "Review stats" }).click();
    await page.getByRole("tab", { name: "Authors" }).click();
    await page.getByRole("tab", { name: "Pull requests" }).click();
  }

  if (cycleIndex % 10 === 0) {
    // The filter bar above the PR table (UI redesign phase 8): open it if
    // it's closed - it opens as it was left, so only the first time.
    const filterToggle = page.getByRole("region", { name: "Filters", exact: true }).getByRole("button", { name: /^Filters/ });
    if ((await filterToggle.getAttribute("aria-expanded")) !== "true") {
      await filterToggle.click();
    }

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
    `Long-session heap check: ${args.cycles} cycles, sampling every ${args.sampleEvery}, ${args.datasetSize} PRs, ` +
      (args.dataChangeEvery > 0 ? `server data change every ${args.dataChangeEvery} cycle(s)` : "no server data changes"),
  );

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "view-prs-stability-"));
  fs.mkdirSync(path.join(tempDir, "backups"), { recursive: true });
  const dataFile = path.join(tempDir, "check-open-pr-updates.data.json");
  fs.writeFileSync(dataFile, JSON.stringify(buildDataset(args.datasetSize)));
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
    VIEW_PRS_DATA_FILE: dataFile,
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

  // Both run on this script's own Node binary, not via `node`/`npx` on
  // PATH: on Windows `npx` is a .cmd shim that spawn() can't run without a
  // shell (ENOENT), and going through a shell would leave kill() stopping
  // the shell instead of the real server/Vite processes.
  const serverProc = spawn(process.execPath, ["src/server/server.js"], {
    cwd: REPO_ROOT,
    env: isolatedEnv,
    stdio: "ignore",
  });
  const viteProc = spawn(
    process.execPath,
    [path.join(REPO_ROOT, "node_modules/vite/bin/vite.js"), "--port", "3458", "--strictPort"],
    {
      cwd: REPO_ROOT,
      env: isolatedEnv,
      stdio: "ignore",
    },
  );

  let browser;
  try {
    await waitForServer("http://localhost:9000/view-prs/data", 30000);
    await waitForServer("http://localhost:3458/", 30000);

    browser = await chromium.launch();
    const page = await browser.newPage();
    // ?dataPollMs= makes PrDataPolling poll every DATA_POLL_MS instead of the
    // real 30s (see readDataPollMsOverride in components/PrDataPolling.jsx).
    // This used to pin window.AUTO_DATA_POLL_MS with an init script; that
    // global was removed by the window-bridge elimination work.
    await page.goto(`http://localhost:3458/?dataPollMs=${DATA_POLL_MS}`);
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

    let dataChanges = 0;
    let missedDataChanges = 0;
    for (let cycle = 1; cycle <= args.cycles; cycle += 1) {
      await runInteractionCycle(page, cycle);

      if (args.dataChangeEvery > 0 && cycle % args.dataChangeEvery === 0) {
        dataChanges += 1;
        if (!(await applyServerDataChange(page, dataFile, args.datasetSize, dataChanges))) {
          missedDataChanges += 1;
        }
      }

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
    if (args.dataChangeEvery > 0) {
      console.log(`Server data changes: ${dataChanges} (${missedDataChanges} not fetched by the page within 10s)`);
      if (missedDataChanges > 0) {
        // A flat heap from a run that never refreshed the payload proves
        // nothing about the payload-refresh path, so this fails too.
        console.log(
          "FAIL: some data changes were never fetched, so this run under-exercises the payload-refresh path - check that polling still works.",
        );
        process.exitCode = 1;
      }
    }
    if (ratio > MAX_GROWTH_RATIO) {
      console.log(
        `FAIL: heap grew more than ${MAX_GROWTH_RATIO}x across the run - worth a closer look (longer run, more cycles, or heap snapshot diffing) before concluding it's a real leak vs one-run noise.`,
      );
      // exitCode, not process.exit(): the finally below still has to stop
      // the browser, server and Vite.
      process.exitCode = 1;
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
