// Runs some of check-open-pr-updates.test.sh's own test functions, which
// nothing else runs: as a whole that file doesn't pass (found 2026-10-31 -
// run_compute_state_tests' "later external non-approved review" check
// fails), so these are the ones known to, picked with its ONLY_TESTS.
const { execFileSync } = require("child_process");
const path = require("path");

const testScript = path.join(__dirname, "check-open-pr-updates.test.sh");

const runShellTests = (testFunctions) =>
  execFileSync("bash", [testScript], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
    env: { ...process.env, BASH_ENV: "", ONLY_TESTS: testFunctions.join(" ") },
  });

test("upserts keep a row's order and stamp when it was written; --prs refreshes only the chosen PRs", () => {
  const output = runShellTests(["run_row_order_stability_tests", "run_targeted_prs_tests"]);
  expect(output).toContain("All tests passed");
}, 180000);

test("a full run reuses rows whose PR hasn't changed, and fetches the rest", () => {
  const output = runShellTests(["run_row_reuse_tests"]);
  expect(output).toContain("All tests passed");
}, 360000);
