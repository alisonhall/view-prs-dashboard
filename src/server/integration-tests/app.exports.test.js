// Tests for all exported functions from app.js
const app = require("../app.js");

describe("exported API surface", () => {
  // Test that all expected exports exist and are of the correct type
  const exportedKeys = [
    // Main app and scheduler
    "createViewPrsApp",
    "initializeScheduler",
    "runViewPrsAutoRefresh",
    // Core config/constants
    "viewPrsDir",
    "viewPrsUiIndexFile",
    "viewPrsRunScriptRelativePath",
    "viewPrsBackfillManagerRelativePath",
    "viewPrsSchedulerFile",
    "viewPrsLegacySchedulerFile",
    "viewPrsDataFile",
    "viewPrsUserStateFile",
    "viewPrsAuthorCommentsFile",
    "viewPrsBackupDir",
    "viewPrsBackupRetention",
    "viewPrsActorNameCacheFile",
    "viewPrsBackfillManagerScript",
    "viewPrsActionLogFile",
    "viewPrsBackfillPidFile",
    "viewPrsBackfillLogFile",
    "viewPrsPrDiffDir",
    "appendActionLogEntry",
    "readActionLog",
    "viewPrsAutoIntervalMs",
    "viewPrsManualCooldownMs",
    "viewPrsAutoCircuitFailureThreshold",
    "viewPrsAutoCircuitCooldownMs",
    "viewPrsAutoScriptTimeoutMs",
    "viewPrsManualScriptTimeoutMs",
    "viewPrsAckScriptTimeoutMs",
    "viewPrsAckRefreshScriptTimeoutMs",
    "viewPrsAckTotalRefreshTimeoutMs",
    "viewPrsBackfillStatusTimeoutMs",
    "viewPrsBackfillActionTimeoutMs",
    "viewPrsViewerLoginCacheTtlMs",
    // State
    "viewPrsSchedulerState",
    // Helpers and utilities
    "isViewPrsFixtureRow",
    "parseTimestamp",
    "readJsonFileIfExists",
    "isObject",
    "toTrimmedString",
    "isRepoSlug",
    "parseRepoCsv",
    "normalizeNotesComment",
    "normalizeNotes",
    "normalizeAuthorComment",
    "normalizeAuthorCommentSentiment",
    "normalizeViewPrsAuthorComments",
    "normalizePerRepoMap",
    "normalizeViewPrsUserState",
    "backupStamp",
    "writeJsonFileWithBackup",
    "writeViewPrsUserState",
    "writeViewPrsAuthorComments",
    "readViewPrsAuthorComments",
    "mergeMissingPerRepoMap",
    "migrateLegacyViewPrsUserState",
    "addActorName",
    "writeJsonFileBestEffort",
    "normalizeDisplayName",
    "resolveActorNameFromGitHub",
    "buildViewPrsActorsMap",
    "getManualCooldownSkipReason",
    "readViewPrsSchedulerState",
    "persistViewPrsSchedulerState",
    "setLastManualRunNow",
    "formatScriptFailureMessage",
    "runViewPrsScript",
    "runViewPrsShellScript",
    "parseBackfillCommandOutput",
    "getBackfillLogTail",
    "getViewPrsBackfillPublicState",
    "runViewPrsBackfillAction",
    "isCommandAvailable",
    "getDependencyStatus",
    "getViewPrsViewerLogin",
    "readViewPrsData",
    "getViewPrsDataMeta",
    "getViewPrsDataManifest",
    "getViewPrsSchedulerPublicState",
    "getViewPrsAutoCircuitOpenState",
    "buildAckRefreshBudgetSkipErrors",
    "recordViewPrsAutoRefreshFailure",
    "resetViewPrsAutoRefreshFailureState",
    "getViewPrsAutoRefreshRepos",
    "getPrDiffCacheFilePath",
    "getPrDiffCommitFingerprint",
    "readPrDiffCache",
    "syncPrDiffForEntry",
    "enqueuePrDiffRefresh",
    "enqueuePrDiffRefreshForData",
  ];

  for (const key of exportedKeys) {
    test(`${key} should be exported`, () => {
      expect(app).toHaveProperty(key);
    });
  }
});

// Add basic invocation tests for pure functions

