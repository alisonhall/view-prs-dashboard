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
// (inferTrackedRepos), so nothing changes when it first appears - once:
// a marker beside it (<file>.seeded) says it has been, so one deleted or
// set aside later starts empty rather than seeded again, which would
// subscribe every repo with a row (those unsubscribed, and those of PRs
// added one by one, included).

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

  const seededMarkerFile = `${sourcesFile}.seeded`;
  const wasSeeded = () => fs.existsSync(seededMarkerFile);
  const markSeeded = () => {
    if (wasSeeded()) return;
    try {
      fs.writeFileSync(seededMarkerFile, `${new Date().toISOString()}\n`, "utf8");
    } catch (error) {
      logger.warn?.(`[view-prs] unable to write ${seededMarkerFile}: ${error.message}`);
    }
  };

  // The stored sources, or null when there's no file - or an unreadable
  // one, which is set aside (not deleted) so it can be seeded afresh.
  const readSources = () => {
    if (!fs.existsSync(sourcesFile)) return null;
    try {
      const stored = normalizeSources(JSON.parse(fs.readFileSync(sourcesFile, "utf8")));
      // A file from before the marker counts as seeded too.
      markSeeded();
      return stored;
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
    markSeeded();
    return normalized;
  };

  const seededSources = (repos) =>
    normalizeSources({ subscriptions: repos.map((repo) => ({ repo, mode: "recent" })) });

  // The sources to start from without a file: none once the file has been
  // seeded (the marker), or else the seed's - null when the seed can't tell
  // (seedRepos returns null: the data couldn't be read).
  const startingSources = (seedRepos) => {
    if (wasSeeded()) return normalizeSources({});
    const seed = seedRepos();
    return Array.isArray(seed) ? seededSources(seed) : null;
  };

  // The sources, seeded and written the first time: a "recent"
  // subscription for each repo seedRepos() names. Null - nothing written -
  // while there's no file and the seed names no repo, or can't tell. Written
  // then, it would stand for good: every repo dropped by one failed read.
  // A file gone after it was seeded starts empty, and says so.
  const loadSources = ({ seedRepos = () => null } = {}) => {
    const stored = readSources();
    if (stored) return stored;
    const seeded = wasSeeded();
    const starting = startingSources(seedRepos);
    if (!starting || (!seeded && starting.subscriptions.length === 0)) return null;
    if (seeded) {
      logger.warn?.(`[view-prs] sources file missing (${sourcesFile}); starting with no subscriptions or added PRs`);
    }
    try {
      return writeSources(starting);
    } catch (error) {
      logger.warn?.(`[view-prs] unable to write sources file: ${error.message}`);
      return starting;
    }
  };

  // The stored sources, or those to start from; null when they can't be
  // told (see startingSources), and a change then is better not written: a
  // file of it alone would drop the seed's repos.
  const readOrStartSources = (seedRepos) => readSources() || startingSources(seedRepos);

  const getRecentSubscriptionRepos = (sources) =>
    (sources?.subscriptions || []).filter((entry) => entry.mode === "recent").map((entry) => entry.repo);

  // Each repo's PRs fetched on their own rather than with the rest of the
  // repo: those of a "numbers" subscription and those added one by one.
  const getExplicitPrNumbersByRepo = (sources) => {
    const byRepo = {};
    const add = (repo, number) => {
      byRepo[repo] = byRepo[repo] || [];
      if (!byRepo[repo].includes(number)) byRepo[repo].push(number);
    };
    (sources?.subscriptions || [])
      .filter((entry) => entry.mode === "numbers")
      .forEach((entry) => (entry.numbers || []).forEach((number) => add(entry.repo, number)));
    (sources?.trackedPrs || []).forEach((entry) => add(entry.repo, entry.number));
    return byRepo;
  };

  // The GitHub Enterprise host a repo is on ("" for github.com): its
  // subscription's, or else a PR added from it.
  const getRepoHost = (sources, repo) =>
    [...(sources?.subscriptions || []), ...(sources?.trackedPrs || [])].find(
      (entry) => entry.repo === repo && entry.host,
    )?.host || "";

  // Subscribes a repo to its recent PRs, unless it's subscribed already
  // (in either mode, which is kept). Returns whether it was added. Without
  // a file, the seed's repos come too - unless the seed can't tell, when
  // nothing is written. Its rows seed it later anyway.
  const subscribeRepo = (repo, { seedRepos = () => null } = {}) => {
    const safeRepo = toTrimmed(repo);
    if (!isRepoSlug(safeRepo)) return false;
    const sources = readOrStartSources(seedRepos);
    if (!sources) return false;
    if (sources.subscriptions.some((entry) => entry.repo === safeRepo)) return false;
    writeSources({ ...sources, subscriptions: [...sources.subscriptions, { repo: safeRepo, mode: "recent" }] });
    return true;
  };

  // Tracks a PR added on its own (by URL). { added, entry }: added false
  // when it was tracked already (entry is the stored one). Throws when the
  // sources can't be told (as subscribeRepo writes nothing then) or the PR
  // isn't one.
  const addTrackedPr = ({ repo, number, url, host }, { seedRepos = () => null, now = () => new Date() } = {}) => {
    const safeRepo = toTrimmed(repo);
    const safeNumber = toTrimmed(number);
    if (!isRepoSlug(safeRepo) || !/^\d+$/.test(safeNumber)) {
      throw new Error(`Not a PR: ${safeRepo}#${safeNumber}`);
    }
    const sources = readOrStartSources(seedRepos);
    if (!sources) {
      throw new Error("The stored PR data couldn't be read, so the sources file wasn't written; try again once it can be");
    }
    const existing = sources.trackedPrs.find((entry) => entry.repo === safeRepo && entry.number === safeNumber);
    if (existing) return { added: false, entry: existing };
    const written = writeSources({
      ...sources,
      trackedPrs: [...sources.trackedPrs, { repo: safeRepo, number: safeNumber, url, host, addedAt: now().toISOString() }],
    });
    return {
      added: true,
      entry: written.trackedPrs.find((entry) => entry.repo === safeRepo && entry.number === safeNumber),
    };
  };

  // Stops tracking a PR added on its own. Returns whether it was tracked.
  const removeTrackedPr = (repo, number) => {
    const sources = readSources();
    if (!sources) return false;
    const safeRepo = toTrimmed(repo);
    const safeNumber = toTrimmed(number);
    const trackedPrs = sources.trackedPrs.filter((entry) => !(entry.repo === safeRepo && entry.number === safeNumber));
    if (trackedPrs.length === sources.trackedPrs.length) return false;
    writeSources({ ...sources, trackedPrs });
    return true;
  };

  return {
    sourcesFile,
    normalizeSources,
    normalizeHost,
    readSources,
    writeSources,
    loadSources,
    getRecentSubscriptionRepos,
    getExplicitPrNumbersByRepo,
    getRepoHost,
    subscribeRepo,
    addTrackedPr,
    removeTrackedPr,
  };
};

module.exports = { createViewPrsSourcesStorage, SOURCES_VERSION };
