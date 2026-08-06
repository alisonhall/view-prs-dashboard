const fs = require("fs");
const path = require("path");
const {
  createViewPrsApp,
  initializeScheduler,
  runViewPrsAutoRefresh,
  viewPrsUiIndexFile,
  viewPrsDataFile,
  viewPrsPrDetailDir,
  viewPrsUserStateFile,
  viewPrsAuthorCommentsFile,
  viewPrsSchedulerFile,
  viewPrsActionLogFile,
  viewPrsBackupDir,
  getPrDiffCacheFilePath,
  getPrDiffCommitFingerprint,
  viewPrsSchedulerState,
} = require("../app.js");

const supertest = require("supertest");

const EMPTY_USER_STATE = {
  notesByPrNumber: {},
  ackByRepo: {},
  reverifyByRepo: {},
  inReviewByRepo: {},
  flaggedByRepo: {},
};

const writeViewPrsData = (data) => {
  fs.writeFileSync(viewPrsDataFile, JSON.stringify(data, null, 2));
};

const writeViewPrsUserState = (state = EMPTY_USER_STATE) => {
  fs.writeFileSync(viewPrsUserStateFile, JSON.stringify(state, null, 2));
};

describe("integration behavior", () => {
  jest.setTimeout(60000);
  let server, request;
  beforeAll(() => {
    writeViewPrsData({ byPrNumber: {}, lastRun: null });
    writeViewPrsUserState();
    fs.writeFileSync(viewPrsSchedulerFile, JSON.stringify({}, null, 2));

    const app = createViewPrsApp();
    server = app.listen(0);
    if (typeof server.unref === "function") {
      server.unref();
    }
    request = supertest(server);
  });
  afterAll((done) => {
    if (!server || !server.listening) {
      done();
      return;
    }
    if (typeof server.closeAllConnections === "function") {
      server.closeAllConnections();
    }
    if (typeof server.closeIdleConnections === "function") {
      server.closeIdleConnections();
    }
    server.close(done);
  });

  test("serves the main UI file when GET / is requested", async () => {
    const res = await request.get("/");
    expect(res.status).toBe(200);
    expect(res.type).toMatch(/html/);
    // Should serve the correct file
    const fileContent = fs.readFileSync(viewPrsUiIndexFile, "utf8");
    expect(res.text).toContain(fileContent.slice(0, 20));
  });

  test("persists notes when POST /notes receives a valid PR payload", async () => {
    const prNumber = "123";
    writeViewPrsData({
      byPrNumber: { [prNumber]: { repo: "owner/repo" } },
      lastRun: null,
    });
    writeViewPrsUserState();

    const res = await request.post("/notes").send({
      prNumber,
      comments: [{ author: "a", note: "n" }],
      otherNotes: "x",
      prDifficulty: "3",
      rallyStories: ["US1001", "DE1002"],
      rallyLinks: [
        "https://rally.example/US1001",
        "https://rally.example/DE1002",
      ],
      analysisOfPr: "Looks moderate overall",
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const persistedUserState = JSON.parse(
      fs.readFileSync(viewPrsUserStateFile, "utf8"),
    );
    expect(persistedUserState.notesByPrNumber[prNumber]).toMatchObject({
      comments: [
        expect.objectContaining({
          author: "a",
          note: "n",
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        }),
      ],
      otherNotes: "x",
      prDifficulty: "3",
      rallyStories: ["US1001", "DE1002"],
      rallyLinks: [
        "https://rally.example/US1001",
        "https://rally.example/DE1002",
      ],
      analysisOfPr: "Looks moderate overall",
    });
  });

  test("preserves other PR notes when POST /notes clears fields for a single PR", async () => {
    const existingPrNumber = "200";
    const clearedPrNumber = "201";

    writeViewPrsData({
      byPrNumber: {
        [existingPrNumber]: { repo: "owner/repo" },
        [clearedPrNumber]: { repo: "owner/repo" },
      },
      lastRun: null,
    });
    writeViewPrsUserState({
      notesByPrNumber: {
        [existingPrNumber]: {
          comments: [{ id: "c-1", author: "a", tone: "Neutral", note: "keep" }],
          otherNotes: "keep me",
          prDifficulty: "4",
          rallyStories: ["US1"],
          rallyLinks: ["https://rally.example/US1"],
          analysisOfPr: "retain",
        },
        [clearedPrNumber]: {
          comments: [{ id: "c-2", author: "b", tone: "Positive", note: "clear" }],
          otherNotes: "remove me",
          prDifficulty: "2",
          rallyStories: ["US2"],
          rallyLinks: ["https://rally.example/US2"],
          analysisOfPr: "clear this",
        },
      },
      ackByRepo: {},
      reverifyByRepo: {},
      inReviewByRepo: {},
  flaggedByRepo: {},
    });

    const res = await request.post("/notes").send({
      prNumber: clearedPrNumber,
      comments: [],
      otherNotes: "",
      prDifficulty: "",
      rallyStories: [],
      rallyLinks: [],
      analysisOfPr: "",
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const persistedUserState = JSON.parse(
      fs.readFileSync(viewPrsUserStateFile, "utf8"),
    );
    expect(persistedUserState.notesByPrNumber[existingPrNumber]).toMatchObject({
      otherNotes: "keep me",
      prDifficulty: "4",
      rallyStories: ["US1"],
      rallyLinks: ["https://rally.example/US1"],
      analysisOfPr: "retain",
    });
    expect(persistedUserState.notesByPrNumber[clearedPrNumber]).toEqual({
      comments: [],
      otherNotes: "",
      prDifficulty: "",
      rallyStories: [],
      rallyLinks: [],
      analysisOfPr: "",
    });
  });

  test("returns cached diff data when GET /diff receives an unchanged commit fingerprint", async () => {
    const prNumber = "321";
    const repo = "owner/repo";
    const dataEntry = {
      prNumber,
      repo,
      section: "open",
      data: {
        number: prNumber,
        sourceUpdatedAt: "2026-05-27T12:00:00Z",
        updatedAt: "2026-05-27T12:00:00Z",
        commits: [{ oid: "abc123" }],
      },
    };

    writeViewPrsData({ byPrNumber: { [prNumber]: dataEntry }, lastRun: null });

    const commitFingerprint = getPrDiffCommitFingerprint(dataEntry);
    const diffFilePath = getPrDiffCacheFilePath(repo, prNumber);
    fs.mkdirSync(path.dirname(diffFilePath), { recursive: true });
    fs.writeFileSync(
      diffFilePath,
      JSON.stringify(
        {
          repo,
          prNumber,
          commitFingerprint,
          fetchedAt: "2026-05-27T12:05:00Z",
          diffText: "diff --git a/file.js b/file.js\n+const x = 1;\n",
        },
        null,
        2,
      ),
      "utf8",
    );

    const res = await request
      .get("/diff")
      .query({ repo, prNumber });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.source).toBe("cache");
    expect(res.body.commitFingerprint).toBe(commitFingerprint);
    expect(String(res.body.diffText || "")).toContain("diff --git");
  });

  test("given invalid diff query params, when GET /diff is requested, then status 400 and route validation error are returned", async () => {
    const res = await request
      .get("/diff")
      .query({ repo: "owner-only", prNumber: "abc" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      ok: false,
      error: "Invalid repo or prNumber",
    });
  });

  test("given no matching stored pr row, when GET /diff is requested, then status 404 and route not-found error are returned", async () => {
    writeViewPrsData({ byPrNumber: {}, lastRun: null });

    const res = await request
      .get("/diff")
      .query({ repo: "owner/repo", prNumber: "999" });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      ok: false,
      error: "PR #999 not found for repo owner/repo",
    });
  });

  test("given diff fetch fails for a stored pr row, when GET /diff is requested, then status 500 and route failure error are returned", async () => {
    const repo = "owner/repo";
    const prNumber = "654";
    writeViewPrsData({
      byPrNumber: {
        [prNumber]: {
          prNumber,
          repo,
          data: {
            number: prNumber,
          },
        },
      },
      lastRun: null,
    });

    const res = await request.get("/diff").query({ repo, prNumber });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      ok: false,
      error: "Failed to fetch diff",
    });
  });

  test("hydrates heavy PR detail arrays from detailRef sidecar when GET /data is requested", async () => {
    const app = require("../app.js");
    const originalEnqueuePrDiffRefreshForData = app.enqueuePrDiffRefreshForData;
    app.enqueuePrDiffRefreshForData = () => {};

    const prNumber = "777";
    const detailFilePath = path.join(viewPrsPrDetailDir, "owner_repo__pr-777.json");
    fs.mkdirSync(path.dirname(detailFilePath), { recursive: true });
    fs.writeFileSync(
      detailFilePath,
      JSON.stringify(
        {
          activityTimeline: [{ date: "2026-06-02", events: [] }],
          activityEvents: [{ type: "comment", actor: "alice" }],
          reviewThreads: [{ id: "thread-1", comments: [] }],
          commentEvents: [{ channel: "thread", actor: "alice" }],
        },
        null,
        2,
      ),
      "utf8",
    );

    writeViewPrsData({
      byPrNumber: {
        [prNumber]: {
          prNumber,
          repo: "owner/repo",
          section: "open",
          updatedAt: "2026-06-02T18:00:00Z",
          rowOrder: 1,
          data: {
            number: prNumber,
            title: "Hydrate detail payload",
            titleDisplay: "Hydrate detail payload [CHK:NA][MRG:UNK]",
            url: "https://github.com/owner/repo/pull/777",
            mergedAt: "",
            closedAt: "",
            sourceUpdatedAt: "2026-06-02T18:00:00Z",
            sourceFingerprint: "fp:v2:sha256:test",
            detailRef: {
              file: detailFilePath,
              version: "v1",
            },
            sourceBranch: "feature/hydrate",
            targetBranch: "main",
            checkState: "NA",
            mergeState: "UNK",
            labels: [],
            author: "Alice",
            authorLogin: "alice",
            viewerLogin: "alice",
            status: "NO_CHANGE",
            approved: "NO",
            approvalCount: "0",
            inReview: "false",
            approvers: [],
            requestedReviewers: [],
            assignees: [],
            openConversationCount: "0",
            viewedFilesCount: "0",
            changedFilesCount: "0",
            viewedFilesSummary: "0/0 viewed",
            comments: [],
            reviews: [],
            commits: [],
            reviewThreads: [],
            commentEvents: [],
            activityEvents: [],
            metrics: {},
            activityTimelineSummary: "-",
            activityTimeline: [],
            baseline: "",
            reason: "-",
          },
        },
      },
      lastRun: {
        repo: "owner/repo",
        updatedAt: "2026-06-02T18:00:00Z",
      },
    });

    try {
      const res = await request.get("/data");
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      const row = res.body?.byPrNumber?.[prNumber]?.data;
      expect(Array.isArray(row?.activityTimeline)).toBe(true);
      expect(Array.isArray(row?.activityEvents)).toBe(true);
      expect(Array.isArray(row?.reviewThreads)).toBe(true);
      expect(Array.isArray(row?.commentEvents)).toBe(true);
      expect(row.activityTimeline).toHaveLength(1);
      expect(row.activityEvents).toHaveLength(1);
      expect(row.reviewThreads).toHaveLength(1);
      expect(row.commentEvents).toHaveLength(1);
    } finally {
      app.enqueuePrDiffRefreshForData = originalEnqueuePrDiffRefreshForData;
    }
  });

  test("returns success when POST /run receives valid input with mocked script execution", async () => {
    // Mock runViewPrsScript to avoid running shell
    const app = require("../app.js");
    const orig = app.runViewPrsScript;
    app.runViewPrsScript = () => Promise.resolve({ stdout: "ok", stderr: "" });
    const testApp = createViewPrsApp();
    const testServer = testApp.listen(0);
    if (typeof testServer.unref === "function") {
      testServer.unref();
    }
    const testRequest = supertest(testServer);
    try {
      const res = await testRequest
        .post("/run")
        .send({ repo: "owner/repo", openMode: "none" });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    } finally {
      app.runViewPrsScript = orig;
      if (typeof testServer.closeAllConnections === "function") {
        testServer.closeAllConnections();
      }
      if (typeof testServer.closeIdleConnections === "function") {
        testServer.closeIdleConnections();
      }
      await new Promise((resolve) => testServer.close(resolve));
    }
  });

  test("returns success when POST /view-prs/run alias receives valid input with mocked script execution", async () => {
    const app = require("../app.js");
    const orig = app.runViewPrsScript;
    app.runViewPrsScript = () => Promise.resolve({ stdout: "ok", stderr: "" });
    const testApp = createViewPrsApp();
    const testServer = testApp.listen(0);
    if (typeof testServer.unref === "function") {
      testServer.unref();
    }
    const testRequest = supertest(testServer);
    try {
      const res = await testRequest
        .post("/view-prs/run")
        .send({ repo: "owner/repo", openMode: "none" });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    } finally {
      app.runViewPrsScript = orig;
      if (typeof testServer.closeAllConnections === "function") {
        testServer.closeAllConnections();
      }
      if (typeof testServer.closeIdleConnections === "function") {
        testServer.closeIdleConnections();
      }
      await new Promise((resolve) => testServer.close(resolve));
    }
  });

  test("returns success when GET /view-prs/data alias is requested", async () => {
    const testApp = createViewPrsApp();
    const testServer = testApp.listen(0);
    if (typeof testServer.unref === "function") {
      testServer.unref();
    }
    const testRequest = supertest(testServer);
    try {
      const res = await testRequest.get("/view-prs/data");
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body).toHaveProperty("byPrNumber");
    } finally {
      if (typeof testServer.closeAllConnections === "function") {
        testServer.closeAllConnections();
      }
      if (typeof testServer.closeIdleConnections === "function") {
        testServer.closeIdleConnections();
      }
      await new Promise((resolve) => testServer.close(resolve));
    }
  });

  test("returns success when POST /view-prs/ack alias receives valid input with mocked script execution", async () => {
    const app = require("../app.js");
    const orig = app.runViewPrsScript;
    app.runViewPrsScript = () => Promise.resolve({ stdout: "ok", stderr: "" });
    const testApp = createViewPrsApp();
    const testServer = testApp.listen(0);
    if (typeof testServer.unref === "function") {
      testServer.unref();
    }
    const testRequest = supertest(testServer);
    try {
      const res = await testRequest
        .post("/view-prs/ack")
        .send({ repo: "owner/repo", ack: "123" });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    } finally {
      app.runViewPrsScript = orig;
      if (typeof testServer.closeAllConnections === "function") {
        testServer.closeAllConnections();
      }
      if (typeof testServer.closeIdleConnections === "function") {
        testServer.closeIdleConnections();
      }
      await new Promise((resolve) => testServer.close(resolve));
    }
  });

  test("returns success when POST /ack receives valid input with mocked script execution", async () => {
    const app = require("../app.js");
    const orig = app.runViewPrsScript;
    app.runViewPrsScript = () => Promise.resolve({ stdout: "ok", stderr: "" });
    const testApp = createViewPrsApp();
    const testServer = testApp.listen(0);
    if (typeof testServer.unref === "function") {
      testServer.unref();
    }
    const testRequest = supertest(testServer);
    try {
      const res = await testRequest
        .post("/ack")
        .send({ repo: "owner/repo", ack: "123" });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    } finally {
      app.runViewPrsScript = orig;
      if (typeof testServer.closeAllConnections === "function") {
        testServer.closeAllConnections();
      }
      if (typeof testServer.closeIdleConnections === "function") {
        testServer.closeIdleConnections();
      }
      await new Promise((resolve) => testServer.close(resolve));
    }
  });

  test("sets interval state when initializeScheduler is called", () => {
    jest.useFakeTimers();
    const app = require("../app.js");
    const origDep = app.getDependencyStatus;
    let interval = null;

    try {
      app.getDependencyStatus = () => ({ ok: false, missing: ["bash"] });
      interval = initializeScheduler();
      expect(typeof interval).toBe("object");
      expect(viewPrsSchedulerState.startedAt).toBeDefined();
    } finally {
      if (interval) {
        clearInterval(interval);
      }
      app.getDependencyStatus = origDep;
      jest.useRealTimers();
    }
  });

  test("runs without error when runViewPrsAutoRefresh uses mocked dependencies", async () => {
    const app = require("../app.js");
    const origRunScript = app.runViewPrsScript;
    const origDep = app.getDependencyStatus;
    app.getDependencyStatus = () => ({ ok: true, missing: [] });
    app.runViewPrsScript = () => Promise.resolve({ stdout: "ok", stderr: "" });
    await runViewPrsAutoRefresh();
    app.runViewPrsScript = origRunScript;
    app.getDependencyStatus = origDep;
  });

  test("persists and reloads scheduler state when persistence helpers are called", () => {
    const app = require("../app.js");
    app.viewPrsSchedulerState.lastManualRunAt = "2026-01-01T00:00:00Z";
    app.persistViewPrsSchedulerState();
    app.viewPrsSchedulerState.lastManualRunAt = null;
    app.readViewPrsSchedulerState();
    expect(app.viewPrsSchedulerState.lastManualRunAt).toBe(
      "2026-01-01T00:00:00Z",
    );
  });

  test("blocks auto refresh when runViewPrsAutoRefresh is called while the circuit is open", async () => {
    const app = require("../app.js");
    const origDep = app.getDependencyStatus;
    app.getDependencyStatus = () => ({ ok: true, missing: [] });
    app.viewPrsSchedulerState.isAutoRunInProgress = false;
    app.viewPrsSchedulerState.autoCircuitOpenUntil = new Date(
      Date.now() + 60000,
    ).toISOString();
    await runViewPrsAutoRefresh();
    expect(app.viewPrsSchedulerState.lastAutoSkipReason).toMatch(
      /auto refresh circuit open/,
    );
    app.getDependencyStatus = origDep;
    app.viewPrsSchedulerState.autoCircuitOpenUntil = null;
  });

  test("blocks auto refresh when runViewPrsAutoRefresh detects missing dependencies", async () => {
    const app = require("../app.js");
    const origDep = app.getDependencyStatus;
    app.getDependencyStatus = () => ({ ok: false, missing: ["bash"] });
    app.viewPrsSchedulerState.isAutoRunInProgress = false;
    await runViewPrsAutoRefresh();
    expect(app.viewPrsSchedulerState.lastAutoSkipReason).toMatch(
      /missing dependencies/,
    );
    app.getDependencyStatus = origDep;
  });

  test("blocks auto refresh when runViewPrsAutoRefresh is inside the manual cooldown window", async () => {
    const app = require("../app.js");
    const origDep = app.getDependencyStatus;
    app.getDependencyStatus = () => ({ ok: true, missing: [] });
    app.viewPrsSchedulerState.isAutoRunInProgress = false;
    app.viewPrsSchedulerState.lastManualRunAt = new Date().toISOString();
    await runViewPrsAutoRefresh();
    expect(app.viewPrsSchedulerState.lastAutoSkipReason).toMatch(
      /manual run happened within/,
    );
    app.getDependencyStatus = origDep;
    app.viewPrsSchedulerState.lastManualRunAt = null;
  });

  test("given author-comments file is missing, when POST /author-comments succeeds, then the file is created", async () => {
    const commentsFileExisted = fs.existsSync(viewPrsAuthorCommentsFile);
    const originalCommentsRaw = commentsFileExisted
      ? fs.readFileSync(viewPrsAuthorCommentsFile, "utf8")
      : "";

    try {
      fs.rmSync(viewPrsAuthorCommentsFile, { force: true });

      const res = await request.post("/author-comments").send({
        authorLogin: "creation-test-author",
        note: "create file",
      });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(fs.existsSync(viewPrsAuthorCommentsFile)).toBe(true);
    } finally {
      if (commentsFileExisted) {
        fs.mkdirSync(path.dirname(viewPrsAuthorCommentsFile), { recursive: true });
        fs.writeFileSync(viewPrsAuthorCommentsFile, originalCommentsRaw, "utf8");
      } else {
        fs.rmSync(viewPrsAuthorCommentsFile, { force: true });
      }
    }
  });

  test("given scheduler file is missing, when scheduler state is persisted, then the file is created", () => {
    const schedulerFileExisted = fs.existsSync(viewPrsSchedulerFile);
    const originalSchedulerRaw = schedulerFileExisted
      ? fs.readFileSync(viewPrsSchedulerFile, "utf8")
      : "";

    try {
      fs.rmSync(viewPrsSchedulerFile, { force: true });

      const app = require("../app.js");
      app.viewPrsSchedulerState.lastManualRunAt = "2026-07-07T00:00:00.000Z";
      app.persistViewPrsSchedulerState();

      expect(fs.existsSync(viewPrsSchedulerFile)).toBe(true);
    } finally {
      if (schedulerFileExisted) {
        fs.mkdirSync(path.dirname(viewPrsSchedulerFile), { recursive: true });
        fs.writeFileSync(viewPrsSchedulerFile, originalSchedulerRaw, "utf8");
      } else {
        fs.rmSync(viewPrsSchedulerFile, { force: true });
      }
    }
  });

  test("given user-state file is missing, when POST /notes succeeds, then the file is created", async () => {
    const userStateFileExisted = fs.existsSync(viewPrsUserStateFile);
    const originalUserStateRaw = userStateFileExisted
      ? fs.readFileSync(viewPrsUserStateFile, "utf8")
      : "";

    const dataFileExisted = fs.existsSync(viewPrsDataFile);
    const originalDataRaw = dataFileExisted
      ? fs.readFileSync(viewPrsDataFile, "utf8")
      : "";

    try {
      fs.rmSync(viewPrsUserStateFile, { force: true });
      writeViewPrsData({
        byPrNumber: {
          "3001": { repo: "owner/repo", data: { number: "3001", repo: "owner/repo" } },
        },
        lastRun: null,
      });

      const res = await request.post("/notes").send({
        prNumber: "3001",
        comments: [{ author: "a", note: "n" }],
        otherNotes: "state file create",
        prDifficulty: "2",
        rallyStories: [],
        rallyLinks: [],
        analysisOfPr: "",
      });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(fs.existsSync(viewPrsUserStateFile)).toBe(true);
    } finally {
      if (dataFileExisted) {
        fs.mkdirSync(path.dirname(viewPrsDataFile), { recursive: true });
        fs.writeFileSync(viewPrsDataFile, originalDataRaw, "utf8");
      } else {
        fs.rmSync(viewPrsDataFile, { force: true });
      }

      if (userStateFileExisted) {
        fs.mkdirSync(path.dirname(viewPrsUserStateFile), { recursive: true });
        fs.writeFileSync(viewPrsUserStateFile, originalUserStateRaw, "utf8");
      } else {
        fs.rmSync(viewPrsUserStateFile, { force: true });
      }
    }
  });

  test("given action-log file is missing, when an action log entry is appended, then the file is created", () => {
    const actionLogFileExisted = fs.existsSync(viewPrsActionLogFile);
    const originalActionLogRaw = actionLogFileExisted
      ? fs.readFileSync(viewPrsActionLogFile, "utf8")
      : "";

    try {
      fs.rmSync(viewPrsActionLogFile, { force: true });

      const app = require("../app.js");
      app.appendActionLogEntry({
        action: "integration-test/create-action-log",
        triggeredAt: new Date().toISOString(),
        durationMs: 1,
        ok: true,
      });

      expect(fs.existsSync(viewPrsActionLogFile)).toBe(true);
    } finally {
      if (actionLogFileExisted) {
        fs.mkdirSync(path.dirname(viewPrsActionLogFile), { recursive: true });
        fs.writeFileSync(viewPrsActionLogFile, originalActionLogRaw, "utf8");
      } else {
        fs.rmSync(viewPrsActionLogFile, { force: true });
      }
    }
  });

  test("given the data folder is missing, when an action log entry is appended, then the data folder is recreated", () => {
    const dataDirPath = path.dirname(viewPrsDataFile);
    const actionLogFileExisted = fs.existsSync(viewPrsActionLogFile);
    const originalActionLogRaw = actionLogFileExisted
      ? fs.readFileSync(viewPrsActionLogFile, "utf8")
      : "";

    try {
      fs.rmSync(dataDirPath, { recursive: true, force: true });

      const app = require("../app.js");
      app.appendActionLogEntry({
        action: "integration-test/recreate-data-dir",
        triggeredAt: new Date().toISOString(),
        durationMs: 1,
        ok: true,
      });

      expect(fs.existsSync(dataDirPath)).toBe(true);
      expect(fs.existsSync(viewPrsActionLogFile)).toBe(true);
    } finally {
      if (actionLogFileExisted) {
        fs.mkdirSync(path.dirname(viewPrsActionLogFile), { recursive: true });
        fs.writeFileSync(viewPrsActionLogFile, originalActionLogRaw, "utf8");
      }
    }
  });

  test("given the backups folder is missing, when user-state is written with an existing state file, then the backups folder is recreated", () => {
    const backupDirExisted = fs.existsSync(viewPrsBackupDir);
    const backupDirEntries = backupDirExisted ? fs.readdirSync(viewPrsBackupDir) : [];
    const backupDirContents = new Map();

    if (backupDirExisted) {
      backupDirEntries.forEach((name) => {
        const fullPath = path.join(viewPrsBackupDir, name);
        backupDirContents.set(name, fs.readFileSync(fullPath));
      });
    }

    const userStateFileExisted = fs.existsSync(viewPrsUserStateFile);
    const originalUserStateRaw = userStateFileExisted
      ? fs.readFileSync(viewPrsUserStateFile, "utf8")
      : "";

    try {
      fs.mkdirSync(path.dirname(viewPrsUserStateFile), { recursive: true });
      fs.writeFileSync(
        viewPrsUserStateFile,
        JSON.stringify(EMPTY_USER_STATE, null, 2),
        "utf8",
      );
      fs.rmSync(viewPrsBackupDir, { recursive: true, force: true });

      const app = require("../app.js");
      app.writeViewPrsUserState({
        notesByPrNumber: {
          "999": {
            comments: [],
            otherNotes: "backup dir recreate",
            prDifficulty: "",
            rallyStories: [],
            rallyLinks: [],
            analysisOfPr: "",
          },
        },
        ackByRepo: {},
        reverifyByRepo: {},
        inReviewByRepo: {},
  flaggedByRepo: {},
      });

      expect(fs.existsSync(viewPrsBackupDir)).toBe(true);
      expect(fs.readdirSync(viewPrsBackupDir).length).toBeGreaterThan(0);
    } finally {
      if (userStateFileExisted) {
        fs.mkdirSync(path.dirname(viewPrsUserStateFile), { recursive: true });
        fs.writeFileSync(viewPrsUserStateFile, originalUserStateRaw, "utf8");
      } else {
        fs.rmSync(viewPrsUserStateFile, { force: true });
      }

      fs.rmSync(viewPrsBackupDir, { recursive: true, force: true });
      if (backupDirExisted) {
        fs.mkdirSync(viewPrsBackupDir, { recursive: true });
        backupDirEntries.forEach((name) => {
          fs.writeFileSync(path.join(viewPrsBackupDir, name), backupDirContents.get(name));
        });
      }
    }
  });

  test("given the pr-details folder is missing, when GET /data reads a row with a missing detail sidecar, then it returns 200 and keeps default arrays", async () => {
    const dataFileExisted = fs.existsSync(viewPrsDataFile);
    const originalDataRaw = dataFileExisted
      ? fs.readFileSync(viewPrsDataFile, "utf8")
      : "";

    const prDetailDirExisted = fs.existsSync(viewPrsPrDetailDir);

    try {
      fs.rmSync(viewPrsPrDetailDir, { recursive: true, force: true });
      writeViewPrsData({
        byPrNumber: {
          "901": {
            prNumber: "901",
            repo: "owner/repo",
            section: "open",
            data: {
              number: "901",
              repo: "owner/repo",
              detailRef: {
                file: path.join(viewPrsPrDetailDir, "owner_repo__pr-901.json"),
                version: "v1",
              },
              activityTimeline: [],
              activityEvents: [],
              reviewThreads: [],
              commentEvents: [],
            },
          },
        },
        lastRun: null,
      });

      const res = await request.get("/data");
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      const row = res.body?.byPrNumber?.["901"]?.data;
      expect(Array.isArray(row?.activityTimeline)).toBe(true);
      expect(Array.isArray(row?.activityEvents)).toBe(true);
      expect(Array.isArray(row?.reviewThreads)).toBe(true);
      expect(Array.isArray(row?.commentEvents)).toBe(true);
    } finally {
      if (dataFileExisted) {
        fs.mkdirSync(path.dirname(viewPrsDataFile), { recursive: true });
        fs.writeFileSync(viewPrsDataFile, originalDataRaw, "utf8");
      } else {
        fs.rmSync(viewPrsDataFile, { force: true });
      }

      if (prDetailDirExisted) {
        fs.mkdirSync(viewPrsPrDetailDir, { recursive: true });
      }
    }
  });
});
