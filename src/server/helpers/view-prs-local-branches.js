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

// git worktree list --porcelain: blank-line separated blocks, the main
// worktree (or the bare repo) first.
const parseWorktrees = (stdout) =>
  String(stdout || "")
    .split(/\r?\n\r?\n/)
    .map((block, index) => {
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
        ...(index === 0 ? { main: true } : {}),
        ...(value("locked") !== null ? { locked: true } : {}),
      };
    })
    .filter(Boolean);

// for-each-ref, one branch a line: refname, oid, then (when asked for) its
// newest commit's time (unix seconds) and subject; with its upstream from
// the config.
const parseBranches = (stdout, upstreams = new Map()) =>
  String(stdout || "")
    .split(/\r?\n/)
    .map((line) => line.split(FIELD))
    .filter(([ref, oid]) => ref && ref.startsWith("refs/heads/") && oid)
    .map(([ref, oid, time, ...subject]) => {
      const name = ref.slice("refs/heads/".length);
      const upstream = upstreams.get(name) || { remote: "", remoteRef: "" };
      const seconds = Number(time);
      return {
        name,
        oid,
        remote: upstream.remote,
        remoteRef: upstream.remoteRef,
        ...(Number.isFinite(seconds) && seconds > 0 ? { committedAt: new Date(seconds * 1000).toISOString() } : {}),
        ...(subject.length > 0 && subject.join(FIELD) ? { subject: subject.join(FIELD) } : {}),
      };
    });

// The repo's default branch, from what the clone's copy of a repo remote's
// HEAD points to (refs/remotes/origin/HEAD -> refs/remotes/origin/main, as
// git clone sets it): remote refs' lines are refname, oid, symref target.
// Else main or master, whichever the clone has, else "".
const findDefaultBranch = (remoteRefsStdout, repoRemotes, branches = []) => {
  const lines = String(remoteRefsStdout || "")
    .split(/\r?\n/)
    .map((line) => line.split(FIELD));
  for (const remote of repoRemotes) {
    const head = lines.find(([ref]) => ref === `refs/remotes/${remote}/HEAD`);
    const target = head?.[2] || "";
    const prefix = `refs/remotes/${remote}/`;
    if (target.startsWith(prefix)) return target.slice(prefix.length);
  }
  const has = (name) =>
    branches.some((branch) => branch.name === name) ||
    lines.some(([ref]) => repoRemotes.some((remote) => ref === `refs/remotes/${remote}/${name}`));
  return ["main", "master"].find(has) || "";
};

// git status --porcelain=v1 -z: "XY path" entries, NUL-separated - X the
// index (staged), Y the folder; a rename or copy is followed by its old
// path. => { staged, changed, untracked, conflicted, total, files: [{ path,
// code }] } - a file staged and changed again counts as both; at most
// maxFiles listed, all counted. Ignored files aren't asked for.
const CONFLICT_CODES = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);
const parseStatus = (stdout, maxFiles = 50) => {
  const entries = String(stdout || "").split("\0");
  const result = { staged: 0, changed: 0, untracked: 0, conflicted: 0, total: 0, files: [] };
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry.length < 4 || entry[2] !== " ") continue;
    const code = entry.slice(0, 2);
    const file = entry.slice(3);
    // A rename or copy's old path comes next, as an entry of its own.
    if (/[RC]/.test(code)) index += 1;
    if (code === "!!") continue;
    if (code === "??") result.untracked += 1;
    else if (CONFLICT_CODES.has(code)) result.conflicted += 1;
    else {
      if (code[0] !== " ") result.staged += 1;
      if (code[1] !== " ") result.changed += 1;
    }
    result.total += 1;
    if (result.files.length < maxFiles) result.files.push({ path: file, code });
  }
  return result;
};

// for-each-ref's remote-tracking refs: refname => oid - each
// remote branch as the clone last fetched or pushed it.
const parseRemoteRefs = (stdout) =>
  new Map(
    String(stdout || "")
      .split(/\r?\n/)
      .map((line) => line.split(FIELD))
      .filter(([ref, oid]) => ref && ref.startsWith("refs/remotes/") && oid),
  );

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

// A fork's PR: its branch isn't on the repo's remotes - from another repo,
// or from a branch named as its base (a fork's main into main). Its local
// branch tracks its pull ref instead. The one rule for it (the rows, Check
// out, and what the pane's told).
const isForkPr = (pr) => Boolean(pr.crossRepository) || (Boolean(pr.targetBranch) && pr.branch === pr.targetBranch);

