const fs = require("fs");

// Removes the run's temporary folder (jest.global-setup.js).
module.exports = async () => {
  const runTmpDir = process.env.VIEW_PRS_JEST_TMPDIR;
  if (runTmpDir) {
    fs.rmSync(runTmpDir, { recursive: true, force: true });
  }
};
