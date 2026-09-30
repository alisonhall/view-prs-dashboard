const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..", "..", "..");
const launcherPath = path.join(repoRoot, "run-prs");

// Regression coverage for a real bug: run-prs used to be `npm run start --
// "$@"`, which silently launched the React dev servers (via `concurrently`)
// instead of the CLI script once `start` was repointed during the React
// migration - every documented flag (--open, --repo, --ack, --backup-list,
// etc.) stopped working, and nothing caught it because nothing exercised
// run-prs end-to-end. These tests assert run-prs actually invokes
// check-open-pr-updates.sh directly.
describe("run-prs launcher", () => {
  test("invokes bash directly, not npm/concurrently", () => {
    const contents = fs.readFileSync(launcherPath, "utf8");
    expect(contents).toMatch(/bash src\/script\/check-open-pr-updates\.sh/);
    // Matches the actual invocation, not the explanatory comment above it
    // (which deliberately names the old broken form for context).
    expect(contents).not.toMatch(/^\s*npm run start/m);
  });

  test("--help prints the CLI script's own usage, not concurrently's", () => {
    const output = execFileSync("bash", [launcherPath, "--help"], {
      cwd: repoRoot,
      encoding: "utf8",
    });

    expect(output).toContain("check-open-pr-updates.sh");
    expect(output).toContain("--repo <owner/name>");
    expect(output).not.toContain("concurrently");
  });
});
