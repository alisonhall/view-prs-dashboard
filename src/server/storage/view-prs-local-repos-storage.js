const path = require("path");
const { writeFileReplacingSync } = require("../helpers/file-io-helpers");

// Where the repos' clones are on this computer (VIEW_PRS_LOCAL_REPOS_FILE,
// data/local-repos.json): { repos: { "owner/name": { path } } }. Its own
// file, not user-defaults.json, as the paths only mean something on this
// computer - a data folder shared or backed up elsewhere shouldn't carry
// them. Only the server writes it, whole.

const toTrimmed = (value) => (value === null || value === undefined ? "" : String(value).trim());
const isPlainObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

const createViewPrsLocalReposStorage = ({ fs, localReposFile, isRepoSlug }) => {
  // repo => absolute path, the ones that look valid.
  const loadLocalRepos = () => {
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(localReposFile, "utf8"));
    } catch (_error) {
      return {};
    }
    const repos = isPlainObject(raw?.repos) ? raw.repos : {};
    return Object.fromEntries(
      Object.entries(repos)
        .map(([repo, entry]) => [toTrimmed(repo), toTrimmed(entry?.path)])
        .filter(([repo, folder]) => isRepoSlug(repo) && folder && path.isAbsolute(folder)),
    );
  };

  const save = (repos) => {
    fs.mkdirSync(path.dirname(localReposFile), { recursive: true });
    const sorted = Object.fromEntries(
      Object.keys(repos)
        .sort()
        .map((repo) => [repo, { path: repos[repo] }]),
    );
    writeFileReplacingSync(fs, localReposFile, `${JSON.stringify({ repos: sorted }, null, 2)}\n`);
  };

  const setLocalRepo = (repo, folder) => {
    save({ ...loadLocalRepos(), [repo]: folder });
  };

  // Whether it had one.
  const removeLocalRepo = (repo) => {
    const repos = loadLocalRepos();
    if (!(repo in repos)) return false;
    delete repos[repo];
    save(repos);
    return true;
  };

  return { loadLocalRepos, setLocalRepo, removeLocalRepo };
};

module.exports = { createViewPrsLocalReposStorage };
