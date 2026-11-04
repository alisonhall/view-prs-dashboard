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
});
