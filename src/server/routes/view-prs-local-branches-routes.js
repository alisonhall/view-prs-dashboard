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
  // view-prs-local-checkout.js's checkOut, fetchPr, pullPr, pullBranch,
  // fetchBranch, createBranch, checkCommands, listCleanup and removeCleanup.
  checkOut,
  fetchPr,
  pullPr,
  pullBranch = async () => {
    throw Object.assign(new Error("Pull isn't available"), { status: 501 });
  },
  fetchBranch = async () => {
    throw Object.assign(new Error("Fetch isn't available"), { status: 501 });
  },
  createBranch = async () => {
    throw Object.assign(new Error("New branch isn't available"), { status: 501 });
  },
  checkCommands,
  listCleanup,
  removeCleanup,
  sendInternalError = ({ res, error }) => res.status(500).json({ ok: false, error: error?.message || String(error) }),
  homeDir = () => os.homedir(),
  // (req) => whether the request came from this computer, not the network
  // (VIEW_PRS_HOST).
  isFromThisComputer = () => true,
  // The sources file (view-prs-sources-storage.js), for the branches
  // tracked without a PR; and what it's seeded from, and the data-changed
  // event a change to it sends (as the sources routes).
  sourcesStorage = null,
  seedSubscriptionRepos = () => null,
  emitDataChanged = () => {},
}) => {
  // The branches tracked without a PR: [{ repo, branch, base?, note? }].
  const listTrackedBranches = () => {
    try {
      return sourcesStorage?.readSources()?.trackedBranches || [];
    } catch (_error) {
      return [];
    }
  };

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

  // Each clone's state with its checkout settings - in every answer with
  // the clones' states, /local-branches' too: the page keeps one copy of
  // them, and an answer without the settings would drop them from it.
  const withCheckout = (repos, entries = localReposStorage.loadLocalRepoEntries()) =>
    Object.fromEntries(
      Object.entries(repos || {}).map(([repo, status]) => [
        repo,
        {
          ...status,
          ...(entries[repo]?.checkout ? { checkout: entries[repo].checkout } : {}),
          ...(entries[repo]?.newBranch ? { newBranch: entries[repo].newBranch } : {}),
        },
      ]),
    );
  const reposStatus = async () => {
    const { repos } = await localBranches.getLocalBranches({ localRepos: localReposStorage.loadLocalRepos(), prs: [] });
    return withCheckout(repos);
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

  // { repo, commands } - whether the user's shell knows each command's
  // first word (Settings' Check), run as Check out would run it, in the
  // repo's clone's folder; none is run. A command is a string, or {
  // field, command } (field: command, after, cleanupList, cleanupRemove,
  // editor or terminal). { results: [{ command, field?, name, found, detail }] }.
  // Only from this computer, as saving the commands is.
  app.post(["/local-repos/checkout/check", "/view-prs/local-repos/checkout/check"], async (req, res) => {
    if (!isFromThisComputer(req)) {
      res.status(403).json({ ok: false, error: "Commands can only be checked on this computer" });
      return;
    }
    const repo = String(req.body?.repo || "").trim();
    const fields = ["command", "after", "cleanupList", "cleanupRemove", "editor", "terminal"];
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
    try {
      const cloneFolder = localReposStorage.loadLocalRepoEntries()[repo]?.path || "";
      res.json({ ok: true, results: await checkCommands({ cloneFolder, commands: commands.map((item) => (item.field ? item : item.command)) }) });
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
        res.json({ ok: true, repos: {}, prs: {}, branches: {} });
        return;
      }
      const prs = listPrs(localRepos);
      const [result, branches] = await Promise.all([
        localBranches.getLocalBranches({ localRepos, prs }),
        localBranches.getTrackedBranches({ localRepos, branches: listTrackedBranches(), prs }),
      ]);
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
      res.json({ ok: true, ...result, branches, repos: withCheckout(result.repos, entries), plans, platform, openWith: localReposStorage.loadOpenWith() });
    } catch (error) {
      sendInternalError({ res, error });
    }
  });

  // The uncommitted changes in the worktree each tracked branch (no PR) is
  // checked out in, for their rows: { changes: key (repo:branch) => {
  // worktreePath, staged, changed, untracked, conflicted, total, files } |
  // { worktreePath, error } } - only those checked out on this computer.
  app.get(["/tracked-branches/changes", "/view-prs/tracked-branches/changes"], async (_req, res) => {
    try {
      const localRepos = localReposStorage.loadLocalRepos();
      const changes = await localBranches.getTrackedBranchChanges({ localRepos, branches: listTrackedBranches() });
      res.json({ ok: true, changes });
    } catch (error) {
      sendInternalError({ res, error });
    }
  });

  // ?repo=&branch= - a tracked branch's commits since it left its base
  // (its own base, else the repo's default branch), for its pane
  // (view-prs-local-branches.js' getBranchCommits).
  app.get(["/tracked-branches/commits", "/view-prs/tracked-branches/commits"], async (req, res) => {
    const repo = String(req.query?.repo || "").trim();
    const branch = String(req.query?.branch || "").trim();
    try {
      const folder = localReposStorage.loadLocalRepos()[repo];
      if (!folder) {
        res.status(404).json({ ok: false, error: `No clone of ${repo} saved (Settings › Local clones)` });
        return;
      }
      if (!branch) {
        res.status(400).json({ ok: false, error: "Which branch?" });
        return;
      }
      const entry = listTrackedBranches().find((item) => item.repo === repo && item.branch === branch);
      const result = await localBranches.getBranchCommits({ repo, folder, branch, base: entry?.base || "" });
      if (!result.ok) {
        res.status(result.status || 422).json({ ok: false, error: result.error });
        return;
      }
      res.json(result);
    } catch (error) {
      sendInternalError({ res, error });
    }
  });

  // ?repo=&oid= - the files a commit of the clone changed, for a tracked
  // branch's pane (view-prs-local-branches.js' getCommitFiles).
  app.get(["/tracked-branches/commit-files", "/view-prs/tracked-branches/commit-files"], async (req, res) => {
    const repo = String(req.query?.repo || "").trim();
    const oid = String(req.query?.oid || "").trim();
    try {
      const folder = localReposStorage.loadLocalRepos()[repo];
      if (!folder) {
        res.status(404).json({ ok: false, error: `No clone of ${repo} saved (Settings › Local clones)` });
        return;
      }
      const result = await localBranches.getCommitFiles({ repo, folder, oid });
      if (!result.ok) {
        res.status(result.status || 422).json({ ok: false, error: result.error });
        return;
      }
      res.json(result);
    } catch (error) {
      sendInternalError({ res, error });
    }
  });

  // ?repo= - the clone's local branches that could be tracked (Track a
  // branch): no PR's, not tracked already; the main branches (the default,
  // open PRs' bases) first, marked main - { branches: [{ name, oid,
  // committedAt?, subject?, worktreePath?, upstream?, main? }],
  // defaultBranch }. &starts=1: and starts, every branch New branch could
  // start from ([{ ref, name, remote? }]).
  app.get(["/local-repos/branches", "/view-prs/local-repos/branches"], async (req, res) => {
    const repo = String(req.query?.repo || "").trim();
    try {
      const localRepos = localReposStorage.loadLocalRepos();
      const folder = localRepos[repo];
      if (!folder) {
        res.status(404).json({ ok: false, error: `No clone of ${repo} saved (Settings › Local clones)` });
        return;
      }
      const result = await localBranches.getBranchCandidates({
        repo,
        folder,
        prs: listPrs({ [repo]: folder }),
        tracked: listTrackedBranches().filter((entry) => entry.repo === repo).map((entry) => entry.branch),
        starts: req.query?.starts === "1",
      });
      if (!result.ok) {
        res.status(422).json(result);
        return;
      }
      res.json(result);
    } catch (error) {
      sendInternalError({ res, error });
    }
  });

  const readSourcesForResponse = () => sourcesStorage.loadSources({ seedRepos: seedSubscriptionRepos }) || sourcesStorage.normalizeSources({});
  const changeError = (res, error) => res.status(/^Not a /.test(error.message) ? 400 : 500).json({ ok: false, error: error.message });

  // { repo, branch, base?, note? } - tracks a local branch of the repo's
  // clone that has no PR: { added, trackedBranch, sources }. Only a branch
  // the clone has (read afresh) - unless restore (Untrack's Undo, with the
  // entry as it was, addedAt too), which puts back what was tracked
  // whether or not this computer has it.
  app.post(["/tracked-branches", "/view-prs/tracked-branches"], async (req, res) => {
    const repo = String(req.body?.repo || "").trim();
    const branch = String(req.body?.branch || "").trim();
    const base = String(req.body?.base || "").trim();
    const note = typeof req.body?.note === "string" ? req.body.note : undefined;
    const restore = req.body?.restore === true;
    if (!sourcesStorage) {
      res.status(500).json({ ok: false, error: "No sources file" });
      return;
    }
    try {
      if (!restore) {
        const folder = localReposStorage.loadLocalRepos()[repo];
        if (!folder) {
          res.status(404).json({ ok: false, error: `No clone of ${repo} saved (Settings › Local clones)` });
          return;
        }
        const clone = await localBranches.readCloneFresh(repo, folder);
        if (!clone.ok) {
          res.status(422).json({ ok: false, error: clone.error });
          return;
        }
        if (!clone.branches.some((item) => item.name === branch)) {
          res.status(422).json({ ok: false, error: `The clone of ${repo} has no branch ${branch}` });
          return;
        }
      }
      const addedAt = restore ? String(req.body?.addedAt || "") : "";
      const result = sourcesStorage.addTrackedBranch({ repo, branch, base, note, addedAt }, { seedRepos: seedSubscriptionRepos });
      res.json({ ok: true, added: result.added, trackedBranch: result.entry, sources: readSourcesForResponse() });
      if (result.added) emitDataChanged();
    } catch (error) {
      changeError(res, error);
    }
  });

  // { repo, branch, base?, note? } - a tracked branch's base ("" for the
  // repo's default branch) or note ("" clears it): { trackedBranch,
  // sources }.
  app.patch(["/tracked-branches", "/view-prs/tracked-branches"], (req, res) => {
    const repo = String(req.body?.repo || "").trim();
    const branch = String(req.body?.branch || "").trim();
    if (!sourcesStorage) {
      res.status(500).json({ ok: false, error: "No sources file" });
      return;
    }
    try {
      const entry = sourcesStorage.updateTrackedBranch(
        { repo, branch, base: req.body?.base, note: req.body?.note },
        { seedRepos: seedSubscriptionRepos },
      );
      if (!entry) {
        res.status(404).json({ ok: false, error: `${branch} in ${repo} isn't tracked` });
        return;
      }
      res.json({ ok: true, trackedBranch: entry, sources: readSourcesForResponse() });
      emitDataChanged();
    } catch (error) {
      changeError(res, error);
    }
  });

  // { repo, branch } - stops tracking a branch (the branch is untouched):
  // { removed, sources }.
  app.delete(["/tracked-branches", "/view-prs/tracked-branches"], (req, res) => {
    const repo = String(req.body?.repo || "").trim();
    const branch = String(req.body?.branch || "").trim();
    if (!sourcesStorage) {
      res.status(500).json({ ok: false, error: "No sources file" });
      return;
    }
    try {
      const removed = sourcesStorage.removeTrackedBranch(repo, branch);
      res.json({ ok: true, removed: Boolean(removed), sources: readSourcesForResponse() });
      if (removed) emitDataChanged();
    } catch (error) {
      changeError(res, error);
    }
  });

  const sendCheckoutError = (res, error) => {
    if (error?.status) {
      res.status(error.status).json({ ok: false, error: error.message, output: error.output || "" });
      return true;
    }
    return false;
  };

  // { repo, branch } - a tracked branch fast-forwarded to the remote branch
  // it tracks, fetched first (view-prs-local-checkout.js' pullBranch; the
  // row asks first): { branch, from, to, commits, worktreePath?, already? }.
  app.post(["/tracked-branches/pull", "/view-prs/tracked-branches/pull"], async (req, res) => {
    const repo = String(req.body?.repo || "").trim();
    const branch = String(req.body?.branch || "").trim();
    try {
      const entry = localReposStorage.loadLocalRepoEntries()[repo];
      if (!entry) {
        res.status(404).json({ ok: false, error: `No clone of ${repo} saved (Settings › Local clones)` });
        return;
      }
      if (!branch) {
        res.status(400).json({ ok: false, error: "Which branch?" });
        return;
      }
      res.json({ ok: true, ...(await pullBranch({ repo, cloneFolder: entry.path, branch })) });
    } catch (error) {
      if (!sendCheckoutError(res, error)) sendInternalError({ res, error });
    }
  });

  // { repo, branch } - a tracked branch's remote branch fetched, so its
  // behind count is current; nothing else changes
  // (view-prs-local-checkout.js' fetchBranch): { branch, remote, ref,
  // ahead?, behind? }.
  app.post(["/tracked-branches/fetch", "/view-prs/tracked-branches/fetch"], async (req, res) => {
    const repo = String(req.body?.repo || "").trim();
    const branch = String(req.body?.branch || "").trim();
    try {
      const entry = localReposStorage.loadLocalRepoEntries()[repo];
      if (!entry) {
        res.status(404).json({ ok: false, error: `No clone of ${repo} saved (Settings › Local clones)` });
        return;
      }
      if (!branch) {
        res.status(400).json({ ok: false, error: "Which branch?" });
        return;
      }
      res.json({ ok: true, ...(await fetchBranch({ repo, cloneFolder: entry.path, branch })) });
    } catch (error) {
      if (!sendCheckoutError(res, error)) sendInternalError({ res, error });
    }
  });

  // { repo, name, start, fetch?, mode? } - New branch: name started from
  // start (refs/heads/<branch> or refs/remotes/<remote>/<branch>; fetched
  // first unless fetch is false), in a new worktree or (mode "switch") the
  // clone's own folder (view-prs-local-checkout.js' createBranch) - then
  // tracked, compared with the branch it started from, and the mode kept
  // as the repo's next: { branch, oid, worktreePath, startedFrom, fetched,
  // warning?, output, trackedBranch }.
  app.post(["/tracked-branches/new", "/view-prs/tracked-branches/new"], async (req, res) => {
    const repo = String(req.body?.repo || "").trim();
    const name = String(req.body?.name || "").trim();
    const start = String(req.body?.start || "").trim();
    const mode = req.body?.mode === "switch" ? "switch" : "worktree";
    if (!sourcesStorage) {
      res.status(500).json({ ok: false, error: "No sources file" });
      return;
    }
    try {
      const entry = localReposStorage.loadLocalRepoEntries()[repo];
      if (!entry) {
        res.status(404).json({ ok: false, error: `No clone of ${repo} saved (Settings › Local clones)` });
        return;
      }
      if (!name) {
        res.status(400).json({ ok: false, error: "Name the new branch" });
        return;
      }
      const made = await createBranch({ repo, cloneFolder: entry.path, settings: entry.checkout || null, name, start, fetch: req.body?.fetch !== false, mode });
      localReposStorage.setLocalRepoNewBranch(repo, mode);
      // Compared with what it started from: that branch's name, when the
      // clone has it as the repo's (else the repo's default branch).
      const clone = await localBranches.readCloneFresh(repo, entry.path);
      const startBranch = start.startsWith("refs/heads/")
        ? start.slice("refs/heads/".length)
        : (clone.ok ? clone.repoRemotes : []).map((remote) => `refs/remotes/${remote}/`).filter((prefix) => start.startsWith(prefix)).map((prefix) => start.slice(prefix.length))[0] || "";
      const base = startBranch && startBranch !== (clone.ok ? clone.defaultBranch : "") ? startBranch : "";
      let trackedBranch = null;
      try {
        trackedBranch = sourcesStorage.addTrackedBranch({ repo, branch: name, base }, { seedRepos: seedSubscriptionRepos }).entry;
        emitDataChanged();
      } catch (error) {
        made.warning = [made.warning, `It was made, but couldn't be tracked: ${error.message}`].filter(Boolean).join(". ");
      }
      res.json({ ok: true, ...made, trackedBranch });
    } catch (error) {
      if (!sendCheckoutError(res, error)) sendInternalError({ res, error });
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
