// What this computer has of each PR's branch (GET /local-branches): the
// local branch for it, the worktree it's checked out in, and how far it is
// ahead of or behind the PR as GitHub has it (the row's head commit) - from
// the clones whose folders Settings › Local clones names
// (view-prs-local-repos-storage.js). Nothing is fetched: the counts compare
// with the PR's newest commit as the dashboard last fetched it, not with
// the clone's own copy of the remote branch, which is as old as its last
// git fetch.
//
// Three git calls per clone read every branch and worktree (a few ms each),
// kept for a few seconds so the page's checks and the pane share them. An
// ahead/behind count between two commits never changes, so it's kept by
// the pair. None of it grows with the number of PRs, only with the PRs
// that have a local branch.

const path = require("path");

const FIELD = "\t";

// "owner/name" from a remote's URL - https, ssh or scp-like - else "".
const repoFromRemoteUrl = (url) => {
  const text = String(url || "").trim();
  const match =
    text.match(/^[a-z][a-z0-9+.-]*:\/\/[^/]+\/(.+?)\/?$/i) || // https://host/o/n, ssh://git@host/o/n
    text.match(/^[^/@\s]+@[^:/\s]+:(.+?)\/?$/); // git@host:o/n
  if (!match) return "";
  const parts = match[1].replace(/\.git$/i, "").split("/").filter(Boolean);
  return parts.length >= 2 ? `${parts[parts.length - 2]}/${parts[parts.length - 1]}` : "";
};

// git config -z --get-regexp: "key\nvalue" entries, NUL-separated. The
// remotes' URLs, and each branch's upstream remote and ref - read from the
// config, as for-each-ref's %(upstream) is empty for a ref no fetch maps,
// such as the pull ref gh pr checkout sets for a fork's PR.
const parseConfig = (stdout) => {
  const remotes = new Map();
  const upstreams = new Map();
  String(stdout || "")
    .split("\0")
    .forEach((entry) => {
      const newline = entry.indexOf("\n");
      if (newline < 0) return;
      const key = entry.slice(0, newline);
      const value = entry.slice(newline + 1);
      let match = key.match(/^remote\.(.+)\.url$/i);
      if (match) {
        if (!remotes.has(match[1])) remotes.set(match[1], value);
        return;
      }
      match = key.match(/^branch\.(.+)\.(remote|merge)$/i);
      if (match) {
        const upstream = upstreams.get(match[1]) || { remote: "", remoteRef: "" };
        upstream[match[2].toLowerCase() === "remote" ? "remote" : "remoteRef"] = value;
        upstreams.set(match[1], upstream);
      }
    });
  return {
    remotes: [...remotes].map(([name, url]) => ({ name, url, repo: repoFromRemoteUrl(url) })),
    upstreams,
  };
};

// git worktree list --porcelain: blank-line separated blocks.
const parseWorktrees = (stdout) =>
  String(stdout || "")
    .split(/\r?\n\r?\n/)
    .map((block) => {
      const lines = block.split(/\r?\n/);
      const value = (key) => {
        const line = lines.find((item) => item === key || item.startsWith(`${key} `));
        return line === undefined ? null : line.slice(key.length + 1);
      };
      const folder = value("worktree");
      if (!folder) return null;
      const branchRef = value("branch") || "";
      return {
        path: folder,
        head: value("HEAD") || "",
        branch: branchRef.startsWith("refs/heads/") ? branchRef.slice("refs/heads/".length) : "",
        bare: value("bare") !== null,
      };
    })
    .filter(Boolean);

// for-each-ref, one branch a line: refname, oid; with its upstream from
// the config.
const parseBranches = (stdout, upstreams = new Map()) =>
  String(stdout || "")
    .split(/\r?\n/)
    .map((line) => line.split(FIELD))
    .filter(([ref, oid]) => ref && ref.startsWith("refs/heads/") && oid)
    .map(([ref, oid]) => {
      const name = ref.slice("refs/heads/".length);
      const upstream = upstreams.get(name) || { remote: "", remoteRef: "" };
      return { name, oid, remote: upstream.remote, remoteRef: upstream.remoteRef };
    });

// Why git couldn't read a folder, from what it printed (a failed command
// rejects with { error, stderr }): "Not a git repository", or git's own
// words - such as a clone another user owns, which git refuses until it's
// marked safe, with the command that does so.
const describeGitFailure = (failure) => {
  const lines = String(failure?.stderr || failure?.error?.message || failure?.message || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0 || /not a git repository/i.test(lines[0])) return "Not a git repository";
  const fix = lines.find((line) => /^git config /.test(line));
  return `git won't read it: ${lines[0].replace(/^fatal:\s*/i, "")}${fix ? ` (to allow it: ${fix})` : ""}`;
};

