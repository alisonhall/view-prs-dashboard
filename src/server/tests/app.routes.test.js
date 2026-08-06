const fs = require("fs");
const path = require("path");

// Patch runViewPrsScript to avoid running real shell scripts in tests
const appModule = require("../app.js");
// Patch BEFORE app creation so the Express app uses the mock
appModule.runViewPrsScript = async (args, _maxBufferBytes, _options) => {
  return {
    stdout: "MOCK STDOUT",
    stderr: "",
    command: `bash ${args.join(" ")}`,
  };
};
appModule.getDependencyStatus = () => ({ ok: true, missing: [] });
const { createViewPrsApp } = appModule;

const requestJson = async (server, route) => {
  const address = server.address();
  if (!address || typeof address !== "object") {
    throw new Error("Unable to resolve server address");
  }

  const response = await fetch(`http://127.0.0.1:${address.port}${route}`, {
    headers: {
      Connection: "close",
    },
  });
  const payload = await response.json();
  return { response, payload };
};

const postJson = async (server, route, body) => {
  const address = server.address();
  if (!address || typeof address !== "object") {
    throw new Error("Unable to resolve server address");
  }

  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}${route}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Connection: "close",
        },
        body: JSON.stringify(body || {}),
      });

      const payload = await response.json();
      return { response, payload };
    } catch (error) {
      lastError = error;
      const message = String(error?.message || "");
      const isConnectionReset = /ECONNRESET/i.test(message);
      if (!isConnectionReset || attempt === 1) {
        throw error;
      }
    }
  }

  throw lastError || new Error("POST request failed");
};

