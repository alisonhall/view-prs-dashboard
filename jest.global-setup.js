const fs = require("fs");
const os = require("os");
const path = require("path");

// One temporary folder for the run, as TMPDIR: the bash the tests run
// (check-open-pr-updates.sh and its helpers) makes its mktemp files and
// folders there, and many of those - a state write a test makes fail on
// purpose, a cache the sourced script falls back to - are never removed.
// jest.global-teardown.js removes the folder, so they don't pile up in the
// system's temporary folder run after run. Set before the workers start,
// so each inherits it.
module.exports = async () => {
  const runTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "view-prs-jest-"));
  process.env.VIEW_PRS_JEST_TMPDIR = runTmpDir;
  process.env.TMPDIR = runTmpDir;
};