describe("pure helper behavior", () => {
  test("returns milliseconds when parseTimestamp receives a valid date", () => {
    expect(typeof app.parseTimestamp("2026-01-01T00:00:00Z")).toBe("number");
  });
  test("returns null when parseTimestamp receives invalid text", () => {
    expect(app.parseTimestamp("not-a-date")).toBeNull();
  });
  test("returns true when isObject receives a plain object", () => {
    expect(app.isObject({ a: 1 })).toBe(true);
  });
  test("returns false when isObject receives null", () => {
    expect(app.isObject(null)).toBe(false);
  });
  test("returns a trimmed string when toTrimmedString receives padded input", () => {
    expect(app.toTrimmedString("  foo  ")).toBe("foo");
  });
  test("returns true when isRepoSlug receives owner/repo", () => {
    expect(app.isRepoSlug("owner/repo")).toBe(true);
  });
  test("returns false when isRepoSlug receives an invalid slug", () => {
    expect(app.isRepoSlug("owner repo")).toBe(false);
  });
  test("returns valid slugs when parseRepoCsv receives comma-separated repos", () => {
    expect(app.parseRepoCsv("owner/repo,foo/bar")).toEqual([
      "owner/repo",
      "foo/bar",
    ]);
  });
  test("returns only valid values when parseRepoCsv receives invalid or empty entries", () => {
    expect(app.parseRepoCsv("owner/repo, not-a-slug, ,foo/bar,bad value")).toEqual([
      "owner/repo",
      "foo/bar",
    ]);
  });
  test("returns a normalized comment when normalizeNotesComment receives valid input", () => {
    expect(
      app.normalizeNotesComment({
        id: "1",
        author: "a",
        note: "n",
        createdAt: "2026-07-14T12:00:00Z",
        updatedAt: "2026-07-14T13:00:00Z",
      }),
    ).toMatchObject({
      id: "1",
      author: "a",
      note: "n",
      createdAt: "2026-07-14T12:00:00Z",
      updatedAt: "2026-07-14T13:00:00Z",
    });
  });
  test("given note timestamps include milliseconds, when normalizeNotesComment runs, then timestamps are normalized to UTC seconds", () => {
    expect(
      app.normalizeNotesComment({
        id: "comment-1776866962769-33xjc",
        author: "a",
        note: "n",
        createdAt: "2026-07-14T12:00:00.123Z",
        updatedAt: "2026-07-14T13:00:00.987Z",
      }),
    ).toMatchObject({
      createdAt: "2026-07-14T12:00:00Z",
      updatedAt: "2026-07-14T13:00:00Z",
    });
  });
  test("given note timestamps are missing and id embeds epoch milliseconds, when normalizeNotesComment runs, then createdAt is derived from id and updatedAt falls back to createdAt", () => {
    expect(
      app.normalizeNotesComment({
        id: "comment-1776866962769-33xjc",
        author: "a",
        note: "n",
        createdAt: "",
        updatedAt: "",
      }),
    ).toMatchObject({
      createdAt: "2026-04-22T14:09:22Z",
      updatedAt: "2026-04-22T14:09:22Z",
    });
  });
  test("returns normalized notes when normalizeNotes receives structured input", () => {
    expect(
      app.normalizeNotes({
        comments: [{ id: "1", author: "a", note: "n" }],
        otherNotes: "x",
        prDifficulty: "3",
        rallyStories: ["US1001", "DE1002"],
        rallyLinks: [
          "https://rally.example/US1001",
          "https://rally.example/DE1002",
        ],
        analysisOfPr: "Moderate complexity",
      }),
    ).toMatchObject({
      comments: [{ id: "1", author: "a", note: "n" }],
      otherNotes: "x",
      prDifficulty: "3",
      rallyStories: ["US1001", "DE1002"],
      rallyLinks: [
        "https://rally.example/US1001",
        "https://rally.example/DE1002",
      ],
      analysisOfPr: "Moderate complexity",
    });
  });
  test("converts legacy rally string fields to arrays when normalizeNotes receives single values", () => {
    expect(
      app.normalizeNotes({
        comments: [],
        otherNotes: "",
        prDifficulty: "",
        rallyStories: "US1001",
        rallyLinks: "https://rally.example/US1001",
        analysisOfPr: "",
      }),
    ).toMatchObject({
      rallyStories: ["US1001"],
      rallyLinks: ["https://rally.example/US1001"],
    });
  });
  test("trims and filters empty rally entries when normalizeNotes receives array values", () => {
    expect(
      app.normalizeNotes({
        comments: [],
        otherNotes: "",
        prDifficulty: "",
        rallyStories: ["  US1001  ", "", "   "],
        rallyLinks: [" https://rally.example/US1001 ", ""],
        analysisOfPr: "",
      }),
    ).toMatchObject({
      rallyStories: ["US1001"],
      rallyLinks: ["https://rally.example/US1001"],
    });
  });
  test("clears prDifficulty when normalizeNotes receives an unsupported value", () => {
    expect(
      app.normalizeNotes({
        comments: [],
        otherNotes: "x",
        prDifficulty: "9",
        rallyStories: "",
        rallyLinks: "",
        analysisOfPr: "",
      }),
    ).toMatchObject({
      prDifficulty: "",
    });
  });
  test("returns an object when normalizePerRepoMap receives repo data", () => {
    expect(typeof app.normalizePerRepoMap({ foo: { 1: "bar" } })).toBe(
      "object",
    );
  });
  test("returns a normalized object when normalizeViewPrsUserState receives input", () => {
    expect(typeof app.normalizeViewPrsUserState({})).toBe("object");
  });
  test("returns a timestamp-like string when backupStamp is called", () => {
    expect(typeof app.backupStamp()).toBe("string");
  });

  test("writeViewPrsUserState restores malformed state from backup", () => {
    const fs = require("fs");
    const path = require("path");

    const backupName = `${path.basename(app.viewPrsUserStateFile)}.user-state.seed.bak`;
    const backupFilePath = path.join(app.viewPrsBackupDir, backupName);
    const fileContents = new Map();

    fileContents.set(
      backupFilePath,
      JSON.stringify({
        notesByPrNumber: {},
        ackByRepo: {
          "owner/repo": {
            777: "2026-05-14T00:00:00Z",
          },
        },
        reverifyByRepo: {},
        inReviewByRepo: {},
        flaggedByRepo: {},
      }),
    );

    let userStateMalformed = true;

    const existsSpy = jest
      .spyOn(fs, "existsSync")
      .mockImplementation((filePath) => {
        if (filePath === app.viewPrsUserStateFile) return true;
        if (filePath === app.viewPrsBackupDir) return true;
        return fileContents.has(filePath);
      });
    const readSpy = jest
      .spyOn(fs, "readFileSync")
      .mockImplementation((filePath) => {
        if (filePath === app.viewPrsUserStateFile) {
          if (userStateMalformed) {
            return "{ invalid-json";
          }
          return String(fileContents.get(filePath) || "{}");
        }

        if (fileContents.has(filePath)) {
          return String(fileContents.get(filePath));
        }

        throw new Error(`Unexpected file read: ${filePath}`);
      });
    const readdirSpy = jest
      .spyOn(fs, "readdirSync")
      .mockImplementation((filePath) => {
        if (filePath === app.viewPrsBackupDir) {
          return [backupName];
        }
        return [];
      });
    const statSpy = jest
      .spyOn(fs, "statSync")
      .mockImplementation(() => ({ mtimeMs: 1234 }));
    const mkdirSpy = jest
      .spyOn(fs, "mkdirSync")
      .mockImplementation(() => undefined);
    const writeSpy = jest
      .spyOn(fs, "writeFileSync")
      .mockImplementation((filePath, content) => {
        fileContents.set(filePath, String(content));
      });
    const renameSpy = jest
      .spyOn(fs, "renameSync")
      .mockImplementation((fromPath, toPath) => {
        const moved = String(fileContents.get(fromPath) || "{}");
        fileContents.set(toPath, moved);
        fileContents.delete(fromPath);
        if (toPath === app.viewPrsUserStateFile) {
          userStateMalformed = false;
        }
      });
    const copySpy = jest
      .spyOn(fs, "copyFileSync")
      .mockImplementation((fromPath, toPath) => {
        fileContents.set(toPath, String(fileContents.get(fromPath) || ""));
      });
    const unlinkSpy = jest
      .spyOn(fs, "unlinkSync")
      .mockImplementation(() => undefined);

    try {
      expect(() =>
        app.writeViewPrsUserState({
          notesByPrNumber: {},
          ackByRepo: {
            "owner/repo": {
              123: "2026-05-15T14:49:25Z",
            },
          },
          reverifyByRepo: {},
          inReviewByRepo: {},
        flaggedByRepo: {},
        }),
      ).not.toThrow();

      const persisted = JSON.parse(
        String(fileContents.get(app.viewPrsUserStateFile) || "{}"),
      );
      expect(persisted.ackByRepo["owner/repo"]["123"]).toBe(
        "2026-05-15T14:49:25Z",
      );
      expect(persisted.ackByRepo["owner/repo"]["777"]).toBe(
        "2026-05-14T00:00:00Z",
      );
      expect(renameSpy).toHaveBeenCalled();
    } finally {
      existsSpy.mockRestore();
      readSpy.mockRestore();
      readdirSpy.mockRestore();
      statSpy.mockRestore();
      mkdirSpy.mockRestore();
      writeSpy.mockRestore();
      renameSpy.mockRestore();
      copySpy.mockRestore();
      unlinkSpy.mockRestore();
    }
  });

  test("writeViewPrsUserState throws when malformed state has no backup", () => {
    const fs = require("fs");

    const existsSpy = jest
      .spyOn(fs, "existsSync")
      .mockImplementation((filePath) => {
        if (filePath === app.viewPrsUserStateFile) return true;
        if (filePath === app.viewPrsBackupDir) return false;
        return false;
      });
    const readSpy = jest
      .spyOn(fs, "readFileSync")
      .mockImplementation((filePath) => {
        if (filePath === app.viewPrsUserStateFile) {
          return "{ invalid-json";
        }
        throw new Error(`Unexpected file read: ${filePath}`);
      });

    try {
      expect(() =>
        app.writeViewPrsUserState({
          notesByPrNumber: {},
          ackByRepo: {
            "owner/repo": {
              123: "2026-05-15T14:49:25Z",
            },
          },
          reverifyByRepo: {},
          inReviewByRepo: {},
        flaggedByRepo: {},
        }),
      ).toThrow(/Refusing to overwrite malformed user-state file/);
    } finally {
      existsSpy.mockRestore();
      readSpy.mockRestore();
    }
  });

  test("writeJsonFileWithBackup blocks clearing pr-data without destructive override", () => {
    const fs = require("fs");
    const originalEnv = process.env.VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE;
    delete process.env.VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE;

    const existsSpy = jest
      .spyOn(fs, "existsSync")
      .mockImplementation((filePath) => filePath === app.viewPrsDataFile);
    const readSpy = jest
      .spyOn(fs, "readFileSync")
      .mockImplementation((filePath) => {
        if (filePath === app.viewPrsDataFile) {
          return JSON.stringify({
            byPrNumber: {
              100: { prNumber: "100" },
            },
            lastRun: null,
          });
        }
        throw new Error(`Unexpected file read: ${filePath}`);
      });
    const mkdirSpy = jest
      .spyOn(fs, "mkdirSync")
      .mockImplementation(() => undefined);
    const writeSpy = jest
      .spyOn(fs, "writeFileSync")
      .mockImplementation(() => undefined);
    const renameSpy = jest
      .spyOn(fs, "renameSync")
      .mockImplementation(() => undefined);

    try {
      expect(() =>
        app.writeJsonFileWithBackup(
          app.viewPrsDataFile,
          { byPrNumber: {}, lastRun: null },
          "pr-data",
        ),
      ).toThrow(/Protected write blocked/);
      expect(writeSpy).not.toHaveBeenCalled();
      expect(renameSpy).not.toHaveBeenCalled();
    } finally {
      existsSpy.mockRestore();
      readSpy.mockRestore();
      mkdirSpy.mockRestore();
      writeSpy.mockRestore();
      renameSpy.mockRestore();
      if (originalEnv === undefined) {
        delete process.env.VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE;
      } else {
        process.env.VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE = originalEnv;
      }
    }
  });

  test("writeJsonFileWithBackup allows destructive pr-data write with override", () => {
    const fs = require("fs");
    const originalEnv = process.env.VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE;
    process.env.VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE = "true";

    const existsSpy = jest
      .spyOn(fs, "existsSync")
      .mockImplementation((filePath) => filePath === app.viewPrsDataFile);
    const readSpy = jest
      .spyOn(fs, "readFileSync")
      .mockImplementation((filePath) => {
        if (filePath === app.viewPrsDataFile) {
          return JSON.stringify({
            byPrNumber: {
              100: { prNumber: "100" },
            },
            lastRun: null,
          });
        }
        return "{}";
      });
    const mkdirSpy = jest
      .spyOn(fs, "mkdirSync")
      .mockImplementation(() => undefined);
    const copySpy = jest
      .spyOn(fs, "copyFileSync")
      .mockImplementation(() => undefined);
    const readdirSpy = jest
      .spyOn(fs, "readdirSync")
      .mockImplementation(() => []);
    const writeSpy = jest
      .spyOn(fs, "writeFileSync")
      .mockImplementation(() => undefined);
    const renameSpy = jest
      .spyOn(fs, "renameSync")
      .mockImplementation(() => undefined);

    try {
      expect(() =>
        app.writeJsonFileWithBackup(
          app.viewPrsDataFile,
          { byPrNumber: {}, lastRun: null },
          "pr-data",
        ),
      ).not.toThrow();
      expect(writeSpy).toHaveBeenCalled();
      expect(renameSpy).toHaveBeenCalled();
    } finally {
      existsSpy.mockRestore();
      readSpy.mockRestore();
      mkdirSpy.mockRestore();
      copySpy.mockRestore();
      readdirSpy.mockRestore();
      writeSpy.mockRestore();
      renameSpy.mockRestore();
      if (originalEnv === undefined) {
        delete process.env.VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE;
      } else {
        process.env.VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE = originalEnv;
      }
    }
  });

  test("writeJsonFileWithBackup blocks clearing all user-state notes without destructive override", () => {
    const fs = require("fs");
    const originalEnv = process.env.VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE;
    delete process.env.VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE;

    const existingUserState = {
      notesByPrNumber: {
        100: { comments: [], otherNotes: "one" },
        101: { comments: [], otherNotes: "two" },
      },
      ackByRepo: {},
      reverifyByRepo: {},
      inReviewByRepo: {},
        flaggedByRepo: {},
    };

    const existsSpy = jest
      .spyOn(fs, "existsSync")
      .mockImplementation((filePath) => filePath === app.viewPrsUserStateFile);
    const readSpy = jest
      .spyOn(fs, "readFileSync")
      .mockImplementation((filePath) => {
        if (filePath === app.viewPrsUserStateFile) {
          return JSON.stringify(existingUserState);
        }
        throw new Error(`Unexpected file read: ${filePath}`);
      });
    const mkdirSpy = jest
      .spyOn(fs, "mkdirSync")
      .mockImplementation(() => undefined);
    const writeSpy = jest
      .spyOn(fs, "writeFileSync")
      .mockImplementation(() => undefined);
    const renameSpy = jest
      .spyOn(fs, "renameSync")
      .mockImplementation(() => undefined);

    try {
      expect(() =>
        app.writeJsonFileWithBackup(
          app.viewPrsUserStateFile,
          {
            notesByPrNumber: {},
            ackByRepo: {},
            reverifyByRepo: {},
            inReviewByRepo: {},
        flaggedByRepo: {},
          },
          "user-state",
        ),
      ).toThrow(/notesByPrNumber would be cleared/);
      expect(writeSpy).not.toHaveBeenCalled();
      expect(renameSpy).not.toHaveBeenCalled();
    } finally {
      existsSpy.mockRestore();
      readSpy.mockRestore();
      mkdirSpy.mockRestore();
      writeSpy.mockRestore();
      renameSpy.mockRestore();
      if (originalEnv === undefined) {
        delete process.env.VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE;
      } else {
        process.env.VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE = originalEnv;
      }
    }
  });

  test("writeJsonFileWithBackup allows reducing user-state notes for a single PR", () => {
    const fs = require("fs");
    const originalEnv = process.env.VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE;
    delete process.env.VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE;

    const existingUserState = {
      notesByPrNumber: {
        100: { comments: [], otherNotes: "one" },
        101: { comments: [], otherNotes: "two" },
      },
      ackByRepo: {},
      reverifyByRepo: {},
      inReviewByRepo: {},
        flaggedByRepo: {},
    };

    const existsSpy = jest
      .spyOn(fs, "existsSync")
      .mockImplementation((filePath) => filePath === app.viewPrsUserStateFile);
    const readSpy = jest
      .spyOn(fs, "readFileSync")
      .mockImplementation((filePath) => {
        if (filePath === app.viewPrsUserStateFile) {
          return JSON.stringify(existingUserState);
        }
        return "{}";
      });
    const mkdirSpy = jest
      .spyOn(fs, "mkdirSync")
      .mockImplementation(() => undefined);
    const copySpy = jest
      .spyOn(fs, "copyFileSync")
      .mockImplementation(() => undefined);
    const readdirSpy = jest
      .spyOn(fs, "readdirSync")
      .mockImplementation(() => []);
    const writeSpy = jest
      .spyOn(fs, "writeFileSync")
      .mockImplementation(() => undefined);
    const renameSpy = jest
      .spyOn(fs, "renameSync")
      .mockImplementation(() => undefined);

    try {
      expect(() =>
        app.writeJsonFileWithBackup(
          app.viewPrsUserStateFile,
          {
            notesByPrNumber: {
              100: { comments: [], otherNotes: "one" },
            },
            ackByRepo: {},
            reverifyByRepo: {},
            inReviewByRepo: {},
        flaggedByRepo: {},
          },
          "user-state",
        ),
      ).not.toThrow();
      expect(writeSpy).toHaveBeenCalled();
      expect(renameSpy).toHaveBeenCalled();
    } finally {
      existsSpy.mockRestore();
      readSpy.mockRestore();
      mkdirSpy.mockRestore();
      copySpy.mockRestore();
      readdirSpy.mockRestore();
      writeSpy.mockRestore();
      renameSpy.mockRestore();
      if (originalEnv === undefined) {
        delete process.env.VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE;
      } else {
        process.env.VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE = originalEnv;
      }
    }
  });

  test("writeJsonFileWithBackup blocks large user-state note shrink without destructive override", () => {
    const fs = require("fs");
    const originalEnv = process.env.VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE;
    const originalRatioEnv = process.env.VIEW_PRS_USER_STATE_MIN_RETAIN_RATIO;
    delete process.env.VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE;
    process.env.VIEW_PRS_USER_STATE_MIN_RETAIN_RATIO = "0.35";

    const existingUserState = {
      notesByPrNumber: Object.fromEntries(
        Array.from({ length: 60 }, (_, index) => {
          const prNumber = String(100 + index);
          return [prNumber, { comments: [], otherNotes: `note ${prNumber}` }];
        }),
      ),
      ackByRepo: {
        "owner/repo": {
          100: "2026-05-27T00:00:00Z",
          101: "2026-05-27T00:00:00Z",
          102: "2026-05-27T00:00:00Z",
          103: "2026-05-27T00:00:00Z",
          104: "2026-05-27T00:00:00Z",
          105: "2026-05-27T00:00:00Z",
          106: "2026-05-27T00:00:00Z",
          107: "2026-05-27T00:00:00Z",
          108: "2026-05-27T00:00:00Z",
          109: "2026-05-27T00:00:00Z",
        },
      },
      reverifyByRepo: {},
      inReviewByRepo: {},
        flaggedByRepo: {},
    };

    const reducedNotesByPrNumber = Object.fromEntries(
      Array.from({ length: 10 }, (_, index) => {
        const prNumber = String(100 + index);
        return [prNumber, { comments: [], otherNotes: `note ${prNumber}` }];
      }),
    );

    const existsSpy = jest
      .spyOn(fs, "existsSync")
      .mockImplementation((filePath) => filePath === app.viewPrsUserStateFile);
    const readSpy = jest
      .spyOn(fs, "readFileSync")
      .mockImplementation((filePath) => {
        if (filePath === app.viewPrsUserStateFile) {
          return JSON.stringify(existingUserState);
        }
        return "{}";
      });
    const mkdirSpy = jest
      .spyOn(fs, "mkdirSync")
      .mockImplementation(() => undefined);
    const writeSpy = jest
      .spyOn(fs, "writeFileSync")
      .mockImplementation(() => undefined);
    const renameSpy = jest
      .spyOn(fs, "renameSync")
      .mockImplementation(() => undefined);

    try {
      expect(() =>
        app.writeJsonFileWithBackup(
          app.viewPrsUserStateFile,
          {
            notesByPrNumber: reducedNotesByPrNumber,
            ackByRepo: existingUserState.ackByRepo,
            reverifyByRepo: {},
            inReviewByRepo: {},
        flaggedByRepo: {},
          },
          "user-state",
        ),
      ).toThrow(/notesByPrNumber would shrink too far/);
      expect(writeSpy).not.toHaveBeenCalled();
      expect(renameSpy).not.toHaveBeenCalled();
    } finally {
      existsSpy.mockRestore();
      readSpy.mockRestore();
      mkdirSpy.mockRestore();
      writeSpy.mockRestore();
      renameSpy.mockRestore();
      if (originalEnv === undefined) {
        delete process.env.VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE;
      } else {
        process.env.VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE = originalEnv;
      }
      if (originalRatioEnv === undefined) {
        delete process.env.VIEW_PRS_USER_STATE_MIN_RETAIN_RATIO;
      } else {
        process.env.VIEW_PRS_USER_STATE_MIN_RETAIN_RATIO = originalRatioEnv;
      }
    }
  });

  test("writeJsonFileWithBackup blocks clearing author comments without destructive override", () => {
    const fs = require("fs");
    const originalEnv = process.env.VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE;
    delete process.env.VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE;

    const existingAuthorComments = {
      byAuthorLogin: {
        ahall236_uhg: {
          comments: [
            {
              id: "ac-1",
              note: "Existing",
              sentiment: "neutral",
              createdAt: "2026-05-27T00:00:00Z",
              updatedAt: "2026-05-27T00:00:00Z",
            },
          ],
        },
      },
    };

    const existsSpy = jest
      .spyOn(fs, "existsSync")
      .mockImplementation((filePath) => filePath === app.viewPrsAuthorCommentsFile);
    const readSpy = jest
      .spyOn(fs, "readFileSync")
      .mockImplementation((filePath) => {
        if (filePath === app.viewPrsAuthorCommentsFile) {
          return JSON.stringify(existingAuthorComments);
        }
        throw new Error(`Unexpected file read: ${filePath}`);
      });
    const mkdirSpy = jest
      .spyOn(fs, "mkdirSync")
      .mockImplementation(() => undefined);
    const writeSpy = jest
      .spyOn(fs, "writeFileSync")
      .mockImplementation(() => undefined);
    const renameSpy = jest
      .spyOn(fs, "renameSync")
      .mockImplementation(() => undefined);

    try {
      expect(() =>
        app.writeJsonFileWithBackup(
          app.viewPrsAuthorCommentsFile,
          { byAuthorLogin: {} },
          "author-comments",
        ),
      ).toThrow(/byAuthorLogin would be cleared/);
      expect(writeSpy).not.toHaveBeenCalled();
      expect(renameSpy).not.toHaveBeenCalled();
    } finally {
      existsSpy.mockRestore();
      readSpy.mockRestore();
      mkdirSpy.mockRestore();
      writeSpy.mockRestore();
      renameSpy.mockRestore();
      if (originalEnv === undefined) {
        delete process.env.VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE;
      } else {
        process.env.VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE = originalEnv;
      }
    }
  });

  test("writeJsonFileWithBackup blocks large author-comments shrink without destructive override", () => {
    const fs = require("fs");
    const originalEnv = process.env.VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE;
    const originalRatioEnv = process.env.VIEW_PRS_AUTHOR_COMMENTS_MIN_RETAIN_RATIO;
    delete process.env.VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE;
    process.env.VIEW_PRS_AUTHOR_COMMENTS_MIN_RETAIN_RATIO = "0.35";

    const existingComments = Array.from({ length: 60 }, (_, index) => ({
      id: `ac-${index}`,
      note: `Note ${index}`,
      sentiment: "neutral",
      createdAt: "2026-05-27T00:00:00Z",
      updatedAt: "2026-05-27T00:00:00Z",
    }));
    const reducedComments = existingComments.slice(0, 10);

    const existsSpy = jest
      .spyOn(fs, "existsSync")
      .mockImplementation((filePath) => filePath === app.viewPrsAuthorCommentsFile);
    const readSpy = jest
      .spyOn(fs, "readFileSync")
      .mockImplementation((filePath) => {
        if (filePath === app.viewPrsAuthorCommentsFile) {
          return JSON.stringify({
            byAuthorLogin: {
              reviewer1: { comments: existingComments },
            },
          });
        }
        return "{}";
      });
    const mkdirSpy = jest
      .spyOn(fs, "mkdirSync")
      .mockImplementation(() => undefined);
    const writeSpy = jest
      .spyOn(fs, "writeFileSync")
      .mockImplementation(() => undefined);
    const renameSpy = jest
      .spyOn(fs, "renameSync")
      .mockImplementation(() => undefined);

    try {
      expect(() =>
        app.writeJsonFileWithBackup(
          app.viewPrsAuthorCommentsFile,
          {
            byAuthorLogin: {
              reviewer1: { comments: reducedComments },
            },
          },
          "author-comments",
        ),
      ).toThrow(/comments would shrink too far/);
      expect(writeSpy).not.toHaveBeenCalled();
      expect(renameSpy).not.toHaveBeenCalled();
    } finally {
      existsSpy.mockRestore();
      readSpy.mockRestore();
      mkdirSpy.mockRestore();
      writeSpy.mockRestore();
      renameSpy.mockRestore();
      if (originalEnv === undefined) {
        delete process.env.VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE;
      } else {
        process.env.VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE = originalEnv;
      }
      if (originalRatioEnv === undefined) {
        delete process.env.VIEW_PRS_AUTHOR_COMMENTS_MIN_RETAIN_RATIO;
      } else {
        process.env.VIEW_PRS_AUTHOR_COMMENTS_MIN_RETAIN_RATIO = originalRatioEnv;
      }
    }
  });

  test("writeJsonFileWithBackup creates backup entries for author comments writes", () => {
    const fs = require("fs");
    const originalEnv = process.env.VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE;
    delete process.env.VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE;

    const existsSpy = jest.spyOn(fs, "existsSync").mockImplementation(() => true);
    const readSpy = jest
      .spyOn(fs, "readFileSync")
      .mockImplementation(() =>
        JSON.stringify({
          byAuthorLogin: {
            reviewer1: {
              comments: [
                {
                  id: "ac-1",
                  note: "Old note",
                  sentiment: "neutral",
                  createdAt: "2026-05-27T00:00:00Z",
                  updatedAt: "2026-05-27T00:00:00Z",
                },
              ],
            },
          },
        }),
      );
    const mkdirSpy = jest
      .spyOn(fs, "mkdirSync")
      .mockImplementation(() => undefined);
    const copySpy = jest
      .spyOn(fs, "copyFileSync")
      .mockImplementation(() => undefined);
    const readdirSpy = jest
      .spyOn(fs, "readdirSync")
      .mockImplementation(() => []);
    const writeSpy = jest
      .spyOn(fs, "writeFileSync")
      .mockImplementation(() => undefined);
    const renameSpy = jest
      .spyOn(fs, "renameSync")
      .mockImplementation(() => undefined);

    try {
      expect(() =>
        app.writeJsonFileWithBackup(
          app.viewPrsAuthorCommentsFile,
          {
            byAuthorLogin: {
              reviewer1: {
                comments: [
                  {
                    id: "ac-1",
                    note: "Updated note",
                    sentiment: "positive",
                    createdAt: "2026-05-27T00:00:00Z",
                    updatedAt: "2026-05-28T00:00:00Z",
                  },
                ],
              },
            },
          },
          "author-comments",
        ),
      ).not.toThrow();

      expect(copySpy).toHaveBeenCalled();
      expect(writeSpy).toHaveBeenCalled();
      expect(renameSpy).toHaveBeenCalled();
    } finally {
      existsSpy.mockRestore();
      readSpy.mockRestore();
      mkdirSpy.mockRestore();
      copySpy.mockRestore();
      readdirSpy.mockRestore();
      writeSpy.mockRestore();
      renameSpy.mockRestore();
      if (originalEnv === undefined) {
        delete process.env.VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE;
      } else {
        process.env.VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE = originalEnv;
      }
    }
  });

  test("readViewPrsData synthesizes merged rows for note-only PRs", () => {
    const fs = require("fs");
    const existsSpy = jest
      .spyOn(fs, "existsSync")
      .mockImplementation((filePath) => {
        return (
          filePath === app.viewPrsUserStateFile ||
          filePath === app.viewPrsDataFile
        );
      });
    const readSpy = jest
      .spyOn(fs, "readFileSync")
      .mockImplementation((filePath) => {
        if (filePath === app.viewPrsUserStateFile) {
          return JSON.stringify({
            notesByPrNumber: {
              999: {
                comments: [
                  {
                    id: "comment-1",
                    author: "reviewer-only",
                    tone: "Negative",
                    note: "Follow up on the missing local row.",
                  },
                ],
                otherNotes: "",
              },
            },
          });
        }

        if (filePath === app.viewPrsDataFile) {
          return JSON.stringify({
            lastRun: {
              repo: "owner/repo",
              updatedAt: "2026-05-14T10:00:00Z",
            },
            byPrNumber: {
              100: {
                prNumber: "100",
                repo: "owner/repo",
                section: "merged",
                updatedAt: "2026-05-14T10:00:00Z",
                data: {
                  number: "100",
                  title: "Known merged PR",
                  viewerLogin: "ahall236_uhg",
                  mergedAt: "2026-05-13T10:00:00Z",
                },
              },
            },
          });
        }

        throw new Error(`Unexpected file read: ${filePath}`);
      });

    try {
      const result = app.readViewPrsData();

      expect(result.byPrNumber["999"]).toMatchObject({
        prNumber: "999",
        repo: "owner/repo",
        section: "merged",
        notes: {
          comments: [
            expect.objectContaining({
              author: "reviewer-only",
              note: "Follow up on the missing local row.",
            }),
          ],
        },
        data: expect.objectContaining({
          number: "999",
          title: "Stored notes only",
          status: "NO_LOCAL_DATA",
          reason: "No retrieved PR data available",
        }),
      });
    } finally {
      existsSpy.mockRestore();
      readSpy.mockRestore();
    }
  });

  test("given a PR diff cache file without a matching data row, when readViewPrsData runs, then it synthesizes a Git Diff only merged row", () => {
    const fs = require("fs");
    const existsSpy = jest
      .spyOn(fs, "existsSync")
      .mockImplementation((filePath) => {
        if (String(filePath).endsWith("owner_repo__pr-777.json")) {
          return true;
        }
        return (
          filePath === app.viewPrsUserStateFile ||
          filePath === app.viewPrsDataFile ||
          filePath === app.viewPrsPrDiffDir
        );
      });
    const readdirSpy = jest
      .spyOn(fs, "readdirSync")
      .mockImplementation((filePath) => {
        if (filePath === app.viewPrsPrDiffDir) {
          return ["owner_repo__pr-777.json"];
        }
        return [];
      });
    const readSpy = jest
      .spyOn(fs, "readFileSync")
      .mockImplementation((filePath) => {
        if (filePath === app.viewPrsUserStateFile) {
          return JSON.stringify({ notesByPrNumber: {} });
        }

        if (filePath === app.viewPrsDataFile) {
          return JSON.stringify({
            lastRun: {
              repo: "owner/repo",
              updatedAt: "2026-05-14T10:00:00Z",
            },
            byPrNumber: {
              100: {
                prNumber: "100",
                repo: "owner/repo",
                section: "merged",
                updatedAt: "2026-05-14T10:00:00Z",
                data: {
                  number: "100",
                  title: "Known merged PR",
                  viewerLogin: "ahall236_uhg",
                  mergedAt: "2026-05-13T10:00:00Z",
                },
              },
            },
          });
        }

        if (String(filePath).endsWith("owner_repo__pr-777.json")) {
          return JSON.stringify({
            repo: "owner/repo",
            prNumber: "777",
            fetchedAt: "2026-06-29T09:00:00Z",
            diffText: "diff --git a/a.js b/a.js\n+const x = 1;",
          });
        }

        throw new Error(`Unexpected file read: ${filePath}`);
      });

    try {
      const result = app.readViewPrsData();

      expect(result.byPrNumber["777"]).toMatchObject({
        prNumber: "777",
        repo: "owner/repo",
        section: "merged",
        updatedAt: "2026-06-29T09:00:00Z",
        data: expect.objectContaining({
          number: "777",
          title: "Git Diff only",
          status: "NO_LOCAL_DATA",
          sourceUpdatedAt: "2026-06-29T09:00:00Z",
          reason: "No retrieved PR data available (cached Git diff only)",
        }),
      });
    } finally {
      existsSpy.mockRestore();
      readdirSpy.mockRestore();
      readSpy.mockRestore();
    }
  });
});

