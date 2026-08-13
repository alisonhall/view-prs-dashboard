const fs = require("fs");
const os = require("os");
const path = require("path");

const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

describe("migrate-pr-detail-sidecar-v1", () => {
  let tmpRoot;
  let viewPrsDir;
  let dataDir;
  let dataFile;
  let detailDir;
  let backupDir;
  const envKeys = [
    "DATA_DIR",
    "MIGRATE_DATA_FILE",
    "MIGRATE_DETAIL_DIR",
    "STATE_BACKUP_DIR",
  ];
  let originalEnv;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "view-prs-migrate-"));
    viewPrsDir = path.join(tmpRoot, "view-prs");
    dataDir = path.join(viewPrsDir, "data");
    dataFile = path.join(dataDir, "check-open-pr-updates.data.json");
    detailDir = path.join(dataDir, "pr-details");
    backupDir = path.join(dataDir, "backups");

    originalEnv = {};
    envKeys.forEach((key) => {
      originalEnv[key] = process.env[key];
    });

    process.env.DATA_DIR = dataDir;
    process.env.MIGRATE_DATA_FILE = dataFile;
    process.env.MIGRATE_DETAIL_DIR = detailDir;
    process.env.STATE_BACKUP_DIR = backupDir;
  });

  afterEach(() => {
    jest.resetModules();
    envKeys.forEach((key) => {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    });

    if (tmpRoot) {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  test("externalizes heavy fields into sidecar and strips them from main row", () => {
    writeJson(dataFile, {
      generatedAt: "2026-06-02T00:00:00Z",
      byPrNumber: {
        123: {
          repo: "owner/repo",
          data: {
            number: 123,
            title: "PR",
            comments: [],
            reviews: [],
            commits: [],
            activityTimeline: [{ date: "2026-06-02" }],
            activityEvents: [{ type: "comment" }],
            reviewThreads: [{ id: "thread-1" }],
            commentEvents: [{ type: "thread" }],
          },
        },
      },
    });

    const { runMigration } = require("../migrate-pr-detail-sidecar-v1");
    runMigration();

    const updated = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    const row = updated.byPrNumber[123].data;

    expect(row.detailRef).toEqual({
      file: `${detailDir}/owner_repo__pr-123.json`,
      version: "v1",
    });
    expect(row.activityTimeline).toBeUndefined();
    expect(row.activityEvents).toBeUndefined();
    expect(row.reviewThreads).toBeUndefined();
    expect(row.commentEvents).toBeUndefined();

    const sidecar = JSON.parse(fs.readFileSync(row.detailRef.file, "utf8"));
    expect(sidecar.activityTimeline).toHaveLength(1);
    expect(sidecar.activityEvents).toHaveLength(1);
    expect(sidecar.reviewThreads).toHaveLength(1);
    expect(sidecar.commentEvents).toHaveLength(1);

    const backups = fs.readdirSync(backupDir);
    expect(backups.length).toBe(1);
  });

  test("does not rewrite data file when no inline-heavy rows need migration", () => {
    writeJson(dataFile, {
      generatedAt: "2026-06-02T00:00:00Z",
      byPrNumber: {
        123: {
          repo: "owner/repo",
          data: {
            number: 123,
            title: "PR",
            comments: [],
            reviews: [],
            commits: [],
            detailRef: {
              file: "data/pr-details/owner_repo__pr-123.json",
              version: "v1",
            },
          },
        },
      },
    });

    const before = fs.readFileSync(dataFile, "utf8");
    const { runMigration } = require("../migrate-pr-detail-sidecar-v1");
    runMigration();

    const after = fs.readFileSync(dataFile, "utf8");
    expect(after).toBe(before);
    expect(fs.existsSync(backupDir)).toBe(false);
  });

  test("does not overwrite existing non-empty sidecar with empty inline-heavy payload", () => {
    const sidecarPath = path.join(detailDir, "owner_repo__pr-123.json");
    writeJson(sidecarPath, {
      activityTimeline: [{ date: "2026-06-02" }],
      activityEvents: [{ type: "comment" }],
      reviewThreads: [{ id: "thread-1" }],
      commentEvents: [{ type: "thread" }],
    });

    writeJson(dataFile, {
      generatedAt: "2026-06-02T00:00:00Z",
      byPrNumber: {
        123: {
          repo: "owner/repo",
          data: {
            number: 123,
            title: "PR",
            comments: [],
            reviews: [],
            commits: [],
            activityTimeline: [],
            activityEvents: [],
            reviewThreads: [],
            commentEvents: [],
          },
        },
      },
    });

    const { runMigration } = require("../migrate-pr-detail-sidecar-v1");
    runMigration();

    const sidecar = JSON.parse(fs.readFileSync(sidecarPath, "utf8"));
    expect(sidecar.activityTimeline).toHaveLength(1);
    expect(sidecar.activityEvents).toHaveLength(1);
    expect(sidecar.reviewThreads).toHaveLength(1);
    expect(sidecar.commentEvents).toHaveLength(1);
  });
});
