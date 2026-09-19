const {
  collectBackfillCandidates,
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
