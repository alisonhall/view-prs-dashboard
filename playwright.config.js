// @ts-check
const fs = require("fs");
const os = require("os");
const path = require("path");
const { defineConfig } = require("@playwright/test");

/**
 * A thin smoke-test layer on top of the jsdom unit/integration suite
 * (`npm test`). jsdom never does real network resolution, CSS charset
 * handling, or font rendering, so a class of bug can only be caught by
 * actually loading the page in a browser - see the marked.umd.js 404 and
 * the missing <meta charset="utf-8"> mojibake bug this suite exists to
 * guard against. Keep this suite small (a handful of smoke tests): it is
 * not meant to duplicate the jsdom suite's interaction coverage.
 *
 * CRITICAL: the app server this suite drives reads/writes real PR-tracking
 * state (flagged/in-review/ack flags, notes) straight from disk with no
 * built-in fixture concept - by default that's the developer's real
 * `data/` directory. Every VIEW_PRS_* env var below points the server at a
 * throwaway temp copy instead, and NODE_ENV=test trips app.js's own
 * hard-enforcement check (see src/server/config/app-config.js) that
 * refuses to start if the data/user-state/actor-cache paths still resolve
 * to their real production defaults. Mirrors the same isolation pattern
 * `jest.setup.env.js` already uses for the jsdom suite - do not remove or
 * narrow this when adding new e2e tests.
 */
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "view-prs-e2e-"));
fs.mkdirSync(path.join(tempDir, "backups"), { recursive: true });
// Filenames must match what src/script/check-open-pr-updates.sh derives
// from $DATA_DIR by default (see its DATA_DIR/PR_STATE_FILE/USER_STATE_FILE
// lines) - checkbox/Ack actions run that script as a child process, and it
// has its own env vars (DATA_DIR, not VIEW_PRS_DATA_DIR) completely
// independent of app-config.js's VIEW_PRS_* vars below. Both sides need to
// agree on the same directory *and* the same filenames inside it.
fs.copyFileSync(
  path.join(__dirname, "e2e/fixtures/data.json"),
  path.join(tempDir, "check-open-pr-updates.data.json"),
);
fs.copyFileSync(
  path.join(__dirname, "e2e/fixtures/user-state.json"),
  path.join(tempDir, "check-open-pr-updates.user-state.json"),
);

const isolatedEnv = {
  NODE_ENV: "test",
  // Isolates the Node server (src/server/app.js via app-config.js).
  VIEW_PRS_DATA_FILE: path.join(tempDir, "check-open-pr-updates.data.json"),
  VIEW_PRS_USER_STATE_FILE: path.join(
    tempDir,
    "check-open-pr-updates.user-state.json",
  ),
  // Isolates src/script/check-open-pr-updates.sh, spawned by the Node
  // server for checkbox toggles, Ack, and "Run script" actions - without
  // this, those actions silently fall back to DATA_DIR's own default
  // ($VIEW_PRS_DIR/data, i.e. the real production data/ directory) no
  // matter what the VIEW_PRS_* vars above are set to.
  DATA_DIR: tempDir,
  VIEW_PRS_SCHEDULER_FILE: path.join(tempDir, "scheduler.json"),
  VIEW_PRS_ACTION_LOG_FILE: path.join(tempDir, "action-log.json"),
  VIEW_PRS_AUTHOR_COMMENTS_FILE: path.join(tempDir, "author-comments.json"),
  VIEW_PRS_ACTOR_NAME_CACHE_FILE: path.join(tempDir, "actor-name-cache.json"),
  VIEW_PRS_ACTOR_LOGIN_ALIASES_FILE: path.join(tempDir, "actor-login-aliases.json"),
  VIEW_PRS_BACKUP_DIR: path.join(tempDir, "backups"),
  VIEW_PRS_PR_DIFF_DIR: path.join(tempDir, "pr-diffs"),
  VIEW_PRS_PR_DETAIL_DIR: path.join(tempDir, "pr-details"),
  VIEW_PRS_USER_DEFAULTS_FILE: path.join(tempDir, "user-defaults.json"),
  VIEW_PRS_BACKFILL_PID_FILE: path.join(tempDir, "backfill-missing.pid"),
  VIEW_PRS_BACKFILL_LOG_FILE: path.join(tempDir, "backfill-missing.log"),
  VIEW_PRS_DISABLE_SCHEDULER_STARTUP: "1",
};

module.exports = defineConfig({
  testDir: "./e2e",
  // Deliberately NOT fullyParallel: every test in this suite shares one
  // long-lived webServer/data directory (see isolatedEnv above) - there's
  // no per-test/per-worker isolation. Tests that persist through "Apply
  // filters (local)" do a real GET-merge-PUT against the same
  // user-defaults.json file; running them concurrently is a genuine
  // lost-update race (worker A's PUT can silently overwrite worker B's),
  // independent of and in addition to each test's own cleanup. Serial
  // execution is still fast for a suite this size (~10s).
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3456",
    trace: "on-first-retry",
  },
  // reuseExistingServer is deliberately always false, even locally: if a
  // developer's own real dev server (started via `npm run dev`, backed by
  // their real data/ directory) is already listening on these ports,
  // Playwright's usual "reuse it" convenience would silently attach these
  // tests to that real, non-isolated server instead of the isolated one
  // above - exactly the mistake that prompted this isolation setup in the
  // first place. Fail loudly (EADDRINUSE) instead.
  webServer: [
    {
      command: "node src/server/server.js",
      url: "http://localhost:9000/view-prs/data",
      reuseExistingServer: false,
      env: isolatedEnv,
      timeout: 30_000,
    },
    {
      command: "npx vite --port 3456",
      url: "http://localhost:3456/",
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