const createViewPrsLocalBranches = ({
  runCommand,
  fs,
  timeoutMs = 15000,
  // git status reads every file's details: slower than the rest in a large
  // worktree, the first time especially.
  statusTimeoutMs = 45000,
  cacheMs = 10000,
  // How many ahead/behind counts run at once.
  concurrency = 4,
  now = () => Date.now(),
}) => {
  const git = async (folder, args, timeout = timeoutMs) => {
    const result = await runCommand("git", ["-C", folder, ...args], 8 * 1024 * 1024, { timeoutMs: timeout });
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
    let remoteRefs;
    let worktreeList;
    let config;
    try {
      [refs, remoteRefs, worktreeList, config] = await Promise.all([
        git(folder, ["for-each-ref", `--format=%(refname)${FIELD}%(objectname)${FIELD}%(committerdate:unix)${FIELD}%(contents:subject)`, "refs/heads"]),
        // The remote branches as the clone has them, for what's not pushed
        // only - a call of its own, as a repo with very many could fail it
        // (too much output): then nothing else fails, and what's not pushed
        // is told from the PR alone.
        git(folder, ["for-each-ref", `--format=%(refname)${FIELD}%(objectname)${FIELD}%(symref)`, "refs/remotes"]).catch(() => ""),
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
      remoteRefs: parseRemoteRefs(remoteRefs),
      defaultBranch: findDefaultBranch(remoteRefs, repoRemotes, parseBranches(refs)),
      worktrees: parseWorktrees(worktreeList)
        .filter((worktree) => !worktree.bare)
        .map((worktree) => (worktree.branch ? worktree : withRebasedBranch(worktree))),
    };
  };

  // A worktree mid-rebase (stopped on a conflict, or at an edit) is listed
  // as detached, though its branch is still in use there - git won't check
  // it out elsewhere. The branch is in the rebase's head-name, in the
  // worktree's own git folder (.git, or the folder a linked worktree's .git
  // file names): { ...worktree, branch, rebasing: true }, else as it was.
  const withRebasedBranch = (worktree) => {
    try {
      const dotGit = path.join(worktree.path, ".git");
      let gitDir = dotGit;
      if (!fs.statSync(dotGit).isDirectory()) {
        const named = String(fs.readFileSync(dotGit, "utf8")).match(/^gitdir:\s*(.+?)\s*$/m);
        if (!named) return worktree;
        gitDir = path.resolve(worktree.path, named[1]);
      }
      for (const folder of ["rebase-merge", "rebase-apply"]) {
        let headName = "";
        try {
          headName = String(fs.readFileSync(path.join(gitDir, folder, "head-name"), "utf8")).trim();
        } catch (_error) {
          continue;
        }
        if (headName.startsWith("refs/heads/")) return { ...worktree, branch: headName.slice("refs/heads/".length), rebasing: true };
      }
    } catch (_error) {
      // Its folder gone, or unreadable: detached, as listed.
    }
    return worktree;
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
    const isFork = isForkPr(pr);
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

  // The local commits GitHub doesn't have, as far as the clone can tell:
  // those in neither the PR's newest commit (as the dashboard last fetched
  // it - given only when it's in the clone) nor the clone's copy of the
  // remote branch the local one tracks (as old as its last fetch or push -
  // so a push from here counts at once, before the dashboard sees it).
  // Never changes for the same commits: kept, as the counts are. null when
  // git can't say.
  const countUnpushed = async (folder, localOid, excluded) => {
    const key = `unpushed\n${folder}\n${localOid}\n${excluded.join(" ")}`;
    if (countCache.has(key)) return countCache.get(key);
    const count = git(folder, ["rev-list", "--count", localOid, "--not", ...excluded]).then(
      (stdout) => {
        const value = Number(stdout.trim());
        return Number.isInteger(value) ? value : null;
      },
      () => null,
    );
    if (countCache.size >= MAX_COUNTS) countCache.delete(countCache.keys().next().value);
    countCache.set(key, count);
    count.then((result) => {
      if (result === null && countCache.get(key) === count) countCache.delete(key);
    });
    return count;
  };

  // The commit of the clone's copy of the remote branch a local branch
  // tracks (refs/remotes/<remote>/<branch>, as git's default fetch maps
  // it), else "" - none for a pull ref, which no fetch maps.
  const trackedOid = (clone, branch) => {
    if (!branch.remote || !branch.remoteRef.startsWith("refs/heads/")) return "";
    return clone.remoteRefs.get(`refs/remotes/${branch.remote}/${branch.remoteRef.slice("refs/heads/".length)}`) || "";
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
      ...(worktree?.rebasing ? { rebasing: true } : {}),
      // Found by its name alone, tracking nothing: perhaps not the PR's.
      ...(branch.remote ? {} : { nameOnly: true }),
    };
    const headOid = pr.headOid || pr.commitOids[pr.commitOids.length - 1] || "";
    // Not pushed: for a branch tracking the PR's (not one found by its name
    // alone, which may not be the PR's at all). Its commits on the PR, or
    // on the clone's copy of the remote branch, are pushed.
    const tracked = branch.remote ? trackedOid(clone, branch) : "";
    const unpushedPast = async (excluded) => {
      if (!branch.remote) return {};
      const list = excluded.filter(Boolean);
      if (list.length === 0) return {};
      const unpushed = await countUnpushed(clone.folder, branch.oid, list);
      return unpushed === null ? {} : { unpushed };
    };
    if (!headOid) return { ...base, diverged: true, ...(await unpushedPast([tracked])) };
    if (branch.oid === headOid) return { ...base, ahead: 0, behind: 0, exact: true, ...(branch.remote ? { unpushed: 0 } : {}) };
    const counts = await countAheadBehind(clone.folder, branch.oid, headOid);
    if (counts) {
      if (counts.ahead === 0) return { ...base, ...counts, exact: true, ...(branch.remote ? { unpushed: 0 } : {}) };
      return { ...base, ...counts, exact: true, ...(await unpushedPast([headOid, tracked])) };
    }
    const index = pr.commitOids.indexOf(branch.oid);
    // One of the PR's commits: on GitHub.
    if (index >= 0) return { ...base, ahead: 0, behind: pr.commitOids.length - 1 - index, exact: false, ...(branch.remote ? { unpushed: 0 } : {}) };
    // The PR's newest isn't in the clone: only the clone's copy of the remote
    // branch can say.
    return { ...base, diverged: true, ...(await unpushedPast([tracked])) };
  };

  // The commit a base branch is at, as the clone has it: the clone's copy
  // of it on one of the repo's remotes (as new as its last fetch, and what
  // a PR would be compared with), else the local branch of that name. ""
  // when the clone has neither.
  const baseOid = (clone, name) => {
    if (!name) return "";
    for (const remote of clone.repoRemotes) {
      const oid = clone.remoteRefs.get(`refs/remotes/${remote}/${name}`);
      if (oid) return oid;
    }
    return clone.branches.find((branch) => branch.name === name)?.oid || "";
  };

  // The local commits on none of the repo's remote branches (as the clone
  // last fetched or pushed them): what isn't on GitHub. null when git
  // can't say. Not kept by commit, as a fetch or push changes it.
  const countNotOnRemotes = async (clone, oid) => {
    if (clone.repoRemotes.length === 0) return null;
    try {
      const stdout = await git(clone.folder, ["rev-list", "--count", oid, "--not", ...clone.repoRemotes.map((remote) => `--remotes=${remote}`)]);
      const value = Number(stdout.trim());
      return Number.isInteger(value) ? value : null;
    } catch (_error) {
      return null;
    }
  };

  // A tracked branch (no PR) as the clone has it: { found: false } when the
  // clone has no local branch of that name, else { found: true, branch,
  // oid, committedAt?, subject?, worktreePath?, rebasing?, upstream?,
  // pushed, unpushed?, base, baseAhead?, baseBehind? }:
  // - upstream: { remote, branch, ahead?, behind?, gone? } - the remote
  //   branch it tracks, ahead/behind the clone's copy of it (as of its
  //   last fetch); gone when the clone has no copy (deleted on GitHub and
  //   pruned, or never fetched).
  // - pushed: its newest commit is on one of the repo's remote branches.
  // - unpushed: its commits on none of them.
  // - base: what it's compared with - the entry's own base, else the
  //   repo's default branch ("" when that can't be told); baseAhead and
  //   baseBehind against the clone's copy of it.
  const describeBranch = async (clone, { branch: name, base: chosenBase }) => {
    const branch = clone.branches.find((item) => item.name === name);
    if (!branch) return { found: false };
    const worktree = clone.worktrees.find((item) => item.branch === branch.name);
    const result = {
      found: true,
      branch: branch.name,
      oid: branch.oid,
      ...(branch.committedAt ? { committedAt: branch.committedAt } : {}),
      ...(branch.subject ? { subject: branch.subject } : {}),
      ...(worktree ? { worktreePath: worktree.path } : {}),
      ...(worktree?.rebasing ? { rebasing: true } : {}),
    };
    if (branch.remote && branch.remoteRef.startsWith("refs/heads/")) {
      const upstream = { remote: branch.remote, branch: branch.remoteRef.slice("refs/heads/".length) };
      const upstreamOid = trackedOid(clone, branch);
      if (!upstreamOid) upstream.gone = true;
      else {
        const counts = branch.oid === upstreamOid ? { ahead: 0, behind: 0 } : await countAheadBehind(clone.folder, branch.oid, upstreamOid);
        if (counts) Object.assign(upstream, counts);
      }
      result.upstream = upstream;
    }
    const unpushed = await countNotOnRemotes(clone, branch.oid);
    result.pushed = unpushed === 0;
    if (unpushed !== null) result.unpushed = unpushed;
    const base = chosenBase || clone.defaultBranch || "";
    result.base = base;
    const onBase = base && base !== branch.name ? baseOid(clone, base) : "";
    if (onBase) {
      const counts = onBase === branch.oid ? { ahead: 0, behind: 0 } : await countAheadBehind(clone.folder, branch.oid, onBase);
      if (counts) {
        result.baseAhead = counts.ahead;
        result.baseBehind = counts.behind;
      }
    } else if (base && base !== branch.name) {
      result.baseMissing = true;
    }
    return result;
  };

  // The local branches that could be tracked, newest commit first: those
  // no PR's branch is (findBranch, for each PR of the repo), not a PR's
  // base, not the repo's default branch and not tracked already - { name,
  // oid, committedAt?, subject?, worktreePath?, upstream? (the remote
  // branch it tracks) }.
  const listBranchCandidates = (clone, { prs = [], tracked = [] } = {}) => {
    const excluded = new Set(tracked);
    if (clone.defaultBranch) excluded.add(clone.defaultBranch);
    prs.forEach((pr) => {
      if (pr.targetBranch) excluded.add(pr.targetBranch);
      const branch = findBranch(clone, pr);
      if (branch) excluded.add(branch.name);
    });
    return clone.branches
      .filter((branch) => !excluded.has(branch.name))
      .map((branch) => {
        const worktree = clone.worktrees.find((item) => item.branch === branch.name);
        return {
          name: branch.name,
          oid: branch.oid,
          ...(branch.committedAt ? { committedAt: branch.committedAt } : {}),
          ...(branch.subject ? { subject: branch.subject } : {}),
          ...(worktree ? { worktreePath: worktree.path } : {}),
          ...(branch.remote && branch.remoteRef.startsWith("refs/heads/")
            ? { upstream: `${branch.remote}/${branch.remoteRef.slice("refs/heads/".length)}` }
            : {}),
        };
      })
      .sort((a, b) => String(b.committedAt || "").localeCompare(String(a.committedAt || "")) || a.name.localeCompare(b.name));
  };

  // A PR's local branch is a tracked branch's, so its PR has opened: the
  // PR (from prs) whose branch findBranch says the local branch named
  // `name` is, open ones first; else null.
  const findPrOfBranch = (clone, name, prs = []) => {
    const matches = prs.filter((pr) => findBranch(clone, pr)?.name === name);
    return matches.find((pr) => !pr.done) || matches[0] || null;
  };

  // localRepos: repo => folder. branches: [{ repo, branch, base? }]; prs as
  // getLocalBranches'. => { key (repo:branch) => describeBranch's, with pr:
  // { number, done } once a PR is the branch's } - nothing for a repo with
  // no readable clone (the page says it isn't on this computer).
  const getTrackedBranches = async ({ localRepos, branches, prs = [] }) => {
    const wanted = (branches || []).filter((entry) => localRepos?.[entry.repo]);
    const clones = Object.fromEntries(
      await Promise.all(
        [...new Set(wanted.map((entry) => entry.repo))].map(async (repo) => [repo, await getClone(repo, localRepos[repo])]),
      ),
    );
    const readable = wanted.filter((entry) => clones[entry.repo]?.ok);
    const described = await mapLimited(readable, concurrency, async (entry) => {
      const clone = clones[entry.repo];
      const status = await describeBranch(clone, entry);
      if (!status.found) return status;
      const pr = findPrOfBranch(clone, entry.branch, prs.filter((item) => item.repo === entry.repo));
      return pr ? { ...status, pr: { number: pr.number, done: Boolean(pr.done) } } : status;
    });
    return Object.fromEntries(readable.map((entry, index) => [`${entry.repo}:${entry.branch}`, described[index]]));
  };

  // The branches a clone could track (Track a branch): { ok, branches,
  // defaultBranch } - or { ok: false, error }.
  const getBranchCandidates = async ({ repo, folder, prs = [], tracked = [] }) => {
    const clone = await getClone(repo, folder);
    if (!clone.ok) return { ok: false, error: clone.error };
    return { ok: true, defaultBranch: clone.defaultBranch, branches: listBranchCandidates(clone, { prs, tracked }) };
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

  // The uncommitted changes in the worktree the PR's local branch is checked
  // out in (the pane's, one PR at a time: a git status is too slow for every
  // row): { worktreePath, staged, changed, untracked, conflicted, total,
  // files } - or { worktreePath, error } when git can't read it (its folder
  // deleted without git worktree remove); null with no worktree for it, or
  // no readable clone. The worktree is the clone's own, found by git, never
  // a folder the page names. No optional locks: a status run alongside the
  // user's own git (an editor's, a commit) doesn't take index.lock, so never
  // makes theirs fail.
  const getWorktreeChanges = async ({ repo, folder, pr }) => {
    const clone = await getClone(repo, folder);
    if (!clone.ok) return null;
    const branch = findBranch(clone, pr);
    const worktree = branch && clone.worktrees.find((item) => item.branch === branch.name);
    if (!worktree) return null;
    return worktreeStatus(worktree);
  };

  // The same for tracked branches (no PR), the worktree each local branch
  // is checked out in: { key (repo:branch) => changes } - only those
  // checked out, a few at a time. localRepos: repo => folder; branches:
  // [{ repo, branch }].
  const getTrackedBranchChanges = async ({ localRepos, branches }) => {
    const found = [];
    for (const entry of branches || []) {
      const folder = localRepos?.[entry.repo];
      if (!folder) continue;
      const clone = await getClone(entry.repo, folder);
      const worktree = clone.ok && clone.worktrees.find((item) => item.branch === entry.branch);
      if (worktree) found.push({ key: `${entry.repo}:${entry.branch}`, worktree });
    }
    const changes = await mapLimited(found, concurrency, ({ worktree }) => worktreeStatus(worktree));
    return Object.fromEntries(found.map((item, index) => [item.key, changes[index]]));
  };

  const worktreeStatus = async (worktree) => {
    if (!fs.existsSync(worktree.path)) {
      return { worktreePath: worktree.path, error: "Its folder is gone (deleted without git worktree remove; git worktree prune forgets it)" };
    }
    // One at a time per worktree: asks while one runs (the pane's minute
    // and a focus at once, other tabs) share it, so a slow status never
    // piles up.
    const running = statusRuns.get(worktree.path);
    if (running) return running;
    const run = (async () => {
      try {
        const stdout = await git(worktree.path, ["--no-optional-locks", "status", "--porcelain=v1", "-z", "--untracked-files=normal"], statusTimeoutMs);
        return { worktreePath: worktree.path, ...parseStatus(stdout) };
      } catch (failure) {
        const message = String(failure?.message || failure?.error?.message || "");
        const error = /timed out/i.test(message)
          ? `git status took over ${Math.round(statusTimeoutMs / 1000)}s (a very large worktree, or one on a slow drive)`
          : describeGitFailure(failure);
        return { worktreePath: worktree.path, error };
      } finally {
        statusRuns.delete(worktree.path);
      }
    })();
    statusRuns.set(worktree.path, run);
    return run;
  };
  const statusRuns = new Map();

  // The clone's worktree at folder, however it's written, else null.
  const worktreeAt = (clone, folder) => {
    const asked = realFolder(fs, folder);
    return clone.worktrees.find((worktree) => sameFolder(realFolder(fs, worktree.path), asked)) || null;
  };
  // Whether folder is the clone's own (the folder its settings name).
  const isCloneFolder = (clone, folder) => sameFolder(realFolder(fs, clone.folder), realFolder(fs, folder));

  return {
    getLocalBranches,
    getWorktreeChanges,
    getTrackedBranches,
    getTrackedBranchChanges,
    getBranchCandidates,
    describeBranch,
    isOpenableFolder,
    checkClone,
    forgetClone,
    findClones,
    readCloneFresh,
    findPrBranch: findBranch,
    describePrBranch: describePr,
    worktreeAt,
    isCloneFolder,
  };
};

module.exports = {
  createViewPrsLocalBranches,
  isForkPr,
  repoFromRemoteUrl,
  parseWorktrees,
  parseBranches,
  findDefaultBranch,
  parseConfig,
  parseStatus,
  describeGitFailure,
};
