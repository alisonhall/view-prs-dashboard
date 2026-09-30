const fs = require("fs");
const path = require("path");

const packageJsonPath = path.join(__dirname, "..", "..", "..", "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

describe("package.json scripts", () => {
  // Regression coverage: cli-view used to invoke check-open-pr-updates.sh via
  // `sh`, but the script relies on bash-only syntax (local -a arrays, [[,
  // pipefail). That happens to work in Git Bash on Windows (its `sh` is
  // bash), masking the bug there, but fails on a system where /bin/sh is a
  // POSIX-only shell like dash (Debian/Ubuntu's default). Every other
  // invocation path in this codebase already uses `bash` explicitly.
  test("cli-view invokes the CLI script with bash, not sh", () => {
    expect(packageJson.scripts["cli-view"]).toMatch(
      /\bbash src\/script\/check-open-pr-updates\.sh\b/,
    );
  });
});
