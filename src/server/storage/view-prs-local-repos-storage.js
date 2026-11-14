const path = require("path");
const { writeFileReplacingSync } = require("../helpers/file-io-helpers");

// Where the repos' clones are on this computer (VIEW_PRS_LOCAL_REPOS_FILE,
// data/local-repos.json): { repos: { "owner/name": { path, checkout? } } }.
// Its own file, not user-defaults.json, as the paths only mean something on
// this computer - a data folder shared or backed up elsewhere shouldn't
// carry them. Only the server writes it, whole.
//
// checkout: how the pane's Check out makes a PR's worktree
// (view-prs-local-checkout.js) - { command?, forks?, after?, folder?, env? }:
// the user's own command instead of plain git (and whether for forks' PRs
// too), a command to run in a worktree git made, the folder pattern for
// git's worktrees, and variables to give the commands.

const toTrimmed = (value) => (value === null || value === undefined ? "" : String(value).trim());
const isPlainObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

const MAX_COMMAND_LENGTH = 2000;
const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

// Checkout settings as given: { checkout } (null when nothing's set, for
// plain git), or { error } saying what's wrong.
const checkCheckoutSettings = (value) => {
  if (value === null || value === undefined) return { checkout: null };
  if (!isPlainObject(value)) return { error: "Checkout settings should be an object" };
  const checkout = {};
  for (const [key, label] of [
    ["command", "The checkout command"],
    ["after", "The after-command"],
  ]) {
    const command = toTrimmed(value[key]);
    if (!command) continue;
    if (/[\r\n\0]/.test(command)) return { error: `${label} should be one line` };
    if (command.length > MAX_COMMAND_LENGTH) return { error: `${label} is too long` };
    checkout[key] = command;
  }
  if (checkout.command && value.forks === true) checkout.forks = true;
  const folder = toTrimmed(value.folder);
  if (folder) {
    if (/[\r\n\0]/.test(folder)) return { error: "The worktree folder should be one line" };
    if (!folder.includes("{branch}")) return { error: "The worktree folder needs {branch} in it, so each PR's branch has its own" };
    checkout.folder = folder;
  }
  if (value.env !== undefined && value.env !== null) {
    if (!isPlainObject(value.env)) return { error: "The variables should be NAME=value pairs" };
    const env = {};
    for (const [name, raw] of Object.entries(value.env)) {
      if (!ENV_NAME_PATTERN.test(name)) return { error: `Not a variable's name: ${name}` };
      if (/^VIEW_PRS_/i.test(name)) return { error: `${name}: VIEW_PRS_ variables are the dashboard's own` };
      const setting = raw === null || raw === undefined ? "" : String(raw);
      if (/[\r\n\0]/.test(setting)) return { error: `${name}'s value should be one line` };
      env[name] = setting;
    }
    if (Object.keys(env).length > 0) checkout.env = env;
  }
  return { checkout: Object.keys(checkout).length > 0 ? checkout : null };
};

// Checkout settings as saved, or null when there are none usable.
const normalizeCheckout = (value) => checkCheckoutSettings(value).checkout || null;

const createViewPrsLocalReposStorage = ({ fs, localReposFile, isRepoSlug }) => {
  // repo => { path, checkout? }, the ones that look valid.
  const loadLocalRepoEntries = () => {
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(localReposFile, "utf8"));
    } catch (_error) {
      return {};
    }
    const repos = isPlainObject(raw?.repos) ? raw.repos : {};
    return Object.fromEntries(
      Object.entries(repos)
        .map(([repo, entry]) => {
          const checkout = normalizeCheckout(entry?.checkout);
          return [toTrimmed(repo), { path: toTrimmed(entry?.path), ...(checkout ? { checkout } : {}) }];
        })
        .filter(([repo, entry]) => isRepoSlug(repo) && entry.path && path.isAbsolute(entry.path)),
    );
  };

  // repo => absolute path.
  const loadLocalRepos = () =>
    Object.fromEntries(Object.entries(loadLocalRepoEntries()).map(([repo, entry]) => [repo, entry.path]));

  const save = (entries) => {
    fs.mkdirSync(path.dirname(localReposFile), { recursive: true });
    const sorted = Object.fromEntries(
      Object.keys(entries)
        .sort()
        .map((repo) => [repo, entries[repo]]),
    );
    writeFileReplacingSync(fs, localReposFile, `${JSON.stringify({ repos: sorted }, null, 2)}\n`);
  };

  // Keeps the repo's checkout settings.
  const setLocalRepo = (repo, folder) => {
    const entries = loadLocalRepoEntries();
    save({ ...entries, [repo]: { ...entries[repo], path: folder } });
  };

  // checkout: the repo's checkout settings, or null for plain git.
  // Whether the repo has a clone saved.
  const setLocalRepoCheckout = (repo, checkout) => {
    const entries = loadLocalRepoEntries();
    if (!entries[repo]) return false;
    const normalized = normalizeCheckout(checkout);
    const { checkout: _dropped, ...rest } = entries[repo];
    save({ ...entries, [repo]: normalized ? { ...rest, checkout: normalized } : rest });
    return true;
  };

  // Whether it had one.
  const removeLocalRepo = (repo) => {
    const entries = loadLocalRepoEntries();
    if (!(repo in entries)) return false;
    delete entries[repo];
    save(entries);
    return true;
  };

  return { loadLocalRepos, loadLocalRepoEntries, setLocalRepo, setLocalRepoCheckout, removeLocalRepo };
};

module.exports = { createViewPrsLocalReposStorage, checkCheckoutSettings, normalizeCheckout };
