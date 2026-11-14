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

const os = require("os");
const path = require("path");

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

// An interactive shell's complaint about having no terminal - not the
// command's.
const isShellNoise = (line) => /no job control|cannot set terminal process group|inappropriate ioctl/i.test(line);

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
  // file that defines it is read), in folder, with the variables.
  const runUserCommand = async (command, folder, variables) =>
    run(await userShell(), ["-ic", `exec </dev/null\ncd -- "$VIEW_PRS_FOLDER" || exit 1\n${expandPlaceholders(command)}`], {
      env: { ...variables, VIEW_PRS_FOLDER: toPosix(folder) },
    });

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
    if (busy.has(repo)) throw checkoutError(`A checkout in ${repo}'s clone is already running`, { status: 409 });
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

      const isFork = pr.crossRepository || (Boolean(pr.targetBranch) && pr.branch === pr.targetBranch);
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
      const byCommand = Boolean(settings?.command) && !existing && (!isFork || settings.forks === true);
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

  return { checkOut };
};

module.exports = {
  createViewPrsLocalCheckout,
  folderNameFor,
  reasonOf,
  expandPlaceholders,
  worktreeFolderFor,
  PLACEHOLDERS,
  DEFAULT_WORKTREE_FOLDER,
};
