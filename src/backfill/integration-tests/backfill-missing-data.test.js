const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  buildDefaultOptions,
  collectBackfillCandidates,
  migrateLegacyStories,
  migrateLegacyStoriesInFiles,
  migrateNoteStories,
  parseArgs,
} = require("../backfill-missing-data.js");

const makeValidateEntryStub = () => {
  const validateEntry = jest.fn((entry) => {
    if (entry.invalid) {
      validateEntry.errors = [
        {
          instancePath: "/data/metrics",
          message: "must be object",
        },
      ];
      return false;
    }

    validateEntry.errors = null;
    return true;
  });

  return validateEntry;
};

describe("backfill-missing-data parseArgs", () => {
  test("parses valid options", () => {
    const options = parseArgs([
      "--dry-run",
      "--repo",
      "owner/repo",
      "--max-prs",
      "10",
      "--delay-ms",
      "1500",
      "--jobs",
      "2",
      "--concurrency",
      "3",
      "--max-age-days",
      "30",
    ]);

    expect(options.dryRun).toBe(true);
    expect(options.repo).toBe("owner/repo");
    expect(options.maxPrs).toBe(10);
    expect(options.delayMs).toBe(1500);
    expect(options.jobs).toBe(2);
    expect(options.concurrency).toBe(3);
    expect(options.maxAgeDays).toBe(30);
  });

  test("throws on unknown argument", () => {
    expect(() => parseArgs(["--unexpected"])).toThrow(
      "Unknown argument: --unexpected",
    );
  });

  test("throws on invalid numeric argument", () => {
    expect(() => parseArgs(["--jobs", "0"])).toThrow(
      "Invalid --jobs value: 0",
    );
    expect(() => parseArgs(["--concurrency", "0"])).toThrow(
      "Invalid --concurrency value: 0",
    );
  });
});

describe("backfill-missing-data candidate selection", () => {
  test("selects schema-invalid and age-stale entries with stable ordering", () => {
    const validateEntry = makeValidateEntryStub();

    const byPrNumber = {
      "15": {
        repo: "owner/repo",
        updatedAt: "2026-05-10T00:00:00Z",
        invalid: true,
      },
      "16": {
        repo: "owner/repo",
        updatedAt: "2026-05-01T00:00:00Z",
      },
      "17": {
        repo: "owner/repo",
        updatedAt: "2026-05-27T00:00:00Z",
      },
      "18": {
        repo: "other/repo",
        updatedAt: "2026-05-01T00:00:00Z",
        invalid: true,
      },
    };

    const candidates = collectBackfillCandidates({
      byPrNumber,
      validateEntry,
      repo: "owner/repo",
      maxAgeDays: 14,
      nowMs: Date.parse("2026-05-27T00:00:00Z"),
    });

    expect(candidates.map((item) => item.prNumber)).toEqual(["16", "15"]);
    expect(candidates[0].reasons).toContain("age>14d");
    expect(candidates[1].reasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining("schema:/data/metrics must be object"),
      ]),
    );
  });

  test("returns empty when no entries match", () => {
    const validateEntry = makeValidateEntryStub();

    const candidates = collectBackfillCandidates({
      byPrNumber: {
        "50": {
          repo: "owner/repo",
          updatedAt: "2026-05-27T00:00:00Z",
        },
      },
      validateEntry,
      repo: "owner/repo",
      maxAgeDays: 7,
      nowMs: Date.parse("2026-05-27T00:00:00Z"),
    });

    expect(candidates).toEqual([]);
  });

  test("prioritizes open and draft candidates ahead of closed and merged", () => {
    const validateEntry = makeValidateEntryStub();

    const byPrNumber = {
      "11": {
        repo: "owner/repo",
        section: "merged",
        updatedAt: "2026-05-01T00:00:00Z",
        invalid: true,
      },
      "12": {
        repo: "owner/repo",
        section: "closed",
        updatedAt: "2026-05-01T00:00:00Z",
        invalid: true,
      },
      "13": {
        repo: "owner/repo",
        section: "open",
        updatedAt: "2026-05-15T00:00:00Z",
        invalid: true,
      },
      "14": {
        repo: "owner/repo",
        section: "draft",
        updatedAt: "2026-05-10T00:00:00Z",
        invalid: true,
      },
    };

    const candidates = collectBackfillCandidates({
      byPrNumber,
      validateEntry,
      repo: "owner/repo",
      maxAgeDays: 0,
    });

    expect(candidates.map((item) => item.prNumber)).toEqual([
      "13",
      "14",
      "12",
      "11",
    ]);
  });
});

