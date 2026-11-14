const fs = require("fs");
const path = require("path");
const appModule = require("../app.js");
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
} = appModule;

// getViewPrsBackfillPublicState (a fire-and-forget side effect of
// GET /data-family routes, called on essentially every request below) goes
// through runViewPrsShellScript, which has no mock/override in this file
// otherwise - without this, every one of those requests would shell out to
// the real backfill-missing-bg.sh script. "Backfill status: not running"
// matches what parseBackfillCommandOutput (app.js) looks for, so routes
// that surface backfill state still see a real-looking, non-running result.
appModule.runViewPrsShellScript = async () => ({
  stdout: "Backfill status: not running",
  stderr: "",
  command: "bash backfill-missing-bg.sh status",
});

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
  // No sources file, as before any is seeded: every stored row is shown -
  // the owner/repo rows these tests write included, which nothing fetches,
  // so no seeded file would subscribe. And no rows left by the test before
  // (its notes give their PR a row too), which it would be seeded from.
  beforeEach(() => {
    writeViewPrsData({ byPrNumber: {}, lastRun: null });
    writeViewPrsUserState();
    fs.rmSync(appModule.viewPrsSourcesStorage.sourcesFile, { force: true });
    fs.rmSync(`${appModule.viewPrsSourcesStorage.sourcesFile}.seeded`, { force: true });
  });
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
      stories: [
        { name: "US1001", url: "https://stories.example/US1001" },
        { name: "DE1002", url: "" },
      ],
      analysisOfPr: "Looks moderate overall",
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const persistedUserState = JSON.parse(
      fs.readFileSync(viewPrsUserStateFile, "utf8"),
    );
    expect(persistedUserState.notesByPrNumber[`owner/repo#${prNumber}`]).toMatchObject({
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
      stories: [
        { name: "US1001", url: "https://stories.example/US1001" },
        { name: "DE1002", url: "" },
      ],
      analysisOfPr: "Looks moderate overall",
    });
    expect(persistedUserState.notesByPrNumber[`owner/repo#${prNumber}`]).not.toHaveProperty("rallyStories");
  });

  // The Notes tab sends only id, author, tone and note. Saving used to
  // reset every comment's createdAt/updatedAt to the save time.
  test("POST /thread-checks confirms a thread resolved for you, undoes it, and a notes save keeps it", async () => {
    writeViewPrsData({ byPrNumber: { "owner/repo#7": { repo: "owner/repo", prNumber: "7" } }, lastRun: null });
    writeViewPrsUserState({ ...EMPTY_USER_STATE, flaggedByRepo: { "owner/repo": { 3: true } } });
    const stored = () => JSON.parse(fs.readFileSync(viewPrsUserStateFile, "utf8"));

    const confirmed = await request
      .post("/thread-checks")
      .send({ repo: "owner/repo", prNumber: "7", threadId: "T1", signature: "bob|2|C2" });
    expect(confirmed.status).toBe(200);
    expect(stored().threadChecksByRepo).toEqual({ "owner/repo": { 7: { T1: "bob|2|C2" } } });
    // The other user state stays, and the page gets it back.
    expect(stored().flaggedByRepo).toEqual({ "owner/repo": { 3: true } });
    expect(confirmed.body.prData.threadChecksByRepo).toEqual({ "owner/repo": { 7: { T1: "bob|2|C2" } } });

    // A notes save rewrites the user state: the confirmation survives.
    const notes = await request.post("/notes").send({ prNumber: "7", repo: "owner/repo", comments: [], otherNotes: "x" });
    expect(notes.status).toBe(200);
    expect(stored().threadChecksByRepo).toEqual({ "owner/repo": { 7: { T1: "bob|2|C2" } } });

    const undone = await request.post("/thread-checks").send({ repo: "owner/repo", prNumber: "7", threadId: "T1", confirmed: false });
    expect(undone.status).toBe(200);
    expect(stored().threadChecksByRepo).toEqual({});
  });

  test("the Ack history (written by the script) survives a notes save and reaches the page", async () => {
    writeViewPrsData({ byPrNumber: { "owner/repo#7": { repo: "owner/repo", prNumber: "7" } }, lastRun: null });
    const ackHistoryByRepo = { "owner/repo": { 7: ["2026-01-01T00:00:00Z", "2026-01-03T00:00:00Z"] } };
    writeViewPrsUserState({ ...EMPTY_USER_STATE, ackHistoryByRepo });

    const notes = await request.post("/notes").send({ prNumber: "7", repo: "owner/repo", comments: [], otherNotes: "x" });
    expect(notes.status).toBe(200);
    expect(JSON.parse(fs.readFileSync(viewPrsUserStateFile, "utf8")).ackHistoryByRepo).toEqual(ackHistoryByRepo);
    expect(notes.body.prData.ackHistoryByRepo).toEqual(ackHistoryByRepo);
  });

  describe("the script's user-state lock", () => {
    const lockDir = viewPrsUserStateFile.replace(/\.json$/, "") + ".lock";
    afterEach(() => fs.rmSync(lockDir, { recursive: true, force: true }));
    const saveNotes = () =>
      request.post("/notes").send({ prNumber: "7", repo: "owner/repo", comments: [], otherNotes: "saved" });
    const storedNotes = () => JSON.parse(fs.readFileSync(viewPrsUserStateFile, "utf8")).notesByPrNumber;
    beforeEach(() => {
      writeViewPrsData({ byPrNumber: { "owner/repo#7": { repo: "owner/repo", prNumber: "7" } }, lastRun: null });
      writeViewPrsUserState();
    });

    test("a notes save waits while the script holds it, then saves, and lets it go", async () => {
      fs.mkdirSync(lockDir);
      // The script lets it go shortly - here a worker thread, which runs
      // while the save holds up this one.
      const { Worker } = require("worker_threads");
      const worker = new Worker(
        `setTimeout(() => require("fs").rmdirSync(${JSON.stringify(lockDir)}), 300)`,
        { eval: true },
      );
      const startedAt = Date.now();
      const res = await saveNotes();
      expect(res.status).toBe(200);
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(250);
      expect(storedNotes()["owner/repo#7"].otherNotes).toBe("saved");
      expect(fs.existsSync(lockDir)).toBe(false);
      await worker.terminate();
    });

    test("one left by a script that died (over a minute old) doesn't stop a save", async () => {
      fs.mkdirSync(lockDir);
      const old = new Date(Date.now() - 5 * 60 * 1000);
      fs.utimesSync(lockDir, old, old);
      expect((await saveNotes()).status).toBe(200);
      expect(storedNotes()["owner/repo#7"].otherNotes).toBe("saved");
      // Not ours to remove.
      expect(fs.existsSync(lockDir)).toBe(true);
    });
  });

  test("a confirmation saved over a malformed user state is added to its backup, not to an empty state", async () => {
    writeViewPrsData({ byPrNumber: { "owner/repo#7": { repo: "owner/repo", prNumber: "7" } }, lastRun: null });
    const backupFile = path.join(viewPrsBackupDir, `${path.basename(viewPrsUserStateFile)}.user-state.malformed-test.bak`);
    fs.mkdirSync(viewPrsBackupDir, { recursive: true });
    fs.writeFileSync(
      backupFile,
      JSON.stringify({ ...EMPTY_USER_STATE, threadChecksByRepo: { "owner/repo": { 7: { T1: "sig-1" } } } }),
    );
    // The newest backup.
    const later = new Date(Date.now() + 60 * 1000);
    fs.utimesSync(backupFile, later, later);
    fs.writeFileSync(viewPrsUserStateFile, "{ not json");

    try {
      const res = await request.post("/thread-checks").send({ repo: "owner/repo", prNumber: "7", threadId: "T2", signature: "sig-2" });
      expect(res.status).toBe(200);
      expect(JSON.parse(fs.readFileSync(viewPrsUserStateFile, "utf8")).threadChecksByRepo).toEqual({
        "owner/repo": { 7: { T1: "sig-1", T2: "sig-2" } },
      });
    } finally {
      fs.rmSync(backupFile, { force: true });
      writeViewPrsUserState();
    }
  });

  test("a server write keeps the file's Ack history, not an older copy read before the script recorded an Ack", () => {
    const latest = { "owner/repo": { 7: ["2026-01-01T00:00:00Z", "2026-01-03T00:00:00Z"] } };
    writeViewPrsUserState({ ...EMPTY_USER_STATE, ackHistoryByRepo: latest });

    appModule.writeViewPrsUserState({
      ...EMPTY_USER_STATE,
      ackHistoryByRepo: { "owner/repo": { 7: ["2026-01-01T00:00:00Z"] } },
    });
    expect(JSON.parse(fs.readFileSync(viewPrsUserStateFile, "utf8")).ackHistoryByRepo).toEqual(latest);
  });

  test("POST /thread-checks rejects a request without a repo, PR number, thread or signature", async () => {
    const send = (body) => request.post("/thread-checks").send(body);
    expect((await send({ prNumber: "7", threadId: "T1", signature: "s" })).status).toBe(400);
    expect((await send({ repo: "owner/repo", prNumber: "x", threadId: "T1", signature: "s" })).status).toBe(400);
    expect((await send({ repo: "owner/repo", prNumber: "7", signature: "s" })).status).toBe(400);
    expect((await send({ repo: "owner/repo", prNumber: "7", threadId: "T1" })).status).toBe(400);
  });

  test("POST /custom-section-prs adds a PR to a custom section and takes it out; a notes save keeps it, and the page gets it", async () => {
    writeViewPrsData({ byPrNumber: { "owner/repo#7": { repo: "owner/repo", prNumber: "7" } }, lastRun: null });
    writeViewPrsUserState({ ...EMPTY_USER_STATE, flaggedByRepo: { "owner/repo": { 3: true } } });
    const stored = () => JSON.parse(fs.readFileSync(viewPrsUserStateFile, "utf8"));
    const send = (body) => request.post("/custom-section-prs").send({ repo: "owner/repo", prNumber: "7", ...body });

    const added = await send({ sectionId: "abc123" });
    expect(added.status).toBe(200);
    expect(added.body).toEqual({ ok: true, customSectionsByRepo: { "owner/repo": { 7: ["abc123"] } } });
    // Added again, it's there once; another section joins it.
    await send({ sectionId: "abc123", member: true });
    await send({ sectionId: "zz9" });
    expect(stored().customSectionsByRepo).toEqual({ "owner/repo": { 7: ["abc123", "zz9"] } });
    expect(stored().flaggedByRepo).toEqual({ "owner/repo": { 3: true } });

    const notes = await request.post("/notes").send({ prNumber: "7", repo: "owner/repo", comments: [], otherNotes: "x" });
    expect(notes.status).toBe(200);
    expect(stored().customSectionsByRepo).toEqual({ "owner/repo": { 7: ["abc123", "zz9"] } });
    expect(notes.body.prData.customSectionsByRepo).toEqual({ "owner/repo": { 7: ["abc123", "zz9"] } });
    expect((await request.get("/data")).body.customSectionsByRepo).toEqual({ "owner/repo": { 7: ["abc123", "zz9"] } });

    const taken = await send({ sectionId: "abc123", member: false });
    expect(taken.body.customSectionsByRepo).toEqual({ "owner/repo": { 7: ["zz9"] } });
    await send({ sectionId: "zz9", member: false });
    expect(stored().customSectionsByRepo).toEqual({});
  });

  test("DELETE /custom-section-prs takes every PR out of a removed section, leaving the others", async () => {
    writeViewPrsUserState({
      ...EMPTY_USER_STATE,
      customSectionsByRepo: { "owner/repo": { 7: ["gone", "kept"], 8: ["gone"] }, "acme/app": { 1: ["gone"] } },
    });

    const res = await request.delete("/custom-section-prs").send({ sectionId: "gone" });

    expect(res.status).toBe(200);
    expect(res.body.customSectionsByRepo).toEqual({ "owner/repo": { 7: ["kept"] } });
    expect(JSON.parse(fs.readFileSync(viewPrsUserStateFile, "utf8")).customSectionsByRepo).toEqual({ "owner/repo": { 7: ["kept"] } });
  });

  test("/custom-section-prs rejects a request without a valid section id, repo or PR number", async () => {
    const send = (body) => request.post("/custom-section-prs").send(body);
    expect((await send({ repo: "owner/repo", prNumber: "7" })).status).toBe(400);
    expect((await send({ sectionId: "Not-Valid", repo: "owner/repo", prNumber: "7" })).status).toBe(400);
    expect((await send({ sectionId: "abc", prNumber: "7" })).status).toBe(400);
    expect((await send({ sectionId: "abc", repo: "owner/repo", prNumber: "x" })).status).toBe(400);
    expect((await request.delete("/custom-section-prs").send({ sectionId: "" })).status).toBe(400);
  });

  test("given stored note comments, when POST /notes saves them without timestamps, then unchanged ones keep theirs and an edited one keeps createdAt", async () => {
    const prNumber = "124";
    writeViewPrsData({ byPrNumber: { [prNumber]: { repo: "owner/repo" } }, lastRun: null });
    const storedComment = (id, note) => ({
      id,
      author: "alice",
      tone: "Positive",
      note,
      createdAt: "2026-01-02T03:04:05Z",
      updatedAt: "2026-01-03T03:04:05Z",
    });
    writeViewPrsUserState({
      ...EMPTY_USER_STATE,
      notesByPrNumber: {
        [prNumber]: {
          comments: [storedComment("comment-1", "kept"), storedComment("comment-2", "before")],
          otherNotes: "",
          prDifficulty: "",
          stories: [],
          analysisOfPr: "",
        },
      },
    });

    const res = await request.post("/notes").send({
      prNumber,
      comments: [
        { id: "comment-1", author: "alice", tone: "Positive", note: "kept" },
        { id: "comment-2", author: "alice", tone: "Positive", note: "after" },
        { id: "comment-3", author: "bob", tone: "Neutral", note: "new" },
      ],
      otherNotes: "changed other notes",
    });
    expect(res.status).toBe(200);

    const saved = JSON.parse(fs.readFileSync(viewPrsUserStateFile, "utf8")).notesByPrNumber[`owner/repo#${prNumber}`].comments;
    const byId = Object.fromEntries(saved.map((comment) => [comment.id, comment]));
    expect(byId["comment-1"]).toMatchObject({ createdAt: "2026-01-02T03:04:05Z", updatedAt: "2026-01-03T03:04:05Z" });
    expect(byId["comment-2"].createdAt).toBe("2026-01-02T03:04:05Z");
    expect(Date.parse(byId["comment-2"].updatedAt)).toBeGreaterThan(Date.parse("2026-01-03T03:04:05Z"));
    expect(byId["comment-3"].createdAt).toBe(byId["comment-3"].updatedAt);
    expect(Date.parse(byId["comment-3"].createdAt)).toBeGreaterThan(Date.parse("2026-01-03T03:04:05Z"));
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
          // Saved before stories existed: read as stories, written back so.
          rallyStories: ["US1"],
          rallyLinks: ["https://stories.example/US1"],
          analysisOfPr: "retain",
        },
        [clearedPrNumber]: {
          comments: [{ id: "c-2", author: "b", tone: "Positive", note: "clear" }],
          otherNotes: "remove me",
          prDifficulty: "2",
          stories: [{ name: "US2", url: "https://stories.example/US2" }],
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
      stories: [],
      analysisOfPr: "",
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const persistedUserState = JSON.parse(
      fs.readFileSync(viewPrsUserStateFile, "utf8"),
    );
    expect(persistedUserState.notesByPrNumber[`owner/repo#${existingPrNumber}`]).toMatchObject({
      otherNotes: "keep me",
      prDifficulty: "4",
      stories: [{ name: "US1", url: "https://stories.example/US1" }],
      analysisOfPr: "retain",
    });
    expect(persistedUserState.notesByPrNumber[`owner/repo#${clearedPrNumber}`]).toEqual({
      comments: [],
      otherNotes: "",
      prDifficulty: "",
      stories: [],
      analysisOfPr: "",
    });
  });

  test("two repos' PRs with the same number keep their own rows and notes", async () => {
    // Before rows and notes were keyed by repo, one replaced the other.
    writeViewPrsData({
      byPrNumber: {
        "acme/api#12": { prNumber: "12", repo: "acme/api", section: "open", data: { number: "12", title: "API twelve" } },
        // Not migrated by the script yet: read as acme/web's.
        12: { prNumber: "12", repo: "acme/web", section: "open", data: { number: "12", title: "Web twelve" } },
      },
      lastRun: { repo: "acme/api", updatedAt: "2026-11-02T10:00:00Z" },
    });
    // Notes from before, keyed by the bare number: the last run's repo's.
    writeViewPrsUserState({ ...EMPTY_USER_STATE, notesByPrNumber: { 12: { otherNotes: "older notes" } } });

    const res = await request.post("/notes").send({ prNumber: "12", repo: "acme/web", otherNotes: "web notes" });
    expect(res.status).toBe(200);

    const { notesByPrNumber } = JSON.parse(fs.readFileSync(viewPrsUserStateFile, "utf8"));
    expect(Object.keys(notesByPrNumber).sort()).toEqual(["acme/api#12", "acme/web#12"]);
    expect(notesByPrNumber["acme/api#12"].otherNotes).toBe("older notes");
    expect(notesByPrNumber["acme/web#12"].otherNotes).toBe("web notes");

    const data = (await request.get("/data")).body;
    expect(data.byPrNumber["acme/api#12"]).toMatchObject({ data: { title: "API twelve" }, notes: { otherNotes: "older notes" } });
    expect(data.byPrNumber["acme/web#12"]).toMatchObject({ data: { title: "Web twelve" }, notes: { otherNotes: "web notes" } });
  });

  test("notes still keyed by the bare number move to their PR's repo key when the data is read", async () => {
    writeViewPrsData({
      byPrNumber: { "acme/web#30": { prNumber: "30", repo: "acme/web", section: "open", data: { number: "30" } } },
      lastRun: { repo: "acme/api", updatedAt: "2026-11-02T10:00:00Z" },
    });
    writeViewPrsUserState({ ...EMPTY_USER_STATE, notesByPrNumber: { 30: { otherNotes: "thirty" } } });

    expect((await request.get("/data")).status).toBe(200);

    const { notesByPrNumber } = JSON.parse(fs.readFileSync(viewPrsUserStateFile, "utf8"));
    // The only row with #30 is acme/web's, whatever the last run was.
    expect(notesByPrNumber).toEqual({ "acme/web#30": expect.objectContaining({ otherNotes: "thirty" }) });
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

  describe("GET /attachment", () => {
    const id = "af1d5a16-8556-4bd3-8d5b-079f77f86d33";
    const asset = `https://github.com/user-attachments/assets/${id}`;
    let originalRunViewPrsCommand;
    let originalFetch;
    beforeEach(() => {
      fs.rmSync(process.env.VIEW_PRS_ATTACHMENT_DIR, { recursive: true, force: true });
      originalRunViewPrsCommand = appModule.runViewPrsCommand;
      originalFetch = global.fetch;
      appModule.runViewPrsCommand = async () => ({ stdout: "tok" });
      global.fetch = async () => ({
        status: 200,
        ok: true,
        headers: { get: (name) => (name === "content-type" ? "image/svg+xml" : null) },
        arrayBuffer: async () => new TextEncoder().encode("<svg/>").buffer,
      });
    });
    afterEach(() => {
      appModule.runViewPrsCommand = originalRunViewPrsCommand;
      global.fetch = originalFetch;
    });

    test("serves a GitHub attachment so it can't run as a page if opened on its own", async () => {
      const res = await request.get("/view-prs/attachment").query({ url: asset, repo: "owner/repo", prNumber: "1" });
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/^image\/svg\+xml/);
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["content-security-policy"]).toBe("default-src 'none'; style-src 'unsafe-inline'; sandbox");
      expect(res.headers["cache-control"]).toBe("private, max-age=31536000, immutable");
      expect(Buffer.from(res.body).toString()).toBe("<svg/>");
    });

    test("serves part of one when asked (a video played from part way)", async () => {
      const res = await request.get("/attachment").query({ url: asset }).set("Range", "bytes=1-3");
      expect(res.status).toBe(206);
      expect(res.headers["content-range"]).toBe("bytes 1-3/6");
      expect(res.headers["content-type"]).toMatch(/^image\/svg\+xml/);
      expect(Buffer.from(res.body).toString()).toBe("svg");
    });

    test("a link that isn't a GitHub attachment is a 400", async () => {
      const res = await request.get("/attachment").query({ url: "https://evil.example/x.png" });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ ok: false, error: "Not a GitHub attachment link" });
    });
  });

  describe("local clones", () => {
    const { execFile, execFileSync } = require("child_process");
    const os = require("os");
    const git = (cwd, ...args) =>
      execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", ...args], { cwd, encoding: "utf8" }).trim();
    let root;
    let clone;
    let worktree;
    let oids;
    let originalOpen;
    let originalRunViewPrsCommand;
    let opened;
    beforeAll(() => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), "local-clones-"));
      clone = path.join(root, "repo");
      worktree = path.join(root, "feature-tree");
      fs.mkdirSync(clone);
      git(clone, "init", "-q");
      git(clone, "remote", "add", "origin", "https://github.com/owner/repo.git");
      git(clone, "commit", "--allow-empty", "-q", "-m", "base");
      git(clone, "branch", "feature");
      git(clone, "config", "branch.feature.remote", "origin");
      git(clone, "config", "branch.feature.merge", "refs/heads/feature");
      oids = { local: git(clone, "rev-parse", "feature") };
      git(clone, "worktree", "add", "-q", worktree, "feature");
      git(worktree, "commit", "--allow-empty", "-q", "-m", "pushed by someone");
      oids.head = git(worktree, "rev-parse", "HEAD");
      // The local branch is a commit behind the PR's newest.
      git(worktree, "reset", "-q", "--hard", oids.local);
    });
    afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
    beforeEach(() => {
      fs.rmSync(process.env.VIEW_PRS_LOCAL_REPOS_FILE, { force: true });
      opened = [];
      // Real git, run without spawn (which the tests' setup refuses).
      originalRunViewPrsCommand = appModule.runViewPrsCommand;
      appModule.runViewPrsCommand = (command, args) =>
        new Promise((resolve, reject) =>
          execFile(command, args, { encoding: "utf8" }, (error, stdout, stderr) => (error ? reject({ error, stderr }) : resolve({ stdout }))),
        );
      originalOpen = appModule.openFolderInEditor;
      appModule.openFolderInEditor = async (folder) => {
        opened.push(folder);
      };
      writeViewPrsData({
        byPrNumber: {
          5: {
            prNumber: "5",
            repo: "owner/repo",
            section: "open",
            data: { number: "5", sourceBranch: "feature", headOid: oids.head, commits: [{ oid: oids.local }, { oid: oids.head }] },
          },
          6: { prNumber: "6", repo: "owner/repo", section: "open", data: { number: "6", sourceBranch: "not-here", headOid: oids.head } },
        },
        lastRun: null,
      });
    });
    afterEach(() => {
      appModule.openFolderInEditor = originalOpen;
      appModule.runViewPrsCommand = originalRunViewPrsCommand;
    });

    test("a clone's folder is saved, in this computer's own file, once git finds it's a clone of the repo", async () => {
      expect((await request.put("/view-prs/local-repos").send({ repo: "owner/repo", path: "relative/path" })).status).toBe(400);
      const wrong = await request.put("/view-prs/local-repos").send({ repo: "other/repo", path: clone });
      expect(wrong.status).toBe(422);
      expect(wrong.body.error).toBe("None of its remotes is other/repo (it has owner/repo)");
      expect(fs.existsSync(process.env.VIEW_PRS_LOCAL_REPOS_FILE)).toBe(false);

      const res = await request.put("/local-repos").send({ repo: "owner/repo", path: clone });
      expect(res.status).toBe(200);
      expect(res.body.repos).toEqual({ "owner/repo": { path: clone, ok: true, branchCount: 2, worktreeCount: 2 } });
      expect(JSON.parse(fs.readFileSync(process.env.VIEW_PRS_LOCAL_REPOS_FILE, "utf8"))).toEqual({ repos: { "owner/repo": { path: clone } } });
      expect((await request.get("/view-prs/local-repos")).body.repos["owner/repo"]).toMatchObject({ ok: true });

      const removed = await request.delete("/view-prs/local-repos").send({ repo: "owner/repo" });
      expect(removed.body).toEqual({ ok: true, removed: true, repos: {} });
    });

    test("finds the clones of the page's repos in a folder, saving nothing", async () => {
      expect((await request.post("/view-prs/local-repos/find").send({ folder: "relative", repos: ["owner/repo"] })).status).toBe(400);
      const missing = await request.post("/view-prs/local-repos/find").send({ folder: path.join(root, "nope"), repos: ["owner/repo"] });
      expect(missing.status).toBe(422);
      expect(missing.body.error).toMatch(/^No such folder/);

      const res = await request.post("/local-repos/find").send({ folder: `"${root}"`, repos: ["owner/repo", "not a repo"] });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, found: [{ repo: "owner/repo", path: clone }] });
      expect(fs.existsSync(process.env.VIEW_PRS_LOCAL_REPOS_FILE)).toBe(false);
    });

    test("~ in a path is the home folder, as in a terminal", async () => {
      appModule.homeDir = () => path.dirname(root);
      try {
        const found = await request.post("/view-prs/local-repos/find").send({ folder: `~/${path.basename(root)}`, repos: ["owner/repo"] });
        expect(found.body).toEqual({ ok: true, found: [{ repo: "owner/repo", path: clone }] });
        const res = await request.put("/view-prs/local-repos").send({ repo: "owner/repo", path: `~/${path.basename(root)}/repo` });
        expect(res.status).toBe(200);
        expect(res.body.repos["owner/repo"].path).toBe(clone);
      } finally {
        delete appModule.homeDir;
      }
    });

    test("a path pasted with its quotes (Windows' Copy as path) is saved without them", async () => {
      const res = await request.put("/view-prs/local-repos").send({ repo: "owner/repo", path: ` "${clone}" ` });
      expect(res.status).toBe(200);
      expect(Object.values(res.body.repos)).toEqual([expect.objectContaining({ path: clone, ok: true })]);
    });

    test("each PR's local branch: the worktree it's in and how far behind the PR it is", async () => {
      // Without a clone, git isn't asked.
      const calls = [];
      const realRun = appModule.runViewPrsCommand;
      appModule.runViewPrsCommand = (...args) => {
        calls.push(args);
        return realRun(...args);
      };
      expect((await request.get("/view-prs/local-branches")).body).toEqual({ ok: true, repos: {}, prs: {} });
      expect(calls).toEqual([]);
      await request.put("/view-prs/local-repos").send({ repo: "owner/repo", path: clone });

      const res = await request.get("/local-branches");
      expect(res.status).toBe(200);
      expect(Object.keys(res.body.prs)).toEqual(["owner/repo#5"]);
      expect(res.body.prs["owner/repo#5"]).toMatchObject({ branch: "feature", oid: oids.local, ahead: 0, behind: 1, exact: true });
      // As git names it: the long form of a short Windows path.
      expect(fs.realpathSync.native(res.body.prs["owner/repo#5"].worktreePath)).toBe(fs.realpathSync.native(worktree));
    });

    test("opens the clone or one of its worktrees in the editor, and no other folder", async () => {
      await request.put("/view-prs/local-repos").send({ repo: "owner/repo", path: clone });
      expect((await request.post("/view-prs/open-in-editor").send({ repo: "owner/repo", path: worktree })).body).toEqual({ ok: true });
      expect((await request.post("/open-in-editor").send({ repo: "owner/repo", path: clone })).status).toBe(200);
      const elsewhere = await request.post("/view-prs/open-in-editor").send({ repo: "owner/repo", path: root });
      expect(elsewhere.status).toBe(400);
      expect((await request.post("/view-prs/open-in-editor").send({ repo: "other/repo", path: clone })).status).toBe(400);
      expect(opened).toEqual([worktree, clone]);
    });
  });

  describe("GET /pr-description", () => {
    const repo = "owner/repo";
    const prNumber = "321";
    const writeRow = (sourceUpdatedAt) =>
      writeViewPrsData({ byPrNumber: { [prNumber]: { prNumber, repo, data: { number: prNumber, sourceUpdatedAt } } }, lastRun: null });
    let calls;
    let answer;
    let originalRunViewPrsCommand;
    beforeEach(() => {
      fs.rmSync(process.env.VIEW_PRS_PR_DESCRIPTION_DIR, { recursive: true, force: true });
      calls = [];
      answer = async () => ({ stdout: JSON.stringify({ body: "## What\n\nFixes the thing." }) });
      originalRunViewPrsCommand = appModule.runViewPrsCommand;
      appModule.runViewPrsCommand = async (command, args, ...rest) => {
        calls.push([command, ...args]);
        return answer(command, args, ...rest);
      };
    });
    afterEach(() => {
      appModule.runViewPrsCommand = originalRunViewPrsCommand;
    });

    test("fetches the description with gh, then answers from its copy while the PR is unchanged, and fetches again once it changes", async () => {
      writeRow("2026-11-01T00:00:00Z");

      const first = await request.get("/pr-description").query({ repo, prNumber });
      expect(first.status).toBe(200);
      expect(first.body).toMatchObject({ ok: true, source: "fresh", body: "## What\n\nFixes the thing.", fetchedAt: expect.any(String) });
      expect(calls).toEqual([["gh", "pr", "view", prNumber, "-R", repo, "--json", "body"]]);

      const second = await request.get("/view-prs/pr-description").query({ repo, prNumber });
      expect(second.body).toMatchObject({ ok: true, source: "cache", body: "## What\n\nFixes the thing." });
      expect(calls).toHaveLength(1);

      writeRow("2026-11-02T00:00:00Z");
      answer = async () => ({ stdout: JSON.stringify({ body: "Edited." }) });
      const third = await request.get("/pr-description").query({ repo, prNumber });
      expect(third.body).toMatchObject({ source: "fresh", body: "Edited." });
      expect(calls).toHaveLength(2);
    });

    test("a failed fetch answers with the copy, marked stale; with no copy it's a 502", async () => {
      writeRow("2026-11-01T00:00:00Z");
      answer = async () => {
        throw new Error("gh: network down");
      };
      const none = await request.get("/pr-description").query({ repo, prNumber });
      expect(none.status).toBe(502);
      expect(none.body).toEqual({ ok: false, error: "gh: network down" });

      answer = async () => ({ stdout: JSON.stringify({ body: "Kept." }) });
      await request.get("/pr-description").query({ repo, prNumber });
      writeRow("2026-11-05T00:00:00Z");
      answer = async () => {
        throw new Error("gh: network down");
      };
      const stale = await request.get("/pr-description").query({ repo, prNumber });
      expect(stale.status).toBe(200);
      expect(stale.body).toMatchObject({ ok: true, source: "stale-cache", stale: true, body: "Kept.", warning: "gh: network down" });
    });

    test("an empty description is an empty body; an unknown PR is a 404 and a bad request a 400, without asking gh", async () => {
      writeRow("2026-11-01T00:00:00Z");
      answer = async () => ({ stdout: JSON.stringify({ body: "" }) });
      expect((await request.get("/pr-description").query({ repo, prNumber })).body).toMatchObject({ ok: true, body: "" });
      calls = [];
      expect((await request.get("/pr-description").query({ repo, prNumber: "999" })).status).toBe(404);
      expect((await request.get("/pr-description").query({ repo: "nope", prNumber })).status).toBe(400);
      expect(calls).toEqual([]);
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

    // fetchPrDiffText (view-prs-pr-diff-cache.js) shells out to `gh api ...` via
    // runViewPrsCommand - mock it to reject so this exercises the route's failure
    // path without a real gh/network call.
    const originalRunViewPrsCommand = appModule.runViewPrsCommand;
    appModule.runViewPrsCommand = async () => {
      throw new Error();
    };

    let res;
    try {
      res = await request.get("/diff").query({ repo, prNumber });
    } finally {
      appModule.runViewPrsCommand = originalRunViewPrsCommand;
    }

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      ok: false,
      error: "Failed to fetch diff",
    });
  });

  test("returns null html when GET /insights-hook is requested and no hook script is configured", async () => {
    const repo = "owner/repo";
    const prNumber = "111";
    writeViewPrsData({
      byPrNumber: {
        [prNumber]: { prNumber, repo, data: { number: prNumber } },
      },
      lastRun: null,
    });

    const res = await request.get("/insights-hook").query({ repo, prNumber });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, html: null, error: null });
  });

  test("returns the hook script's html when GET /insights-hook is requested and the hook succeeds", async () => {
    const repo = "owner/repo";
    const prNumber = "222";
    writeViewPrsData({
      byPrNumber: {
        [prNumber]: { prNumber, repo, data: { number: prNumber, title: "Add feature" } },
      },
      lastRun: null,
    });

    let receivedMetadata = null;
    const originalRunInsightsHookScript = appModule.runInsightsHookScript;
    appModule.runInsightsHookScript = async (entry) => {
      receivedMetadata = appModule.buildInsightsHookMetadata(entry);
      return { html: "<div>hook output</div>", error: null };
    };

    let res;
    try {
      res = await request.get("/insights-hook").query({ repo, prNumber });
    } finally {
      appModule.runInsightsHookScript = originalRunInsightsHookScript;
    }

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, html: "<div>hook output</div>", error: null });
    expect(receivedMetadata).toMatchObject({
      repo,
      repoOwner: "owner",
      repoName: "repo",
      prId: prNumber,
      title: "Add feature",
      status: "open",
    });
  });

  test("returns a debug error alongside null html when GET /insights-hook is requested and a configured hook script fails", async () => {
    const repo = "owner/repo";
    const prNumber = "333";
    writeViewPrsData({
      byPrNumber: {
        [prNumber]: { prNumber, repo, data: { number: prNumber } },
      },
      lastRun: null,
    });

    const originalRunInsightsHookScript = appModule.runInsightsHookScript;
    appModule.runInsightsHookScript = async () => ({
      html: null,
      error: "Command exited with code 127",
    });

    let res;
    try {
      res = await request.get("/insights-hook").query({ repo, prNumber });
    } finally {
      appModule.runInsightsHookScript = originalRunInsightsHookScript;
    }

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      html: null,
      error: "Command exited with code 127",
    });
  });

  test("given the insights-hook dependency itself throws, when GET /insights-hook is requested, then status 500 is returned", async () => {
    const repo = "owner/repo";
    const prNumber = "444";
    writeViewPrsData({
      byPrNumber: {
        [prNumber]: { prNumber, repo, data: { number: prNumber } },
      },
      lastRun: null,
    });

    const originalRunInsightsHookScript = appModule.runInsightsHookScript;
    appModule.runInsightsHookScript = async () => {
      throw new Error("unexpected failure");
    };

    let res;
    try {
      res = await request.get("/insights-hook").query({ repo, prNumber });
    } finally {
      appModule.runInsightsHookScript = originalRunInsightsHookScript;
    }

    expect(res.status).toBe(500);
    expect(res.body.ok).toBe(false);
  });

  test("given invalid insights-hook query params, when GET /insights-hook is requested, then status 400 and route validation error are returned", async () => {
    const res = await request
      .get("/insights-hook")
      .query({ repo: "owner-only", prNumber: "abc" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      ok: false,
      error: "Invalid repo or prNumber",
    });
  });

  test("given no matching stored pr row, when GET /insights-hook is requested, then status 404 and route not-found error are returned", async () => {
    writeViewPrsData({ byPrNumber: {}, lastRun: null });

    const res = await request
      .get("/insights-hook")
      .query({ repo: "owner/repo", prNumber: "999" });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      ok: false,
      error: "PR #999 not found for repo owner/repo",
    });
  });

  // The list's rows carry the detail without its text (the full rows were
  // ~100 MB for 960 PRs); /pr-detail gives one PR's in full.
  // readViewPrsData keeps its answer while nothing it reads changes: it
  // parsed every file (~100 MB for 960 PRs) for each poll.
  describe("readViewPrsData's cache", () => {
    const row = (number, title, extra = {}) => ({
      prNumber: number,
      repo: "owner/repo",
      section: "open",
      updatedAt: "2026-06-02T18:00:00Z",
      data: { number, title, url: `https://github.com/owner/repo/pull/${number}`, viewerLogin: "alice", ...extra },
    });
    const diffFile = () => path.join(appModule.viewPrsPrDiffDir, "owner_repo__pr-4242.json");
    afterEach(() => {
      jest.restoreAllMocks();
      fs.rmSync(diffFile(), { force: true });
    });

    test("given nothing changed, when it's read again, then the same answer comes back without reading any file", () => {
      writeViewPrsData({ byPrNumber: { "owner/repo#1": row("1", "First") }, lastRun: null });
      const first = appModule.readViewPrsData();
      const readSpy = jest.spyOn(fs, "readFileSync");

      expect(appModule.readViewPrsData()).toBe(first);
      expect(readSpy).not.toHaveBeenCalled();
    });

    test("given the data file or the user state changes, when it's read again, then the change is there", () => {
      writeViewPrsData({ byPrNumber: { "owner/repo#1": row("1", "First") }, lastRun: null });
      appModule.readViewPrsData();
      writeViewPrsData({ byPrNumber: { "owner/repo#1": row("1", "Renamed") }, lastRun: null });
      expect(appModule.readViewPrsData().byPrNumber["owner/repo#1"].data.title).toBe("Renamed");

      writeViewPrsUserState({ ...EMPTY_USER_STATE, flaggedByRepo: { "owner/repo": { 1: true } } });
      expect(appModule.readViewPrsData().flaggedByRepo).toEqual({ "owner/repo": { 1: true } });
    });

    test("given a PR's diff appears in the diff cache, when it's read again, then its diff-only row is there", () => {
      writeViewPrsData({ byPrNumber: { "owner/repo#1": row("1", "First") }, lastRun: null });
      fs.mkdirSync(appModule.viewPrsPrDiffDir, { recursive: true });
      appModule.readViewPrsData();
      fs.writeFileSync(diffFile(), JSON.stringify({ repo: "owner/repo", prNumber: "4242", fetchedAt: "2026-06-02T18:00:00Z" }));

      expect(appModule.readViewPrsData().byPrNumber["owner/repo#4242"]).toBeDefined();
    });

    test("given the list was read, when a PR's detail is asked for, then only its detail file is read, not the data file", async () => {
      const detailFilePath = path.join(viewPrsPrDetailDir, "owner_repo__pr-778.json");
      fs.mkdirSync(path.dirname(detailFilePath), { recursive: true });
      fs.writeFileSync(detailFilePath, JSON.stringify({ activityTimeline: [], activityEvents: [], commentEvents: [{ body: "Hello" }], reviewThreads: [] }));
      writeViewPrsData({
        byPrNumber: { "owner/repo#778": row("778", "With detail", { detailRef: { file: detailFilePath, version: "v1" } }) },
        lastRun: null,
      });
      const listed = (await request.get("/data")).body.byPrNumber["owner/repo#778"].data;
      const readSpy = jest.spyOn(fs, "readFileSync");

      const res = await request.get("/pr-detail").query({ repo: "owner/repo", prNumber: "778" });

      expect(res.body.detail.commentEvents).toEqual([{ body: "Hello" }]);
      expect(res.body.detailVersion).toBe(listed.detailVersion);
      const filesRead = readSpy.mock.calls.map(([file]) => path.resolve(String(file)));
      expect(filesRead).toContain(path.resolve(detailFilePath));
      expect(filesRead).not.toContain(path.resolve(viewPrsDataFile));
    });
  });

  // Merged and closed PRs past the archive cutoff are in the archive file
  // (the script moves them): the page loads them only when it asks.
  describe("archived PRs", () => {
    const archived = (number, section = "merged", extra = {}) => ({
      prNumber: number,
      repo: "owner/repo",
      section,
      updatedAt: "2026-01-02T18:00:00Z",
      data: { number, title: `Old ${number}`, mergedAt: section === "merged" ? "2025-06-01T00:00:00Z" : "", ...extra },
    });
    const current = (number) => ({
      prNumber: number,
      repo: "owner/repo",
      section: "open",
      updatedAt: "2026-06-02T18:00:00Z",
      data: { number, title: `Current ${number}` },
    });
    const writeArchive = (byPrNumber) => {
      fs.writeFileSync(appModule.viewPrsArchiveFile, JSON.stringify({ byPrNumber }));
    };
    const diffFile = () => path.join(appModule.viewPrsPrDiffDir, "owner_repo__pr-501.json");
    afterEach(() => {
      fs.rmSync(appModule.viewPrsArchiveFile, { force: true });
      fs.rmSync(diffFile(), { force: true });
    });

    test("given archived PRs, when the page loads its data, then they're left out and counted by section, and GET /archive gives them", async () => {
      writeViewPrsData({ byPrNumber: { "owner/repo#1": current("1") }, lastRun: null });
      writeArchive({
        "owner/repo#501": archived("501"),
        // Fetched after it merged (a comment then): its events can be as late as that.
        "owner/repo#502": { ...archived("502"), fetchedAt: "2025-06-03T00:00:00Z" },
        "owner/repo#503": archived("503", "closed", { closedAt: "2025-05-01T00:00:00Z" }),
      });

      // Other tests' cached diffs may add diff-only rows: only these PRs' keys are checked.
      const archivedKeys = ["owner/repo#501", "owner/repo#502", "owner/repo#503"];
      const data = (await request.get("/data")).body;
      expect(Object.keys(data.byPrNumber)).toContain("owner/repo#1");
      archivedKeys.forEach((key) => expect(data.byPrNumber).not.toHaveProperty([key]));
      expect(data.archiveSummary).toEqual({
        version: expect.any(String),
        merged: 2,
        closed: 1,
        newestEventAt: "2025-06-03T00:00:00Z",
        authors: [],
        labels: [],
      });
      const manifest = (await request.get("/data-manifest")).body;
      expect(Object.keys(manifest.manifest)).toContain("owner/repo#1");
      archivedKeys.forEach((key) => expect(manifest.manifest).not.toHaveProperty([key]));
      expect(manifest.archiveSummary).toEqual(data.archiveSummary);

      const res = await request.get("/view-prs/archive");
      expect(res.status).toBe(200);
      expect(Object.keys(res.body.byPrNumber).sort()).toEqual(archivedKeys);
      expect(res.body.byPrNumber["owner/repo#501"]).toMatchObject({ archived: true, section: "merged", data: { title: "Old 501" } });
    });

    test("given archived PRs' authors and labels, then the summary lists each repo's once each, for the Author and Label lists", async () => {
      // Two repos, both in view ("owner/repo" is never a subscription's: a
      // placeholder).
      const inRepo = (repo, row) => ({ ...row, repo });
      writeViewPrsData({ byPrNumber: {}, lastRun: null });
      writeArchive({
        "acme/app#501": inRepo("acme/app", archived("501", "merged", { authorLogin: "old-dev", author: "Old Dev", labels: [{ name: "legacy" }, "docs"] })),
        // The same author and label again, in other cases: once each.
        "acme/app#502": inRepo("acme/app", archived("502", "merged", { authorLogin: "OLD-DEV", author: "Old Dev", labels: ["Legacy"] })),
        // No login: by name. Another repo: its own.
        "acme/app#503": inRepo("acme/app", archived("503", "closed", { author: "Ghost", labels: [] })),
        "acme/lib#7": inRepo("acme/lib", archived("7", "merged", { authorLogin: "old-dev", labels: ["legacy"] })),
      });
      appModule.viewPrsSourcesStorage.writeSources({
        subscriptions: [
          { repo: "acme/app", mode: "recent" },
          { repo: "acme/lib", mode: "recent" },
        ],
      });

      const summary = (await request.get("/data-manifest")).body.archiveSummary;
      expect(summary.authors).toEqual([
        { repo: "acme/app", login: "old-dev", name: "Old Dev" },
        { repo: "acme/app", login: "", name: "Ghost" },
        { repo: "acme/lib", login: "old-dev", name: "" },
      ]);
      expect(summary.labels).toEqual([
        { repo: "acme/app", name: "legacy" },
        { repo: "acme/app", name: "docs" },
        { repo: "acme/lib", name: "legacy" },
      ]);
    });

    test("given the archive changes, when the data is read again, then the archive's version and rows move with it", async () => {
      writeViewPrsData({ byPrNumber: {}, lastRun: null });
      writeArchive({ "owner/repo#501": archived("501") });
      const before = (await request.get("/data-manifest")).body.archiveSummary.version;
      writeArchive({ "owner/repo#501": archived("501"), "owner/repo#502": archived("502") });

      const after = (await request.get("/data-manifest")).body.archiveSummary;
      expect(after.version).not.toBe(before);
      expect(after.merged).toBe(2);
      expect(Object.keys((await request.get("/archive")).body.byPrNumber)).toHaveLength(2);
    });

    test("given a PR in both files (saved again after it was archived), then it's the data file's, and not archived", async () => {
      writeViewPrsData({ byPrNumber: { "owner/repo#501": current("501") }, lastRun: null });
      writeArchive({ "owner/repo#501": archived("501") });

      expect((await request.get("/data")).body.byPrNumber["owner/repo#501"].data.title).toBe("Current 501");
      expect((await request.get("/archive")).body.byPrNumber).toEqual({});
    });

    test("given an archived PR with a cached diff and notes, then it isn't shown as a diff-only or notes-only row, and its notes come with it", async () => {
      writeViewPrsData({ byPrNumber: {}, lastRun: null });
      writeArchive({ "owner/repo#501": archived("501") });
      writeViewPrsUserState({ ...EMPTY_USER_STATE, notesByPrNumber: { "owner/repo#501": { otherNotes: "kept" } } });
      fs.mkdirSync(appModule.viewPrsPrDiffDir, { recursive: true });
      fs.writeFileSync(diffFile(), JSON.stringify({ repo: "owner/repo", prNumber: "501", fetchedAt: "2026-06-02T18:00:00Z" }));

      expect((await request.get("/data")).body.byPrNumber).not.toHaveProperty(["owner/repo#501"]);
      expect((await request.get("/archive")).body.byPrNumber["owner/repo#501"]).toMatchObject({
        data: { title: "Old 501" },
        notes: expect.objectContaining({ otherNotes: "kept" }),
      });
    });

    test("given an archive file that can't be read, when a current PR's notes are saved, then they still save", async () => {
      writeViewPrsData({ byPrNumber: { "owner/repo#1": current("1") }, lastRun: null });
      fs.writeFileSync(appModule.viewPrsArchiveFile, '{"byPrNumber":');

      const res = await request.post("/notes").send({ repo: "owner/repo", prNumber: "1", comments: [], otherNotes: "still saved" });

      expect(res.status).toBe(200);
      expect(JSON.parse(fs.readFileSync(viewPrsUserStateFile, "utf8")).notesByPrNumber["owner/repo#1"]).toMatchObject({ otherNotes: "still saved" });
    });

    test("given an archived PR, when its notes are saved or its detail is asked for, then it's found", async () => {
      const detailFilePath = path.join(viewPrsPrDetailDir, "owner_repo__pr-504.json");
      fs.mkdirSync(path.dirname(detailFilePath), { recursive: true });
      fs.writeFileSync(detailFilePath, JSON.stringify({ activityTimeline: [], activityEvents: [], commentEvents: [{ body: "Old comment" }], reviewThreads: [] }));
      writeViewPrsData({ byPrNumber: {}, lastRun: null });
      writeArchive({ "owner/repo#504": archived("504", "merged", { detailRef: { file: detailFilePath, version: "v1" } }) });

      const versionBefore = (await request.get("/data-manifest")).body.archiveSummary.version;
      const notes = await request.post("/notes").send({ repo: "owner/repo", prNumber: "504", comments: [], otherNotes: "archived note" });
      expect(notes.status).toBe(200);
      // Its notes are in the archived rows the page holds: their version moves, so it fetches them again.
      expect((await request.get("/data-manifest")).body.archiveSummary.version).not.toBe(versionBefore);
      expect((await request.get("/archive")).body.byPrNumber["owner/repo#504"].notes).toMatchObject({ otherNotes: "archived note" });
      const { notesByPrNumber } = JSON.parse(fs.readFileSync(viewPrsUserStateFile, "utf8"));
      expect(notesByPrNumber["owner/repo#504"]).toMatchObject({ otherNotes: "archived note" });

      const detail = await request.get("/pr-detail").query({ repo: "owner/repo", prNumber: "504" });
      expect(detail.body.detail.commentEvents).toEqual([{ body: "Old comment" }]);
    });
  });

  test("given a row with a detail file, when GET /data and GET /pr-detail are requested, then the list's row has the detail without its text and /pr-detail all of it", async () => {
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
          activityTimeline: [{ date: "2026-06-02", events: [{ type: "comment", actor: "alice", body: "Looks fine" }] }],
          activityEvents: [{ type: "comment", actor: "alice", body: "Looks fine", url: "https://example.test/c1" }],
          reviewThreads: [
            { id: "thread-1", comments: [{ id: "c2", authorLogin: "alice", body: "@Bob can you check this?", createdAt: "2026-06-02T18:00:00Z" }] },
          ],
          commentEvents: [{ channel: "thread", actor: "alice", body: "@Bob can you check this?" }],
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

      const row = res.body?.byPrNumber?.[`owner/repo#${prNumber}`]?.data;
      expect(row.detailSlim).toBe(true);
      expect(row.detailVersion).toMatch(/^[0-9a-f]{16}$/);
      expect(row.activityTimeline).toEqual([]);
      expect(row.activityEvents).toEqual([{ type: "comment", actor: "alice" }]);
      expect(row.commentEvents).toEqual([{ channel: "thread", actor: "alice" }]);
      expect(row.reviewThreads).toEqual([
        { id: "thread-1", comments: [{ id: "c2", authorLogin: "alice", createdAt: "2026-06-02T18:00:00Z", mentions: ["bob"] }] },
      ]);

      const detailRes = await request.get("/pr-detail").query({ repo: "owner/repo", prNumber });
      expect(detailRes.status).toBe(200);
      expect(detailRes.body.detailVersion).toBe(row.detailVersion);
      expect(detailRes.body.detail.activityTimeline[0].events[0].body).toBe("Looks fine");
      expect(detailRes.body.detail.reviewThreads[0].comments[0].body).toBe("@Bob can you check this?");
      expect(detailRes.body.detail.commentEvents).toHaveLength(1);

      const detailsRes = await request.post("/pr-details").send({ prs: [{ repo: "owner/repo", prNumber }, { repo: "owner/repo", prNumber: "999" }] });
      expect(Object.keys(detailsRes.body.byPrKey)).toEqual([`owner/repo#${prNumber}`]);
      expect((await request.get("/pr-detail").query({ repo: "owner/repo", prNumber: "999" })).status).toBe(404);
      expect((await request.get("/pr-detail").query({ repo: "bad", prNumber })).status).toBe(400);
    } finally {
      app.enqueuePrDiffRefreshForData = originalEnqueuePrDiffRefreshForData;
    }
  });

  test("returns success when POST /run receives valid input with mocked script execution", async () => {
    // Mock runViewPrsScript to avoid running shell, and getDependencyStatus so
    // this doesn't depend on gh/jq/bash actually being installed on whatever
    // machine runs the suite (see the same pattern used further down this
    // file for the missing-dependency tests).
    const app = require("../app.js");
    const orig = app.runViewPrsScript;
    const origDep = app.getDependencyStatus;
    app.runViewPrsScript = () => Promise.resolve({ stdout: "ok", stderr: "" });
    app.getDependencyStatus = () => ({ ok: true, missing: [] });
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
      app.getDependencyStatus = origDep;
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
    const origDep = app.getDependencyStatus;
    app.runViewPrsScript = () => Promise.resolve({ stdout: "ok", stderr: "" });
    app.getDependencyStatus = () => ({ ok: true, missing: [] });
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
      app.getDependencyStatus = origDep;
      if (typeof testServer.closeAllConnections === "function") {
        testServer.closeAllConnections();
      }
      if (typeof testServer.closeIdleConnections === "function") {
        testServer.closeIdleConnections();
      }
      await new Promise((resolve) => testServer.close(resolve));
    }
  });

  test("a Run script is a task of yours counting the PRs it finishes - of how many for chosen PRs; gone when it ends", async () => {
    const app = require("../app.js");
    const orig = app.runViewPrsScript;
    const origDep = app.getDependencyStatus;
    const savedSources = app.viewPrsSourcesStorage.readSources();
    const seen = [];
    app.runViewPrsScript = async (_args, _maxBuffer, options) => {
      options.progressTracker.onEnd("5");
      seen.push(app.getViewPrsSchedulerPublicState().tasks);
      return { stdout: "ok", stderr: "" };
    };
    app.getDependencyStatus = () => ({ ok: true, missing: [] });
    const testServer = createViewPrsApp().listen(0);
    const testRequest = supertest(testServer);
    try {
      await testRequest.post("/view-prs/run").send({ repo: "acme-org/run-task", prNumber: "5, 6", openMode: "none" }).expect(200);
      await testRequest.post("/view-prs/run").send({ repo: "acme-org/run-task", openMode: "none" }).expect(200);

      expect(seen[0]).toEqual([
        expect.objectContaining({ kind: "runScript", origin: "you", repos: ["acme-org/run-task"], unit: "PR", done: 1, total: 2 }),
      ]);
      expect(seen[1]).toEqual([expect.objectContaining({ kind: "runScript", done: 1, total: null })]);
      expect(app.getViewPrsSchedulerPublicState().tasks).toEqual([]);
    } finally {
      app.runViewPrsScript = orig;
      app.getDependencyStatus = origDep;
      app.viewPrsSourcesStorage.writeSources(savedSources);
      await new Promise((resolve) => testServer.close(resolve));
    }
  });

  // Running a repo in full always added it to the background updates; it
  // subscribes it (the sources file) now. A run of one PR adds just it, so
  // its row stays in view.
  test("a full manual run subscribes its repo to its recent PRs, and a run of one PR adds just it", async () => {
    const app = require("../app.js");
    const orig = app.runViewPrsScript;
    const origDep = app.getDependencyStatus;
    const savedSources = app.viewPrsSourcesStorage.readSources();
    app.runViewPrsScript = () => Promise.resolve({ stdout: "ok", stderr: "" });
    app.getDependencyStatus = () => ({ ok: true, missing: [] });
    app.viewPrsSourcesStorage.writeSources({ subscriptions: [] });
    const testServer = createViewPrsApp().listen(0);
    const testRequest = supertest(testServer);
    try {
      await testRequest.post("/view-prs/run").send({ repo: "acme-org/run-whole", openMode: "none" }).expect(200);
      await testRequest.post("/view-prs/run").send({ repo: "acme-org/run-one", prNumber: "5", openMode: "none" }).expect(200);
      await testRequest.post("/view-prs/run").send({ repo: "owner/repo", openMode: "none" }).expect(200);

      expect(app.viewPrsSourcesStorage.readSources().subscriptions).toEqual([{ repo: "acme-org/run-whole", mode: "recent" }]);
      expect(app.viewPrsSourcesStorage.readSources().trackedPrs).toEqual([
        expect.objectContaining({ repo: "acme-org/run-one", number: "5", url: "https://github.com/acme-org/run-one/pull/5" }),
      ]);
      expect(app.getViewPrsAutoRefreshRepos("")).toEqual(["acme-org/run-whole", "acme-org/run-one"]);

      // A run of one PR in a subscribed repo, or of one added already, adds nothing.
      await testRequest.post("/view-prs/run").send({ repo: "acme-org/run-whole", prNumber: "8", openMode: "none" }).expect(200);
      await testRequest.post("/view-prs/run").send({ repo: "acme-org/run-one", prNumber: "5", openMode: "none" }).expect(200);
      expect(app.viewPrsSourcesStorage.readSources().trackedPrs).toHaveLength(1);
    } finally {
      app.runViewPrsScript = orig;
      app.getDependencyStatus = origDep;
      if (savedSources) {
        app.viewPrsSourcesStorage.writeSources(savedSources);
      } else {
        fs.rmSync(app.viewPrsSourcesStorage.sourcesFile, { force: true });
        fs.rmSync(`${app.viewPrsSourcesStorage.sourcesFile}.seeded`, { force: true });
      }
      testServer.closeAllConnections?.();
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
    // No-arg auto refresh targets every configured repo - populate that
    // same set's own circuit breaker entries (circuit breaker is now
    // per-repo - see autoCircuitByRepo's own comment in app.js).
    const openUntilIso = new Date(Date.now() + 60000).toISOString();
    app.getViewPrsAutoRefreshRepos().forEach((repo) => {
      app.viewPrsSchedulerState.autoCircuitByRepo[repo] = {
        consecutiveFailures: 3,
        circuitOpenUntil: openUntilIso,
        lastCircuitOpenedAt: new Date().toISOString(),
      };
    });
    await runViewPrsAutoRefresh();
    expect(app.viewPrsSchedulerState.lastAutoSkipReason).toMatch(
      /auto refresh circuit open/,
    );
    app.getDependencyStatus = origDep;
    app.viewPrsSchedulerState.autoCircuitByRepo = {};
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
    app.viewPrsSchedulerState.manualFullRunAtByRepo = { "*": new Date().toISOString() };
    await runViewPrsAutoRefresh();
    expect(app.viewPrsSchedulerState.lastAutoSkipReason).toMatch(
      /manual run happened within/,
    );
    app.getDependencyStatus = origDep;
    app.viewPrsSchedulerState.manualFullRunAtByRepo = {};
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
      const row = res.body?.byPrNumber?.["owner/repo#901"]?.data;
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
