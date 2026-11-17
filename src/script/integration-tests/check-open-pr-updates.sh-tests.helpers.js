// Runs groups of check-open-pr-updates.test.sh's own test functions as Jest
// tests (picked with its ONLY_TESTS), so a failure names its group. The
// groups are split over a few test files because Jest runs files in
// parallel but a file's tests one after another.
const { execFileSync } = require("child_process");
const path = require("path");

const testScript = path.join(__dirname, "check-open-pr-updates.test.sh");

const tail = (text, lines = 40) => String(text || "").trimEnd().split("\n").slice(-lines).join("\n");

const runShellTests = (testFunctions, timeoutMs) => {
  try {
    return execFileSync("bash", [testScript], {
      cwd: path.join(__dirname, ".."),
      encoding: "utf8",
      env: { ...process.env, BASH_ENV: "", ONLY_TESTS: testFunctions.join(" ") },
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
      // execFileSync blocks, so Jest's own timeout can't stop a hung run.
      timeout: timeoutMs,
      killSignal: "SIGKILL",
    });
  } catch (error) {
    // Jest's own message is just "Command failed"; the script's output says
    // which check failed and why.
    const how = error.signal ? `killed (${error.signal}) after ${timeoutMs / 1000}s` : `exit ${error.status}`;
    throw new Error(
      `${testFunctions.join(" ")} failed: ${how}.\n--- stdout (end) ---\n${tail(error.stdout)}\n--- stderr (end) ---\n${tail(error.stderr)}`,
      { cause: error },
    );
  }
};

// groups: [name, testFunctions][]; timeoutMs: each group's limit.
const defineShellTestGroups = (groups, { timeoutMs = 300000 } = {}) => {
  for (const [name, testFunctions] of groups) {
    test(name, () => {
      expect(runShellTests(testFunctions, timeoutMs)).toContain("All tests passed");
    }, timeoutMs + 30000);
  }
};

module.exports = { defineShellTestGroups };