// Same folder, however it's written (git gives forward slashes on Windows).
// Each by its real path where it exists: Windows writes a folder in its
// short form (C:\Users\RUNNER~1) as well as its long one, which git gives,
// and a junction or symlink is another name for the folder it points to.
const realFolder = (fs, value) => {
  try {
    return fs.realpathSync.native(String(value || ""));
  } catch (_error) {
    return String(value || "");
  }
};
const sameFolder = (a, b) => {
  const normalize = (value) => String(value || "").replace(/\\/g, "/").replace(/\/+$/, "");
  const left = normalize(a);
  const right = normalize(b);
  return process.platform === "win32" || process.platform === "darwin" ? left.toLowerCase() === right.toLowerCase() : left === right;
};

const createViewPrsLocalBranches = ({
  runCommand,
  fs,
  timeoutMs = 15000,
  cacheMs = 10000,
  // How many ahead/behind counts run at once.
  concurrency = 4,
  now = () => Date.now(),
}) => {
  const git = async (folder, args) => {
    const result = await runCommand("git", ["-C", folder, ...args], 8 * 1024 * 1024, { timeoutMs });
    return String(result?.stdout || "");
  };

  // { ok: true, folder, remotes, repoRemotes, branches, worktrees } or
  // { ok: false, error }. The remotes that are the repo's own are what a
  // branch's upstream must be on to be the PR's.
  const readClone = async (repo, folder) => {
    try {
      if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
        return { ok: false, error: `No such folder: ${folder}` };
      }
    } catch (error) {
      return { ok: false, error: error.message };
    }
    let refs;
    let worktreeList;
    let config;
    try {
      [refs, worktreeList, config] = await Promise.all([
        git(folder, ["for-each-ref", `--format=%(refname)${FIELD}%(objectname)`, "refs/heads"]),
        git(folder, ["worktree", "list", "--porcelain"]),
        // Exits 1 when nothing matches (no remotes, no upstreams).
        git(folder, ["config", "-z", "--get-regexp", "^(remote\\..*\\.url|branch\\..*\\.(remote|merge))$"]).catch(() => ""),
      ]);
    } catch (failure) {
      return { ok: false, error: describeGitFailure(failure) };
    }
    const { remotes, upstreams } = parseConfig(config);
    const repoRemotes = remotes.filter((remote) => remote.repo.toLowerCase() === repo.toLowerCase()).map((remote) => remote.name);
    if (repoRemotes.length === 0) {
      const others = remotes.map((remote) => remote.repo || remote.url).filter(Boolean);
      return {
        ok: false,
        error: `None of its remotes is ${repo}${others.length ? ` (it has ${others.join(", ")})` : " (it has no remotes)"}`,
      };
    }
    return {
      ok: true,
      folder,
      remotes,
      repoRemotes,
      branches: parseBranches(refs, upstreams),
      worktrees: parseWorktrees(worktreeList).filter((worktree) => !worktree.bare),
    };
  };

  // Kept a few seconds per repo and folder, and shared while being read.
  const cloneCache = new Map();
  const getClone = (repo, folder) => {
    const key = `${repo}\n${folder}`;
    const kept = cloneCache.get(key);
    if (kept && now() - kept.at < cacheMs) return kept.promise;
    const promise = readClone(repo, folder);
    cloneCache.set(key, { at: now(), promise });
    return promise;
  };
  const forgetClone = (repo) => {
    [...cloneCache.keys()].filter((key) => key.startsWith(`${repo}\n`)).forEach((key) => cloneCache.delete(key));
  };

  // The local branch that is the PR's: one whose upstream is the PR's branch
  // on one of the repo's remotes (or its pull ref, as gh pr checkout sets up
  // a fork's PR), else one of the same name - not for a fork's PR, whose
  // branch name says nothing about this repo's branches. One checked out
  // first. A PR from a branch named as its base (a fork's main into main)
  // is a fork's too, whether or not its row says so yet (rows fetched
  // before crossRepository was kept): this repo's branch of that name is
  // the base, not the PR.
  const findBranch = (clone, pr) => {
    const isFork = pr.crossRepository || (Boolean(pr.targetBranch) && pr.branch === pr.targetBranch);
    const onRepoRemote = (branch) => clone.repoRemotes.includes(branch.remote);
    const tracking = clone.branches.filter(
      (branch) =>
        onRepoRemote(branch) &&
        ((!isFork && pr.branch && branch.remoteRef === `refs/heads/${pr.branch}`) ||
          branch.remoteRef === `refs/pull/${pr.number}/head`),
    );
    const named = isFork || !pr.branch ? [] : clone.branches.filter((branch) => branch.name === pr.branch && !branch.remote);
    const candidates = [...tracking, ...named];
    const checkedOut = (branch) => clone.worktrees.some((worktree) => worktree.branch === branch.name);
    return candidates.find(checkedOut) || candidates[0] || null;
  };

  // Ahead/behind between two commits never changes: kept by the pair -
  // only once worked out. One git couldn't work out (the PR's newest commit
  // not in the clone yet) is asked again next time, as a git fetch may have
  // brought it.
  const countCache = new Map();
  const MAX_COUNTS = 5000;
  const countAheadBehind = async (folder, localOid, headOid) => {
    const key = `${folder}\n${localOid}\n${headOid}`;
    if (countCache.has(key)) return countCache.get(key);
    const counts = git(folder, ["rev-list", "--left-right", "--count", `${localOid}...${headOid}`]).then(
      (stdout) => {
        const [ahead, behind] = stdout.trim().split(/\s+/).map(Number);
        return Number.isFinite(ahead) && Number.isFinite(behind) ? { ahead, behind } : null;
      },
      // The PR's head commit isn't in the clone (not fetched since).
      () => null,
    );
    if (countCache.size >= MAX_COUNTS) countCache.delete(countCache.keys().next().value);
    // Kept as it's worked out, so a second ask at once shares it.
    countCache.set(key, counts);
    counts.then((result) => {
      if (!result && countCache.get(key) === counts) countCache.delete(key);
    });
    return counts;
  };

  // A PR's local branch: { branch, oid, worktreePath?, ahead, behind,
  // exact } - exact false when the count comes from the row's commits
  // (the PR's head isn't in the clone yet: behind by the commits after the
  // local one, merges from the base branch not counted) - or { branch, oid,
  // worktreePath?, diverged: true } when neither says. null without one.
  // A row fetched before headOid was kept (a merged PR's row is reused
  // until the PR changes) compares with its newest stored commit - the same
  // unless the branch's newest is a merge from the base, which the row's
  // commits leave out.
  const describePr = async (clone, pr) => {
    const branch = findBranch(clone, pr);
    if (!branch) return null;
    const worktree = clone.worktrees.find((item) => item.branch === branch.name);
    const base = {
      branch: branch.name,
      oid: branch.oid,
      ...(worktree ? { worktreePath: worktree.path } : {}),
    };
    const headOid = pr.headOid || pr.commitOids[pr.commitOids.length - 1] || "";
    if (!headOid) return { ...base, diverged: true };
    if (branch.oid === headOid) return { ...base, ahead: 0, behind: 0, exact: true };
    const counts = await countAheadBehind(clone.folder, branch.oid, headOid);
    if (counts) return { ...base, ...counts, exact: true };
    const index = pr.commitOids.indexOf(branch.oid);
    if (index >= 0) return { ...base, ahead: 0, behind: pr.commitOids.length - 1 - index, exact: false };
    return { ...base, diverged: true };
  };

  const mapLimited = async (items, limit, mapper) => {
    const results = new Array(items.length);
    let next = 0;
    const worker = async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await mapper(items[index]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
  };

  const summarizeClone = (folder, clone) =>
    clone.ok
      ? { path: folder, ok: true, branchCount: clone.branches.length, worktreeCount: clone.worktrees.length }
      : { path: folder, ok: false, error: clone.error };

  // localRepos: repo => folder. prs: [{ key, repo, number, branch, headOid,
  // crossRepository, commitOids }]. => { repos: repo => summary, prs: key
  // => local branch }.
  const getLocalBranches = async ({ localRepos, prs }) => {
    const repos = Object.keys(localRepos || {});
    const clones = Object.fromEntries(
      await Promise.all(repos.map(async (repo) => [repo, await getClone(repo, localRepos[repo])])),
    );
    const wanted = (prs || []).filter((pr) => clones[pr.repo]?.ok);
    const described = await mapLimited(wanted, concurrency, (pr) => describePr(clones[pr.repo], pr));
    const byKey = {};
    wanted.forEach((pr, index) => {
      if (described[index]) byKey[pr.key] = described[index];
    });
    return {
      repos: Object.fromEntries(repos.map((repo) => [repo, summarizeClone(localRepos[repo], clones[repo])])),
      prs: byKey,
    };
  };

  // Whether a folder is one the page may open for the repo: its clone's
  // own, or one of its worktrees - never any other path.
  const isOpenableFolder = async (repo, cloneFolder, folder) => {
    if (!cloneFolder || !folder) return false;
    const asked = realFolder(fs, folder);
    if (sameFolder(realFolder(fs, cloneFolder), asked)) return true;
    const clone = await getClone(repo, cloneFolder);
    return Boolean(clone.ok && clone.worktrees.some((worktree) => sameFolder(realFolder(fs, worktree.path), asked)));
  };

  // For saving a folder: the same checks, read afresh.
  const checkClone = async (repo, folder) => {
    forgetClone(repo);
    const clone = await getClone(repo, folder);
    return summarizeClone(folder, clone);
  };

  // Clones in a folder, for Settings › Local clones' Find: the folder
  // itself and the folders up to three levels down (worktrees kept beside
  // a main folder, grouped by owner: <folder>/<owner>/<repo>/main) - not
  // inside a clone, a hidden folder or node_modules, and at most
  // maxFolders looked in. A
  // clone is a folder with a .git folder; one whose .git is a file is a
  // worktree, whose clone is found too - except a folder named main, which
  // in the common bare-repo layout (a .bare folder with a main worktree
  // beside the others) is where the clone is used from. Each is
  // offered for the repos in `repos` one of its remotes is.
  // => { ok, found: [{ repo, path }] } - per repo, a folder named main
  // first, then by path - or { ok: false, error }.
  const SKIPPED_FOLDERS = new Set(["node_modules", "vendor", "dist", "build", "coverage"]);
  const findClones = async ({ folder, repos, maxDepth = 3, maxFolders = 2000 }) => {
    try {
      if (!fs.statSync(folder).isDirectory()) return { ok: false, error: `Not a folder: ${folder}` };
    } catch (_error) {
      return { ok: false, error: `No such folder: ${folder}` };
    }
    const wanted = new Map((repos || []).map((repo) => [String(repo).toLowerCase(), String(repo)]));
    const clones = [];
    let looked = 0;
    const gitKind = (dir) => {
      try {
        const stats = fs.statSync(path.join(dir, ".git"));
        return stats.isDirectory() ? "folder" : "file";
      } catch (_error) {
        return "";
      }
    };
    const walk = (dir, depth) => {
      if (looked >= maxFolders) return;
      looked += 1;
      const kind = gitKind(dir);
      if (kind === "folder" || (kind === "file" && path.basename(dir) === "main")) {
        clones.push(dir);
        return;
      }
      if (kind === "file" || depth >= maxDepth) return;
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch (_error) {
        return;
      }
      entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && !SKIPPED_FOLDERS.has(entry.name))
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((entry) => walk(path.join(dir, entry.name), depth + 1));
    };
    walk(folder, 0);

    const remotesOf = async (clone) => {
      try {
        return parseConfig(await git(clone, ["config", "-z", "--get-regexp", "^remote\\..*\\.url$"])).remotes;
      } catch (_error) {
        return [];
      }
    };
    const remotes = await mapLimited(clones, concurrency, remotesOf);
    const found = [];
    clones.forEach((clone, index) => {
      const matched = new Set();
      remotes[index].forEach((remote) => {
        const repo = wanted.get(remote.repo.toLowerCase());
        if (repo && !matched.has(repo)) {
          matched.add(repo);
          found.push({ repo, path: clone });
        }
      });
    });
    const isMain = (item) => (path.basename(item.path) === "main" ? 0 : 1);
    found.sort((a, b) => a.repo.localeCompare(b.repo) || isMain(a) - isMain(b) || a.path.localeCompare(b.path));
    return { ok: true, found, ...(looked >= maxFolders ? { truncated: true } : {}) };
  };

  // The clone read afresh, for a checkout (view-prs-local-checkout.js).
  const readCloneFresh = (repo, folder) => {
    forgetClone(repo);
    return getClone(repo, folder);
  };

  return { getLocalBranches, isOpenableFolder, checkClone, forgetClone, findClones, readCloneFresh, findPrBranch: findBranch };
};

module.exports = { createViewPrsLocalBranches, repoFromRemoteUrl, parseWorktrees, parseBranches, parseConfig, describeGitFailure };