describe("backfill-missing-data default paths", () => {
  test("the default schema and refresh script paths point at files that exist", () => {
    const { schemaPath, refreshScriptPath } = buildDefaultOptions();
    expect(fs.existsSync(schemaPath)).toBe(true);
    expect(fs.existsSync(refreshScriptPath)).toBe(true);
  });
});

describe("backfill-missing-data old-format stories", () => {
  test("given a note with rallyStories/rallyLinks, when migrating, then they become stories paired by position, keeping other fields and their order", () => {
    const migrated = migrateNoteStories({
      comments: [{ id: "c-1", note: "keep" }],
      otherNotes: "x",
      prDifficulty: "3",
      rallyStories: ["US1", "US2"],
      rallyLinks: ["https://stories.example/US1"],
      analysisOfPr: "a",
    });

    expect(migrated).toEqual({
      comments: [{ id: "c-1", note: "keep" }],
      otherNotes: "x",
      prDifficulty: "3",
      stories: [
        { name: "US1", url: "https://stories.example/US1" },
        { name: "US2", url: "" },
      ],
      analysisOfPr: "a",
    });
    expect(Object.keys(migrated)).toEqual(["comments", "otherNotes", "prDifficulty", "stories", "analysisOfPr"]);
  });

  test("given a note already using stories, or with no story fields, when migrating, then it is left alone", () => {
    expect(migrateNoteStories({ comments: [], stories: [{ name: "US1", url: "" }] })).toBeNull();
    expect(migrateNoteStories({ comments: [] })).toBeNull();
    expect(migrateNoteStories(null)).toBeNull();
  });

  test("given a note with both stories and leftover old keys, when migrating, then stories is kept and the old keys removed", () => {
    expect(
      migrateNoteStories({ stories: [{ name: "US1", url: "" }], rallyStories: ["OLD"], rallyLinks: [] }),
    ).toEqual({ stories: [{ name: "US1", url: "" }] });
  });

  test("given old-format notes in the user state and on data-file entries, when migrating both, then each is converted and reported", () => {
    const userState = {
      notesByPrNumber: {
        1: { comments: [], otherNotes: "", rallyStories: "US1", rallyLinks: "" },
        2: { comments: [], otherNotes: "", stories: [] },
      },
    };
    const data = {
      byPrNumber: {
        3: { repo: "owner/repo", notes: { comments: [], otherNotes: "", rallyLinks: ["https://x/3"] } },
        4: { repo: "owner/repo" },
      },
    };

    expect(migrateLegacyStories({ userState, data })).toEqual({ userStatePrNumbers: ["1"], dataPrNumbers: ["3"] });
    expect(userState.notesByPrNumber[1].stories).toEqual([{ name: "US1", url: "" }]);
    expect(data.byPrNumber[3].notes).toEqual({ comments: [], otherNotes: "", stories: [{ name: "", url: "https://x/3" }] });
    expect(data.byPrNumber[4]).toEqual({ repo: "owner/repo" });
  });

  describe("in the files", () => {
    let dir;
    let userStatePath;
    let dataPath;
    let backupDir;
    const writeJson = (filePath, value) => fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
    const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
    const run = (extra = {}) =>
      migrateLegacyStoriesInFiles({ userStatePath, dataPath, backupDir, log: () => {}, ...extra });

    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "backfill-stories-"));
      userStatePath = path.join(dir, "check-open-pr-updates.user-state.json");
      dataPath = path.join(dir, "check-open-pr-updates.data.json");
      backupDir = path.join(dir, "backups");
      writeJson(userStatePath, {
        notesByPrNumber: { 1: { comments: [], otherNotes: "", rallyStories: ["US1"], rallyLinks: ["https://x/1"] } },
        ackByRepo: {},
      });
      writeJson(dataPath, { byPrNumber: { 1: { repo: "owner/repo" } }, lastRun: null });
    });

    afterEach(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test("given an old-format note, when run, then the user state is rewritten with stories and the original is backed up", async () => {
      await expect(run()).resolves.toEqual({ userStatePrNumbers: ["1"], dataPrNumbers: [] });

      expect(readJson(userStatePath)).toEqual({
        notesByPrNumber: { 1: { comments: [], otherNotes: "", stories: [{ name: "US1", url: "https://x/1" }] } },
        ackByRepo: {},
      });
      const backups = fs.readdirSync(backupDir);
      expect(backups).toHaveLength(1);
      expect(backups[0]).toMatch(/^check-open-pr-updates\.user-state\.json\.stories-migration\..+\.bak$/);
      expect(readJson(path.join(backupDir, backups[0])).notesByPrNumber[1].rallyStories).toEqual(["US1"]);
      // The unchanged data file is neither rewritten nor backed up, and no
      // lock directory is left behind.
      expect(fs.existsSync(path.join(dir, "check-open-pr-updates.user-state.lock"))).toBe(false);
    });

    test("given a second run, when nothing is left in the old format, then nothing is written", async () => {
      await run();
      const before = fs.readFileSync(userStatePath, "utf8");

      await expect(run()).resolves.toEqual({ userStatePrNumbers: [], dataPrNumbers: [] });
      expect(fs.readFileSync(userStatePath, "utf8")).toBe(before);
      expect(fs.readdirSync(backupDir)).toHaveLength(1);
    });

    test("given --dry-run, when run, then the changes are reported but no file is written", async () => {
      const before = fs.readFileSync(userStatePath, "utf8");

      await expect(run({ dryRun: true })).resolves.toEqual({ userStatePrNumbers: ["1"], dataPrNumbers: [] });
      expect(fs.readFileSync(userStatePath, "utf8")).toBe(before);
      expect(fs.existsSync(backupDir)).toBe(false);
    });

    test("given the user state lock is held by another writer, when run, then it fails without writing", async () => {
      fs.mkdirSync(path.join(dir, "check-open-pr-updates.user-state.lock"));
      const before = fs.readFileSync(userStatePath, "utf8");

      await expect(run({ lockWaitMs: 100 })).rejects.toThrow(/Unable to acquire lock/);
      expect(fs.readFileSync(userStatePath, "utf8")).toBe(before);
    });

    test("given a held lock with the shell's lock-info, when run, then the error says who holds it and when it can be removed", async () => {
      const lockDir = path.join(dir, "check-open-pr-updates.user-state.lock");
      fs.mkdirSync(lockDir);
      fs.writeFileSync(path.join(lockDir, "lock-info"), "pid=4242\ncreated_at=0\n");

      await expect(run({ lockWaitMs: 50 })).rejects.toThrow(
        /held for \d+s by pid 4242\).*if no check-open-pr-updates\.sh run is in progress.*can be removed/,
      );
    });

    test("given the dashboard saves a note between the read and the write, when run, then the conversion is redone on the saved copy instead of overwriting it", async () => {
      let reads = 0;
      const readText = (filePath) => {
        reads += 1;
        if (filePath === userStatePath && reads === 2) {
          // The "dashboard" saves PR 2's notes after the first read.
          const saved = readJson(userStatePath);
          saved.notesByPrNumber[2] = { comments: [], otherNotes: "saved meanwhile", stories: [] };
          writeJson(userStatePath, saved);
        }
        return fs.readFileSync(filePath, "utf8");
      };

      await expect(run({ readText })).resolves.toMatchObject({ userStatePrNumbers: ["1"] });

      expect(readJson(userStatePath).notesByPrNumber).toEqual({
        1: { comments: [], otherNotes: "", stories: [{ name: "US1", url: "https://x/1" }] },
        2: { comments: [], otherNotes: "saved meanwhile", stories: [] },
      });
      expect(fs.readdirSync(backupDir)).toHaveLength(1);
    });

    test("given the file keeps changing on every read, when run, then it gives up without writing", async () => {
      let reads = 0;
      const readText = (filePath) => {
        reads += 1;
        if (filePath === userStatePath) {
          const saved = readJson(userStatePath);
          saved.ackByRepo = { "owner/repo": { [String(reads)]: "2026-10-24T00:00:00Z" } };
          writeJson(userStatePath, saved);
        }
        return fs.readFileSync(filePath, "utf8");
      };

      await expect(run({ readText })).rejects.toThrow(/kept changing.*nothing was written/);
      expect(readJson(userStatePath).notesByPrNumber[1].rallyStories).toEqual(["US1"]);
      expect(fs.existsSync(backupDir)).toBe(false);
    });

    test("given missing files, when run, then they are skipped", async () => {
      fs.rmSync(userStatePath);
      fs.rmSync(dataPath);

      await expect(run()).resolves.toEqual({ userStatePrNumbers: [], dataPrNumbers: [] });
    });
  });
});
