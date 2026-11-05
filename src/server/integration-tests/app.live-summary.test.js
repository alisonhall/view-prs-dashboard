const fs = require("fs");
const path = require("path");
const appModule = require("../app.js");

const {
  readViewPrsData,
  getViewPrsDataMeta,
  runViewPrsQuickCheck,
  setPendingForRepo,
  viewPrsSchedulerState,
  viewPrsSchedulerFile,
} = appModule;

// app-config.js puts the live summary beside the data file (both temp
// paths under jest.setup.env.js).
const dataFile = process.env.VIEW_PRS_DATA_FILE;
const liveSummaryFile = path.join(path.dirname(dataFile), "check-open-pr-updates.live-summary.json");

const writeData = () =>
  fs.writeFileSync(
    dataFile,
    JSON.stringify({
      lastRun: { repo: "acme/api", updatedAt: "2026-10-31T09:00:00Z" },
      byPrNumber: {
        12: {
          prNumber: "12",
          repo: "acme/api",
          section: "open",
          updatedAt: "2026-10-31T09:00:00Z",
          data: {
            number: "12",
            title: "Add widgets",
            checkState: "RUN",
            mergeState: "YES",
            titleDisplay: "Add widgets [CHK:RUN][MRG:YES]",
            sourceUpdatedAt: "2026-10-31T08:00:00Z",
          },
        },
      },
    }),
  );
const writeLiveSummary = (checkState = "PASS") =>
  fs.writeFileSync(
    liveSummaryFile,
    JSON.stringify({
      byRepo: {
        "acme/api": {
          checkedAt: "2026-10-31T10:00:00.000Z",
          prs: {
            12: {
              number: "12",
              title: "Add widgets",
              isDraft: false,
              updatedAt: "2026-10-31T08:00:00Z",
              labels: [],
              additions: "1",
              deletions: "0",
              changedFiles: "1",
              viewedFiles: null,
              checkState,
              mergeState: "YES",
              assignees: [],
              requestedReviewers: [],
              openConversationCount: null,
            },
          },
        },
      },
    }),
  );

const savedDependencyStatus = appModule.getDependencyStatus;
const savedRunViewPrsScript = appModule.runViewPrsScript;
const savedRefreshRepoLiveSummary = appModule.refreshRepoLiveSummary;
const savedDisable = process.env.VIEW_PRS_DISABLE_LIVE_SUMMARY;
const savedAutoRepos = process.env.VIEW_PRS_AUTO_REPOS;

beforeEach(() => {
  writeData();
  fs.rmSync(liveSummaryFile, { force: true });
  viewPrsSchedulerState.pendingByRepo = {};
});

afterAll(() => {
  fs.rmSync(liveSummaryFile, { force: true });
  fs.rmSync(dataFile, { force: true });
  viewPrsSchedulerState.pendingByRepo = {};
});

