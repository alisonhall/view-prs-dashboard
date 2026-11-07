// check-open-pr-updates.test.sh's quicker groups (see
// check-open-pr-updates.sh-tests.helpers.js); full runs are in
// check-open-pr-updates.sh-tests.runs.test.js and .main.test.js.
const { defineShellTestGroups } = require("./check-open-pr-updates.sh-tests.helpers");

defineShellTestGroups([
  ["helpers, and the ack and user-state stores", ["run_helper_tests", "run_ack_store_tests"]],
  ["a row's status, reasons, approvals and activity", ["run_compute_state_tests"]],
  ["review threads page; an ack with new activity reruns", ["run_fetch_threads_pagination_tests", "run_ack_changed_rerun_tests"]],
  ["stored open rows no longer listed are reclassified", ["run_reconcile_missing_open_rows_tests"]],
  ["the stale collections split open from draft; cached details are reused unless the run targets the PR", ["run_cache_freshness_tests"]],
  ["the quick check reports only changed PRs", ["run_quick_check_tests", "run_quick_check_numbers_tests"]],
]);
