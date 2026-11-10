const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const scriptPath = path.join(__dirname, "..", "backfill-missing-bg.sh");

// The background backfill uses the same PID and log files the server reads
// for the dashboard's backfill status and log (app-config.js's
// VIEW_PRS_BACKFILL_PID_FILE / VIEW_PRS_BACKFILL_LOG_FILE), not a data/
// folder beside the script.
describe("backfill-missing-bg.sh", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "view-prs-backfill-bg-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("status reads the configured PID file, and clears it when that process is gone", () => {
    const pidFile = path.join(tempDir, "backfill-missing.pid");
    fs.writeFileSync(pidFile, "999999\n", "utf8");

    const stdout = execFileSync("bash", [scriptPath, "status"], {
      encoding: "utf8",
      env: {
        ...process.env,
        VIEW_PRS_BACKFILL_PID_FILE: pidFile,
        VIEW_PRS_BACKFILL_LOG_FILE: path.join(tempDir, "backfill-missing.log"),
      },
    });

    expect(stdout).toContain("Backfill status: not running");
    expect(fs.existsSync(pidFile)).toBe(false);
  });

  test("by default, its PID file is in the data folder (VIEW_PRS_DATA_DIR), as the server's is", () => {
    const pidFile = path.join(tempDir, "backfill-missing.pid");
    fs.writeFileSync(pidFile, "999999\n", "utf8");
    const env = { ...process.env, VIEW_PRS_DATA_DIR: tempDir };
    delete env.DATA_DIR;
    delete env.VIEW_PRS_BACKFILL_PID_FILE;
    delete env.VIEW_PRS_BACKFILL_LOG_FILE;

    const stdout = execFileSync("bash", [scriptPath, "status"], { encoding: "utf8", env });

    expect(stdout).toContain("Backfill status: not running");
    expect(fs.existsSync(pidFile)).toBe(false);
  });
});
