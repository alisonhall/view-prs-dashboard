// check-open-pr-updates.test.sh's slowest group, on its own so it runs
// alongside the others (see check-open-pr-updates.sh-tests.helpers.js): four
// full runs, about 4.5 minutes on a fast Windows machine.
const { defineShellTestGroups } = require("./check-open-pr-updates.sh-tests.helpers");

defineShellTestGroups(
  [["full runs: closed/merged day windows, limits and label filters", ["run_main_integration_tests"]]],
  { timeoutMs: 600000 },
);
