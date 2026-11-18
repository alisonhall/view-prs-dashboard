// The pane's Check out (POST /local-branches/checkout): a worktree for a
// PR's branch, so it can be opened in the editor - made as each repo's
// checkout settings say (Settings › Local clones), nothing assumed about
// the user's own tools:
//
// - By default, plain git: the PR's branch fetched from the repo's remote
//   into a branch of the same name tracking it, in a worktree at the
//   repo's worktree folder (beside the clone, unless set). A fork's PR has
//   no branch on the repo's remotes: its pull ref is fetched into a branch
//   pr-<number> tracking it, as gh pr checkout does (so the rows find it).
//   A local branch the clone already has for the PR is checked out as it
//   is. Then the repo's after-command, if it has one, in the new worktree.
// - With the repo's checkout command: that, run in an interactive shell in
//   the clone's folder (so the user's rc file's aliases, functions and
//   settings apply, as in a terminal) - for a fork's PR only if the
//   settings say so. It has to leave a worktree of the clone with a branch
//   tracking the PR's branch (or pull ref) on the repo's remote, which the
//   dashboard then finds as it finds any.
//
// Each command is given the PR as VIEW_PRS_* variables (and the repo's own
// variables from its settings); {name} in a command is that variable,
// quoted.

const crypto = require("crypto");
const os = require("os");
const path = require("path");
const { isForkPr, parseStatus } = require("./view-prs-local-branches");

const MAX_OUTPUT = 4000;

const toPosix = (value) => String(value || "").replace(/\\/g, "/");

