/**
 * Jest setupFiles entry — runs in each worker process before any test module is
 * loaded. Sets VIEW_PRS_* env vars so that app.js's hard-enforcement check
 * passes and every test writes only to a temporary directory, never to real
 * production state files.
 *
 * This file must NOT import app.js or any module that imports app.js.
 */

const os = require("os");
const fs = require("fs");
const path = require("path");

// Only create a new temp dir if this worker hasn't done so already.
// With --runInBand a single process handles all suites sequentially, so the
// env vars survive across suites and we reuse the same temp dir.
if (!process.env.VIEW_PRS_DATA_FILE) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "view-prs-test-"));
  fs.mkdirSync(path.join(tempDir, "backups"), { recursive: true });

  process.env.VIEW_PRS_DATA_FILE = path.join(tempDir, "data.json");
  process.env.VIEW_PRS_USER_STATE_FILE = path.join(tempDir, "user-state.json");
  process.env.VIEW_PRS_SCHEDULER_FILE = path.join(tempDir, "scheduler.json");
  process.env.VIEW_PRS_ACTION_LOG_FILE = path.join(tempDir, "action-log.json");
  process.env.VIEW_PRS_ACTOR_NAME_CACHE_FILE = path.join(
    tempDir,
    "actor-name-cache.json",
  );
  process.env.VIEW_PRS_ACTOR_LOGIN_ALIASES_FILE = path.join(
    tempDir,
    "actor-login-aliases.json",
  );
  process.env.VIEW_PRS_PR_DIFF_CONCURRENCY = "0";
  process.env.VIEW_PRS_DISABLE_BACKGROUND_DIFF_REFRESH = "1";
  process.env.VIEW_PRS_BACKUP_DIR = path.join(tempDir, "backups");
  // Expose to other setup files / global teardown if needed.
  process.env.VIEW_PRS_TEST_STATE_DIR = tempDir;
}

// Required for the hard-enforcement gate in app.js.
process.env.NODE_ENV = "test";