describe("route behavior", () => {
  jest.setTimeout(20000);
  let server;
  let userDefaultsFilePath;
  let userDefaultsFileExisted;
  let originalUserDefaultsRaw;
  let authorCommentsFilePath;
  let authorCommentsFileExisted;
  let originalAuthorCommentsRaw;
  let actorNameCacheFilePath;
  let actorNameCacheFileExisted;
  let originalActorNameCacheRaw;
  let actorLoginAliasesFilePath;
  let actorLoginAliasesFileExisted;
  let originalActorLoginAliasesRaw;
  let actionLogFilePath;
  let actionLogFileExisted;
  let originalActionLogRaw;

  beforeAll(() => {
    process.env.BACKFILL_EXTRA_ARGS = "--dry-run --max-prs 1";
    process.env.BACKFILL_DELAY_MS = "0";
    process.env.BACKFILL_MAX_PRS = "1";
    process.env.BACKFILL_JOBS = "1";

    userDefaultsFilePath = appModule.viewPrsUserDefaultsFile;
    userDefaultsFileExisted = fs.existsSync(userDefaultsFilePath);
    originalUserDefaultsRaw = userDefaultsFileExisted
      ? fs.readFileSync(userDefaultsFilePath, "utf8")
      : "";

    authorCommentsFilePath = appModule.viewPrsAuthorCommentsFile;
    authorCommentsFileExisted = fs.existsSync(authorCommentsFilePath);
    originalAuthorCommentsRaw = authorCommentsFileExisted
      ? fs.readFileSync(authorCommentsFilePath, "utf8")
      : "";

    actorNameCacheFilePath = appModule.viewPrsActorNameCacheFile;
    actorNameCacheFileExisted = fs.existsSync(actorNameCacheFilePath);
    originalActorNameCacheRaw = actorNameCacheFileExisted
      ? fs.readFileSync(actorNameCacheFilePath, "utf8")
      : "";

    actorLoginAliasesFilePath = appModule.viewPrsActorLoginAliasesFile;
    actorLoginAliasesFileExisted = fs.existsSync(actorLoginAliasesFilePath);
    originalActorLoginAliasesRaw = actorLoginAliasesFileExisted
      ? fs.readFileSync(actorLoginAliasesFilePath, "utf8")
      : "";

    actionLogFilePath = appModule.viewPrsActionLogFile;
    actionLogFileExisted = fs.existsSync(actionLogFilePath);
    originalActionLogRaw = actionLogFileExisted
      ? fs.readFileSync(actionLogFilePath, "utf8")
      : "";

    // Force startup path that creates the defaults file when missing.
    fs.rmSync(userDefaultsFilePath, { force: true });
    fs.rmSync(authorCommentsFilePath, { force: true });
    fs.rmSync(actorNameCacheFilePath, { force: true });
    fs.rmSync(actorLoginAliasesFilePath, { force: true });
    fs.rmSync(actionLogFilePath, { force: true });

    const app = createViewPrsApp();
    server = app.listen(0);
  });

  afterAll(() => {
    return new Promise((resolve, reject) => {
      if (typeof server.closeAllConnections === "function") {
        server.closeAllConnections();
      }
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        try {
          if (userDefaultsFileExisted) {
            fs.mkdirSync(path.dirname(userDefaultsFilePath), { recursive: true });
            fs.writeFileSync(userDefaultsFilePath, originalUserDefaultsRaw, "utf8");
          } else {
            fs.rmSync(userDefaultsFilePath, { force: true });
          }

          if (authorCommentsFileExisted) {
            fs.mkdirSync(path.dirname(authorCommentsFilePath), { recursive: true });
            fs.writeFileSync(
              authorCommentsFilePath,
              originalAuthorCommentsRaw,
              "utf8",
            );
          } else {
            fs.rmSync(authorCommentsFilePath, { force: true });
          }

          if (actorNameCacheFileExisted) {
            fs.mkdirSync(path.dirname(actorNameCacheFilePath), { recursive: true });
            fs.writeFileSync(
              actorNameCacheFilePath,
              originalActorNameCacheRaw,
              "utf8",
            );
          } else {
            fs.rmSync(actorNameCacheFilePath, { force: true });
          }

          if (actorLoginAliasesFileExisted) {
            fs.mkdirSync(path.dirname(actorLoginAliasesFilePath), { recursive: true });
            fs.writeFileSync(
              actorLoginAliasesFilePath,
              originalActorLoginAliasesRaw,
              "utf8",
            );
          } else {
            fs.rmSync(actorLoginAliasesFilePath, { force: true });
          }

          if (actionLogFileExisted) {
            fs.mkdirSync(path.dirname(actionLogFilePath), { recursive: true });
            fs.writeFileSync(actionLogFilePath, originalActionLogRaw, "utf8");
          } else {
            fs.rmSync(actionLogFilePath, { force: true });
          }
        } catch (_restoreError) {
          // Best effort restore only.
        }

        resolve();
      });
    });
  });

  test("returns scheduler and data metadata when GET /data is requested", async () => {
    const { response, payload } = await requestJson(server, "/data");

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload).toMatchObject({
      scheduler: expect.objectContaining({
        intervalMinutes: 15,
        manualCooldownMinutes: 15,
      }),
      byPrNumber: expect.anything(),
      dataMeta: expect.anything(),
      backfill: expect.any(Object),
    });
    // lastRun can be null or an object
    expect(payload).toHaveProperty("lastRun");

    const scheduler = payload.scheduler;
    const requiredSchedulerKeys = [
      "activePrNumbers",
      "startedAt",
      "isAutoRunInProgress",
      "lastManualRunAt",
      "lastAutoAttemptAt",
      "lastAutoRunAt",
      "lastAutoSkipReason",
      "lastAutoError",
      "autoCircuitFailureThreshold",
      "autoCircuitCooldownMinutes",
      "consecutiveAutoFailures",
      "autoCircuitOpenUntil",
      "lastAutoCircuitOpenedAt",
    ];
    requiredSchedulerKeys.forEach((key) => {
      expect(scheduler).toHaveProperty(key);
    });
    expect(Array.isArray(scheduler.activePrNumbers)).toBe(true);

    expect(payload.backfill).toMatchObject({
      ok: expect.any(Boolean),
      running: expect.any(Boolean),
      // pid can be null or a number/string, so just check defined
      logFile: expect.anything(),
      pidFile: expect.anything(),
      summary: expect.anything(),
      output: expect.anything(),
    });
    expect(payload.backfill).toHaveProperty("pid");
  });

  test("creates and returns author comments when author comments endpoints are used", async () => {
    const createResult = await postJson(server, "/author-comments", {
      authorLogin: "ahall236_uhg",
      note: "Helpful reviewer patterns",
      sentiment: "positive",
    });

    expect(createResult.response.status).toBe(200);
    expect(createResult.payload.ok).toBe(true);
    expect(createResult.payload.authorLogin).toBe("ahall236_uhg");
    expect(Array.isArray(createResult.payload.comments)).toBe(true);
    expect(createResult.payload.comments.length).toBe(1);
    expect(createResult.payload.comments[0]).toMatchObject({
      note: "Helpful reviewer patterns",
      sentiment: "positive",
    });
    expect(typeof createResult.payload.comments[0].createdAt).toBe("string");

    const readResult = await requestJson(
      server,
      "/author-comments?authorLogin=ahall236_uhg",
    );
    expect(readResult.response.status).toBe(200);
    expect(readResult.payload.ok).toBe(true);
    expect(readResult.payload.authorLogin).toBe("ahall236_uhg");
    expect(readResult.payload.comments.length).toBe(1);
  });

  test("given an aliased author login, when author comments are created and read across both logins, then they share one canonical author identity", async () => {
    fs.mkdirSync(path.dirname(actorLoginAliasesFilePath), { recursive: true });
    fs.writeFileSync(
      actorLoginAliasesFilePath,
      JSON.stringify(
        { "7c7240971101674017d4597caddf24_uhg": "mthom486_uhg" },
        null,
        2,
      ),
      "utf8",
    );

    const createResult = await postJson(server, "/author-comments", {
      authorLogin: "7c7240971101674017d4597caddf24_uhg",
      note: "Merged alias author comment",
      sentiment: "positive",
    });

    expect(createResult.response.status).toBe(200);
    expect(createResult.payload.ok).toBe(true);
    expect(createResult.payload.authorLogin).toBe("mthom486_uhg");

    const readCanonical = await requestJson(
      server,
      "/author-comments?authorLogin=mthom486_uhg",
    );
    expect(readCanonical.response.status).toBe(200);
    expect(readCanonical.payload.authorLogin).toBe("mthom486_uhg");
    expect(readCanonical.payload.comments.some((comment) => comment.note === "Merged alias author comment")).toBe(true);

    const readAlias = await requestJson(
      server,
      "/author-comments?authorLogin=7c7240971101674017d4597caddf24_uhg",
    );
    expect(readAlias.response.status).toBe(200);
    expect(readAlias.payload.authorLogin).toBe("mthom486_uhg");
    expect(readAlias.payload.comments.some((comment) => comment.note === "Merged alias author comment")).toBe(true);
  });

  test("updates saved author comments via PUT /author-comments", async () => {
    const created = await postJson(server, "/author-comments", {
      authorLogin: "reviewer1",
      note: "Original note",
      sentiment: "neutral",
    });
    const existingCommentId = created.payload.comments[0].id;
    const existingCreatedAt = created.payload.comments[0].createdAt;

    const address = server.address();
    const updateResponse = await fetch(
      `http://127.0.0.1:${address.port}/author-comments`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Connection: "close",
        },
        body: JSON.stringify({
          authorLogin: "reviewer1",
          id: existingCommentId,
          note: "Updated note",
          sentiment: "negative",
        }),
      },
    );
    const updatePayload = await updateResponse.json();

    expect(updateResponse.status).toBe(200);
    expect(updatePayload.ok).toBe(true);
    expect(updatePayload.comment).toMatchObject({
      id: existingCommentId,
      note: "Updated note",
      sentiment: "negative",
    });
    expect(updatePayload.comment.createdAt).toBe(existingCreatedAt);
    expect(typeof updatePayload.comment.updatedAt).toBe("string");

    const actionLogEntry = appModule
      .readActionLog()
      .find(
        (entry) =>
          entry?.action === "put/author-comments" &&
          entry?.detail?.commentId === existingCommentId,
      );
    expect(actionLogEntry).toBeTruthy();
    expect(actionLogEntry.detail).toEqual({
      authorLogin: "reviewer1",
      commentId: existingCommentId,
      file: appModule.viewPrsAuthorCommentsFile,
    });
  });

  test("returns 400 for invalid author comment payloads", async () => {
    const missingAuthor = await postJson(server, "/author-comments", {
      note: "Missing author",
      sentiment: "neutral",
    });
    expect(missingAuthor.response.status).toBe(400);
    expect(missingAuthor.payload.ok).toBe(false);

    const missingNote = await postJson(server, "/author-comments", {
      authorLogin: "reviewer2",
      note: "   ",
      sentiment: "neutral",
    });
    expect(missingNote.response.status).toBe(400);
    expect(missingNote.payload.ok).toBe(false);
  });

  test("returns 400 when GET /author-comments omits authorLogin", async () => {
    const { response, payload } = await requestJson(server, "/author-comments");

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(payload.error).toContain("authorLogin");
  });

  test("returns 400 when PUT /author-comments omits comment id", async () => {
    const address = server.address();
    const updateResponse = await fetch(
      `http://127.0.0.1:${address.port}/author-comments`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Connection: "close",
        },
        body: JSON.stringify({
          authorLogin: "reviewer3",
          note: "Missing id",
          sentiment: "neutral",
        }),
      },
    );
    const updatePayload = await updateResponse.json();

    expect(updateResponse.status).toBe(400);
    expect(updatePayload.ok).toBe(false);
    expect(updatePayload.error).toContain("comment id");
  });

  test("returns 404 when PUT /author-comments references an unknown author", async () => {
    const address = server.address();
    const updateResponse = await fetch(
      `http://127.0.0.1:${address.port}/author-comments`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Connection: "close",
        },
        body: JSON.stringify({
          authorLogin: "unknown-author",
          id: "ac-does-not-exist",
          note: "Update attempt",
          sentiment: "neutral",
        }),
      },
    );
    const updatePayload = await updateResponse.json();

    expect(updateResponse.status).toBe(404);
    expect(updatePayload.ok).toBe(false);
    expect(updatePayload.error).toContain("Author comments not found");
  });

  test("returns 404 when PUT /author-comments references an unknown comment id for an existing author", async () => {
    await postJson(server, "/author-comments", {
      authorLogin: "reviewer-existing",
      note: "Seed comment",
      sentiment: "neutral",
    });

    const address = server.address();
    const updateResponse = await fetch(
      `http://127.0.0.1:${address.port}/author-comments`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Connection: "close",
        },
        body: JSON.stringify({
          authorLogin: "reviewer-existing",
          id: "ac-unknown",
          note: "Update attempt",
          sentiment: "negative",
        }),
      },
    );
    const updatePayload = await updateResponse.json();

    expect(updateResponse.status).toBe(404);
    expect(updatePayload.ok).toBe(false);
    expect(updatePayload.error).toContain("Comment not found");
  });

  test("returns data metadata when GET /data-meta is requested", async () => {
    const { response, payload } = await requestJson(server, "/data-meta");

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.supportsDataManifest).toBe(true);
    expect(payload).toHaveProperty("dataVersion");
    expect(payload).toHaveProperty("lastModifiedAt");
    expect(payload).toHaveProperty("sizeBytes");
  });

  test("returns per-PR manifest when GET /data-manifest is requested", async () => {
    const { response, payload } = await requestJson(server, "/data-manifest");

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(typeof payload.manifest).toBe("object");
    expect(payload.manifest).not.toBeNull();
    expect(payload).toHaveProperty("dataMeta");
  });

  test("returns per-PR deltas when POST /data-delta is requested", async () => {
    const initialData = await requestJson(server, "/data");
    const knownPrNumber = Object.keys(initialData.payload?.byPrNumber || {})[0];
    const requested = [knownPrNumber || "123456789", "999999999"];

    const { response, payload } = await postJson(server, "/data-delta", {
      prNumbers: requested,
    });

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.requestedCount).toBe(2);
    expect(payload).toHaveProperty("byPrNumber");
    expect(Array.isArray(payload.missingPrNumbers)).toBe(true);
    if (knownPrNumber) {
      expect(payload.byPrNumber).toHaveProperty(String(knownPrNumber));
    }
    expect(payload.missingPrNumbers).toContain("999999999");
  });

  test("returns 400 when POST /data-delta omits prNumbers", async () => {
    const { response, payload } = await postJson(server, "/data-delta", {
      numbers: ["1"],
    });

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
  });

  test("returns scheduler state when GET /scheduler is requested", async () => {
    const { response, payload } = await requestJson(server, "/scheduler");

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload).toHaveProperty("scheduler");
    expect(payload.scheduler).toMatchObject({
      intervalMinutes: 15,
      manualCooldownMinutes: 15,
    });
  });

  test("serves stylesheet content when GET /index.css is requested", async () => {
    const address = server.address();
    if (!address || typeof address !== "object") {
      throw new Error("Unable to resolve server address");
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/index.css`);
    const css = await response.text();

    expect(response.status).toBe(200);
    expect(String(response.headers.get("content-type") || "")).toContain(
      "text/css",
    );
    expect(css.length).toBeGreaterThan(0);
  });

  test("creates the user-defaults file on startup when it is missing", () => {
    expect(fs.existsSync(userDefaultsFilePath)).toBe(true);

    const persisted = JSON.parse(fs.readFileSync(userDefaultsFilePath, "utf8"));
    expect(persisted).toEqual({});
  });

  test("returns an overrides object when GET /user-defaults is requested", async () => {
    const { response, payload } = await requestJson(server, "/user-defaults");

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(typeof payload.overrides).toBe("object");
    expect(payload.overrides).not.toBeNull();
    expect(Array.isArray(payload.overrides)).toBe(false);
  });

  test("returns persisted overrides when GET /user-defaults reads a saved file", async () => {
    fs.writeFileSync(
      userDefaultsFilePath,
      JSON.stringify(
        {
          "scope-mode": "needs-attention",
          "attention-include-closed-merged": false,
        },
        null,
        2,
      ),
      "utf8",
    );

    const { response, payload } = await requestJson(server, "/user-defaults");

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.overrides["scope-mode"]).toBe("needs-attention");
    expect(payload.overrides["attention-include-closed-merged"]).toBe(false);
  });

  test("returns an empty overrides object when /user-defaults file JSON is invalid", async () => {
    fs.writeFileSync(userDefaultsFilePath, "{invalid-json", "utf8");

    const { response, payload } = await requestJson(server, "/user-defaults");

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.overrides).toEqual({});
  });

  test("persists overrides when PUT /user-defaults receives a valid body", async () => {
    const address = server.address();
    const putResponse = await fetch(
      `http://127.0.0.1:${address.port}/user-defaults`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ "scope-mode": "mine" }),
      },
    );
    const putPayload = await putResponse.json();
    expect(putResponse.status).toBe(200);
    expect(putPayload.ok).toBe(true);

    const { response, payload } = await requestJson(server, "/user-defaults");
    expect(response.status).toBe(200);
    expect(payload.overrides["scope-mode"]).toBe("mine");
  });

  test("returns 400 when PUT /user-defaults receives a non-object body", async () => {
    const address = server.address();
    const putResponse = await fetch(
      `http://127.0.0.1:${address.port}/user-defaults`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([1, 2, 3]),
      },
    );
    const putPayload = await putResponse.json();
    expect(putResponse.status).toBe(400);
    expect(putPayload.ok).toBe(false);
  });

  test("given actor-name-cache file is missing, when GET /actor-name-cache is requested, then the file is created and an empty map is returned", async () => {
    fs.rmSync(actorNameCacheFilePath, { force: true });

    const { response, payload } = await requestJson(server, "/actor-name-cache");

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.entries).toEqual({});
    expect(payload.count).toBe(0);
    expect(fs.existsSync(actorNameCacheFilePath)).toBe(true);
  });

  test("given actor-name-cache contains entries, when GET /actor-name-cache is requested, then persisted mappings are returned", async () => {
    fs.mkdirSync(path.dirname(actorNameCacheFilePath), { recursive: true });
    fs.writeFileSync(
      actorNameCacheFilePath,
      JSON.stringify({ "ahall236_uhg": "Alison Hall" }, null, 2),
      "utf8",
    );

    const { response, payload } = await requestJson(server, "/actor-name-cache");

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.entries).toEqual({ ahall236_uhg: "Alison Hall" });
    expect(payload.count).toBe(1);
  });

  test("given actor-name-cache is missing and /data contains a new author login, when GET /data is requested, then the login is added to actor-name-cache", async () => {
    const dataFilePath = appModule.viewPrsDataFile;
    const dataFileExisted = fs.existsSync(dataFilePath);
    const originalDataRaw = dataFileExisted
      ? fs.readFileSync(dataFilePath, "utf8")
      : "";

    try {
      fs.rmSync(actorNameCacheFilePath, { force: true });
      fs.mkdirSync(path.dirname(dataFilePath), { recursive: true });
      fs.writeFileSync(
        dataFilePath,
        JSON.stringify(
          {
            byPrNumber: {
              "9999": {
                data: {
                  number: 9999,
                  repo: "owner/repo",
                  authorLogin: "new_author_login",
                  author: "New Author",
                },
              },
            },
            lastRun: "2026-07-07T00:00:00.000Z",
          },
          null,
          2,
        ),
        "utf8",
      );

      const { response } = await requestJson(server, "/data");

      expect(response.status).toBe(200);
      expect(fs.existsSync(actorNameCacheFilePath)).toBe(true);

      const savedCache = JSON.parse(fs.readFileSync(actorNameCacheFilePath, "utf8"));
      expect(savedCache.new_author_login).toBe("New Author");
    } finally {
      if (dataFileExisted) {
        fs.mkdirSync(path.dirname(dataFilePath), { recursive: true });
        fs.writeFileSync(dataFilePath, originalDataRaw, "utf8");
      } else {
        fs.rmSync(dataFilePath, { force: true });
      }
    }
  });

  test("given actor-name-cache is missing and /data includes authorLogin without a display name, when GET /data is requested, then actor-name-cache stores the login as the fallback name", async () => {
    const dataFilePath = appModule.viewPrsDataFile;
    const dataFileExisted = fs.existsSync(dataFilePath);
    const originalDataRaw = dataFileExisted
      ? fs.readFileSync(dataFilePath, "utf8")
      : "";

    try {
      fs.rmSync(actorNameCacheFilePath, { force: true });
      fs.mkdirSync(path.dirname(dataFilePath), { recursive: true });
      fs.writeFileSync(
        dataFilePath,
        JSON.stringify(
          {
            byPrNumber: {
              "10001": {
                data: {
                  number: 10001,
                  repo: "owner/repo",
                  authorLogin: "fallback_login_only_10001",
                },
              },
            },
            lastRun: "2026-07-07T00:00:00.000Z",
          },
          null,
          2,
        ),
        "utf8",
      );

      const { response } = await requestJson(server, "/data");

      expect(response.status).toBe(200);
      expect(fs.existsSync(actorNameCacheFilePath)).toBe(true);

      const savedCache = JSON.parse(fs.readFileSync(actorNameCacheFilePath, "utf8"));
      expect(savedCache.fallback_login_only_10001).toBe(
        "fallback_login_only_10001",
      );
    } finally {
      if (dataFileExisted) {
        fs.mkdirSync(path.dirname(dataFilePath), { recursive: true });
        fs.writeFileSync(dataFilePath, originalDataRaw, "utf8");
      } else {
        fs.rmSync(dataFilePath, { force: true });
      }
    }
  });

  test("given /data includes unknown and valid author logins, when GET /data is requested, then actor-name-cache skips unknown and persists only valid logins", async () => {
    const dataFilePath = appModule.viewPrsDataFile;
    const dataFileExisted = fs.existsSync(dataFilePath);
    const originalDataRaw = dataFileExisted
      ? fs.readFileSync(dataFilePath, "utf8")
      : "";

    try {
      fs.rmSync(actorNameCacheFilePath, { force: true });
      fs.mkdirSync(path.dirname(dataFilePath), { recursive: true });
      fs.writeFileSync(
        dataFilePath,
        JSON.stringify(
          {
            byPrNumber: {
              "10002": {
                data: {
                  number: 10002,
                  repo: "owner/repo",
                  authorLogin: "unknown",
                  author: "Unknown Person",
                },
              },
              "10003": {
                data: {
                  number: 10003,
                  repo: "owner/repo",
                  authorLogin: "known_login_10003",
                  author: "Known Person",
                },
              },
            },
            lastRun: "2026-07-07T00:00:00.000Z",
          },
          null,
          2,
        ),
        "utf8",
      );

      const { response } = await requestJson(server, "/data");

      expect(response.status).toBe(200);
      expect(fs.existsSync(actorNameCacheFilePath)).toBe(true);

      const savedCache = JSON.parse(fs.readFileSync(actorNameCacheFilePath, "utf8"));
      expect(savedCache.known_login_10003).toBe("Known Person");
      expect(savedCache).not.toHaveProperty("unknown");
    } finally {
      if (dataFileExisted) {
        fs.mkdirSync(path.dirname(dataFilePath), { recursive: true });
        fs.writeFileSync(dataFilePath, originalDataRaw, "utf8");
      } else {
        fs.rmSync(dataFilePath, { force: true });
      }
    }
  });

  test("given actor-name-cache already contains a login mapping, when GET /data sees the same login without a display name, then the existing mapping is preserved", async () => {
    const dataFilePath = appModule.viewPrsDataFile;
    const dataFileExisted = fs.existsSync(dataFilePath);
    const originalDataRaw = dataFileExisted
      ? fs.readFileSync(dataFilePath, "utf8")
      : "";

    try {
      fs.mkdirSync(path.dirname(actorNameCacheFilePath), { recursive: true });
      fs.writeFileSync(
        actorNameCacheFilePath,
        JSON.stringify({ preserved_login_10004: "Preserved Name" }, null, 2),
        "utf8",
      );

      fs.mkdirSync(path.dirname(dataFilePath), { recursive: true });
      fs.writeFileSync(
        dataFilePath,
        JSON.stringify(
          {
            byPrNumber: {
              "10004": {
                data: {
                  number: 10004,
                  repo: "owner/repo",
                  authorLogin: "preserved_login_10004",
                },
              },
            },
            lastRun: "2026-07-07T00:00:00.000Z",
          },
          null,
          2,
        ),
        "utf8",
      );

      const { response } = await requestJson(server, "/data");

      expect(response.status).toBe(200);

      const savedCache = JSON.parse(fs.readFileSync(actorNameCacheFilePath, "utf8"));
      expect(savedCache.preserved_login_10004).toBe("Preserved Name");
    } finally {
      if (dataFileExisted) {
        fs.mkdirSync(path.dirname(dataFilePath), { recursive: true });
        fs.writeFileSync(dataFilePath, originalDataRaw, "utf8");
      } else {
        fs.rmSync(dataFilePath, { force: true });
      }
    }
  });

  test("given a non-empty actor-name-cache payload, when PUT /actor-name-cache is requested, then mappings are persisted", async () => {
    const address = server.address();
    const putResponse = await fetch(
      `http://127.0.0.1:${address.port}/actor-name-cache`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ahall236_uhg: "Alison Hall",
          reviewer1: "Reviewer One",
        }),
      },
    );
    const putPayload = await putResponse.json();

    expect(putResponse.status).toBe(200);
    expect(putPayload.ok).toBe(true);
    expect(putPayload.count).toBe(2);

    const saved = JSON.parse(fs.readFileSync(actorNameCacheFilePath, "utf8"));
    expect(saved).toEqual({
      ahall236_uhg: "Alison Hall",
      reviewer1: "Reviewer One",
    });
  });

  test("given an empty actor-name-cache payload, when PUT /actor-name-cache is requested, then clearing all mappings is blocked", async () => {
    const address = server.address();
    const putResponse = await fetch(
      `http://127.0.0.1:${address.port}/actor-name-cache`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    const putPayload = await putResponse.json();

    expect(putResponse.status).toBe(400);
    expect(putPayload.ok).toBe(false);
    expect(String(putPayload.error || "")).toContain("Clearing all mappings is blocked");
  });

  test("given actor-login-aliases file is missing, when GET /actor-login-aliases is requested, then the file is created and an empty map is returned", async () => {
    fs.rmSync(actorLoginAliasesFilePath, { force: true });

    const { response, payload } = await requestJson(server, "/actor-login-aliases");

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.entries).toEqual({});
    expect(payload.count).toBe(0);
    expect(fs.existsSync(actorLoginAliasesFilePath)).toBe(true);
  });

  test("given actor-login-aliases contains entries, when GET /actor-login-aliases is requested, then persisted mappings are returned", async () => {
    fs.mkdirSync(path.dirname(actorLoginAliasesFilePath), { recursive: true });
    fs.writeFileSync(
      actorLoginAliasesFilePath,
      JSON.stringify({ alias_user: "canonical_user" }, null, 2),
      "utf8",
    );

    const { response, payload } = await requestJson(server, "/actor-login-aliases");

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.entries).toEqual({ alias_user: "canonical_user" });
    expect(payload.count).toBe(1);
  });

  test("given a non-empty actor-login-aliases payload, when PUT /actor-login-aliases is requested, then mappings are persisted", async () => {
    const address = server.address();
    const putResponse = await fetch(
      `http://127.0.0.1:${address.port}/actor-login-aliases`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alias_user: "canonical_user",
          alias_user_two: "canonical_user_two",
        }),
      },
    );
    const putPayload = await putResponse.json();

    expect(putResponse.status).toBe(200);
    expect(putPayload.ok).toBe(true);
    expect(putPayload.count).toBe(2);

    const saved = JSON.parse(fs.readFileSync(actorLoginAliasesFilePath, "utf8"));
    expect(saved).toEqual({
      alias_user: "canonical_user",
      alias_user_two: "canonical_user_two",
    });
  });

  test("given an empty actor-login-aliases payload, when PUT /actor-login-aliases is requested, then clearing all mappings is blocked", async () => {
    const address = server.address();
    const putResponse = await fetch(
      `http://127.0.0.1:${address.port}/actor-login-aliases`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    const putPayload = await putResponse.json();

    expect(putResponse.status).toBe(400);
    expect(putPayload.ok).toBe(false);
    expect(String(putPayload.error || "")).toContain("Clearing all mappings is blocked");
  });

  test("returns backfill status when GET /backfill is requested", async () => {
    const { response, payload } = await requestJson(server, "/backfill");

    expect(response.status).toBe(200);
    expect(typeof payload.running).toBe("boolean");
  });

  test("returns backfill log details when GET /backfill/log is requested", async () => {
    const { response, payload } = await requestJson(server, "/backfill/log");

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload).toHaveProperty("logFile");
    expect(payload).toHaveProperty("linesRequested");
    expect(payload).toHaveProperty("lineCount");
    expect(payload).toHaveProperty("tail");
    expect(payload).toHaveProperty("summary");
  });

  test("returns ok and entries when GET /action-log is requested", async () => {
    const { response, payload } = await requestJson(server, "/action-log");

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(Array.isArray(payload.entries)).toBe(true);
  });

  test("returns 400 when POST /backfill/restart omits an action", async () => {
    const { response, payload } = await postJson(
      server,
      "/backfill/restart",
      {},
    );

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
  });

  test("starts backfill when POST /backfill/start is requested", async () => {
    const { response, payload } = await postJson(server, "/backfill/start", {});

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(String(payload.summary || "").length).toBeGreaterThan(0);
  });

  test("stops backfill when POST /backfill/stop is requested", async () => {
    const { response, payload } = await postJson(server, "/backfill/stop", {});

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.running).toBe(false);
  });

  test("returns 400 when POST /run receives an invalid repo", async () => {
    const { response, payload } = await postJson(server, "/run", {
      repo: "owner/repo/extra",
      openMode: "none",
    });

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(String(payload.error || "")).toContain("Invalid --repo value");
  });

  test("returns 400 when POST /run receives an invalid open mode", async () => {
    const { response, payload } = await postJson(server, "/run", {
      openMode: "bad-mode",
    });

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(String(payload.error || "")).toContain("Invalid --open mode");
  });

  test("returns 400 when POST /merged/request-more receives an invalid repo", async () => {
    const { response, payload } = await postJson(
      server,
      "/merged/request-more",
      {
        repo: "owner/repo/extra",
        count: 30,
      },
    );

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(String(payload.error || "")).toContain("Invalid repo");
  });

  test("omits local-only filters from command args when POST /run is called", async () => {
    const { response, payload } = await postJson(server, "/run", {
      repo: "owner/repo",
      author: "ahall236_uhg",
      label: "bug,frontend",
      excludeLabel: "blocked",
      openMode: "none",
    });

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(String(payload.command || "")).not.toContain("--author");
    expect(String(payload.command || "")).not.toContain("--label");
    expect(String(payload.command || "")).not.toContain("--exclude-label");
  });

  test("returns 400 when POST /ack does not include any operation", async () => {
    const { response, payload } = await postJson(server, "/ack", {
      repo: "owner/repo",
    });

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(String(payload.error || "")).toContain(
      "Provide at least one operation",
    );
  });

  test("returns 400 when POST /ack receives an invalid repo", async () => {
    const { response, payload } = await postJson(server, "/ack", {
      repo: "owner/repo/extra",
      ack: "123",
    });

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(String(payload.error || "")).toContain("Invalid --repo value");
  });

  test("returns 202 when POST /run-auto is requested while idle", async () => {
    appModule.viewPrsSchedulerState.isAutoRunInProgress = false;

    const { response, payload } = await postJson(server, "/run-auto", {});

    expect(response.status).toBe(202);
    expect(payload.ok).toBe(true);
  });

  test("returns 202 when POST /view-prs/run-auto alias is requested while idle", async () => {
    appModule.viewPrsSchedulerState.isAutoRunInProgress = false;

    const { response, payload } = await postJson(server, "/view-prs/run-auto", {});

    expect(response.status).toBe(202);
    expect(payload.ok).toBe(true);
  });

  test("writes an action-log entry when POST /run-auto is requested", async () => {
    appModule.viewPrsSchedulerState.isAutoRunInProgress = false;

    const { response } = await postJson(server, "/run-auto", {});
    expect(response.status).toBe(202);

    const { payload: actionLogPayload } = await requestJson(server, "/action-log");
    expect(actionLogPayload.ok).toBe(true);
    expect(Array.isArray(actionLogPayload.entries)).toBe(true);

    const runAutoEntry = actionLogPayload.entries.find(
      (entry) => String(entry?.action || "") === "post/run-auto",
    );
    expect(runAutoEntry).toBeTruthy();
    expect(runAutoEntry).toHaveProperty("triggeredAt");
    expect(runAutoEntry).toHaveProperty("ok");
  });

  test("returns 409 when POST /run-auto is requested during an active auto run", async () => {
    appModule.viewPrsSchedulerState.isAutoRunInProgress = true;
    try {
      const { response, payload } = await postJson(server, "/run-auto", {});

      expect(response.status).toBe(409);
      expect(payload.ok).toBe(false);
      expect(String(payload.error || "")).toMatch(/already in progress/i);
    } finally {
      appModule.viewPrsSchedulerState.isAutoRunInProgress = false;
    }
  });
});
