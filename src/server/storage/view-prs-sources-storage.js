const path = require("path");
const { writeFileReplacingSync } = require("../helpers/file-io-helpers");

// Which PRs are in view, and why (the sources file, VIEW_PRS_SOURCES_FILE):
// - subscriptions: repos followed as a whole. mode "recent" takes the
//   repo's recent PRs, as the dashboard always has; mode "numbers" only
//   the PR numbers listed.
// - trackedPrs: PRs added one by one (by URL), from any repo.
// Rows are still keyed by repo and number in the data file; this says
// which repos and PRs the background updates fetch. Only the server writes
// it, whole (writeFileReplacingSync). A file that doesn't exist yet is
// seeded once from the repos the dashboard tracked before it existed
// (inferTrackedRepos), so nothing changes when it first appears.

const SOURCES_VERSION = 1;
const SUBSCRIPTION_MODES = new Set(["recent", "numbers"]);
const HOSTNAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

const toTrimmed = (value) => (value === null || value === undefined ? "" : String(value).trim());
const isPlainObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

const createViewPrsSourcesStorage = ({ fs, sourcesFile, isRepoSlug, console: logger = console }) => {
  // A GitHub Enterprise host ("github.example.com"); github.com is the
  // default, so it's left out.
  const normalizeHost = (value) => {
    const host = toTrimmed(value).toLowerCase();
    return host && host !== "github.com" && HOSTNAME_PATTERN.test(host) ? host : "";
  };

  const normalizeNumbers = (list) =>
    Array.from(new Set((Array.isArray(list) ? list : []).map(toTrimmed).filter((value) => /^\d+$/.test(value))));

  const normalizeSources = (raw) => {
    const source = isPlainObject(raw) ? raw : {};
    const subscriptions = [];
    const seenRepos = new Set();
    (Array.isArray(source.subscriptions) ? source.subscriptions : []).forEach((entry) => {
      const repo = toTrimmed(entry?.repo);
      if (!isRepoSlug(repo) || seenRepos.has(repo)) return;
      seenRepos.add(repo);
      const mode = SUBSCRIPTION_MODES.has(entry?.mode) ? entry.mode : "recent";
      const host = normalizeHost(entry?.host);
      subscriptions.push({
        repo,
        mode,
        ...(mode === "numbers" ? { numbers: normalizeNumbers(entry?.numbers) } : {}),
        ...(host ? { host } : {}),
      });
    });

    const trackedPrs = [];
    const seenPrs = new Set();
    (Array.isArray(source.trackedPrs) ? source.trackedPrs : []).forEach((entry) => {
      const repo = toTrimmed(entry?.repo);
      const number = toTrimmed(entry?.number);
      const key = `${repo}#${number}`;
      if (!isRepoSlug(repo) || !/^\d+$/.test(number) || seenPrs.has(key)) return;
      seenPrs.add(key);
      const host = normalizeHost(entry?.host);
      trackedPrs.push({
        repo,
        number,
        ...(toTrimmed(entry?.url) ? { url: toTrimmed(entry.url) } : {}),
        ...(host ? { host } : {}),
        ...(toTrimmed(entry?.addedAt) ? { addedAt: toTrimmed(entry.addedAt) } : {}),
      });
    });

    return { version: SOURCES_VERSION, subscriptions, trackedPrs };
  };

  // The stored sources, or null when there's no file - or an unreadable
  // one, which is set aside (not deleted) so it can be seeded afresh.
  const readSources = () => {
    if (!fs.existsSync(sourcesFile)) return null;
    try {
      return normalizeSources(JSON.parse(fs.readFileSync(sourcesFile, "utf8")));
    } catch (error) {
      const asidePath = `${sourcesFile}.unreadable-${Date.now()}`;
      try {
        fs.renameSync(sourcesFile, asidePath);
        logger.warn?.(`[view-prs] sources file unreadable (${error.message}); kept as ${asidePath}`);
      } catch (_renameError) {
        logger.warn?.(`[view-prs] sources file unreadable (${error.message})`);
      }
      return null;
    }
  };

  const writeSources = (sources) => {
    const normalized = normalizeSources(sources);
    fs.mkdirSync(path.dirname(sourcesFile), { recursive: true });
    writeFileReplacingSync(fs, sourcesFile, `${JSON.stringify(normalized, null, 2)}\n`);
    return normalized;
  };

  const seededSources = (repos) =>
    normalizeSources({ subscriptions: repos.map((repo) => ({ repo, mode: "recent" })) });

  // The sources, seeded and written the first time: a "recent"
  // subscription for each repo seedRepos() names. Null - nothing written -
  // while there's no file and the seed names no repo, or can't tell
  // (seedRepos returns null: the data couldn't be read). Written then, it
  // would stand for good: every repo dropped by one failed read.
  const loadSources = ({ seedRepos = () => null } = {}) => {
    const stored = readSources();
    if (stored) return stored;
    const seed = seedRepos();
    if (!Array.isArray(seed) || seed.length === 0) return null;
    const seeded = seededSources(seed);
    try {
      return writeSources(seeded);
    } catch (error) {
      logger.warn?.(`[view-prs] unable to write sources file: ${error.message}`);
      return seeded;
    }
  };

  const getRecentSubscriptionRepos = (sources) =>
    (sources?.subscriptions || []).filter((entry) => entry.mode === "recent").map((entry) => entry.repo);

  // Subscribes a repo to its recent PRs, unless it's subscribed already
  // (in either mode, which is kept). Returns whether it was added. Without
  // a file, the seed's repos come too - unless the seed can't tell (null),
  // when nothing is written: a file of this repo alone would drop the
  // rest. Its rows seed it later anyway.
  const subscribeRepo = (repo, { seedRepos = () => null } = {}) => {
    const safeRepo = toTrimmed(repo);
    if (!isRepoSlug(safeRepo)) return false;
    let sources = readSources();
    if (!sources) {
      const seed = seedRepos();
      if (!Array.isArray(seed)) return false;
      sources = seededSources(seed);
    }
    if (sources.subscriptions.some((entry) => entry.repo === safeRepo)) return false;
    writeSources({ ...sources, subscriptions: [...sources.subscriptions, { repo: safeRepo, mode: "recent" }] });
    return true;
  };

  return {
    sourcesFile,
    normalizeSources,
    readSources,
    writeSources,
    loadSources,
    getRecentSubscriptionRepos,
    subscribeRepo,
  };
};

module.exports = { createViewPrsSourcesStorage, SOURCES_VERSION };
