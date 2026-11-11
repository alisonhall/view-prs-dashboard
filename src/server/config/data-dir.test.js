const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { findDataDirProblem, readDataDirFromEnvFile, readEnvFileValue, resolveDataDir } = require("./data-dir");

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

    // The server reads .env with Node's loader; the CLI and tools read it
    // here and in data-dir.sh: all three must find the same folder.
    test("reads values as Node's own .env loader does, and so does data-dir.sh", () => {
      const shFile = path.join(__dirname, "..", "..", "script", "data-dir.sh").replace(/\\/g, "/");
      const app = appDir.replace(/\\/g, "/");
      const envFile = path.join(appDir, ".env");
      const values = ["a#b", "My #1 data", '"q"z"', "'it''s'", '"new\\nline"', "`tick # x`", "  spaced   "];
      values.forEach((value) => {
        writeEnv(`VIEW_PRS_DATA_DIR=${value}\n`);
        const node = JSON.parse(
          execFileSync(
            process.execPath,
            ["-e", "process.loadEnvFile(process.argv[1]); process.stdout.write(JSON.stringify(process.env.VIEW_PRS_DATA_DIR))", envFile],
            { encoding: "utf8", env: { PATH: process.env.PATH } },
          ),
        );
        expect([value, readDataDirFromEnvFile(envFile)]).toEqual([value, node]);
        const env = { ...process.env };
        delete env.DATA_DIR;
        delete env.VIEW_PRS_DATA_DIR;
        const bash = execFileSync("bash", ["-c", '. "$1"; resolve_data_dir "$2"', "bash", shFile, app], { encoding: "utf8", env });
        expect([value, bash.replace(/\n$/, "")]).toEqual([value, `${app}/${node}`]);
      });
    });

    test('reads an "export VIEW_PRS_DATA_DIR=" line, as Node\'s loader does, and so does data-dir.sh', () => {
      writeEnv("export VIEW_PRS_DATA_DIR=exported\n");
      expect(readDataDirFromEnvFile(path.join(appDir, ".env"))).toBe("exported");
      const env = { ...process.env };
      delete env.DATA_DIR;
      delete env.VIEW_PRS_DATA_DIR;
      const sh = path.join(__dirname, "..", "..", "script", "data-dir.sh").replace(/\\/g, "/");
      const app = appDir.replace(/\\/g, "/");
      expect(execFileSync("bash", ["-c", '. "$1"; resolve_data_dir "$2"', "bash", sh, app], { encoding: "utf8", env }).trim()).toBe(
        `${app}/exported`,
      );
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

    test("takes ~ as the home folder", () => {
      expect(resolveDataDir({ viewPrsDir: appDir, env: { VIEW_PRS_DATA_DIR: "~/view-prs-data" } })).toBe(
        path.join(os.homedir(), "view-prs-data"),
      );
      expect(resolveDataDir({ viewPrsDir: appDir, env: { VIEW_PRS_DATA_DIR: "~" } })).toBe(os.homedir());
      expect(resolveDataDir({ viewPrsDir: appDir, env: { VIEW_PRS_DATA_DIR: "~other" } })).toBe(path.join(appDir, "~other"));
    });

    test("keeps an absolute folder as it is", () => {
      const elsewhere = path.join(os.tmpdir(), "elsewhere");
      expect(resolveDataDir({ viewPrsDir: appDir, env: { VIEW_PRS_DATA_DIR: elsewhere } })).toBe(elsewhere);
    });
  });

  describe("readEnvFileValue", () => {
    test("reads the named setting only", () => {
      writeEnv("VIEW_PRS_PORT_EXTRA=1\nVIEW_PRS_PORT = 9100 # mine\n");
      expect(readEnvFileValue(path.join(appDir, ".env"), "VIEW_PRS_PORT")).toBe("9100");
    });
  });

  describe("findDataDirProblem", () => {
    const withAppData = () => {
      fs.mkdirSync(path.join(appDir, "data"));
      fs.writeFileSync(path.join(appDir, "data", "check-open-pr-updates.data.json"), "{}", "utf8");
    };

    test("names a missing folder set elsewhere while the data is still in data/", () => {
      withAppData();
      const problem = findDataDirProblem({ viewPrsDir: appDir, dataDir: path.join(appDir, "..", "nowhere") });
      expect(problem).toMatch(/doesn't exist, and your data is still in/);
    });

    test("is fine for data/ itself, a folder that exists, or a first start with no data", () => {
      expect(findDataDirProblem({ viewPrsDir: appDir, dataDir: path.join(appDir, "nowhere") })).toBeNull();
      withAppData();
      expect(findDataDirProblem({ viewPrsDir: appDir, dataDir: path.join(appDir, "data") })).toBeNull();
      fs.mkdirSync(path.join(appDir, "fresh"));
      expect(findDataDirProblem({ viewPrsDir: appDir, dataDir: path.join(appDir, "fresh") })).toBeNull();
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

    test("takes ~ as the home folder", () => {
      const home = execFileSync("bash", ["-c", 'printf "%s" "$HOME"'], { encoding: "utf8" });
      expect(resolveInBash({ VIEW_PRS_DATA_DIR: "~/view-prs-data" })).toBe(`${home}/view-prs-data`);
    });

    test("data_dir_problem: a missing folder while data/ holds the data, as data-dir.js's", () => {
      const problemInBash = (dataDir) => {
        try {
          return execFileSync("bash", ["-c", '. "$1"; data_dir_problem "$2" "$3"', "bash", posix(shFile), posix(appDir), dataDir], {
            encoding: "utf8",
          }).trim();
        } catch (_error) {
          return null;
        }
      };
      expect(problemInBash(`${posix(appDir)}/nowhere`)).toBeNull();
      fs.mkdirSync(path.join(appDir, "data"));
      fs.writeFileSync(path.join(appDir, "data", "check-open-pr-updates.data.json"), "{}", "utf8");
      expect(problemInBash(`${posix(appDir)}/nowhere`)).toMatch(/doesn't exist, and your data is still in/);
      expect(problemInBash(`${posix(appDir)}/data`)).toBeNull();
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
      // With a space, as a folder in iCloud Drive or OneDrive has.
      const dataDir = path.join(appDir, "my data");
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
