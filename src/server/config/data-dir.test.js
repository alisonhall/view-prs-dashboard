const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { readDataDirFromEnvFile, resolveDataDir } = require("./data-dir");

// The data folder: VIEW_PRS_DATA_DIR, then DATA_DIR, then .env, then data/
// (README "Data folder"); data-dir.sh finds the same folder for the scripts.
describe("data-dir", () => {
  let appDir;

  beforeEach(() => {
    appDir = fs.mkdtempSync(path.join(os.tmpdir(), "view-prs-data-dir-"));
  });

  afterEach(() => {
    fs.rmSync(appDir, { recursive: true, force: true });
  });

  const writeEnv = (text) => fs.writeFileSync(path.join(appDir, ".env"), text, "utf8");

  describe("readDataDirFromEnvFile", () => {
    test("reads the last VIEW_PRS_DATA_DIR line, unquoted, from a CRLF file", () => {
      writeEnv('GITHUB_TOKEN=x\r\nVIEW_PRS_DATA_DIR=first\r\n  VIEW_PRS_DATA_DIR = "D:/My Data"  \r\n');
      expect(readDataDirFromEnvFile(path.join(appDir, ".env"))).toBe("D:/My Data");
    });

    test("drops an inline comment from an unquoted value, as Node's .env loader does", () => {
      writeEnv("VIEW_PRS_DATA_DIR=../my-data   # moved 2026-11-09\n");
      expect(readDataDirFromEnvFile(path.join(appDir, ".env"))).toBe("../my-data");
      writeEnv("VIEW_PRS_DATA_DIR='a # b' # comment\n");
      expect(readDataDirFromEnvFile(path.join(appDir, ".env"))).toBe("a # b");
    });

    test("is empty without the file or the line", () => {
      expect(readDataDirFromEnvFile(path.join(appDir, ".env"))).toBe("");
      writeEnv("OTHER=1\n# VIEW_PRS_DATA_DIR=commented\n");
      expect(readDataDirFromEnvFile(path.join(appDir, ".env"))).toBe("");
    });
  });

  describe("resolveDataDir", () => {
    test("defaults to the app's data/", () => {
      expect(resolveDataDir({ viewPrsDir: appDir, env: {} })).toBe(path.join(appDir, "data"));
    });

    test("takes VIEW_PRS_DATA_DIR from the environment, then .env", () => {
      writeEnv("VIEW_PRS_DATA_DIR=from-env-file\n");
      expect(resolveDataDir({ viewPrsDir: appDir, env: { VIEW_PRS_DATA_DIR: "a" } })).toBe(path.join(appDir, "a"));
      expect(resolveDataDir({ viewPrsDir: appDir, env: { VIEW_PRS_DATA_DIR: "  " } })).toBe(
        path.join(appDir, "from-env-file"),
      );
    });

    // A common name a shell may have set for something else.
    test("never reads DATA_DIR", () => {
      expect(resolveDataDir({ viewPrsDir: appDir, env: { DATA_DIR: "elsewhere" } })).toBe(path.join(appDir, "data"));
    });

    test("skips .env with envFile null", () => {
      writeEnv("VIEW_PRS_DATA_DIR=from-env-file\n");
      expect(resolveDataDir({ viewPrsDir: appDir, env: {}, envFile: null })).toBe(path.join(appDir, "data"));
    });

    test("keeps an absolute folder as it is", () => {
      const elsewhere = path.join(os.tmpdir(), "elsewhere");
      expect(resolveDataDir({ viewPrsDir: appDir, env: { VIEW_PRS_DATA_DIR: elsewhere } })).toBe(elsewhere);
    });
  });

  describe("data-dir.sh", () => {
    const shFile = path.join(__dirname, "..", "..", "script", "data-dir.sh");
    // Bash wants forward slashes on Windows.
    const posix = (p) => p.replace(/\\/g, "/");
    const resolveInBash = (env) => {
      const clean = { ...process.env, ...env };
      ["DATA_DIR", "VIEW_PRS_DATA_DIR"].forEach((key) => {
        if (!(key in env)) delete clean[key];
      });
      return execFileSync("bash", ["-c", '. "$1"; resolve_data_dir "$2"', "bash", posix(shFile), posix(appDir)], {
        encoding: "utf8",
        env: clean,
      }).trim();
    };

    test("defaults to the app's data/", () => {
      expect(resolveInBash({})).toBe(`${posix(appDir)}/data`);
    });

    test("reads VIEW_PRS_DATA_DIR from a CRLF .env, unquoted, relative to the app", () => {
      writeEnv('VIEW_PRS_DATA_DIR=old\r\nVIEW_PRS_DATA_DIR="my data"\r\n');
      expect(resolveInBash({})).toBe(`${posix(appDir)}/my data`);
    });

    test("drops an inline comment, as data-dir.js does", () => {
      writeEnv("VIEW_PRS_DATA_DIR=../my-data   # moved\r\n");
      expect(resolveInBash({})).toBe(`${posix(appDir)}/../my-data`);
      writeEnv("VIEW_PRS_DATA_DIR='a # b' # comment\n");
      expect(resolveInBash({})).toBe(`${posix(appDir)}/a # b`);
    });

    test("takes DATA_DIR, then VIEW_PRS_DATA_DIR, before .env; keeps absolute folders", () => {
      writeEnv("VIEW_PRS_DATA_DIR=from-env-file\n");
      expect(resolveInBash({ DATA_DIR: "/abs/one", VIEW_PRS_DATA_DIR: "two" })).toBe("/abs/one");
      expect(resolveInBash({ VIEW_PRS_DATA_DIR: "two" })).toBe(`${posix(appDir)}/two`);
    });

    // The server passes its folder as a Windows path; a backslash in the
    // script's file patterns is an escape character.
    (process.platform === "win32" ? test : test.skip)("makes a Windows path bash's on Windows", () => {
      expect(resolveInBash({ DATA_DIR: "C:\\abs\\two" })).toBe("/c/abs/two");
      expect(resolveInBash({ VIEW_PRS_DATA_DIR: "C:/abs/two" })).toBe("/c/abs/two");
      expect(resolveInBash({ DATA_DIR: "..\\up" })).toBe(`${posix(appDir)}/../up`);
    });

    test("check-open-pr-updates.sh finds the backups in the data folder the server passes, as it passes it", () => {
      const dataDir = path.join(appDir, "data-here");
      fs.mkdirSync(path.join(dataDir, "backups"), { recursive: true });
      fs.writeFileSync(
        path.join(dataDir, "backups", "check-open-pr-updates.data.json.pr-data.20261109T000000Z-1-1.bak"),
        "{}",
        "utf8",
      );
      const env = { ...process.env, DATA_DIR: dataDir, VIEW_PRS_DATA_DIR: dataDir };
      ["PR_STATE_FILE", "USER_STATE_FILE", "STATE_BACKUP_DIR"].forEach((key) => delete env[key]);

      const stdout = execFileSync("bash", [path.join(__dirname, "..", "..", "script", "check-open-pr-updates.sh"), "--backup-list"], {
        encoding: "utf8",
        env,
      });

      expect(stdout).toContain("check-open-pr-updates.data.json.pr-data.20261109T000000Z-1-1.bak");
    });
  });
});
