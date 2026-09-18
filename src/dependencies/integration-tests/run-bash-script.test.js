const { execFileSync } = require("child_process");
const path = require("path");

const wrapperPath = path.join(__dirname, "..", "run-bash-script.js");
const projectRoot = path.join(__dirname, "..", "..", "..");

const runWrapper = (args, env) => {
  try {
    const stdout = execFileSync("node", [wrapperPath, ...args], {
      cwd: projectRoot,
      encoding: "utf8",
      env: env || process.env,
    });
    return { status: 0, stdout };
  } catch (error) {
    return { status: error.status, stdout: error.stdout, stderr: error.stderr };
  }
};

describe("run-bash-script", () => {
  test("given no script path argument, when run, then it exits 1 with a clear message", () => {
    const result = runWrapper([]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("requires a script path argument");
  });

  test("given bash is unavailable, when run, then it fails with an actionable install message instead of a bare not-found error", () => {
    // Strip every directory that could plausibly provide bash from PATH,
    // simulating a native Windows shell with no Git Bash/WSL - the exact
    // scenario this wrapper exists to give a clear error for.
    const strippedPath = String(process.env.PATH || "")
      .split(path.delimiter)
      .filter((entry) => !/mingw64.bin|\bbin$|Git.bin|usr.bin/i.test(entry))
      .join(path.delimiter);

    const result = runWrapper(["src/backfill/backfill-missing-bg.sh", "status"], {
      ...process.env,
      PATH: strippedPath,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("requires bash");
    expect(result.stderr).toContain("Git Bash");
  });

  test("given bash is available, when run with a real script, then it runs the script and forwards its output", () => {
    const result = runWrapper(["src/backfill/backfill-missing-bg.sh", "status"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Backfill status");
  });
});
