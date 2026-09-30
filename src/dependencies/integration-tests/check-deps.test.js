jest.mock("child_process");

const { spawnSync } = require("child_process");
const {
  REQUIRED_SYSTEM_COMMANDS,
  getInstallHint,
  evaluateSystemCommands,
  evaluatePackageDeps,
  evaluateDeps,
  reportDeps,
  runCheckDeps,
} = require("../check-deps.js");

describe("check-deps", () => {
  describe("getInstallHint", () => {
    test("returns the platform-specific hint when present", () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", { value: "win32" });
      try {
        expect(getInstallHint({ win32: "winget install foo", default: "see docs" })).toBe(
          "winget install foo",
        );
      } finally {
        Object.defineProperty(process, "platform", { value: originalPlatform });
      }
    });

    test("falls back to the default hint on an unlisted platform", () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", { value: "freebsd" });
      try {
        expect(getInstallHint({ win32: "winget install foo", default: "see docs" })).toBe(
          "see docs",
        );
      } finally {
        Object.defineProperty(process, "platform", { value: originalPlatform });
      }
    });
  });

  describe("evaluateSystemCommands", () => {
    test("reports each required command's availability via `command -v`", () => {
      spawnSync.mockImplementation((_bin, args) => {
        // gh, not jq: jq's availability also checks node_modules/node-jq on
        // disk (see isJqAvailable), which is genuinely present in this repo
        // - a real devDependency - so mocking `command -v jq` to "missing"
        // wouldn't actually simulate an unavailable jq here.
        const isGh = args[1].includes("gh");
        return { status: isGh ? 1 : 0 };
      });

      const results = evaluateSystemCommands();

      expect(results).toHaveLength(REQUIRED_SYSTEM_COMMANDS.length);
      const ghEntry = results.find((entry) => entry.command === "gh");
      expect(ghEntry.available).toBe(false);
      const bashEntry = results.find((entry) => entry.command === "bash");
      expect(bashEntry.available).toBe(true);
    });

    test("reports jq as available via the bundled node-jq binary even when `command -v jq` itself would fail", () => {
      // Simulates every system `command -v` check failing (as if nothing
      // were on PATH at all) - jq should still report available because
      // node_modules/node-jq/bin is a real devDependency of this project.
      spawnSync.mockImplementation(() => ({ status: 1 }));

      const results = evaluateSystemCommands();
      const jqEntry = results.find((entry) => entry.command === "jq");
      expect(jqEntry.available).toBe(true);
    });
  });

  describe("evaluatePackageDeps", () => {
    // Regression test: require.resolve() used to be the check here, which
    // falsely reported types-only packages (e.g. @types/react - no runtime
    // "main"/"exports" JS file, only .d.ts) as missing even when npm
    // installed them correctly. Verified against the real project's own
    // node_modules, since @types/react is a genuine devDependency here.
    test("does not false-positive on a types-only package that is actually installed", () => {
      const missing = evaluatePackageDeps();
      expect(missing).not.toContain("@types/react");
      expect(missing).not.toContain("@types/react-dom");
    });

    test("does not false-positive on a real runtime package that is actually installed", () => {
      const missing = evaluatePackageDeps();
      expect(missing).not.toContain("express");
    });
  });

  describe("evaluateDeps scoping", () => {
    beforeEach(() => {
      spawnSync.mockImplementation((_bin, args) => {
        const cmd = args[1].replace("command -v ", "");
        // Only `gh` is missing in this scenario.
        return { status: cmd === "gh" ? 1 : 0 };
      });
    });

    test("scope 'all' includes every required command, testRequired or not", () => {
      const evaluation = evaluateDeps({ scope: "all" });
      expect(evaluation.missingCommands.map((entry) => entry.command)).toEqual(["gh"]);
    });

    test("scope 'test' excludes commands the jest suite doesn't actually exercise (e.g. gh)", () => {
      const evaluation = evaluateDeps({ scope: "test" });
      expect(evaluation.missingCommands).toEqual([]);
    });
  });

  describe("reportDeps", () => {
    const missingEntry = {
      command: "jq",
      reason: "parses JSON",
      installHint: "brew install jq",
    };

    test("logs at error level and returns 1 when something is missing and not soft", () => {
      const logger = { error: jest.fn(), warn: jest.fn(), log: jest.fn() };
      const exitCode = reportDeps(
        { commands: [], missingCommands: [missingEntry], missingPackages: [], packageJsonError: null },
        { soft: false, logger },
      );

      expect(exitCode).toBe(1);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("Missing command `jq`"),
      );
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("brew install jq"));
    });

    test("logs at warn level and returns 0 when soft, even with issues", () => {
      const logger = { error: jest.fn(), warn: jest.fn(), log: jest.fn() };
      const exitCode = reportDeps(
        { commands: [], missingCommands: [missingEntry], missingPackages: [], packageJsonError: null },
        { soft: true, logger },
      );

      expect(exitCode).toBe(0);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Missing command `jq`"));
    });

    test("logs OK and returns 0 when nothing is missing", () => {
      const logger = { error: jest.fn(), warn: jest.fn(), log: jest.fn() };
      const exitCode = reportDeps(
        { commands: [], missingCommands: [], missingPackages: [], packageJsonError: null },
        { soft: false, logger },
      );

      expect(exitCode).toBe(0);
      expect(logger.log).toHaveBeenCalledWith(expect.stringContaining("OK"));
    });
  });

  describe("runCheckDeps", () => {
    test("given all commands present, when run with scope 'test', then it exits 0", () => {
      spawnSync.mockImplementation(() => ({ status: 0 }));
      const logger = { error: jest.fn(), warn: jest.fn(), log: jest.fn() };
      expect(runCheckDeps({ scope: "test", logger })).toBe(0);
    });
  });
});
