const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..", "..", "..");
const scriptPath = path.join(repoRoot, "verify-react-setup.sh");

// Regression coverage for two real bugs found by inspection, neither
// previously caught by any test:
// - the port check tested 3455 ("backend"), but the real backend port is
//   9000 - it was checking a port nothing ever listens on.
// - the port check used `lsof`, which isn't installed by default in Git
//   Bash on Windows, so `! lsof ...` silently reported "available" for
//   every port there regardless of what was actually listening.
describe("verify-react-setup.sh", () => {
  test("checks the real backend port (9000), not a stale one (3455)", () => {
    const contents = fs.readFileSync(scriptPath, "utf8");
    expect(contents).toMatch(/check_port 9000 "backend"/);
    expect(contents).not.toContain("3455");
  });

  test("does not depend on lsof", () => {
    const contents = fs.readFileSync(scriptPath, "utf8");
    // Matches the actual command invocation, not the explanatory comment
    // above it (which deliberately names lsof for context on why it's gone).
    expect(contents).not.toMatch(/\blsof\s+-/);
  });

  test("does not reference nonexistent doc files", () => {
    const contents = fs.readFileSync(scriptPath, "utf8");
    expect(contents).not.toContain("TEST_REACT_SETUP.md");
    expect(contents).not.toContain("PHASE1_STEP1_COMPLETE.md");
  });

  test("reports the real backend port as available when nothing is listening on it", () => {
    const output = execFileSync("bash", [scriptPath], {
      cwd: repoRoot,
      encoding: "utf8",
    });

    expect(output).toContain("Port 9000 (backend) available");
  });
});
