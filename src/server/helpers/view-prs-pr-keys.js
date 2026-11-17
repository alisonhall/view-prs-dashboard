// Stored PRs are keyed by repo and number - "owner/repo#123" - in the data
// file's byPrNumber and the user state's notesByPrNumber: two repos can each
// have a PR #123. Before 2026-11-02 they were keyed by the bare number, so
// such PRs replaced each other's rows and shared notes. The script migrates
// the data file (check-open-pr-updates.sh, ensure_pr_state_store); these
// read either, and migrate notes.

const LEGACY_KEY_PATTERN = /^\d+$/;

const asTrimmed = (value) => (value === null || value === undefined ? "" : String(value).trim());

const buildPrEntryKey = (repo, prNumber) => `${asTrimmed(repo)}#${asTrimmed(prNumber)}`;

const isLegacyPrEntryKey = (key) => LEGACY_KEY_PATTERN.test(asTrimmed(key));

// The PR number from a key, either kind.
const prNumberFromKey = (key) => asTrimmed(key).split("#").pop();

// The rows with every bare-number key moved to its row's repo key - unless
// that key already has a row (the newer one). A row without a repo keeps
// its number.
const normalizePrEntryKeys = (byPrNumber = {}) => {
  const entries = Object.entries(byPrNumber || {});
  const keyed = new Set(entries.filter(([key]) => !isLegacyPrEntryKey(key)).map(([key]) => key));
  const result = {};
  entries.forEach(([key, entry]) => {
    const repo = asTrimmed(entry?.repo);
    if (isLegacyPrEntryKey(key) && repo) {
      const prKey = buildPrEntryKey(repo, key);
      if (!keyed.has(prKey)) result[prKey] = entry;
      return;
    }
    result[key] = entry;
  });
  return result;
};

// A stored row by repo and number: its repo key, else its bare number when
// that row is the repo's (or has none).
const findPrEntry = (byPrNumber, repo, prNumber) => {
  const rows = byPrNumber || {};
  const byKey = rows[buildPrEntryKey(repo, prNumber)];
  if (byKey) return byKey;
  const legacy = rows[asTrimmed(prNumber)];
  if (legacy && (!asTrimmed(legacy.repo) || asTrimmed(legacy.repo) === asTrimmed(repo))) return legacy;
  return undefined;
};

// The key a row is (or would be) stored under.
const findPrEntryKey = (byPrNumber, repo, prNumber) => {
  const rows = byPrNumber || {};
  const prKey = buildPrEntryKey(repo, prNumber);
  if (rows[prKey]) return prKey;
  const legacy = rows[asTrimmed(prNumber)];
  if (legacy && (!asTrimmed(legacy.repo) || asTrimmed(legacy.repo) === asTrimmed(repo))) return asTrimmed(prNumber);
  return prKey;
};

// Notes keyed by a bare number move to a repo key: the repo of the row with
// that number - the fallback repo's when several repos have one (the last
// run's; which PR they were written for can't be told any more), else the
// first - or the fallback repo when no row has it. An existing repo key
// wins.
const migrateNotesKeys = (notesByPrNumber = {}, byPrNumber = {}, fallbackRepo = "") => {
  const notesEntries = Object.entries(notesByPrNumber || {});
  if (!notesEntries.some(([key]) => isLegacyPrEntryKey(key))) {
    return notesByPrNumber || {};
  }
  const reposByNumber = new Map();
  Object.entries(byPrNumber || {}).forEach(([key, entry]) => {
    const repo = asTrimmed(entry?.repo);
    if (!repo) return;
    const number = asTrimmed(entry?.prNumber) || prNumberFromKey(key);
    if (!reposByNumber.has(number)) reposByNumber.set(number, []);
    if (!reposByNumber.get(number).includes(repo)) reposByNumber.get(number).push(repo);
  });
  const keyed = new Set(notesEntries.filter(([key]) => !isLegacyPrEntryKey(key)).map(([key]) => key));
  const result = {};
  notesEntries.forEach(([key, notes]) => {
    if (!isLegacyPrEntryKey(key)) {
      result[key] = notes;
      return;
    }
    const repos = reposByNumber.get(key) || [];
    const fallback = asTrimmed(fallbackRepo);
    const repo = repos.includes(fallback) ? fallback : repos[0] || fallback;
    if (!repo) {
      result[key] = notes;
      return;
    }
    const prKey = buildPrEntryKey(repo, key);
    if (!keyed.has(prKey)) result[prKey] = notes;
  });
  return result;
};

module.exports = {
  buildPrEntryKey,
  isLegacyPrEntryKey,
  prNumberFromKey,
  normalizePrEntryKeys,
  findPrEntry,
  findPrEntryKey,
  migrateNotesKeys,
};
