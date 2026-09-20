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

// defaultViewPrsRepo (app-config.js) has no hardcoded fallback (deliberately
// removed - it was the repo owner's own private repo). Tests that exercise
// app.js's real scheduler/auto-refresh bootstrap logic with no other repo
// signal (no stored lastRun.repo, no VIEW_PRS_AUTO_REPOS) need *some* stable
// value here to have anything to do - a clearly-fake placeholder, not a
// real repo, and never used for any actual `gh` call in these tests (they
// mock runViewPrsScript). Tests that need "no repo configured at all"
// specifically (e.g. app-config.test.js) already pass their own `env: {}`
// override to createAppConfig(), bypassing this.
if (!process.env.VIEW_PRS_REPO) {
  process.env.VIEW_PRS_REPO = "test-org/test-repo";
}

// Required for the hard-enforcement gate in app.js.
process.env.NODE_ENV = "test";

// --- Guard against real child_process.spawn during tests ---
// app.js's script-execution layer (command-execution-helpers.js) shells
// out to real `gh`/bash commands via a *detached* spawn (see its own spawn
// options) for long-running work - every test that exercises that layer is
// expected to inject a fake spawn (see command-execution-helpers.test.js)
// or override module.exports.runViewPrsScript/runViewPrsBashCommand (see
// app.scheduler.test.js and friends) rather than ever invoking a real one.
// A missed or broken mock would otherwise silently launch a real, detached
// child process that nothing waits for or cleans up - and --forceExit (see
// package.json's test:all/test:coverage) then lets Jest exit without ever
// noticing it's still running. Throwing here converts that into an
// immediate, loud failure naming the exact call site instead of a silent
// orphaned process.
//
// spawnSync is deliberately NOT guarded here, even though it's also a real
// child-process API: it blocks until the child exits and is never called
// with `detached`, so it can't leave anything orphaned the way an
// unmocked detached spawn can - it can only make a test slower or flakier
// against real `gh`/`bash` availability, a pre-existing, different concern
// (confirmed: getViewPrsViewerLogin calls a real, ungated spawnSync on
// every /view-prs/data-family request with no cached login yet - guarding
// spawnSync too broke every route-integration test that hits it).
//
// This file runs once per test file - Jest resets each file's own module
// registry AND gives each file its own sandboxed `global` (jest-environment-
// node/jsdom each run test code inside a fresh vm context), but Node's
// built-in modules like child_process are the one real, process-wide
// singleton shared across all of them. That combination means the wrapper
// below must be reinstalled on every file (each file's own `global`, e.g.
// its own global.__viewPrsAllowRealSpawn, must be the one the *active*
// wrapper reads) - a wrapper closure created once, during only the first
// file's setup, keeps whichever file's `global` was in scope at that
// moment forever, silently going stale for every later file. Confirmed
// this exact bug: real, allowlisted spawns from later files were
// intermittently, non-deterministically blocked under `--coverage`
// specifically (its added overhead made the timing worse), because the
// first-installed wrapper's closed-over `global` no longer matched the
// file whose code was actually calling spawn(). The real original spawn
// is captured on `childProcess` itself exactly once so re-running this
// file never wraps an already-wrapped function.
const childProcess = require("child_process");
if (!childProcess.__viewPrsRealSpawn) {
  childProcess.__viewPrsRealSpawn = childProcess.spawn;
}
{
  // Genuine exceptions only - add a file here for an equally real "must
  // spawn something real" case, not to silence this guard because a mock
  // was inconvenient to wire up.
  //
  // Matched against the call's own stack trace (see isRealSpawnAllowedHere
  // below), not expect.getState().testPath/currentTestName: under heavy
  // load (confirmed with --coverage specifically) those reflect whichever
  // test Jest currently considers "current" at the moment spawn() happens
  // to run, which is NOT reliably the test whose own code actually called
  // it - a real, legitimate spawn from one of these files was intermittently
  // misattributed to a completely unrelated, unallowlisted test elsewhere
  // in the suite and wrongly blocked, while the resulting "DEBUG BLOCKED
  // SPAWN" trace still showed these exact files as the true caller. The
  // stack trace is the actual JS call chain at the moment spawn() runs, so
  // it isn't subject to that race.
  const REAL_SPAWN_ALLOWED_FILES = [
    // Boots a real `node server.js` subprocess throughout, to verify the
    // standalone server actually starts and responds.
    "server.startup.test.js",
    // Verifies progress-marker parsing (START/END stderr markers around
    // real stdout) against a real bash one-liner, on purpose - there's
    // nothing to mock here, the marker-parsing logic *is* the subject.
    "app.helpers.test.js",
    // Both of these run real, end-to-end supertest requests against a real
    // Express app/server instance (not mocked route handlers) - GET
    // /data-family routes trigger a real runViewPrsBackfillAction("status")
    // (bash backfill-missing-bg.sh) as a side effect on essentially every
    // request, and POST /backfill/start,/stop go through
    // runViewPrsShellScript directly, which (unlike runViewPrsScript/
    // runViewPrsBashCommand) has no module.exports.X override hook at all
    // yet. A real fix would add that override hook and mock the status
    // side effect; allowlisting these two files preserves today's actual
    // (already-passing) behavior without that larger refactor here.
    "app.integration-extra.test.js",
    "app.routes.test.js",
  ];

  // global.__viewPrsAllowRealSpawn is the fallback for callers whose real
  // spawn happens inside async route-handling machinery (Express/http)
  // that never puts the test file's own frame on the call stack - see
  // app.routes.test.js/app.integration-extra.test.js's own
  // beforeAll/afterAll, which toggle it for their real-server lifetime.
  const isRealSpawnAllowedHere = (stack) =>
    global.__viewPrsAllowRealSpawn === true ||
    REAL_SPAWN_ALLOWED_FILES.some((allowedFile) => stack.includes(allowedFile));

  childProcess.spawn = (...args) => {
    // Captured before checking anything else - this is what actually
    // identifies the caller (see REAL_SPAWN_ALLOWED_FILES's own comment).
    const { stack } = new Error();
    if (!isRealSpawnAllowedHere(stack)) {
      throw new Error(
        `Real child_process.spawn(${JSON.stringify(args[0])}, ...) was called during a test. ` +
          "This should be mocked instead - inject a fake spawn (see " +
          "command-execution-helpers.test.js) or override module.exports.runViewPrsScript / " +
          "runViewPrsBashCommand (see app.scheduler.test.js). If this test genuinely needs a " +
          "real subprocess, add its file name to REAL_SPAWN_ALLOWED_FILES in jest.setup.env.js.\n" +
          `Call stack:\n${stack}`,
      );
    }
    return childProcess.__viewPrsRealSpawn.apply(childProcess, args);
  };
}
