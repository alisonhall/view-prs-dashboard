const fs = require("fs");
const os = require("os");
const path = require("path");
const { createViewPrsSourcesStorage } = require("./view-prs-sources-storage");

const isRepoSlug = (value) => /^[^/\s]+\/[^/\s]+$/.test(String(value || "").trim());

describe("view-prs sources storage", () => {
  let tempDir;
  let sourcesFile;
  let storage;
  let warnings;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "view-prs-sources-"));
    sourcesFile = path.join(tempDir, "check-open-pr-updates.sources.json");
    warnings = [];
    storage = createViewPrsSourcesStorage({
      fs,
      sourcesFile,
      isRepoSlug,
      console: { warn: (message) => warnings.push(message) },
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("normalizes subscriptions and tracked PRs: valid entries once each, a mode, numbers only for numbers mode, Enterprise hosts only", () => {
    const normalized = storage.normalizeSources({
      subscriptions: [
        { repo: "acme/api" },
        { repo: "acme/api", mode: "numbers", numbers: ["1"] },
        { repo: "acme/web", mode: "numbers", numbers: ["4", " 4", "x", 12], host: "GitHub.Example.com" },
        { repo: "not a repo" },
        { repo: "acme/docs", mode: "everything", numbers: ["3"], host: "github.com" },
      ],
      trackedPrs: [
        { repo: "other/lib", number: "9", url: "https://github.com/other/lib/pull/9", addedAt: "2026-11-03T10:00:00Z" },
        { repo: "other/lib", number: "9" },
        { repo: "other/lib", number: "nine" },
        { repo: "corp/tool", number: 5, host: "not_a_host" },
      ],
    });

    expect(normalized).toEqual({
      version: 1,
      subscriptions: [
        { repo: "acme/api", mode: "recent" },
        { repo: "acme/web", mode: "numbers", numbers: ["4", "12"], host: "github.example.com" },
        { repo: "acme/docs", mode: "recent" },
      ],
      trackedPrs: [
        { repo: "other/lib", number: "9", url: "https://github.com/other/lib/pull/9", addedAt: "2026-11-03T10:00:00Z" },
        { repo: "corp/tool", number: "5" },
      ],
    });
  });

  test("the first load seeds recent subscriptions and writes them; later loads read the file, not the seed", () => {
    const seedRepos = jest.fn(() => ["acme/api", "acme/web"]);

    const first = storage.loadSources({ seedRepos });
    const second = storage.loadSources({ seedRepos: () => ["something/else"] });

    expect(first.subscriptions).toEqual([
      { repo: "acme/api", mode: "recent" },
      { repo: "acme/web", mode: "recent" },
    ]);
    expect(second).toEqual(first);
    expect(seedRepos).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fs.readFileSync(sourcesFile, "utf8"))).toEqual(first);
  });

  // Written, a seed stands for good - so not one from data that couldn't be
  // read (null), nor one naming no repo yet.
  test("without a file, a seed that can't tell or names no repo writes nothing and loads as null", () => {
    expect(storage.loadSources({ seedRepos: () => null })).toBeNull();
    expect(storage.loadSources({ seedRepos: () => [] })).toBeNull();
    expect(fs.existsSync(sourcesFile)).toBe(false);
  });

  test("subscribing without a file takes in the seed's repos, or writes nothing when the seed can't tell", () => {
    expect(storage.subscribeRepo("acme/api", { seedRepos: () => null })).toBe(false);
    expect(fs.existsSync(sourcesFile)).toBe(false);

    expect(storage.subscribeRepo("acme/api", { seedRepos: () => ["acme/web"] })).toBe(true);
    expect(storage.readSources().subscriptions).toEqual([
      { repo: "acme/web", mode: "recent" },
      { repo: "acme/api", mode: "recent" },
    ]);
  });

  test("subscribing without a file or any seeded repo writes the one subscription", () => {
    expect(storage.subscribeRepo("acme/api", { seedRepos: () => [] })).toBe(true);
    expect(storage.readSources().subscriptions).toEqual([{ repo: "acme/api", mode: "recent" }]);
  });

  test("an unreadable file is kept aside, not overwritten, and the sources are seeded afresh", () => {
    fs.writeFileSync(sourcesFile, "{ not json", "utf8");

    const loaded = storage.loadSources({ seedRepos: () => ["acme/api"] });

    expect(loaded.subscriptions).toEqual([{ repo: "acme/api", mode: "recent" }]);
    const aside = fs.readdirSync(tempDir).filter((name) => name.includes(".unreadable-"));
    expect(aside).toHaveLength(1);
    expect(fs.readFileSync(path.join(tempDir, aside[0]), "utf8")).toBe("{ not json");
    expect(warnings.join("\n")).toMatch(/sources file unreadable/);
  });

  test("subscribing adds a recent subscription once, and leaves a repo already subscribed in numbers mode as it is", () => {
    storage.writeSources({ subscriptions: [{ repo: "acme/web", mode: "numbers", numbers: ["4"] }] });

    expect(storage.subscribeRepo("acme/api")).toBe(true);
    expect(storage.subscribeRepo("acme/api")).toBe(false);
    expect(storage.subscribeRepo("acme/web")).toBe(false);
    expect(storage.subscribeRepo("not a repo")).toBe(false);

    expect(storage.readSources().subscriptions).toEqual([
      { repo: "acme/web", mode: "numbers", numbers: ["4"] },
      { repo: "acme/api", mode: "recent" },
    ]);
    expect(storage.getRecentSubscriptionRepos(storage.readSources())).toEqual(["acme/api"]);
  });

  // Seeded again, it would subscribe every repo with a row: those
  // unsubscribed, and those of PRs added one by one.
  test("once seeded, a file gone later starts empty, and says so, rather than being seeded again", () => {
    storage.loadSources({ seedRepos: () => ["acme/api"] });
    fs.rmSync(sourcesFile);

    const loaded = storage.loadSources({ seedRepos: () => ["acme/api", "other/lib"] });

    expect(loaded).toEqual({ version: 1, subscriptions: [], trackedPrs: [] });
    expect(storage.readSources()).toEqual(loaded);
    expect(warnings.join("\n")).toMatch(/sources file missing/);
    expect(storage.subscribeRepo("acme/web", { seedRepos: () => ["acme/api"] })).toBe(true);
    expect(storage.readSources().subscriptions).toEqual([{ repo: "acme/web", mode: "recent" }]);
  });

  test("a file from before the seeded marker counts as seeded once read", () => {
    fs.writeFileSync(sourcesFile, JSON.stringify({ subscriptions: [{ repo: "acme/api" }] }), "utf8");
    storage.readSources();
    fs.rmSync(sourcesFile);

    expect(storage.loadSources({ seedRepos: () => ["acme/api"] }).subscriptions).toEqual([]);
  });

  test("adds a tracked PR once, with when it was added, and removes it", () => {
    storage.writeSources({ subscriptions: [{ repo: "acme/api", mode: "recent" }] });
    const now = () => new Date("2026-11-04T09:00:00Z");

    const first = storage.addTrackedPr(
      { repo: "corp/tool", number: "5", url: "https://github.example.com/corp/tool/pull/5", host: "github.example.com" },
      { now },
    );
    const again = storage.addTrackedPr({ repo: "corp/tool", number: "5" }, { now });

    const entry = {
      repo: "corp/tool",
      number: "5",
      url: "https://github.example.com/corp/tool/pull/5",
      host: "github.example.com",
      addedAt: "2026-11-04T09:00:00.000Z",
    };
    expect(first).toEqual({ added: true, entry });
    expect(again).toEqual({ added: false, entry });
    expect(storage.readSources().trackedPrs).toEqual([entry]);
    expect(() => storage.addTrackedPr({ repo: "corp/tool", number: "x" })).toThrow(/Not a PR/);

    expect(storage.removeTrackedPr("corp/tool", "5")).toBe(true);
    expect(storage.removeTrackedPr("corp/tool", "5")).toBe(false);
    expect(storage.readSources().trackedPrs).toEqual([]);
  });

  test("adding a tracked PR without a file seeds it first, and writes nothing when the seed can't tell", () => {
    expect(() => storage.addTrackedPr({ repo: "corp/tool", number: "5" }, { seedRepos: () => null })).toThrow(/couldn't be read/);
    expect(fs.existsSync(sourcesFile)).toBe(false);

    storage.addTrackedPr({ repo: "corp/tool", number: "5" }, { seedRepos: () => ["acme/api"] });

    expect(storage.readSources().subscriptions).toEqual([{ repo: "acme/api", mode: "recent" }]);
    expect(storage.readSources().trackedPrs.map((entry) => `${entry.repo}#${entry.number}`)).toEqual(["corp/tool#5"]);
  });

  test("lists each repo's PRs fetched on their own, and a repo's Enterprise host", () => {
    const sources = storage.normalizeSources({
      subscriptions: [
        { repo: "acme/api", mode: "recent" },
        { repo: "acme/web", mode: "numbers", numbers: ["4", "7"], host: "github.example.com" },
      ],
      trackedPrs: [
        { repo: "acme/web", number: "7" },
        { repo: "acme/web", number: "9" },
        { repo: "corp/tool", number: "5", host: "ghe.corp.example" },
      ],
    });

    expect(storage.getExplicitPrNumbersByRepo(sources)).toEqual({
      "acme/web": ["4", "7", "9"],
      "corp/tool": ["5"],
    });
    expect(storage.getRepoHost(sources, "acme/web")).toBe("github.example.com");
    expect(storage.getRepoHost(sources, "corp/tool")).toBe("ghe.corp.example");
    expect(storage.getRepoHost(sources, "acme/api")).toBe("");
  });
});
