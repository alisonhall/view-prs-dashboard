// check-open-pr-updates.test.sh's groups that run the script with --prs or
// reuse rows (see check-open-pr-updates.sh-tests.helpers.js).
const { defineShellTestGroups } = require("./check-open-pr-updates.sh-tests.helpers");

defineShellTestGroups([
  ["upserts keep a row's order and stamp when it was written; --prs refreshes only the chosen PRs", ["run_row_order_stability_tests", "run_targeted_prs_tests"]],
  ["a full run reuses rows whose PR hasn't changed, and fetches the rest", ["run_row_reuse_tests"]],
]);
