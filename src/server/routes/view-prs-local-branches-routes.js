const path = require("path");

// This computer's clones of the repos (Settings › Local clones) and what
// they have of each PR's branch (view-prs-local-branches.js).
const registerViewPrsLocalBranchesRoutes = ({
  app,
  localReposStorage,
  localBranches,
  isRepoSlug,
  // () => the data's rows in view (byPrNumber's entries).
  readViewPrsRows,
  // (folder) => resolves once the editor is started, rejects with why not.
  openInEditor,
  sendInternalError = ({ res, error }) => res.status(500).json({ ok: false, error: error?.message || String(error) }),
}) => {
  // Each PR the server can look for locally: its branch, head commit and
  // commits, from its row.
  const listPrs = (localRepos) =>
    readViewPrsRows()
      .filter((entry) => entry && localRepos[entry.repo] && entry.data)
      .map((entry) => {
        const data = entry.data;
        const commits = Array.isArray(data.commits) ? data.commits : [];
        const number = String(entry.prNumber || data.number || "");
        return {
          key: `${entry.repo}#${number}`,
          repo: entry.repo,
          number,
          branch: String(data.sourceBranch || ""),
          targetBranch: String(data.targetBranch || ""),
          headOid: String(data.headOid || ""),
          crossRepository: data.crossRepository === true,
          commitOids: commits.map((commit) => String(commit?.oid || "")).filter(Boolean),
        };
      })
      .filter((pr) => pr.number && (pr.branch || pr.crossRepository));

  const reposStatus = async () => (await localBranches.getLocalBranches({ localRepos: localReposStorage.loadLocalRepos(), prs: [] })).repos;

  // { repos: repo => { path, ok, error?, branchCount, worktreeCount } }.
  app.get(["/local-repos", "/view-prs/local-repos"], async (_req, res) => {
    try {
      res.json({ ok: true, repos: await reposStatus() });
    } catch (error) {
      sendInternalError({ res, error });
    }
  });

  // { repo, path } - the clone's folder: saved once git finds it's a clone
  // of the repo.
  app.put(["/local-repos", "/view-prs/local-repos"], async (req, res) => {
    const repo = String(req.body?.repo || "").trim();
    // A path copied with its quotes (Windows' Copy as path) works too.
    const folder = String(req.body?.path || "")
      .trim()
      .replace(/^(["'])(.*)\1$/, "$2")
      .trim();
    if (!isRepoSlug(repo)) {
      res.status(400).json({ ok: false, error: `Not a repo (owner/name): ${repo}` });
      return;
    }
    if (!folder || !path.isAbsolute(folder)) {
      res.status(400).json({ ok: false, error: "Give the clone's full path" });
      return;
    }
    try {
      const status = await localBranches.checkClone(repo, folder);
      if (!status.ok) {
        res.status(422).json({ ok: false, error: status.error });
        return;
      }
      localReposStorage.setLocalRepo(repo, folder);
      res.json({ ok: true, repos: await reposStatus() });
    } catch (error) {
      sendInternalError({ res, error });
    }
  });

  // { repo } - forgets its clone's folder.
  app.delete(["/local-repos", "/view-prs/local-repos"], async (req, res) => {
    const repo = String(req.body?.repo || "").trim();
    try {
      const removed = localReposStorage.removeLocalRepo(repo);
      localBranches.forgetClone(repo);
      res.json({ ok: true, removed, repos: await reposStatus() });
    } catch (error) {
      sendInternalError({ res, error });
    }
  });

  // { repos, prs: "owner/name#12" => { branch, oid, worktreePath?, ahead,
  // behind, exact } | { ..., diverged: true } } - only PRs with a local
  // branch.
  app.get(["/local-branches", "/view-prs/local-branches"], async (_req, res) => {
    try {
      const localRepos = localReposStorage.loadLocalRepos();
      // Without a clone (most of the time, for most), the rows aren't read.
      if (Object.keys(localRepos).length === 0) {
        res.json({ ok: true, repos: {}, prs: {} });
        return;
      }
      const result = await localBranches.getLocalBranches({ localRepos, prs: listPrs(localRepos) });
      res.json({ ok: true, ...result });
    } catch (error) {
      sendInternalError({ res, error });
    }
  });

  // { repo, path } - opens the folder in the code editor (`code`): only the
  // repo's clone or one of its worktrees, never another path.
  app.post(["/open-in-editor", "/view-prs/open-in-editor"], async (req, res) => {
    const repo = String(req.body?.repo || "").trim();
    const folder = String(req.body?.path || "").trim();
    try {
      const cloneFolder = localReposStorage.loadLocalRepos()[repo];
      if (!(await localBranches.isOpenableFolder(repo, cloneFolder, folder))) {
        res.status(400).json({ ok: false, error: `Not ${repo}'s clone or one of its worktrees` });
        return;
      }
      await openInEditor(folder);
      res.json({ ok: true });
    } catch (error) {
      res.status(502).json({ ok: false, error: error?.message || String(error) });
    }
  });
};

module.exports = { registerViewPrsLocalBranchesRoutes };
