const fs = require("fs");
const os = require("os");
const path = require("path");
const { DATA_GITIGNORE, moveDataFolder, withDataDirSetting } = require("./move-data-folder");

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

  describe("withDataDirSetting", () => {
    test("replaces the last line, drops earlier ones and keeps the rest", () => {
      const text = "A=1\nVIEW_PRS_DATA_DIR=old\nB=2\nVIEW_PRS_DATA_DIR=older\nC=3\n";
      expect(withDataDirSetting(text, "D:\\new")).toBe("A=1\nB=2\nVIEW_PRS_DATA_DIR=D:/new\nC=3\n");
    });

    test("writes a new file with only the setting", () => {
      expect(withDataDirSetting("", "/d")).toBe('# The data folder (README "Data folder"; set by npm run data:move).\nVIEW_PRS_DATA_DIR=/d\n');
    });
  });
});