describe("test environment path isolation", () => {
  test("given NODE_ENV test and setup env overrides, when actor cache paths are exported, then production actor cache files are not used", () => {
    const actorCachePath = String(app.viewPrsActorNameCacheFile || "");
    const actorAliasesPath = String(app.viewPrsActorLoginAliasesFile || "");

    expect(actorCachePath).toContain("view-prs-test-");
    expect(actorCachePath.endsWith("/data/actor-name-cache.json")).toBe(false);

    expect(actorAliasesPath).toContain("view-prs-test-");
    expect(actorAliasesPath.endsWith("/data/actor-login-aliases.json")).toBe(false);
  });
});

describe("Action log helpers", () => {
  test("readActionLog returns empty array when file does not exist", () => {
    const fs = require("fs");
    const existsSpy = jest.spyOn(fs, "existsSync").mockReturnValue(false);
    try {
      expect(app.readActionLog()).toEqual([]);
    } finally {
      existsSpy.mockRestore();
    }
  });

  test("appendActionLogEntry writes a new entry and readActionLog returns it", () => {
    const fs = require("fs");
    let stored = null;
    const existsSpy = jest.spyOn(fs, "existsSync").mockReturnValue(false);
    const mkdirSpy = jest.spyOn(fs, "mkdirSync").mockReturnValue(undefined);
    const writeSpy = jest
      .spyOn(fs, "writeFileSync")
      .mockImplementation((_filePath, content) => {
        stored = content;
      });

    const entry = {
      action: "run",
      triggeredAt: new Date().toISOString(),
      durationMs: 123,
      ok: true,
      detail: { repo: "owner/repo" },
    };
    app.appendActionLogEntry(entry);

    expect(writeSpy).toHaveBeenCalled();
    const parsed = JSON.parse(stored);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0]).toMatchObject({ action: "run", ok: true });

    existsSpy.mockRestore();
    mkdirSpy.mockRestore();
    writeSpy.mockRestore();
  });

  test("appendActionLogEntry keeps newest entries at top (unshift)", () => {
    const fs = require("fs");
    const existing = [
      {
        action: "old",
        triggeredAt: "2020-01-01T00:00:00Z",
        ok: true,
        durationMs: 1,
      },
    ];
    let stored = null;
    const existsSpy = jest.spyOn(fs, "existsSync").mockReturnValue(true);
    const readSpy = jest
      .spyOn(fs, "readFileSync")
      .mockReturnValue(JSON.stringify(existing));
    const mkdirSpy = jest.spyOn(fs, "mkdirSync").mockReturnValue(undefined);
    const writeSpy = jest
      .spyOn(fs, "writeFileSync")
      .mockImplementation((_filePath, content) => {
        stored = content;
      });

    app.appendActionLogEntry({
      action: "new",
      triggeredAt: new Date().toISOString(),
      ok: true,
      durationMs: 5,
    });

    const parsed = JSON.parse(stored);
    expect(parsed[0].action).toBe("new");
    expect(parsed[1].action).toBe("old");

    existsSpy.mockRestore();
    readSpy.mockRestore();
    mkdirSpy.mockRestore();
    writeSpy.mockRestore();
  });

  test("appendActionLogEntry does not throw on write error", () => {
    const fs = require("fs");
    const existsSpy = jest.spyOn(fs, "existsSync").mockReturnValue(false);
    const mkdirSpy = jest.spyOn(fs, "mkdirSync").mockImplementation(() => {
      throw new Error("disk full");
    });

    expect(() =>
      app.appendActionLogEntry({ action: "run", ok: true, durationMs: 1 }),
    ).not.toThrow();

    existsSpy.mockRestore();
    mkdirSpy.mockRestore();
  });
});
