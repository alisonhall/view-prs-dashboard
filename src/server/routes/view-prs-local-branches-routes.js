const os = require("os");
const path = require("path");
const { checkCheckoutSettings, checkOpenWithSettings } = require("../storage/view-prs-local-repos-storage");
const { isForkPr } = require("../helpers/view-prs-local-branches");
const { planCheckout } = require("../helpers/view-prs-local-checkout");

// This computer's clones of the repos (Settings › Local clones) and what
// they have of each PR's branch (view-prs-local-branches.js).
const registerViewPrsLocalBranchesRoutes = ({
  app,
  localReposStorage,
  localBranches,
  isRepoSlug,
  // () => the data's rows in view (byPrNumber's entries).
  readViewPrsRows,
  // view-prs-local-open.js' openFolder: ({ kind, folder, settings }) =>
  // resolves once the editor, terminal or file manager is started, rejects
  // with .status and why not.
  openFolder,
  // The server's platform (process.platform): the page names Explorer or
  // Finder by it, and says what Terminal opens.
  platform = process.platform,
  // view-prs-local-checkout.js's checkOut, fetchPr, pullPr, checkCommands,
  // listCleanup and removeCleanup.
  checkOut,
  fetchPr,
  pullPr,
  checkCommands,
  listCleanup,
  removeCleanup,
  sendInternalError = ({ res, error }) => res.status(500).json({ ok: false, error: error?.message || String(error) }),
  homeDir = () => os.homedir(),
  // (req) => whether the request came from this computer, not the network
  // (VIEW_PRS_HOST).
  isFromThisComputer = () => true,
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
          // Merged or closed: nothing to check out.
          done: Boolean(data.mergedAt || data.closedAt),
          crossRepository: data.crossRepository === true,
          commitOids: commits.map((commit) => String(commit?.oid || "")).filter(Boolean),
        };
      })
      .filter((pr) => pr.number && (pr.branch || pr.crossRepository));

  // A path as typed or pasted - one copied with its quotes (Windows' Copy
  // as path) works too, and ~ is the home folder, as in a terminal.
  const cleanFolder = (value) => {
    const folder = String(value || "")
      .trim()
      .replace(/^(["'])(.*)\1$/, "$2")
      .trim();
    return /^~(?=$|[\\/])/.test(folder) ? path.join(homeDir(), folder.slice(1)) : folder;
  };

  // Each clone's state, with its checkout settings.
  const reposStatus = async () => {
    const entries = localReposStorage.loadLocalRepoEntries();
    const { repos } = await localBranches.getLocalBranches({ localRepos: localReposStorage.loadLocalRepos(), prs: [] });
    return Object.fromEntries(
      Object.entries(repos).map(([repo, status]) => [repo, entries[repo]?.checkout ? { ...status, checkout: entries[repo].checkout } : status]),
    );
  };

  // { repos: repo => { path, ok, error?, branchCount, worktreeCount },
  // openWith: { editor?, terminal? }, platform }.
  app.get(["/local-repos", "/view-prs/local-repos"], async (_req, res) => {
    try {
      res.json({ ok: true, repos: await reposStatus(), openWith: localReposStorage.loadOpenWith(), platform });
    } catch (error) {
      sendInternalError({ res, error });
    }
  });

  // { folder, repos } - the clones of those repos in the folder (up to three
  // levels down), to choose from: { found: [{ repo, path }] }. Saves nothing.
  app.post(["/local-repos/find", "/view-prs/local-repos/find"], async (req, res) => {
    const folder = cleanFolder(req.body?.folder);
    if (!folder || !path.isAbsolute(folder)) {
      res.status(400).json({ ok: false, error: "Give the folder's full path" });
      return;
    }
    const repos = (Array.isArray(req.body?.repos) ? req.body.repos : []).map((repo) => String(repo).trim()).filter(isRepoSlug);
    try {
      const result = await localBranches.findClones({ folder, repos });
      if (!result.ok) {
        res.status(422).json(result);
        return;
      }
      res.json(result);
    } catch (error) {
      sendInternalError({ res, error });
    }
  });

  // { repo, path } - the clone's folder: saved once git finds it's a clone
  // of the repo.
  app.put(["/local-repos", "/view-prs/local-repos"], async (req, res) => {
    const repo = String(req.body?.repo || "").trim();
    const folder = cleanFolder(req.body?.path);
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

  // { repo, checkout } - how the pane's Check out makes a worktree for the
  // repo's PRs (view-prs-local-checkout.js): { command?, forks?, after?,
  // folder?, env? }, or null for plain git.
  // Only from this computer: the commands are run on it, as the user, so
  // with the server opened to the network (no sign-in), anyone who could
  // reach it could otherwise run anything there.
  app.put(["/local-repos/checkout", "/view-prs/local-repos/checkout"], async (req, res) => {
    if (!isFromThisComputer(req)) {
      res.status(403).json({ ok: false, error: "Checkout settings can only be changed on this computer" });
      return;
    }
    const repo = String(req.body?.repo || "").trim();
    const { checkout, error } = checkCheckoutSettings(req.body?.checkout);
    if (error) {
      res.status(400).json({ ok: false, error });
      return;
    }
    try {
      if (!localReposStorage.setLocalRepoCheckout(repo, checkout)) {
        res.status(404).json({ ok: false, error: `Save ${repo}'s clone first` });
        return;
      }
      res.json({ ok: true, repos: await reposStatus() });
    } catch (caught) {
      sendInternalError({ res, error: caught });
    }
  });

  // { repo, commands, env? } - whether the user's shell knows each
  // command's first word (Settings' Check), run as Check out would run it,
  // in the repo's clone's folder - and the list command run for real (it
  // only lists). A command is a string, or { field, command } (field:
  // command, after, cleanupList or cleanupRemove); env: the variables as
  // typed, not yet saved. { results: [{ command, field?, name, found,
  // detail, trial? }] }. Only from this computer, as saving the commands is.
  app.post(["/local-repos/checkout/check", "/view-prs/local-repos/checkout/check"], async (req, res) => {
    if (!isFromThisComputer(req)) {
      res.status(403).json({ ok: false, error: "Commands can only be checked on this computer" });
      return;
    }
    const repo = String(req.body?.repo || "").trim();
    const fields = ["command", "after", "cleanupList", "cleanupRemove"];
    const commands = (Array.isArray(req.body?.commands) ? req.body.commands : [])
      .map((item) =>
        item && typeof item === "object"
          ? { field: fields.includes(item.field) ? item.field : "", command: String(item.command || "").trim() }
          : { field: "", command: String(item || "").trim() },
      )
      .filter(({ command }) => command && !/[\r\n\0]/.test(command))
      .slice(0, 4);
    if (commands.length === 0) {
      res.status(400).json({ ok: false, error: "No command to check" });
      return;
    }
    const rawEnv = req.body?.env && typeof req.body.env === "object" && !Array.isArray(req.body.env) ? req.body.env : {};
    const env = Object.fromEntries(
      Object.entries(rawEnv)
        .filter(([name, value]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !name.startsWith("VIEW_PRS_") && typeof value === "string" && !/\0/.test(value))
        .slice(0, 50),
    );
    try {
      const cloneFolder = localReposStorage.loadLocalRepoEntries()[repo]?.path || "";
      res.json({ ok: true, results: await checkCommands({ repo, cloneFolder, commands: commands.map((item) => (item.field ? item : item.command)), env }) });
    } catch (error) {
      sendInternalError({ res, error });
    }
  });

  // ?repo= - what's safe to remove after merged and closed PRs, and what
  // isn't and why (view-prs-local-checkout.js' listCleanup): { by, items,
  // ignored?, output? }. Only from this computer: it may run the repo's
  // list command, and removing is from Settings, as changing the commands is.
  app.get(["/local-repos/cleanup", "/view-prs/local-repos/cleanup"], async (req, res) => {
    if (!isFromThisComputer(req)) {
      res.status(403).json({ ok: false, error: "Clean up is only on this computer" });
      return;
    }
    const repo = String(req.query?.repo || "").trim();
    try {
      const entry = localReposStorage.loadLocalRepoEntries()[repo];
      if (!entry) {
        res.status(404).json({ ok: false, error: `No clone of ${repo} saved (Settings › Local clones)` });
        return;
      }
      const prs = listPrs({ [repo]: entry.path });
      res.json({ ok: true, ...(await listCleanup({ repo, cloneFolder: entry.path, settings: entry.checkout, prs })) });
    } catch (error) {
      if (error?.status) {
        res.status(error.status).json({ ok: false, error: error.message, output: error.output || "" });
        return;
      }
      sendInternalError({ res, error });
    }
  });

  // { repo, branch?, worktreePath? } - one item of the list removed, once
  // listed again and still safe (removeCleanup): { removed, how, output } -
  // or { error, output }. Only from this computer.
  app.post(["/local-repos/cleanup/remove", "/view-prs/local-repos/cleanup/remove"], async (req, res) => {
    if (!isFromThisComputer(req)) {
      res.status(403).json({ ok: false, error: "Clean up is only on this computer" });
      return;
    }
    const repo = String(req.body?.repo || "").trim();
    const branch = String(req.body?.branch || "");
    const worktreePath = String(req.body?.worktreePath || "");
    if (!branch && !worktreePath) {
      res.status(400).json({ ok: false, error: "Nothing to remove" });
      return;
    }
    try {
      const entry = localReposStorage.loadLocalRepoEntries()[repo];
      if (!entry) {
        res.status(404).json({ ok: false, error: `No clone of ${repo} saved (Settings › Local clones)` });
        return;
      }
      const prs = listPrs({ [repo]: entry.path });
      res.json({ ok: true, ...(await removeCleanup({ repo, cloneFolder: entry.path, settings: entry.checkout, prs, branch, worktreePath })) });
    } catch (error) {
      if (error?.status) {
        res.status(error.status).json({ ok: false, error: error.message, output: error.output || "" });
        return;
      }
      sendInternalError({ res, error });
    }
  });

  // { openWith: { editor?, terminal? } } - this computer's commands for
  // the pane's Open in editor and Terminal, empty for VS Code's code and
  // the system's terminal: { openWith }. Only from this computer, as the
  // checkout commands are: they're run on it, as the user.
  app.put(["/local-repos/open-with", "/view-prs/local-repos/open-with"], async (req, res) => {
    if (!isFromThisComputer(req)) {
      res.status(403).json({ ok: false, error: "The editor and terminal can only be changed on this computer" });
      return;
    }
    const { openWith, error } = checkOpenWithSettings(req.body?.openWith);
    if (error) {
      res.status(400).json({ ok: false, error });
      return;
    }
    try {
      localReposStorage.setOpenWith(openWith);
      res.json({ ok: true, openWith: localReposStorage.loadOpenWith() });
    } catch (caught) {
      sendInternalError({ res, error: caught });
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
      const prs = listPrs(localRepos);
      const result = await localBranches.getLocalBranches({ localRepos, prs });
      // How Check out would make each open PR's worktree (planCheckout), so
      // the pane says it as the server will do it.
      const entries = localReposStorage.loadLocalRepoEntries();
      const plans = Object.fromEntries(
        prs
          .filter((pr) => !pr.done && result.repos[pr.repo]?.ok)
          .map((pr) => {
            const fork = isForkPr(pr);
            return [pr.key, { how: planCheckout({ existing: Boolean(result.prs[pr.key]), isFork: fork, settings: entries[pr.repo]?.checkout }), fork }];
          }),
      );
      res.json({ ok: true, ...result, plans, platform, openWith: localReposStorage.loadOpenWith() });
    } catch (error) {
      sendInternalError({ res, error });
    }
  });

  // ?repo=&number= - the uncommitted changes in the worktree the PR is
  // checked out in, for the pane (view-prs-local-branches.js'
  // getWorktreeChanges): { changes: { worktreePath, staged, changed,
  // untracked, conflicted, total, files } | { worktreePath, error } | null }.
  // Any PR, merged and closed too: their worktrees may still hold work.
  app.get(["/local-branches/changes", "/view-prs/local-branches/changes"], async (req, res) => {
    const repo = String(req.query?.repo || "").trim();
    const number = String(req.query?.number || "").trim();
    try {
      const folder = localReposStorage.loadLocalRepos()[repo];
      if (!folder) {
        res.status(404).json({ ok: false, error: `No clone of ${repo} saved (Settings › Local clones)` });
        return;
      }
      const pr = listPrs({ [repo]: folder }).find((item) => item.number === number);
      if (!pr) {
        res.status(404).json({ ok: false, error: `No PR #${number} in ${repo}` });
        return;
      }
      res.json({ ok: true, changes: await localBranches.getWorktreeChanges({ repo, folder, pr }) });
    } catch (error) {
      sendInternalError({ res, error });
    }
  });

  // { repo, number } - a worktree for the PR's branch beside the clone
  // (view-prs-local-checkout.js): { branch, worktreePath, how, already?,
  // warning?, output } - or { error, output }.
  app.post(["/local-branches/checkout", "/view-prs/local-branches/checkout"], async (req, res) => {
    const repo = String(req.body?.repo || "").trim();
    const number = String(req.body?.number || "").trim();
    try {
      const entry = localReposStorage.loadLocalRepoEntries()[repo];
      if (!entry) {
        res.status(404).json({ ok: false, error: `No clone of ${repo} saved (Settings › Local clones)` });
        return;
      }
      const pr = listPrs({ [repo]: entry.path }).find((item) => item.number === number);
      if (!pr) {
        res.status(404).json({ ok: false, error: `No PR #${number} in ${repo}` });
        return;
      }
      if (pr.done) {
        res.status(409).json({ ok: false, error: `#${number} is merged or closed` });
        return;
      }
      const result = await checkOut({ repo, cloneFolder: entry.path, settings: entry.checkout || null, pr });
      res.json({ ok: true, ...result });
    } catch (error) {
      if (error?.status) {
        res.status(error.status).json({ ok: false, error: error.message, output: error.output || "" });
        return;
      }
      sendInternalError({ res, error });
    }
  });

  // { repo, number } - the PR's branch fetched into the clone, for an exact
  // count (view-prs-local-checkout.js' fetchPr; changes no files): { remote,
  // ref, warning? } - or { error }. Open PRs only, as Check out.
  app.post(["/local-branches/fetch", "/view-prs/local-branches/fetch"], async (req, res) => {
    const repo = String(req.body?.repo || "").trim();
    const number = String(req.body?.number || "").trim();
    try {
      const entry = localReposStorage.loadLocalRepoEntries()[repo];
      if (!entry) {
        res.status(404).json({ ok: false, error: `No clone of ${repo} saved (Settings › Local clones)` });
        return;
      }
      const pr = listPrs({ [repo]: entry.path }).find((item) => item.number === number);
      if (!pr) {
        res.status(404).json({ ok: false, error: `No PR #${number} in ${repo}` });
        return;
      }
      if (pr.done) {
        res.status(409).json({ ok: false, error: `#${number} is merged or closed` });
        return;
      }
      res.json({ ok: true, ...(await fetchPr({ repo, cloneFolder: entry.path, pr })) });
    } catch (error) {
      if (error?.status) {
        res.status(error.status).json({ ok: false, error: error.message, output: error.output || "" });
        return;
      }
      sendInternalError({ res, error });
    }
  });

  // { repo, number } - the PR's local branch fast-forwarded to the PR's
  // branch (view-prs-local-checkout.js' pullPr; the pane asks first):
  // { branch, from, to, commits, worktreePath?, already? } - or { error }.
  // Open PRs only, as Check out and Fetch.
  app.post(["/local-branches/pull", "/view-prs/local-branches/pull"], async (req, res) => {
    const repo = String(req.body?.repo || "").trim();
    const number = String(req.body?.number || "").trim();
    try {
      const entry = localReposStorage.loadLocalRepoEntries()[repo];
      if (!entry) {
        res.status(404).json({ ok: false, error: `No clone of ${repo} saved (Settings › Local clones)` });
        return;
      }
      const pr = listPrs({ [repo]: entry.path }).find((item) => item.number === number);
      if (!pr) {
        res.status(404).json({ ok: false, error: `No PR #${number} in ${repo}` });
        return;
      }
      if (pr.done) {
        res.status(409).json({ ok: false, error: `#${number} is merged or closed` });
        return;
      }
      res.json({ ok: true, ...(await pullPr({ repo, cloneFolder: entry.path, pr })) });
    } catch (error) {
      if (error?.status) {
        res.status(error.status).json({ ok: false, error: error.message, output: error.output || "" });
        return;
      }
      sendInternalError({ res, error });
    }
  });

  // { repo, path, with } - opens the folder (view-prs-local-open.js): with
  // "editor" (the default; /open-in-editor), "terminal" or "files" (Explorer,
  // Finder) - only the repo's clone or one of its worktrees, never another
  // path. Only from this computer: what it opens is on this computer's
  // screen, and the commands are run on it.
  app.post(["/open-folder", "/view-prs/open-folder", "/open-in-editor", "/view-prs/open-in-editor"], async (req, res) => {
    if (!isFromThisComputer(req)) {
      res.status(403).json({ ok: false, error: "Folders can only be opened on this computer" });
      return;
    }
    const repo = String(req.body?.repo || "").trim();
    const folder = String(req.body?.path || "").trim();
    const kind = String(req.body?.with || "editor");
    try {
      const cloneFolder = localReposStorage.loadLocalRepos()[repo];
      if (!(await localBranches.isOpenableFolder(repo, cloneFolder, folder))) {
        res.status(400).json({ ok: false, error: `Not ${repo}'s clone or one of its worktrees` });
        return;
      }
      await openFolder({ kind, folder, settings: localReposStorage.loadOpenWith() });
      res.json({ ok: true });
    } catch (error) {
      res.status(error?.status || 502).json({ ok: false, error: error?.message || String(error) });
    }
  });
};

module.exports = { registerViewPrsLocalBranchesRoutes };