describe("the live summary laid over the rows", () => {
  test("a listing newer than the row's refresh shows the current CI state", () => {
    expect(readViewPrsData().byPrNumber["acme/api#12"].data.checkState).toBe("RUN");

    writeLiveSummary("PASS");

    const { data } = readViewPrsData().byPrNumber["acme/api#12"];
    expect(data.checkState).toBe("PASS");
    expect(data.titleDisplay).toBe("Add widgets [CHK:PASS][MRG:YES]");
    expect(data.live).toEqual({ updatedAt: "2026-10-31T08:00:00Z", detailsBehind: false, stillOpen: true });
    // When the repo was listed is in the data meta, with how often it's
    // listed (none: no quick check registered for it).
    expect(getViewPrsDataMeta().liveSummary).toEqual({
      "acme/api": {
        checkedAt: "2026-10-31T10:00:00.000Z",
        complete: false,
        lastError: null,
        lastErrorAt: null,
        quickCheckIntervalMs: null,
      },
    });
  });

  test("the data meta gives each listed repo its quick check's interval", () => {
    const savedDispatcher = viewPrsSchedulerState.dispatcher;
    try {
      viewPrsSchedulerState.dispatcher = {
        entries: { "acme/api::quickCheck": { repo: "acme/api", taskType: "quickCheck", intervalMs: 120000 } },
        reservedGhSlots: 0,
      };
      writeLiveSummary("PASS");
      expect(getViewPrsDataMeta().liveSummary["acme/api"].quickCheckIntervalMs).toBe(120000);
    } finally {
      viewPrsSchedulerState.dispatcher = savedDispatcher;
    }
  });

  test("the data meta gives every repo checked in the background its interval and pause, listed or not", () => {
    const savedDispatcher = viewPrsSchedulerState.dispatcher;
    const savedCircuits = viewPrsSchedulerState.autoCircuitByRepo;
    const pausedUntil = new Date(Date.now() + 10 * 60000).toISOString();
    try {
      viewPrsSchedulerState.dispatcher = {
        entries: {
          "acme/api::quickCheck": { repo: "acme/api", taskType: "quickCheck", intervalMs: 120000 },
          "acme/web::quickCheck": { repo: "acme/web", taskType: "quickCheck", intervalMs: 1800000 },
          "acme/web::autoRefresh": { repo: "acme/web", taskType: "autoRefresh", intervalMs: 900000 },
        },
        reservedGhSlots: 0,
      };
      viewPrsSchedulerState.autoCircuitByRepo = {
        "acme/web": { consecutiveFailures: 3, circuitOpenUntil: pausedUntil },
        // An old breaker that has closed again isn't a pause.
        "acme/api": { consecutiveFailures: 0, circuitOpenUntil: "2020-01-01T00:00:00.000Z" },
      };
      expect(getViewPrsDataMeta().backgroundUpdates).toEqual({
        "acme/api": { quickCheckIntervalMs: 120000, pausedUntil: null },
        "acme/web": { quickCheckIntervalMs: 1800000, pausedUntil },
      });
    } finally {
      viewPrsSchedulerState.dispatcher = savedDispatcher;
      viewPrsSchedulerState.autoCircuitByRepo = savedCircuits;
    }
  });

  test("a row whose CI a run fetched after the listing keeps that CI", () => {
    const data = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    data.byPrNumber["12"].fetchedAt = "2026-10-31T09:00:00Z";
    data.byPrNumber["12"].ciFetchedAt = "2026-10-31T10:02:00Z";
    fs.writeFileSync(dataFile, JSON.stringify(data));
    writeLiveSummary("PASS");
    expect(readViewPrsData().byPrNumber["acme/api#12"].data.checkState).toBe("RUN");
  });

  test("the data version the page polls changes with a new listing and with a newly queued PR", () => {
    const before = getViewPrsDataMeta().dataVersion;
    writeLiveSummary("PASS");
    const afterListing = getViewPrsDataMeta().dataVersion;
    expect(afterListing).not.toBe(before);

    setPendingForRepo("acme/api", { open: [12], mergedClosed: [] });
    expect(getViewPrsDataMeta().dataVersion).not.toBe(afterListing);
    expect(readViewPrsData().byPrNumber["acme/api#12"].data.updatePending).toBe(true);
  });
});