// A branch's folder name: / as _, and nothing Windows refuses.
const folderNameFor = (branch) => branch.replace(/[/\\]/g, "_").replace(/[<>:"|?*]/g, "_");

// The placeholders a command can use, and the variables they stand for.
const PLACEHOLDERS = {
  branch: "VIEW_PRS_BRANCH",
  number: "VIEW_PRS_NUMBER",
  repo: "VIEW_PRS_REPO",
  remote: "VIEW_PRS_REMOTE",
  ref: "VIEW_PRS_REF",
  clone: "VIEW_PRS_CLONE",
  local: "VIEW_PRS_LOCAL_BRANCH",
  worktree: "VIEW_PRS_WORKTREE",
};

// {branch} and the like as the quoted variable - so a branch name is never
// read as shell. Other braces are left as they are.
const expandPlaceholders = (command) =>
  String(command).replace(/\{([a-z]+)\}/g, (whole, name) => (PLACEHOLDERS[name] ? `"$${PLACEHOLDERS[name]}"` : whole));

// The worktree folder pattern's {branch} and {clone} (the clone folder's
// name), relative to the clone's folder unless absolute; ~ is the home
// folder, as in a terminal (and Settings' other folder fields).
const DEFAULT_WORKTREE_FOLDER = "../{clone}-{branch}";
const worktreeFolderFor = (pattern, cloneFolder, localBranch, homeDir = os.homedir()) => {
  const relative = String(pattern || DEFAULT_WORKTREE_FOLDER)
    .replace(/\{branch\}/g, folderNameFor(localBranch))
    .replace(/\{clone\}/g, path.basename(cloneFolder))
    .replace(/^~(?=$|[\\/])/, homeDir);
  return path.resolve(cloneFolder, relative);
};

// Whether folder is the clone's folder or inside it.
const isInside = (folder, parent) => {
  const relative = path.relative(parent, folder);
  return !relative || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

// What a run printed after its marker line: the shell's startup (the
// user's rc file's greeting, say) prints before it. markers: the last
// first - the one printed once the shell is in the command's folder, so a
// cd hook's chatter (nvm's "Now using node" or "Reverting to nvm default
// version") is left out too - then the one printed once the shell has
// started, for a cd that failed. All of it when none came - the shell
// stopped while starting, which is what to show then.
const afterMarker = (text, markers) => {
  if (text === undefined || text === null) return text;
  const value = String(text);
  for (const marker of [].concat(markers)) {
    const at = value.indexOf(marker);
    if (at >= 0) return value.slice(at + marker.length).replace(/^\r?\n/, "");
  }
  return value;
};

// An interactive shell's complaint about having no terminal, or the
// "exit" it prints when a command exits it - not the command's.
const isShellNoise = (line) => /no job control|cannot set terminal process group|inappropriate ioctl|^\s*exit\s*$/i.test(line);

// What a command printed, the end of it if long.
const outputOf = (result) => {
  const text = [result?.stdout, result?.stderr]
    .map((part) =>
      String(part || "")
        .split(/\r?\n/)
        .filter((line) => !isShellNoise(line))
        .join("\n")
        .trim(),
    )
    .filter(Boolean)
    .join("\n");
  return text.length > MAX_OUTPUT ? `…${text.slice(-MAX_OUTPUT)}` : text;
};

// The line that says what went wrong: the last of the command's own.
const reasonOf = (failure) => {
  const lines = [failure?.stderr, failure?.stdout]
    .map((part) => String(part || ""))
    .join("\n")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !isShellNoise(line));
  const fatal = lines.find((line) => /^(fatal|error):/i.test(line));
  return (fatal || lines[lines.length - 1] || failure?.error?.message || failure?.message || "it failed").replace(/^(fatal|error):\s*/i, "");
};

// How Check out makes a PR's worktree: "command" (the repo's checkout
// command) unless the clone has a local branch for the PR already (git
// checks it out as it is), or it's a fork's PR the command isn't for, or
// there's no command - then "git". The one place this is decided: the pane
// is told it (GET /local-branches' plans).
const planCheckout = ({ existing, isFork, settings }) =>
  Boolean(settings?.command) && !existing && (!isFork || settings.forks === true) ? "command" : "git";

// The command a shell line runs first, to check it's known: past any
// NAME=value words before it (a value may be quoted or a $(...)), or ""
// when it can't be told without running the line (it's itself a variable
// or a substitution).
const commandNameOf = (line) => {
  const text = String(line || "");
  let index = 0;
  const readWord = () => {
    let word = "";
    let depth = 0;
    let quote = "";
    while (index < text.length) {
      const char = text[index];
      if (quote) {
        if (char === "\\" && quote === '"') {
          word += char + (text[index + 1] || "");
          index += 2;
          continue;
        }
        if (char === quote) quote = "";
        word += char;
      } else if (char === "\\") {
        word += char + (text[index + 1] || "");
        index += 2;
        continue;
      } else if (char === "'" || char === '"') {
        quote = char;
        word += char;
      } else if (char === "(" && text[index - 1] === "$") {
        depth += 1;
        word += char;
      } else if (char === ")" && depth > 0) {
        depth -= 1;
        word += char;
      } else if (depth === 0 && /[\s;&|<>()]/.test(char)) {
        break;
      } else {
        word += char;
      }
      index += 1;
    }
    return word;
  };
  for (;;) {
    while (index < text.length && /\s/.test(text[index])) index += 1;
    if (index >= text.length) return "";
    const word = readWord();
    if (!word) return "";
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(word)) continue;
    return /^[A-Za-z0-9_./:+@%~-]+$/.test(word) ? word : "";
  }
};

const checkoutError = (message, { status = 422, output = "" } = {}) => Object.assign(new Error(message), { status, output });

const createViewPrsLocalCheckout = ({
  runCommand,
  fs,
  localBranches,
  platform = process.platform,
  env = process.env,
  // A fetch, and the user's command (which may install or link), can take
  // a while.
  timeoutMs = 180000,
  homeDir = () => os.homedir(),
}) => {
  const run = (command, args, options = {}) => runCommand(command, args, 8 * 1024 * 1024, { timeoutMs, ...options });
  const git = async (folder, args) => String((await run("git", ["-C", folder, ...args]))?.stdout || "");
  // One checkout, fetch or pull at a time per clone.
  const busyMessage = (repo) => `A checkout, fetch or pull in ${repo}'s clone is already running`;

  // bash on Windows: Git Bash - found from git's own folder, never
  // Windows' bash.exe (WSL's), which can't run Windows' git.
  let bashFound = null;
  const findGitBash = async () => {
    if (bashFound) return bashFound;
    const candidates = [];
    try {
      const execPath = String((await run("git", ["--exec-path"]))?.stdout || "").trim();
      // <Git>/mingw64/libexec/git-core
      if (execPath) {
        const gitRoot = path.win32.resolve(execPath, "..", "..", "..");
        candidates.push(path.win32.join(gitRoot, "bin", "bash.exe"), path.win32.join(gitRoot, "usr", "bin", "bash.exe"));
      }
    } catch (_error) {
      // The usual places, then.
    }
    [env.ProgramFiles, env["ProgramFiles(x86)"], env.LOCALAPPDATA && path.win32.join(env.LOCALAPPDATA, "Programs")]
      .filter(Boolean)
      .forEach((folder) => candidates.push(path.win32.join(folder, "Git", "bin", "bash.exe")));
    bashFound = candidates.find((candidate) => fs.existsSync(candidate)) || null;
    if (!bashFound) throw checkoutError("Git Bash wasn't found - the repo's commands run in it on Windows", { status: 502 });
    return bashFound;
  };

  // The shell the user's commands are defined in: theirs (bash, zsh or
  // ksh), else bash; Git Bash on Windows.
  const userShell = async () => {
    if (platform === "win32") return findGitBash();
    const shell = String(env.SHELL || "");
    return ["bash", "zsh", "ksh"].includes(path.basename(shell)) ? shell : "/bin/bash";
  };

  // Runs one of the repo's commands in an interactive shell (so the rc
  // file that defines it is read), in folder, with the variables. Once
  // the shell has started it prints a marker line, new each run, to
  // stdout and stderr, and another once it's in the folder (a cd hook -
  // nvm's, say - prints as it changes folder); what came before the last
  // that came is dropped from both - whatever the rc file and the cd
  // printed - on success and failure alike.
  const runUserCommand = async (command, folder, variables) => {
    const id = crypto.randomBytes(8).toString("hex");
    const markers = [`@@view-prs-${id}-in@@`, `@@view-prs-${id}@@`];
    const fromMarker = (result) => {
      if (!result || typeof result !== "object") return result;
      if ("stdout" in result) result.stdout = afterMarker(result.stdout, markers);
      if ("stderr" in result) result.stderr = afterMarker(result.stderr, markers);
      return result;
    };
    // printf puts the markers together, so the script never holds one
    // whole: an rc file's set -x or set -v echoes the script's lines to
    // stderr.
    const mark = (suffix) => `printf '@@view-prs-%s@@\\n' ${id}${suffix}; printf '@@view-prs-%s@@\\n' ${id}${suffix} >&2`;
    const script = `exec </dev/null\n${mark("")}\ncd -- "$VIEW_PRS_FOLDER" || exit 1\n${mark("-in")}\n${expandPlaceholders(command)}`;
    let result;
    try {
      result = await run(await userShell(), ["-ic", script], { env: { ...variables, VIEW_PRS_FOLDER: toPosix(folder) } });
    } catch (failure) {
      throw fromMarker(failure);
    }
    return fromMarker(result && typeof result === "object" ? { ...result } : result);
  };

  const worktreeOf = (clone, branchName) => clone.worktrees.find((worktree) => worktree.branch === branchName);

  // Plain git: a worktree at folder for the PR's local branch - the one
  // the clone has, else the PR's branch fetched into one tracking it.
  const addWithGit = async ({ clone, existing, name, remote, remoteRef, folder }) => {
    if (fs.existsSync(folder)) throw checkoutError(`${folder} already exists`);
    if (existing) {
      await git(clone.folder, ["worktree", "add", folder, existing.name]);
      return;
    }
    if (clone.branches.some((branch) => branch.name === name)) {
      throw checkoutError(`The clone already has a branch named ${name}, tracking something else`);
    }
    // Just the PR's branch (or pull ref), not the whole remote.
    await git(clone.folder, ["fetch", "--no-tags", remote, remoteRef]);
    const oid = (await git(clone.folder, ["rev-parse", "FETCH_HEAD"])).trim();
    await git(clone.folder, ["worktree", "add", "--no-track", "-b", name, folder, oid]);
    await git(clone.folder, ["config", `branch.${name}.remote`, remote]);
    await git(clone.folder, ["config", `branch.${name}.merge`, remoteRef]);
  };

  const busy = new Set();

  // pr: { number, branch, targetBranch, crossRepository, headOid } (from
  // its row). settings: the repo's checkout settings - { command?, forks?,
  // after?, folder?, env? } - or none for plain git. => { branch,
  // worktreePath, how: "command" | "git", already?, warning?, output } -
  // or throws with .status and .output.
  const checkOut = async ({ repo, cloneFolder, settings, pr }) => {
    if (busy.has(repo)) throw checkoutError(busyMessage(repo), { status: 409 });
    busy.add(repo);
    const outputs = [];
    const record = (result) => {
      const text = outputOf(result);
      if (text) outputs.push(text);
      return result;
    };
    try {
      const clone = await localBranches.readCloneFresh(repo, cloneFolder);
      if (!clone.ok) throw checkoutError(clone.error);
      const existing = localBranches.findPrBranch(clone, pr);
      const checkedOut = existing && worktreeOf(clone, existing.name);
      if (checkedOut) return { branch: existing.name, worktreePath: checkedOut.path, how: "git", already: true, output: "" };

      const isFork = isForkPr(pr);
      if (!isFork && !pr.branch) throw checkoutError("The PR's branch isn't known yet - update the PR first");
      const remote = clone.repoRemotes.includes("origin") ? "origin" : clone.repoRemotes[0];
      const remoteRef = isFork ? `refs/pull/${pr.number}/head` : `refs/heads/${pr.branch}`;
      const variables = {
        ...(settings?.env || {}),
        VIEW_PRS_BRANCH: String(pr.branch || ""),
        VIEW_PRS_NUMBER: String(pr.number),
        VIEW_PRS_REPO: repo,
        VIEW_PRS_REMOTE: remote,
        VIEW_PRS_REF: remoteRef,
        VIEW_PRS_IS_FORK: isFork ? "1" : "",
        VIEW_PRS_HEAD_OID: String(pr.headOid || ""),
        VIEW_PRS_CLONE: toPosix(cloneFolder),
      };

      // The repo's command, unless the clone has a branch for the PR
      // already (git checks it out as it is) or it's a fork's PR the
      // command isn't for.
      const byCommand = planCheckout({ existing, isFork, settings }) === "command";
      const how = byCommand ? "command" : "git";
      let warning = "";
      try {
        if (byCommand) {
          record(await runUserCommand(settings.command, cloneFolder, variables));
        } else {
          const name = existing ? existing.name : isFork ? `pr-${pr.number}` : pr.branch;
          const folder = worktreeFolderFor(settings?.folder, cloneFolder, name, homeDir());
          // A worktree in the clone's folder would be in its files too.
          if (isInside(folder, cloneFolder)) {
            throw checkoutError(`${folder} is inside the clone's folder - git's worktrees go outside it (like ${DEFAULT_WORKTREE_FOLDER})`);
          }
          await addWithGit({ clone, existing, name, remote, remoteRef, folder });
          if (settings?.after) {
            // The worktree's made even if this fails.
            try {
              record(await runUserCommand(settings.after, folder, { ...variables, VIEW_PRS_LOCAL_BRANCH: name, VIEW_PRS_WORKTREE: toPosix(folder) }));
            } catch (failure) {
              record(failure);
              warning = `The after-command failed: ${failure?.didTimeout ? "it took too long" : reasonOf(failure)}`;
            }
          }
        }
      } catch (failure) {
        if (failure instanceof Error && failure.status) throw failure;
        record(failure);
        const what = byCommand ? "The checkout command" : "git";
        throw checkoutError(failure?.didTimeout ? `${what} took too long` : `${what} failed: ${reasonOf(failure)}`, {
          status: 502,
          output: outputs.join("\n"),
        });
      }

      const after = await localBranches.readCloneFresh(repo, cloneFolder);
      const output = outputs.join("\n");
      const branch = after.ok ? localBranches.findPrBranch(after, pr) : null;
      const worktree = branch && worktreeOf(after, branch.name);
      if (!worktree) {
        throw checkoutError(
          byCommand
            ? `The checkout command finished, but no worktree of ${cloneFolder} has a branch tracking ${remoteRef} on ${remote}`
            : "It finished, but no worktree has the PR's branch",
          { status: 502, output },
        );
      }
      // A branch of the PR's name tracking nothing: made by the command,
      // not from the PR's branch (from a default branch, say).
      if (byCommand && !branch.remote) {
        throw checkoutError(
          `The checkout command made ${branch.name} in ${worktree.path}, but it tracks nothing, so it may not be the PR's branch - it should track ${remoteRef} on ${remote}`,
          { status: 502, output },
        );
      }
      return { branch: branch.name, worktreePath: worktree.path, how, ...(warning ? { warning } : {}), output };
    } finally {
      busy.delete(repo);
    }
  };

  // The pane's Fetch: the PR's branch (or a fork's pull ref) fetched into
  // the clone - from the remote its local branch tracks, else as Check out
  // chooses - so its newest commit is there to count against. Only git's
  // objects and remote-tracking refs change: no files, no local branches.
  // => { remote, ref, warning? } - warning when the PR's newest commit, as
  // last fetched by the dashboard, still isn't in the clone (pushed over
  // since: update the PR), or isn't known - or throws with .status.
  // Where the PR's branch is fetched from: the remote and ref its local
  // branch tracks, when that's one of the repo's remotes; else origin (or
  // the repo's first remote), its branch - a fork's pull ref.
  const fetchSource = (clone, pr, existing) => {
    const tracked = existing && existing.remote && clone.repoRemotes.includes(existing.remote) && existing.remoteRef;
    const remote = tracked ? existing.remote : clone.repoRemotes.includes("origin") ? "origin" : clone.repoRemotes[0];
    const ref = tracked ? existing.remoteRef : isForkPr(pr) ? `refs/pull/${pr.number}/head` : `refs/heads/${pr.branch}`;
    return { remote, ref };
  };
  const fetchInto = async (clone, remote, ref) => {
    try {
      await git(clone.folder, ["fetch", "--no-tags", remote, ref]);
    } catch (failure) {
      throw checkoutError(failure?.didTimeout ? "git fetch took too long" : `git fetch failed: ${reasonOf(failure)}`, {
        status: 502,
        output: outputOf(failure),
      });
    }
  };

  const fetchPr = async ({ repo, cloneFolder, pr }) => {
    if (busy.has(repo)) throw checkoutError(busyMessage(repo), { status: 409 });
    busy.add(repo);
    try {
      const clone = await localBranches.readCloneFresh(repo, cloneFolder);
      if (!clone.ok) throw checkoutError(clone.error);
      const isFork = isForkPr(pr);
      if (!isFork && !pr.branch) throw checkoutError("The PR's branch isn't known yet - update the PR first");
      const { remote, ref } = fetchSource(clone, pr, localBranches.findPrBranch(clone, pr));
      await fetchInto(clone, remote, ref);
      // The commit the count compares with, as the rows do (an older row
      // without headOid: its newest stored commit) - only ever a commit id.
      const commitOids = Array.isArray(pr.commitOids) ? pr.commitOids : [];
      const headOid = String(pr.headOid || commitOids[commitOids.length - 1] || "");
      let warning = "";
      if (!/^[0-9a-f]{40}([0-9a-f]{24})?$/i.test(headOid)) {
        warning = `Fetched ${ref} from ${remote}, but the dashboard doesn't know the PR's newest commit yet, so there's nothing to count against - update the PR`;
      } else {
        try {
          await git(clone.folder, ["cat-file", "-e", `${headOid}^{commit}`]);
        } catch (_missing) {
          warning = `Fetched ${ref} from ${remote}, but the PR's newest commit as last fetched here (${headOid.slice(0, 7)}) isn't on it - it may have been pushed over since; update the PR`;
        }
      }
      return { remote, ref, ...(warning ? { warning } : {}) };
    } finally {
      busy.delete(repo);
    }
  };

  // Settings' Check: whether the user's shell knows each command's first
  // word, as Check out would run it (the same shell, rc file and folder).
  // None is run: Check out and Clean up run them. commands: strings, or {
  // field, command }. => [{ command, field?, name, found: true | false |
  // null, detail }] - found null when the name can't be told without
  // running the line.
  const checkCommands = async ({ cloneFolder, commands }) => {
    const items = commands.map((item) => (typeof item === "string" ? { command: item, field: "" } : { command: String(item?.command || ""), field: String(item?.field || "") }));
    let shellName = "";
    try {
      shellName = path.basename(await userShell()).replace(/\.exe$/i, "");
    } catch (error) {
      return items.map(({ command, field }) => ({ command, ...(field ? { field } : {}), name: "", found: false, detail: error.message }));
    }
    return Promise.all(
      items.map(async ({ command, field }) => {
        const base = { command, ...(field ? { field } : {}) };
        const withField = (result) => ({ ...base, ...result });
        const name = commandNameOf(command);
        if (!name) return withField({ name, found: null, detail: "Its first word is only known when it runs, so it isn't checked" });
        // type's first line ("my-fn is a function"); the rc file's own
        // lines, and what a cd hook printed, are already left out
        // (runUserCommand's markers).
        const script = 'type -- "$VIEW_PRS_CHECK"';
        const answer = (result) => String(result?.stdout || "").trim().split(/\r?\n/)[0] || "";
        try {
          const result = await runUserCommand(script, cloneFolder || homeDir(), { VIEW_PRS_CHECK: name });
          return withField({ name, found: true, detail: answer(result) || `${name} is known to your shell (${shellName})` });
        } catch (failure) {
          if (failure instanceof Error && failure.status) return withField({ name, found: false, detail: failure.message });
          return withField({ name, found: false, detail: `${name} isn't known to your shell (${shellName}) - is it in the rc file an interactive ${shellName} reads?` });
        }
      }),
    );
  };

  // The PR's local branch brought up to the PR's branch, fast-forward only
  // (the pane's Pull, which asks first): refused - nothing changed - for a
  // branch tracking no remote branch, a worktree mid-rebase or with
  // uncommitted changes (new files are fine, unless the pull would
  // overwrite one: git refuses then), or a branch with commits the PR's
  // doesn't have. The PR's branch is fetched as Fetch does, then: in its
  // worktree, git merge --ff-only; a branch not checked out has its ref
  // moved, only from the commit it was read at. One at a time per clone,
  // with Check out and Fetch. => { branch, from, to, commits, worktreePath?,
  // already? } - or throws with .status and .output.
  const pullPr = async ({ repo, cloneFolder, pr }) => {
    if (busy.has(repo)) throw checkoutError(busyMessage(repo), { status: 409 });
    busy.add(repo);
    try {
      const clone = await localBranches.readCloneFresh(repo, cloneFolder);
      if (!clone.ok) throw checkoutError(clone.error);
      if (!isForkPr(pr) && !pr.branch) throw checkoutError("The PR's branch isn't known yet - update the PR first");
      const branch = localBranches.findPrBranch(clone, pr);
      if (!branch) throw checkoutError(`No local branch for #${pr.number} in ${repo}'s clone`, { status: 409 });
      if (!branch.remote || !clone.repoRemotes.includes(branch.remote)) {
        throw checkoutError(`${branch.name} tracks no branch of ${repo}, so it may not be the PR's - pull it yourself`, { status: 409 });
      }
      const { remote, ref } = fetchSource(clone, pr, branch);
      return await fastForward({ repo, clone, branch, remote, ref });
    } finally {
      busy.delete(repo);
    }
  };

  // A tracked branch (no PR) brought up to the remote branch it tracks,
  // as Pull does a PR's: fast-forward only, refused - nothing changed -
  // for one tracking none of the repo's remote branches, mid-rebase, with
  // uncommitted changes, or with commits the remote branch doesn't have.
  const pullBranch = async ({ repo, cloneFolder, branch: name }) => {
    if (busy.has(repo)) throw checkoutError(busyMessage(repo), { status: 409 });
    busy.add(repo);
    try {
      const clone = await localBranches.readCloneFresh(repo, cloneFolder);
      if (!clone.ok) throw checkoutError(clone.error);
      const branch = clone.branches.find((item) => item.name === name);
      if (!branch) throw checkoutError(`${repo}'s clone has no branch ${name}`, { status: 404 });
      if (!branch.remote || !clone.repoRemotes.includes(branch.remote) || !branch.remoteRef.startsWith("refs/heads/")) {
        throw checkoutError(`${name} tracks no branch on ${repo}'s remote, so there's nothing to pull - push it first (git push -u)`, { status: 409 });
      }
      return await fastForward({ repo, clone, branch, remote: branch.remote, ref: branch.remoteRef });
    } finally {
      busy.delete(repo);
    }
  };

  // A tracked branch's Fetch: the remote branch it tracks fetched into the
  // clone, so its behind count is current - no files or local branches
  // change. => { branch, remote, ref, behind?, ahead? } (against the
  // fetched commit) - or throws with .status.
  const fetchBranch = async ({ repo, cloneFolder, branch: name }) => {
    if (busy.has(repo)) throw checkoutError(busyMessage(repo), { status: 409 });
    busy.add(repo);
    try {
      const clone = await localBranches.readCloneFresh(repo, cloneFolder);
      if (!clone.ok) throw checkoutError(clone.error);
      const branch = clone.branches.find((item) => item.name === name);
      if (!branch) throw checkoutError(`${repo}'s clone has no branch ${name}`, { status: 404 });
      if (!branch.remote || !(clone.remotes || []).some((item) => item.name === branch.remote) || !branch.remoteRef.startsWith("refs/heads/")) {
        throw checkoutError(`${name} tracks no remote branch, so there's nothing to fetch`, { status: 409 });
      }
      try {
        await fetchInto(clone, branch.remote, branch.remoteRef);
      } finally {
        localBranches.forgetClone(repo);
      }
      const to = (await git(clone.folder, ["rev-parse", "--verify", "-q", "FETCH_HEAD^{commit}"])).trim();
      let counts = {};
      try {
        const [ahead, behind] = (await git(clone.folder, ["rev-list", "--left-right", "--count", `${branch.oid}...${to}`])).trim().split(/\s+/).map(Number);
        if (Number.isFinite(ahead) && Number.isFinite(behind)) counts = { ahead, behind };
      } catch (_error) {
        // Fetched; the counts come with the page's next read.
      }
      return { branch: name, remote: branch.remote, ref: branch.remoteRef, ...counts };
    } finally {
      busy.delete(repo);
    }
  };

  // The shared part of Pull: ref fetched from remote, then the local branch
  // fast-forwarded to it - in its worktree, git merge --ff-only; one not
  // checked out has its ref moved, only from the commit it was read at.
  // Refused - nothing changed - mid-rebase, with uncommitted changes (new
  // files are fine, unless the pull would overwrite one: git refuses
  // then), or with commits the fetched one doesn't have. => { branch,
  // from, to, commits, worktreePath?, already? }.
  const fastForward = async ({ repo, clone, branch, remote, ref }) => {
    const worktree = clone.worktrees.find((item) => item.branch === branch.name);
    if (worktree?.rebasing) throw checkoutError(`A rebase is in progress in ${worktree.path} - finish or abort it first`, { status: 409 });
    if (worktree) {
      let status;
      try {
        status = await git(worktree.path, ["--no-optional-locks", "status", "--porcelain=v1", "-z", "--untracked-files=no"]);
      } catch (failure) {
        throw checkoutError(`git can't read ${worktree.path}: ${reasonOf(failure)}`, { output: outputOf(failure) });
      }
      if (status.replace(/\0/g, "").trim()) {
        throw checkoutError(`Uncommitted changes in ${worktree.path} - commit or stash them first`, { status: 409 });
      }
    }
    await fetchInto(clone, remote, ref);
    const to = (await git(clone.folder, ["rev-parse", "--verify", "-q", "FETCH_HEAD^{commit}"])).trim();
    const from = branch.oid;
    const result = { branch: branch.name, from, to, ...(worktree ? { worktreePath: worktree.path } : {}) };
    if (to === from) {
      // The fetch may have moved its remote branch (behind counts).
      localBranches.forgetClone(repo);
      return { ...result, commits: 0, already: true };
    }
    try {
      await git(clone.folder, ["merge-base", "--is-ancestor", from, to]);
    } catch (_notAncestor) {
      localBranches.forgetClone(repo);
      throw checkoutError(
        `${branch.name} has commits ${ref} on ${remote} doesn't, so it can't be fast-forwarded - nothing was changed (merge or rebase it yourself)`,
        { status: 409 },
      );
    }
    const commits = Number((await git(clone.folder, ["rev-list", "--count", `${from}..${to}`])).trim()) || 0;
    try {
      if (worktree) await git(worktree.path, ["merge", "--ff-only", to]);
      // Only from the commit it was read at: a commit made meanwhile isn't lost.
      else await git(clone.folder, ["update-ref", `refs/heads/${branch.name}`, to, from]);
    } catch (failure) {
      throw checkoutError(`git couldn't fast-forward ${branch.name}: ${reasonOf(failure)}`, { status: 409, output: outputOf(failure) });
    } finally {
      // The branch has moved (or may have): the page's check right after
      // reads the clone afresh, not as it was before the pull.
      localBranches.forgetClone(repo);
    }
    return { ...result, commits };
  };

  // New branch (Tracked Branches): a local branch named `name` started from
  // `start` - a branch of the clone as refs/heads/<branch> or
  // refs/remotes/<remote>/<branch>, fetched first when `fetch` (a local
  // branch's upstream on the repo's remote; a remote branch itself), so it
  // starts from the newest - tracking nothing (it's pushed later, with
  // git push -u). Then, as `mode` says:
  // - "worktree": in a new worktree at the repo's worktree folder (as Check
  //   out makes a PR's), then the repo's after-command there, if any.
  // - "switch": the clone's own folder switched to it (git switch -c) -
  //   refused with uncommitted changes there, mid-rebase, or for a clone
  //   whose folder has no checkout of its own (a bare one).
  // One at a time per clone, with Check out, Fetch and Pull. => { branch,
  // oid, worktreePath, startedFrom, fetched, warning?, output } - or throws
  // with .status and .output.
  const createBranch = async ({ repo, cloneFolder, settings, name, start, fetch = true, mode = "worktree" }) => {
    if (busy.has(repo)) throw checkoutError(busyMessage(repo), { status: 409 });
    busy.add(repo);
    const outputs = [];
    try {
      try {
        await git(cloneFolder, ["check-ref-format", "--branch", name]);
      } catch (_bad) {
        throw checkoutError(`${name} isn't a name git takes for a branch`, { status: 400 });
      }
      if (name.startsWith("-")) throw checkoutError(`${name} isn't a name git takes for a branch`, { status: 400 });
      const clone = await localBranches.readCloneFresh(repo, cloneFolder);
      if (!clone.ok) throw checkoutError(clone.error);
      if (clone.branches.some((branch) => branch.name === name)) throw checkoutError(`${repo}'s clone already has a branch ${name}`, { status: 409 });

      // Where it starts: the commit, and what to fetch first.
      const startText = String(start || "");
      let oid = "";
      let source = null;
      let startedFrom = "";
      if (startText.startsWith("refs/heads/")) {
        const from = clone.branches.find((branch) => branch.name === startText.slice("refs/heads/".length));
        if (!from) throw checkoutError(`${repo}'s clone has no branch ${startText.slice("refs/heads/".length)}`, { status: 404 });
        oid = from.oid;
        startedFrom = from.name;
        if (from.remote && (clone.remotes || []).some((item) => item.name === from.remote) && from.remoteRef.startsWith("refs/heads/")) {
          source = { remote: from.remote, ref: from.remoteRef, label: `${from.remote}/${from.remoteRef.slice("refs/heads/".length)}` };
        }
      } else if (startText.startsWith("refs/remotes/")) {
        oid = clone.remoteRefs.get(startText) || "";
        if (!oid) throw checkoutError(`${repo}'s clone has no remote branch ${startText.slice("refs/remotes/".length)}`, { status: 404 });
        const rest = startText.slice("refs/remotes/".length);
        // Any of the clone's remotes (a fork's too), the longest name that fits.
        const remote = (clone.remotes || [])
          .map((item) => item.name)
          .filter((item) => rest.startsWith(`${item}/`))
          .sort((a, b) => b.length - a.length)[0];
        startedFrom = rest;
        if (remote) source = { remote, ref: `refs/heads/${rest.slice(remote.length + 1)}`, label: rest };
      } else {
        throw checkoutError("Start it from one of the clone's branches", { status: 400 });
      }
      let fetched = false;
      let warning = "";
      if (fetch && source) {
        // Can't be fetched (deleted on GitHub, offline): from what the clone
        // has, said so - nothing's lost by starting there.
        let newest = "";
        try {
          await fetchInto(clone, source.remote, source.ref);
          newest = (await git(clone.folder, ["rev-parse", "--verify", "-q", "FETCH_HEAD^{commit}"])).trim();
          fetched = true;
        } catch (failure) {
          warning = `${source.label} couldn't be fetched (${failure.message.replace(/^git fetch failed: /, "")}), so it started from ${startedFrom} as the clone has it`;
        }
        const isAncestor = async (older, newer) => {
          try {
            await git(clone.folder, ["merge-base", "--is-ancestor", older, newer]);
            return true;
          } catch (_not) {
            return false;
          }
        };
        if (newest && newest !== oid) {
          // A local branch's own commits aren't left behind: its remote
          // branch only when that's ahead of it (or it's a remote branch).
          if (!startText.startsWith("refs/heads/") || (await isAncestor(oid, newest))) {
            oid = newest;
            startedFrom = source.label;
          } else if (!(await isAncestor(newest, oid))) {
            warning = `${startedFrom} and ${source.label} have each moved on, so it started from ${startedFrom} as the clone has it (its own commits kept)`;
          }
        } else if (newest) {
          startedFrom = source.label;
        }
      }

      let worktreePath = "";
      if (mode === "switch") {
        const own = localBranches.worktreeAt(clone, clone.folder);
        if (!own) throw checkoutError(`${clone.folder} has no checkout of its own (a bare clone?) - make a new worktree instead`, { status: 409 });
        if (own.rebasing) throw checkoutError(`A rebase is in progress in ${own.path} - finish or abort it first`, { status: 409 });
        let status;
        try {
          status = await git(own.path, ["--no-optional-locks", "status", "--porcelain=v1", "-z", "--untracked-files=no"]);
        } catch (failure) {
          throw checkoutError(`git can't read ${own.path}: ${reasonOf(failure)}`, { output: outputOf(failure) });
        }
        if (status.replace(/\0/g, "").trim()) {
          throw checkoutError(`Uncommitted changes in ${own.path} - commit or stash them, or make a new worktree instead`, { status: 409 });
        }
        try {
          await git(own.path, ["switch", "--no-track", "-c", name, oid]);
        } catch (failure) {
          throw checkoutError(`git couldn't switch ${own.path} to a new branch: ${reasonOf(failure)}`, { status: 502, output: outputOf(failure) });
        }
        worktreePath = own.path;
      } else {
        const folder = worktreeFolderFor(settings?.folder, cloneFolder, name, homeDir());
        if (isInside(folder, cloneFolder)) {
          throw checkoutError(`${folder} is inside the clone's folder - git's worktrees go outside it (like ${DEFAULT_WORKTREE_FOLDER})`);
        }
        if (fs.existsSync(folder)) throw checkoutError(`${folder} already exists`, { status: 409 });
        try {
          await git(clone.folder, ["worktree", "add", "--no-track", "-b", name, folder, oid]);
        } catch (failure) {
          throw checkoutError(`git couldn't make the worktree: ${reasonOf(failure)}`, { status: 502, output: outputOf(failure) });
        }
        worktreePath = folder;
        if (settings?.after) {
          // The worktree's made even if this fails.
          try {
            const result = await runUserCommand(settings.after, folder, {
              ...(settings?.env || {}),
              VIEW_PRS_BRANCH: name,
              VIEW_PRS_REPO: repo,
              VIEW_PRS_CLONE: toPosix(cloneFolder),
              VIEW_PRS_LOCAL_BRANCH: name,
              VIEW_PRS_WORKTREE: toPosix(folder),
            });
            const text = outputOf(result);
            if (text) outputs.push(text);
          } catch (failure) {
            const text = outputOf(failure);
            if (text) outputs.push(text);
            warning = [warning, `The after-command failed: ${failure?.didTimeout ? "it took too long" : reasonOf(failure)}`].filter(Boolean).join(". ");
          }
        }
      }
      localBranches.forgetClone(repo);
      return { branch: name, oid, worktreePath, startedFrom, fetched, ...(warning ? { warning } : {}), output: outputs.join("\n") };
    } finally {
      busy.delete(repo);
    }
  };

  // Clean up after merged and closed PRs (Settings › Local clones): what's
  // safe to remove, each removable.
  //
  // - By default, plain git: each local branch of a merged or closed PR
  //   (found as the rows find it), with its worktree if it's checked out.
  // - With the repo's list command: the worktrees it prints, one folder a
  //   line (run as Check out's command is, given the clone as
  //   VIEW_PRS_CLONE) - only those that are worktrees of the clone; any
  //   other line is ignored and said so.
  //
  // Either way the dashboard's own checks apply: an item is safe only when
  // no PR of its branch is still open, it isn't long-lived (a PR's base, or
  // the source of more than one PR - develop into main), its worktree isn't
  // the clone's own
  // folder, locked or mid-rebase and has no uncommitted changes (new files
  // included: they'd be lost), and its branch tracks the PR's branch and
  // has no commits GitHub doesn't (as Not pushed counts them). A branch no
  // PR has (the list command's) isn't checked for what's pushed - the
  // command's own judgement - and says so.
  //
  // prs: the repo's rows (the routes' listPrs). => { by: "git" |
  // "command", items: [{ branch?, oid?, worktreePath?, prs: [{ number,
  // done }], safe, reasons, notes }], ignored?, output?, printed? } - or
  // throws. printed: the list command's stdout (by command only).
  const statusOf = async (folder) =>
    parseStatus(await git(folder, ["--no-optional-locks", "status", "--porcelain=v1", "-z", "--untracked-files=normal"]));

  // "1 staged, 2 changed, 3 new, 1 conflicted".
  const describeChanges = (changes) =>
    [
      [changes.staged, "staged"],
      [changes.changed, "changed"],
      [changes.untracked, "new"],
      [changes.conflicted, "conflicted"],
    ]
      .filter(([count]) => count > 0)
      .map(([count, what]) => `${count} ${what}`)
      .join(", ");

  const assessCleanup = async (clone, { branch, worktree, prs, allPrs, byCommand }) => {
    const reasons = [];
    const notes = [];
    const open = prs.filter((pr) => !pr.done);
    if (open.length > 0) reasons.push(`${open.map((pr) => `#${pr.number}`).join(", ")} ${open.length === 1 ? "is" : "are"} still open`);
    // A long-lived branch (develop, a release branch) a PR came from once
    // merged: kept when it's a PR's base, or more than one PR has come from
    // it.
    if (branch) {
      const remoteName = branch.remote && clone.repoRemotes.includes(branch.remote) && branch.remoteRef.startsWith("refs/heads/")
        ? branch.remoteRef.slice("refs/heads/".length)
        : "";
      const bases = allPrs.filter((pr) => pr.targetBranch && (pr.targetBranch === remoteName || pr.targetBranch === branch.name));
      if (bases.length > 0) {
        const numbers = bases.slice(0, 3).map((pr) => `#${pr.number}`).join(", ");
        reasons.push(`${branch.name} is the base of ${numbers}${bases.length > 3 ? ` and ${bases.length - 3} more` : ""} - a long-lived branch`);
      } else if (prs.length > 1 && open.length === 0) {
        reasons.push(`${prs.length} PRs have come from ${branch.name} - a long-lived branch?`);
      }
    }
    if (worktree) {
      if (worktree.main || localBranches.isCloneFolder(clone, worktree.path)) reasons.push("It's the clone's own folder");
      if (worktree.locked) reasons.push("Its worktree is locked (git worktree unlock it first)");
      if (worktree.rebasing) reasons.push("A rebase is in progress there");
      if (!fs.existsSync(worktree.path)) {
        notes.push("Its folder is gone already - git still lists it");
      } else {
        try {
          const changes = await statusOf(worktree.path);
          if (changes.total > 0) reasons.push(`Uncommitted: ${describeChanges(changes)}`);
        } catch (failure) {
          reasons.push(`git can't read it: ${reasonOf(failure)}`);
        }
      }
    }
    if (branch) {
      const done = prs.filter((pr) => pr.done);
      if (done.length === 0) {
        if (byCommand) notes.push("No PR on the page has this branch, so what's pushed isn't checked");
      } else if (!branch.remote) {
        reasons.push(`${branch.name} tracks nothing - found by its name alone, so it may not be the PR's`);
      } else {
        const described = await Promise.all(done.map((pr) => localBranches.describePrBranch(clone, pr)));
        const counts = described.map((info) => info?.unpushed).filter((value) => typeof value === "number");
        if (counts.includes(0)) {
          // All on GitHub, as one of its PRs has them.
        } else if (counts.length > 0) {
          const fewest = Math.min(...counts);
          reasons.push(`${fewest} commit${fewest === 1 ? "" : "s"} not on GitHub`);
        } else {
          reasons.push("Can't tell whether its commits are all on GitHub (the PR's newest commit isn't in the clone)");
        }
      }
    }
    return { safe: reasons.length === 0, reasons, notes };
  };

  // At most a few git statuses at once.
  const mapFew = async (items, mapper, limit = 4) => {
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

  const listCleanup = async ({ repo, cloneFolder, settings, prs }) => {
    const clone = await localBranches.readCloneFresh(repo, cloneFolder);
    if (!clone.ok) throw checkoutError(clone.error);
    // Each local branch's PRs, as the rows find them.
    const prsOf = new Map();
    (prs || []).forEach((pr) => {
      const branch = localBranches.findPrBranch(clone, pr);
      if (!branch) return;
      prsOf.set(branch.name, [...(prsOf.get(branch.name) || []), pr]);
    });
    const worktreeOfBranch = (name) => clone.worktrees.find((worktree) => worktree.branch === name) || null;
    const byCommand = Boolean(settings?.cleanupList);
    let candidates;
    let ignored = [];
    let output = "";
    // The list command's stdout as it printed it (the shell's startup left
    // out), for Settings to show.
    let printed = "";
    if (byCommand) {
      let result;
      try {
        result = await runUserCommand(settings.cleanupList, cloneFolder, { ...(settings.env || {}), VIEW_PRS_CLONE: toPosix(cloneFolder), VIEW_PRS_REPO: repo });
      } catch (failure) {
        if (failure instanceof Error && failure.status) throw failure;
        throw checkoutError(failure?.didTimeout ? "The list command took too long" : `The list command failed: ${reasonOf(failure)}`, {
          status: 502,
          output: outputOf(failure),
        });
      }
      output = outputOf({ stderr: result?.stderr });
      printed = outputOf({ stdout: result?.stdout });
      const seen = new Set();
      candidates = [];
      String(result?.stdout || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !isShellNoise(line))
        .forEach((line) => {
          const worktree = localBranches.worktreeAt(clone, line);
          if (!worktree) {
            ignored.push(line);
            return;
          }
          if (seen.has(worktree.path)) return;
          seen.add(worktree.path);
          candidates.push({ worktree, branch: clone.branches.find((item) => item.name === worktree.branch) || null });
        });
      ignored = ignored.slice(0, 50);
    } else {
      candidates = clone.branches
        .filter((branch) => (prsOf.get(branch.name) || []).some((pr) => pr.done))
        .map((branch) => ({ branch, worktree: worktreeOfBranch(branch.name) }));
    }
    const items = await mapFew(candidates, async ({ branch, worktree }) => {
      const itsPrs = branch ? prsOf.get(branch.name) || [] : [];
      const assessed = await assessCleanup(clone, { branch, worktree, prs: itsPrs, allPrs: prs || [], byCommand });
      return {
        ...(branch ? { branch: branch.name, oid: branch.oid } : {}),
        ...(worktree ? { worktreePath: worktree.path } : {}),
        prs: itsPrs.map((pr) => ({ number: pr.number, done: Boolean(pr.done) })),
        ...assessed,
      };
    });
    items.sort((a, b) => Number(b.safe) - Number(a.safe) || String(a.branch || a.worktreePath).localeCompare(String(b.branch || b.worktreePath)));
    return {
      by: byCommand ? "command" : "git",
      items,
      ...(ignored.length ? { ignored } : {}),
      ...(output ? { output } : {}),
      ...(byCommand ? { printed } : {}),
    };
  };

  // Removes one of the list's items - { branch?, worktreePath? } as listed -
  // once it's listed again and still safe: its worktree (by the repo's
  // remove command, given VIEW_PRS_WORKTREE and VIEW_PRS_LOCAL_BRANCH, else
  // git worktree remove - never forced, so git refuses a worktree changed
  // since; one whose folder is gone, git worktree prune), then, by git
  // only, its branch - only from the commit it was listed at, its tracking
  // settings with it. With the remove command, the branch is its to remove.
  // One at a time per clone, with Check out, Fetch and Pull. => { removed:
  // { worktreePath?, branch? }, how: "git" | "command", output } - or throws.
  const removeCleanup = async ({ repo, cloneFolder, settings, prs, branch, worktreePath }) => {
    if (busy.has(repo)) throw checkoutError(busyMessage(repo), { status: 409 });
    busy.add(repo);
    try {
      const listed = await listCleanup({ repo, cloneFolder, settings, prs });
      const item = listed.items.find((candidate) => (candidate.branch || "") === (branch || "") && (candidate.worktreePath || "") === (worktreePath || ""));
      if (!item) throw checkoutError("It's no longer in the list - look again", { status: 409 });
      if (!item.safe) throw checkoutError(`Not safe to remove: ${item.reasons.join("; ")}`, { status: 409 });
      const outputs = [];
      const removed = {};
      const byCommand = Boolean(item.worktreePath && settings?.cleanupRemove);
      try {
        if (item.worktreePath) {
          if (byCommand) {
            try {
              const result = await runUserCommand(settings.cleanupRemove, cloneFolder, {
                ...(settings.env || {}),
                VIEW_PRS_CLONE: toPosix(cloneFolder),
                VIEW_PRS_REPO: repo,
                VIEW_PRS_WORKTREE: toPosix(item.worktreePath),
                VIEW_PRS_LOCAL_BRANCH: item.branch || "",
              });
              const text = outputOf(result);
              if (text) outputs.push(text);
            } catch (failure) {
              if (failure instanceof Error && failure.status) throw failure;
              throw checkoutError(failure?.didTimeout ? "The remove command took too long" : `The remove command failed: ${reasonOf(failure)}`, {
                status: 502,
                output: outputOf(failure),
              });
            }
            const after = await localBranches.readCloneFresh(repo, cloneFolder);
            if (after.ok && localBranches.worktreeAt(after, item.worktreePath)) {
              throw checkoutError(`The remove command finished, but ${item.worktreePath} is still a worktree of the clone`, {
                status: 502,
                output: outputs.join("\n"),
              });
            }
          } else if (fs.existsSync(item.worktreePath)) {
            await git(cloneFolder, ["worktree", "remove", item.worktreePath]);
          } else {
            await git(cloneFolder, ["worktree", "prune"]);
          }
          removed.worktreePath = item.worktreePath;
        }
        if (item.branch && !byCommand) {
          // Only from the commit it was listed at: one made since isn't lost.
          await git(cloneFolder, ["update-ref", "-d", `refs/heads/${item.branch}`, item.oid]);
          await git(cloneFolder, ["config", "--remove-section", `branch.${item.branch}`]).catch(() => "");
          removed.branch = item.branch;
        }
      } catch (failure) {
        if (failure instanceof Error && failure.status) throw failure;
        throw checkoutError(
          failure?.didTimeout
            ? "git took too long"
            : `git couldn't remove ${removed.worktreePath ? item.branch : item.worktreePath || item.branch}: ${reasonOf(failure)}`,
          { status: 409, output: outputOf(failure) },
        );
      } finally {
        localBranches.forgetClone(repo);
      }
      return { removed, how: byCommand ? "command" : "git", output: outputs.join("\n") };
    } finally {
      busy.delete(repo);
    }
  };

  // userShell: for Open in editor and Terminal's own commands, run the same way.
  return { checkOut, fetchPr, pullPr, pullBranch, fetchBranch, createBranch, checkCommands, listCleanup, removeCleanup, userShell };
};

module.exports = {
  createViewPrsLocalCheckout,
  planCheckout,
  commandNameOf,
  folderNameFor,
  reasonOf,
  expandPlaceholders,
  worktreeFolderFor,
  PLACEHOLDERS,
  DEFAULT_WORKTREE_FOLDER,
};
