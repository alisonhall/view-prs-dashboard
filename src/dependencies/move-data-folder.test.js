const fs = require("fs");
const os = require("os");
const path = require("path");
const { DATA_GITIGNORE, findRunningServer, findServerUsing, isUntrackedInAppRepo, moveDataFolder, withDataDirSetting } = require("./move-data-folder");

// npm run data:move (README "Data folder").
describe("move-data-folder", () => {
  let root;
  let appDir;
  let source;
  const now = new Date("2026-11-09T10:20:30.456Z");

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "view-prs-move-data-"));
    appDir = path.join(root, "app");
    source = path.join(appDir, "data");
    fs.mkdirSync(path.join(source, "pr-details"), { recursive: true });
    fs.writeFileSync(path.join(source, "check-open-pr-updates.user-state.json"), '{"notes":1}', "utf8");
    fs.writeFileSync(path.join(source, "pr-details", "1.json"), "{}", "utf8");
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const move = (destination, options = {}) => moveDataFolder({ viewPrsDir: appDir, destination, now, env: {}, ...options });

  test("copies everything, adds a .gitignore, sets VIEW_PRS_DATA_DIR in .env and keeps the old folder aside", () => {
    fs.writeFileSync(path.join(appDir, ".env"), "GITHUB_TOKEN=x\r\n", "utf8");
    const destination = path.join(root, "backed-up");

    const result = move(destination);

    expect(result.files.map((file) => file.path).sort()).toEqual(
      ["check-open-pr-updates.user-state.json", path.join("pr-details", "1.json")].sort(),
    );
    expect(fs.readFileSync(path.join(destination, "check-open-pr-updates.user-state.json"), "utf8")).toBe('{"notes":1}');
    expect(fs.existsSync(path.join(destination, "pr-details", "1.json"))).toBe(true);
    expect(fs.readFileSync(path.join(destination, ".gitignore"), "utf8")).toBe(DATA_GITIGNORE);
    // In the file's own CRLF line endings.
    expect(fs.readFileSync(path.join(appDir, ".env"), "utf8")).toBe(
      `GITHUB_TOKEN=x\r\n\r\n# The data folder (README "Data folder"; set by npm run data:move).\r\nVIEW_PRS_DATA_DIR=${destination.replace(/\\/g, "/")}\r\n`,
    );
    expect(result.envOverride).toBeNull();
    expect(fs.existsSync(source)).toBe(false);
    expect(result.movedAside).toBe(`${source}.moved-20261109T102030Z`);
    expect(fs.existsSync(path.join(result.movedAside, "pr-details", "1.json"))).toBe(true);
  });

  // Windows has neither permissions like these nor symlinks without admin.
  (process.platform === "win32" ? test.skip : test)("keeps .env's permissions, and writes through a symlinked one", () => {
    const real = path.join(root, "secrets.env");
    fs.writeFileSync(real, "GITHUB_TOKEN=x\n", { mode: 0o600 });
    fs.chmodSync(real, 0o600);
    fs.symlinkSync(real, path.join(appDir, ".env"));

    move(path.join(root, "backed-up"));

    expect(fs.lstatSync(path.join(appDir, ".env")).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(real, "utf8")).toContain("VIEW_PRS_DATA_DIR=");
    expect(fs.statSync(real).mode & 0o777).toBe(0o600);
  });

  test("a dry run changes nothing", () => {
    const destination = path.join(root, "backed-up");
    const result = move(destination, { dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.files).toHaveLength(2);
    expect(fs.existsSync(destination)).toBe(false);
    expect(fs.existsSync(path.join(appDir, ".env"))).toBe(false);
    expect(fs.existsSync(source)).toBe(true);
  });

  test("puts the data folder back, and leaves .env, when a step after the copy fails", () => {
    // A folder where .env goes: writing it fails.
    fs.mkdirSync(path.join(appDir, ".env"));
    const destination = path.join(root, "backed-up");

    expect(() => move(destination)).toThrow(/back at .*and \.env unchanged/s);

    expect(fs.readFileSync(path.join(source, "check-open-pr-updates.user-state.json"), "utf8")).toBe('{"notes":1}');
    expect(fs.readdirSync(appDir)).toEqual(expect.arrayContaining(["data", ".env"]));
    expect(fs.readdirSync(appDir).some((name) => name.startsWith("data.moved-"))).toBe(false);
  });

  test("says when the environment's VIEW_PRS_DATA_DIR would win over .env", () => {
    const result = move(path.join(root, "next"), { dryRun: true, env: { VIEW_PRS_DATA_DIR: source } });
    expect(result.envOverride).toBe(source);
    expect(result.source).toBe(source);
  });

  test("keeps a .gitignore the folder already brings", () => {
    fs.writeFileSync(path.join(source, ".gitignore"), "mine\n", "utf8");
    const destination = path.join(root, "backed-up");
    move(destination);
    expect(fs.readFileSync(path.join(destination, ".gitignore"), "utf8")).toBe("mine\n");
  });

  test("refuses without a destination, a missing source, nested folders, a non-empty destination or a lock", () => {
    expect(() => move("")).toThrow(/Name the new folder/);
    expect(() => move(path.join(source, "inside"))).toThrow(/inside one another/);
    expect(() => moveDataFolder({ viewPrsDir: path.join(source, "x"), destination: root, now, env: {} })).toThrow(
      /doesn't exist/,
    );

    const busy = path.join(root, "busy");
    fs.mkdirSync(busy);
    fs.writeFileSync(path.join(busy, "file"), "", "utf8");
    expect(() => move(busy)).toThrow(/isn't empty/);
    expect(() => move(root)).toThrow(/inside one another/);

    fs.mkdirSync(path.join(source, "check-open-pr-updates.lock"));
    expect(() => move(path.join(root, "new"))).toThrow(/Something is writing/);
    expect(fs.existsSync(path.join(root, "new"))).toBe(false);
  });

  test("moves the folder .env already points at", () => {
    const current = path.join(root, "current");
    fs.mkdirSync(current);
    fs.writeFileSync(path.join(current, "actors.json"), "{}", "utf8");
    fs.writeFileSync(path.join(appDir, ".env"), "VIEW_PRS_DATA_DIR=../current\n", "utf8");

    const result = move(path.join(root, "next"));

    expect(result.source).toBe(current);
    expect(fs.existsSync(path.join(root, "next", "actors.json"))).toBe(true);
    expect(fs.existsSync(source)).toBe(true);
  });

  // Nothing stops the move on macOS while the server writes to the folder.
  describe("findRunningServer", () => {
    const answering = (body, ok = true) => jest.fn(async () => ({ ok, json: async () => body }));

    test("finds the dashboard answering on its port, from .env when not in the environment", async () => {
      fs.writeFileSync(path.join(appDir, ".env"), "VIEW_PRS_PORT=9100\n", "utf8");
      const fetchImpl = answering({ app: "view-prs", dataDir: "/d" });

      await expect(findRunningServer({ viewPrsDir: appDir, env: {}, fetchImpl })).resolves.toEqual({ port: "9100", dataDir: "/d" });
      expect(fetchImpl.mock.calls[0][0]).toBe("http://127.0.0.1:9100/health");
    });

    test("takes the port as the server does: VIEW_PRS_PORT, then PORT, from the environment or .env", async () => {
      const ask = async (env, envText) => {
        if (envText !== undefined) fs.writeFileSync(path.join(appDir, ".env"), envText, "utf8");
        const fetchImpl = answering({ app: "view-prs" });
        await findRunningServer({ viewPrsDir: appDir, env, fetchImpl });
        return fetchImpl.mock.calls[0][0];
      };
      expect(await ask({}, "PORT=9300\n")).toBe("http://127.0.0.1:9300/health");
      expect(await ask({ PORT: "9400" }, "VIEW_PRS_PORT=9100\n")).toBe("http://127.0.0.1:9100/health");
      expect(await ask({ VIEW_PRS_PORT: "9500" })).toBe("http://127.0.0.1:9500/health");
    });

    test("asks where the server listens: VIEW_PRS_HOST, with every-address hosts asked on 127.0.0.1", async () => {
      const ask = async (env) => {
        const fetchImpl = answering({ app: "view-prs" });
        await findRunningServer({ viewPrsDir: appDir, env, fetchImpl });
        return fetchImpl.mock.calls[0][0];
      };
      expect(await ask({ VIEW_PRS_HOST: "192.168.1.5" })).toBe("http://192.168.1.5:9000/health");
      expect(await ask({ VIEW_PRS_HOST: "0.0.0.0" })).toBe("http://127.0.0.1:9000/health");
      expect(await ask({ VIEW_PRS_HOST: "::1" })).toBe("http://[::1]:9000/health");
    });

    // Another copy of the app (a second checkout) with its own folder can
    // go on running.
    test("findServerUsing: only a server using the folder being moved", async () => {
      const using = (dataDir) =>
        findServerUsing({ viewPrsDir: appDir, env: {}, folder: source, fetchImpl: answering({ app: "view-prs", dataDir }) });
      await expect(using(source)).resolves.toEqual({ port: "9000", dataDir: source });
      await expect(using(`${source}${path.sep}`)).resolves.not.toBeNull();
      await expect(using(path.join(root, "other-checkout", "data"))).resolves.toBeNull();
      await expect(using(undefined)).resolves.not.toBeNull();
    });

    test("is null when nothing answers, or something else does", async () => {
      const refused = jest.fn(async () => {
        throw new Error("ECONNREFUSED");
      });
      await expect(findRunningServer({ viewPrsDir: appDir, env: {}, fetchImpl: refused })).resolves.toBeNull();
      expect(refused.mock.calls[0][0]).toBe("http://127.0.0.1:9000/health");
      await expect(
        findRunningServer({ viewPrsDir: appDir, env: { VIEW_PRS_PORT: "9200" }, fetchImpl: answering({ other: true }) }),
      ).resolves.toBeNull();
      await expect(findRunningServer({ viewPrsDir: appDir, env: {}, fetchImpl: answering(null, false) })).resolves.toBeNull();
    });
  });

  test("isUntrackedInAppRepo: only when git says a folder inside the app isn't ignored", () => {
    const inside = path.join(appDir, "my-data");
    // Not a git checkout: says nothing.
    expect(isUntrackedInAppRepo(appDir, inside)).toBe(false);
    require("child_process").execFileSync("git", ["init", "-q"], { cwd: appDir });
    expect(isUntrackedInAppRepo(appDir, inside)).toBe(true);
    expect(isUntrackedInAppRepo(appDir, path.join(root, "outside"))).toBe(false);
    fs.writeFileSync(path.join(appDir, ".gitignore"), "my-data/\n", "utf8");
    expect(isUntrackedInAppRepo(appDir, inside)).toBe(false);
  });

  describe("withDataDirSetting", () => {
    test("replaces the last line, drops earlier ones and keeps the rest", () => {
      const text = "A=1\nVIEW_PRS_DATA_DIR=old\nB=2\nVIEW_PRS_DATA_DIR=older\nC=3\n";
      expect(withDataDirSetting(text, "D:\\new")).toBe("A=1\nB=2\nVIEW_PRS_DATA_DIR=D:/new\nC=3\n");
    });

    // Node's .env loader cuts an unquoted value at a #.
    test("quotes a folder Node's .env loader would cut or change, and it reads back as written", () => {
      const roundTrip = (folder) => {
        const envFile = path.join(root, ".env");
        fs.writeFileSync(envFile, withDataDirSetting("", folder), "utf8");
        const loaded = require("child_process").execFileSync(
          process.execPath,
          ["-e", "process.loadEnvFile(process.argv[1]); process.stdout.write(process.env.VIEW_PRS_DATA_DIR)", envFile],
          { encoding: "utf8", env: { PATH: process.env.PATH } },
        );
        return [loaded, require("../server/config/data-dir.js").readDataDirFromEnvFile(envFile)];
      };
      expect(withDataDirSetting("", "/d/My #1 data")).toContain("VIEW_PRS_DATA_DIR='/d/My #1 data'\n");
      expect(roundTrip("/d/My #1 data")).toEqual(["/d/My #1 data", "/d/My #1 data"]);
      expect(roundTrip("/d/it's #2")).toEqual(["/d/it's #2", "/d/it's #2"]);
      expect(roundTrip("/d/plain data")).toEqual(["/d/plain data", "/d/plain data"]);
      expect(withDataDirSetting("", "/d/plain data")).toContain("VIEW_PRS_DATA_DIR=/d/plain data\n");
    });

    test('replaces an "export VIEW_PRS_DATA_DIR=" line too', () => {
      expect(withDataDirSetting("export VIEW_PRS_DATA_DIR=old\n", "/d")).toBe("VIEW_PRS_DATA_DIR=/d\n");
    });

    test("writes a new file with only the setting", () => {
      expect(withDataDirSetting("", "/d")).toBe('# The data folder (README "Data folder"; set by npm run data:move).\nVIEW_PRS_DATA_DIR=/d\n');
    });
  });
});