describe("quick checks list each repo's open PRs", () => {
  let listed;

  beforeEach(() => {
    listed = [];
    viewPrsSchedulerState.isQuickCheckInProgress = false;
    viewPrsSchedulerState.isAutoRunInProgress = false;
    viewPrsSchedulerState.autoRefreshInProgressRepos = new Set();
    viewPrsSchedulerState.quickCheckInProgressRepos = new Set();
    viewPrsSchedulerState.quickCheckSkippedRepos = new Set();
    viewPrsSchedulerState.autoCircuitByRepo = {};
    viewPrsSchedulerState.dispatcher = { entries: {}, reservedGhSlots: 0 };
    fs.rmSync(viewPrsSchedulerFile, { force: true });
    delete process.env.VIEW_PRS_DISABLE_LIVE_SUMMARY;
    process.env.VIEW_PRS_AUTO_REPOS = "acme/api,acme/web";
    appModule.getDependencyStatus = () => ({ ok: true, missing: [] });
    appModule.runViewPrsScript = async () => ({
      stdout: JSON.stringify({ pendingOpen: [], pendingMergedClosed: [] }),
      stderr: "",
    });
    appModule.refreshRepoLiveSummary = async (repo) => {
      listed.push(repo);
      return repo === "acme/web" ? { ok: false, error: "rate limited" } : { ok: true, prCount: 1 };
    };
  });

  afterAll(() => {
    appModule.getDependencyStatus = savedDependencyStatus;
    appModule.runViewPrsScript = savedRunViewPrsScript;
    appModule.refreshRepoLiveSummary = savedRefreshRepoLiveSummary;
    if (savedDisable === undefined) delete process.env.VIEW_PRS_DISABLE_LIVE_SUMMARY;
    else process.env.VIEW_PRS_DISABLE_LIVE_SUMMARY = savedDisable;
    if (savedAutoRepos === undefined) delete process.env.VIEW_PRS_AUTO_REPOS;
    else process.env.VIEW_PRS_AUTO_REPOS = savedAutoRepos;
  });

  test("every repo checked is listed; one failing listing doesn't fail the check", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const result = await runViewPrsQuickCheck();
      expect(listed.sort()).toEqual(["acme/api", "acme/web"]);
      expect(result.reposChecked.sort()).toEqual(["acme/api", "acme/web"]);
      expect(result.reposFailed).toEqual([]);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("live summary failed for acme/web: rate limited"));
    } finally {
      warn.mockRestore();
    }
  });

  test("a check of entered PR numbers doesn't list the repo", async () => {
    await runViewPrsQuickCheck({ repo: "acme/api", prNumbers: "12" });
    expect(listed).toEqual([]);
  });

  test("a PR whose review threads changed since its row was fetched is queued for update", async () => {
    // Resolving a thread doesn't move updatedAt, so the script finds nothing.
    const row = (number, openThreads) => ({
      prNumber: String(number),
      repo: "acme/api",
      section: "open",
      fetchedAt: "2026-10-31T09:00:00Z",
      updatedAt: "2026-10-31T09:00:00Z",
      data: { number: String(number), metrics: { conversationSummary: { openThreads } } },
    });
    fs.writeFileSync(dataFile, JSON.stringify({ byPrNumber: { 12: row(12, 2), 13: row(13, 1) } }));
    fs.writeFileSync(
      liveSummaryFile,
      JSON.stringify({
        byRepo: {
          "acme/api": {
            checkedAt: "2026-10-31T10:00:00.000Z",
            complete: true,
            prs: { 12: { number: "12", openConversationCount: "1" }, 13: { number: "13", openConversationCount: "1" } },
          },
        },
      }),
    );
    viewPrsSchedulerState.pendingByRepo = {};
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    let result;
    try {
      result = await runViewPrsQuickCheck({ repo: "acme/api" });
    } finally {
      warn.mockRestore();
      writeData();
      fs.rmSync(liveSummaryFile, { force: true });
    }
    // Only 12 (13's count hasn't changed). The dispatcher tick it starts
    // may already have refreshed it off the queue.
    expect(result).toMatchObject({ newPendingOpenCount: 1, reposWithPendingOpen: ["acme/api"] });
  });

  // Merged before the script's merged listing reaches back (while the app
  // was off, say): only the open listing shows it's gone.
  test("an open row the complete listing no longer has is queued as merged or closed, to be fetched again", async () => {
    const row = (number) => ({
      prNumber: String(number),
      repo: "acme/api",
      section: "open",
      fetchedAt: "2026-10-31T09:00:00Z",
      updatedAt: "2026-10-31T09:00:00Z",
      data: { number: String(number) },
    });
    fs.writeFileSync(dataFile, JSON.stringify({ byPrNumber: { "acme/api#12": row(12), "acme/api#20": row(20) } }));
    fs.writeFileSync(
      liveSummaryFile,
      JSON.stringify({ byRepo: { "acme/api": { checkedAt: "2026-10-31T10:00:00.000Z", complete: true, prs: { 12: { number: "12" } } } } }),
    );
    viewPrsSchedulerState.pendingByRepo = {};
    viewPrsSchedulerState.noLongerOpenQueuedAt = {};
    const savedTick = appModule.runDispatcherTick;
    appModule.runDispatcherTick = async () => {};
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    let result;
    let again;
    let afterCoolOff;
    try {
      result = await runViewPrsQuickCheck({ repo: "acme/api" });
      expect(viewPrsSchedulerState.pendingByRepo["acme/api"]).toMatchObject({ open: [], mergedClosed: ["20"] });
      // Its run couldn't fetch it, and took it off the queue: the next
      // check doesn't queue it again straight away...
      viewPrsSchedulerState.pendingByRepo = {};
      again = await runViewPrsQuickCheck({ repo: "acme/api" });
      // A listing cut off at its page limit doesn't say it's back, so
      // doesn't forget when it was queued...
      const summary = JSON.parse(fs.readFileSync(liveSummaryFile, "utf8"));
      summary.byRepo["acme/api"].complete = false;
      fs.writeFileSync(liveSummaryFile, JSON.stringify(summary));
      await runViewPrsQuickCheck({ repo: "acme/api" });
      expect(Object.keys(viewPrsSchedulerState.noLongerOpenQueuedAt)).toContain("acme/api#20");
      summary.byRepo["acme/api"].complete = true;
      fs.writeFileSync(liveSummaryFile, JSON.stringify(summary));
      // ...and it's queued again only once 6 hours have passed.
      viewPrsSchedulerState.noLongerOpenQueuedAt["acme/api#20"] = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();
      afterCoolOff = await runViewPrsQuickCheck({ repo: "acme/api" });
    } finally {
      warn.mockRestore();
      appModule.runDispatcherTick = savedTick;
      viewPrsSchedulerState.noLongerOpenQueuedAt = {};
      writeData();
      fs.rmSync(liveSummaryFile, { force: true });
    }
    expect(result).toMatchObject({ newPendingOpenCount: 0, newPendingMergedClosedCount: 1 });
    expect(again).toMatchObject({ newPendingMergedClosedCount: 0 });
    expect(afterCoolOff).toMatchObject({ newPendingMergedClosedCount: 1 });
  });

  test("VIEW_PRS_DISABLE_LIVE_SUMMARY turns it off", async () => {
    process.env.VIEW_PRS_DISABLE_LIVE_SUMMARY = "1";
    await runViewPrsQuickCheck();
    expect(listed).toEqual([]);
  });
});
