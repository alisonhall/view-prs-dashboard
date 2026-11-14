const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile, execFileSync } = require("child_process");
const { createViewPrsLocalBranches } = require("./view-prs-local-branches");
const {
  createViewPrsLocalCheckout,
  folderNameFor,
  reasonOf,
  expandPlaceholders,
  worktreeFolderFor,
} = require("./view-prs-local-checkout");

const git = (cwd, ...args) =>
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "init.defaultBranch=main", ...args], {
    cwd,
    encoding: "utf8",
  }).trim();
const commit = (cwd, message) => {
  git(cwd, "commit", "--allow-empty", "-q", "-m", message);
  return git(cwd, "rev-parse", "HEAD");
};
const toPosix = (value) => value.replace(/\\/g, "/");

// A user's own checkout script, standing in for whatever theirs is: logs
// what it was given, then makes the worktree for its first argument's
// branch from $MY_REMOTE (the dashboard's remote unless set) - or, as some
// tools do when the branch isn't there, a new branch from main. "broken"
// fails; "nothing" does nothing.
const MY_CHECKOUT = String.raw`#!/usr/bin/env bash
here="$(cd "$(dirname "$0")" && pwd)"
printf '%s|%s|%s|%s|%s|%s|%s|%s\n' "$*" "$VIEW_PRS_BRANCH" "$VIEW_PRS_NUMBER" "$VIEW_PRS_REPO" "$VIEW_PRS_REMOTE" "$VIEW_PRS_REF" "$VIEW_PRS_IS_FORK" "$MY_SETTING" >> "$here/log"
touch ran-here
case "$1" in
  broken) echo "error: it couldn't do it" >&2; exit 1 ;;
  nothing) echo "did nothing"; exit 0 ;;
esac
remote="$MY_REMOTE"
[ -n "$remote" ] || remote="$VIEW_PRS_REMOTE"
folder="$VIEW_PRS_CLONE/../$(printf %s "$1" | tr / _)"
if git fetch -q "$remote" "+$VIEW_PRS_REF:refs/my/$VIEW_PRS_NUMBER" 2>/dev/null; then
  git worktree add -q --no-track -b "$1" "$folder" "refs/my/$VIEW_PRS_NUMBER" &&
    git config "branch.$1.remote" "$remote" && git config "branch.$1.merge" "$VIEW_PRS_REF"
else
  git worktree add -q -b "$1" "$folder" main
fi
`;

// Real clones, fetches and shells - Git Bash's start is slow on Windows,
// more so with the whole suite running.
jest.setTimeout(30000);

describe("checking out a PR into a worktree", () => {
  let root;
  let remote;
  let oids;
  let script;
  // Real commands, failing as the server's runner does ({ error, stdout,
  // stderr }), with HOME a folder of the test's own, so the interactive
  // shell reads no one's real rc file.
  let run;
  beforeAll(() => {
    root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "local-checkout-")));
    fs.mkdirSync(path.join(root, "home"));
    run = (command, args, _maxBuffer, options = {}) =>
      new Promise((resolve, reject) =>
        execFile(command, args, { encoding: "utf8", env: { ...process.env, HOME: path.join(root, "home"), ...(options.env || {}) } }, (error, stdout, stderr) =>
          error ? reject({ error, stdout, stderr }) : resolve({ stdout, stderr }),
        ),
      );
    // GitHub, as far as the clones know: a bare repo with a branch, and a
    // fork's PR's pull ref.
    const seed = path.join(root, "seed");
    fs.mkdirSync(seed);
    git(seed, "init", "-q");
    oids = { base: commit(seed, "base") };
    git(seed, "checkout", "-q", "-b", "feature/x");
    oids.feature = commit(seed, "feature");
    git(seed, "checkout", "-q", "main");
    oids.fork = commit(seed, "a fork's change");
    git(seed, "reset", "-q", "--hard", oids.base);
    remote = path.join(root, "remote.git");
    git(root, "clone", "-q", "--bare", seed, remote);
    git(seed, "push", "-q", remote, `${oids.fork}:refs/pull/9/head`);
    script = path.join(root, "scripts", "my-checkout.sh");
    fs.mkdirSync(path.dirname(script));
    fs.writeFileSync(script, MY_CHECKOUT);
  });
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  // A clone of acme/app: its remote's URL is GitHub's (so it's acme/app's),
  // fetched from the bare repo.
  let count = 0;
  const freshClone = () => {
    count += 1;
    const folder = path.join(root, `c${count}`, "app");
    fs.mkdirSync(path.dirname(folder), { recursive: true });
    git(root, "clone", "-q", remote, folder);
    git(folder, "remote", "set-url", "origin", "https://github.com/acme/app.git");
    git(folder, "config", `url.${toPosix(remote)}.insteadOf`, "https://github.com/acme/app.git");
    return folder;
  };
  const logOf = () => {
    const file = path.join(path.dirname(script), "log");
    const lines = fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim().split("\n") : [];
    fs.rmSync(file, { force: true });
    return lines;
  };
  const myCommand = (args) => `bash "${toPosix(script)}" ${args}`;

  const pr = (overrides) => ({ number: "1", branch: "feature/x", targetBranch: "main", crossRepository: false, headOid: "", ...overrides });
  const forkPr = () => pr({ number: "9", branch: "main", crossRepository: true });
  const setUp = (runCommand = run) => {
    const localBranches = createViewPrsLocalBranches({ runCommand, fs });
    // bash as the user's shell (Git Bash on Windows, found from git).
    return { localBranches, checkout: createViewPrsLocalCheckout({ runCommand, fs, localBranches, env: { ...process.env, SHELL: "/bin/bash" } }) };
  };
  const upstreamOf = (clone, branch) => [git(clone, "config", `branch.${branch}.remote`), git(clone, "config", `branch.${branch}.merge`)];
  const samePath = (a, b) => expect(fs.realpathSync.native(a)).toBe(fs.realpathSync.native(b));

  test("plain git: the PR's branch fetched into one tracking it, in a worktree beside the clone - which the rows then find", async () => {
    const clone = freshClone();
    const { localBranches, checkout } = setUp();
    const result = await checkout.checkOut({ repo: "acme/app", cloneFolder: clone, settings: null, pr: pr() });
    const folder = path.join(path.dirname(clone), "app-feature_x");
    expect(result).toEqual(expect.objectContaining({ branch: "feature/x", how: "git" }));
    samePath(result.worktreePath, folder);
    expect(git(folder, "rev-parse", "HEAD")).toBe(oids.feature);
    expect(upstreamOf(clone, "feature/x")).toEqual(["origin", "refs/heads/feature/x"]);

    const { prs } = await localBranches.getLocalBranches({
      localRepos: { "acme/app": clone },
      prs: [{ key: "k", repo: "acme/app", number: "1", branch: "feature/x", headOid: oids.feature, commitOids: [] }],
    });
    expect(prs.k).toEqual(expect.objectContaining({ branch: "feature/x", ahead: 0, behind: 0 }));
  });

  test("a fork's PR: its pull ref fetched into pr-<number>, tracking it as gh pr checkout does", async () => {
    const clone = freshClone();
    const { checkout } = setUp();
    const result = await checkout.checkOut({ repo: "acme/app", cloneFolder: clone, settings: null, pr: forkPr() });
    expect(result.branch).toBe("pr-9");
    expect(git(result.worktreePath, "rev-parse", "HEAD")).toBe(oids.fork);
    expect(path.basename(result.worktreePath)).toBe("app-pr-9");
    expect(upstreamOf(clone, "pr-9")).toEqual(["origin", "refs/pull/9/head"]);
  });

  test("already checked out: its worktree, nothing made; a local branch not checked out gets a worktree as it is", async () => {
    const clone = freshClone();
    const { checkout } = setUp();
    const first = await checkout.checkOut({ repo: "acme/app", cloneFolder: clone, settings: null, pr: pr() });
    const again = await checkout.checkOut({ repo: "acme/app", cloneFolder: clone, settings: null, pr: pr() });
    expect(again).toEqual(expect.objectContaining({ already: true, branch: "feature/x" }));
    samePath(again.worktreePath, first.worktreePath);

    const other = freshClone();
    git(other, "branch", "mine", oids.base);
    git(other, "config", "branch.mine.remote", "origin");
    git(other, "config", "branch.mine.merge", "refs/heads/feature/x");
    const result = await checkout.checkOut({ repo: "acme/app", cloneFolder: other, settings: null, pr: pr() });
    expect(result.branch).toBe("mine");
    expect(path.basename(result.worktreePath)).toBe("app-mine");
    // As it was: not moved to the PR's newest commit.
    expect(git(result.worktreePath, "rev-parse", "HEAD")).toBe(oids.base);
  });

  test("a folder already where the worktree would go, or a branch of the PR's name tracking something else, is left alone", async () => {
    const clone = freshClone();
    const { checkout } = setUp();
    fs.mkdirSync(path.join(path.dirname(clone), "app-feature_x"));
    await expect(checkout.checkOut({ repo: "acme/app", cloneFolder: clone, settings: null, pr: pr() })).rejects.toMatchObject({
      status: 422,
      message: expect.stringMatching(/app-feature_x already exists$/),
    });

    const other = freshClone();
    git(other, "branch", "feature/x", oids.base);
    git(other, "config", "branch.feature/x.remote", "origin");
    git(other, "config", "branch.feature/x.merge", "refs/heads/something-else");
    await expect(checkout.checkOut({ repo: "acme/app", cloneFolder: other, settings: null, pr: pr() })).rejects.toMatchObject({
      status: 422,
      message: "The clone already has a branch named feature/x, tracking something else",
    });
  });

  test("a branch git can't fetch says why, with what git printed", async () => {
    const clone = freshClone();
    const { checkout } = setUp();
    const failure = await checkout.checkOut({ repo: "acme/app", cloneFolder: clone, settings: null, pr: pr({ branch: "gone" }) }).catch((error) => error);
    expect(failure.status).toBe(502);
    expect(failure.message).toMatch(/^git failed: .*gone/);
    expect(failure.output).toMatch(/gone/);
  });

  test("the worktree folder setting: {branch} and {clone}, relative to the clone's folder, or absolute", async () => {
    const clone = freshClone();
    const { checkout } = setUp();
    const beside = await checkout.checkOut({ repo: "acme/app", cloneFolder: clone, settings: { folder: "../{branch}" }, pr: pr() });
    samePath(beside.worktreePath, path.join(path.dirname(clone), "feature_x"));

    const elsewhere = await checkout.checkOut({
      repo: "acme/app",
      cloneFolder: clone,
      settings: { folder: `${toPosix(root)}/trees/{clone}/{branch}` },
      pr: forkPr(),
    });
    samePath(elsewhere.worktreePath, path.join(root, "trees", "app", "pr-9"));
  });

  test("the worktree folder's ~ is the home folder; one inside the clone's folder is refused, nothing made", async () => {
    const home = path.join(root, `home${count}`);
    const localBranches = createViewPrsLocalBranches({ runCommand: run, fs });
    const checkout = createViewPrsLocalCheckout({ runCommand: run, fs, localBranches, homeDir: () => home });
    const clone = freshClone();
    const result = await checkout.checkOut({ repo: "acme/app", cloneFolder: clone, settings: { folder: "~/trees/{branch}" }, pr: pr() });
    samePath(result.worktreePath, path.join(home, "trees", "feature_x"));

    const other = freshClone();
    await expect(checkout.checkOut({ repo: "acme/app", cloneFolder: other, settings: { folder: "{branch}" }, pr: pr() })).rejects.toMatchObject({
      status: 422,
      message: `${path.join(other, "feature_x")} is inside the clone's folder - git's worktrees go outside it (like ../{clone}-{branch})`,
    });
    expect(fs.existsSync(path.join(other, "feature_x"))).toBe(false);
    expect(git(other, "branch", "--list", "feature/x")).toBe("");
  });

  test("the after-command runs in the worktree git made, with the PR's variables and the repo's own; its failure is a warning", async () => {
    const clone = freshClone();
    const { checkout } = setUp();
    const result = await checkout.checkOut({
      repo: "acme/app",
      cloneFolder: clone,
      settings: { after: 'printf "%s|%s|%s|%s" {local} {branch} {number} "$MY_SETTING" > made-by-after', env: { MY_SETTING: "a b" } },
      pr: forkPr(),
    });
    expect(result).toEqual(expect.objectContaining({ branch: "pr-9", how: "git" }));
    expect(result.warning).toBeUndefined();
    expect(fs.readFileSync(path.join(result.worktreePath, "made-by-after"), "utf8")).toBe("pr-9|main|9|a b");

    const failing = await checkout.checkOut({
      repo: "acme/app",
      cloneFolder: freshClone(),
      settings: { after: 'echo "error: no links made" >&2; exit 3' },
      pr: pr(),
    });
    expect(failing).toEqual(expect.objectContaining({ branch: "feature/x", warning: "The after-command failed: no links made" }));
    expect(fs.existsSync(failing.worktreePath)).toBe(true);
  });

  test("the repo's checkout command: run in the clone's folder through the user's shell, with the PR's variables and the repo's own", async () => {
    const clone = freshClone();
    const { checkout } = setUp();
    const result = await checkout.checkOut({
      repo: "acme/app",
      cloneFolder: clone,
      settings: { command: myCommand("{branch}"), env: { MY_SETTING: "mine" }, after: "touch after-ran" },
      pr: pr(),
    });
    expect(result).toEqual(expect.objectContaining({ branch: "feature/x", how: "command" }));
    samePath(result.worktreePath, path.join(path.dirname(clone), "feature_x"));
    expect(git(result.worktreePath, "rev-parse", "HEAD")).toBe(oids.feature);
    expect(logOf()).toEqual(["feature/x|feature/x|1|acme/app|origin|refs/heads/feature/x||mine"]);
    expect(fs.existsSync(path.join(clone, "ran-here"))).toBe(true);
    // The after-command is for worktrees git makes.
    expect(fs.existsSync(path.join(result.worktreePath, "after-ran"))).toBe(false);
  });

  test("a fork's PR goes to the command only when the settings say so; a local branch the clone has is checked out by git", async () => {
    const { checkout } = setUp();
    const byGit = await checkout.checkOut({ repo: "acme/app", cloneFolder: freshClone(), settings: { command: myCommand("pr-{number}") }, pr: forkPr() });
    expect(byGit).toEqual(expect.objectContaining({ branch: "pr-9", how: "git" }));
    expect(logOf()).toEqual([]);

    const byCommand = await checkout.checkOut({
      repo: "acme/app",
      cloneFolder: freshClone(),
      settings: { command: myCommand("pr-{number}"), forks: true },
      pr: forkPr(),
    });
    expect(byCommand).toEqual(expect.objectContaining({ branch: "pr-9", how: "command" }));
    expect(git(byCommand.worktreePath, "rev-parse", "HEAD")).toBe(oids.fork);
    expect(logOf()).toEqual(["pr-9|main|9|acme/app|origin|refs/pull/9/head|1|"]);

    const clone = freshClone();
    git(clone, "branch", "mine", oids.base);
    git(clone, "config", "branch.mine.remote", "origin");
    git(clone, "config", "branch.mine.merge", "refs/heads/feature/x");
    const existing = await checkout.checkOut({ repo: "acme/app", cloneFolder: clone, settings: { command: myCommand("{branch}") }, pr: pr() });
    expect(existing).toEqual(expect.objectContaining({ branch: "mine", how: "git" }));
    expect(logOf()).toEqual([]);
  });

  test("a checkout command failing, making nothing, or making a branch that tracks nothing says so, with what it printed", async () => {
    const { checkout } = setUp();
    const failed = await checkout.checkOut({ repo: "acme/app", cloneFolder: freshClone(), settings: { command: myCommand("broken") }, pr: pr() }).catch((error) => error);
    expect(failed).toMatchObject({ status: 502, message: "The checkout command failed: it couldn't do it" });
    expect(failed.output).toMatch(/it couldn't do it/);

    const clone = freshClone();
    const nothing = await checkout.checkOut({ repo: "acme/app", cloneFolder: clone, settings: { command: myCommand("nothing") }, pr: pr() }).catch((error) => error);
    expect(nothing).toMatchObject({
      status: 502,
      message: `The checkout command finished, but no worktree of ${clone} has a branch tracking refs/heads/feature/x on origin`,
      output: "did nothing",
    });

    // Fetching from a remote without the branch, the script makes a new
    // branch from main - of the PR's name, but not the PR's.
    const forked = freshClone();
    const fork = path.join(root, "fork.git");
    if (!fs.existsSync(fork)) git(root, "init", "-q", "--bare", fork);
    git(forked, "remote", "add", "fork", fork);
    git(forked, "push", "-q", "fork", "main");
    const untracked = await checkout
      .checkOut({ repo: "acme/app", cloneFolder: forked, settings: { command: myCommand("{branch}"), env: { MY_REMOTE: "fork" } }, pr: pr() })
      .catch((error) => error);
    expect(untracked).toMatchObject({
      status: 502,
      message: expect.stringMatching(/^The checkout command made feature\/x in .*feature_x, but it tracks nothing, so it may not be the PR's branch - it should track refs\/heads\/feature\/x on origin$/),
    });
    logOf();
  });

  test("the user's shell: theirs if bash, zsh or ksh, else bash - an interactive one, so their rc file's commands work", async () => {
    const clone = freshClone();
    const calls = [];
    const fakeShell = async (command, args, maxBuffer, options) => {
      if (command === "git") return run(command, args, maxBuffer, options);
      calls.push({ command, args, env: options.env });
      throw { error: new Error("exit 1"), stderr: "error: stop here" };
    };
    const localBranches = createViewPrsLocalBranches({ runCommand: fakeShell, fs });
    const settings = { command: "my-tool add {branch}" };
    const zsh = createViewPrsLocalCheckout({ runCommand: fakeShell, fs, localBranches, platform: "darwin", env: { SHELL: "/bin/zsh" } });
    await expect(zsh.checkOut({ repo: "acme/app", cloneFolder: clone, settings, pr: pr() })).rejects.toMatchObject({ message: "The checkout command failed: stop here" });
    expect(calls[0].command).toBe("/bin/zsh");
    expect(calls[0].args).toEqual(["-ic", 'exec </dev/null\ncd -- "$VIEW_PRS_FOLDER" || exit 1\nmy-tool add "$VIEW_PRS_BRANCH"']);
    expect(calls[0].env).toEqual(expect.objectContaining({ VIEW_PRS_FOLDER: toPosix(clone), VIEW_PRS_BRANCH: "feature/x" }));

    const fish = createViewPrsLocalCheckout({ runCommand: fakeShell, fs, localBranches, platform: "linux", env: { SHELL: "/usr/bin/fish" } });
    await fish.checkOut({ repo: "acme/app", cloneFolder: clone, settings, pr: pr() }).catch(() => {});
    expect(calls[1].command).toBe("/bin/bash");
  });

  // Windows paths: only on Windows.
  (process.platform === "win32" ? test : test.skip)("on Windows, the commands run in Git Bash, found from git's own folder - never Windows' own bash.exe", async () => {
    const calls = [];
    const gitRoot = path.join(root, "Git");
    fs.mkdirSync(path.join(gitRoot, "bin"), { recursive: true });
    fs.writeFileSync(path.join(gitRoot, "bin", "bash.exe"), "");
    const clone = freshClone();
    const fakeRun = async (command, args, maxBuffer, options) => {
      if (command === "git" && args[0] === "--exec-path") return { stdout: `${toPosix(path.join(gitRoot, "mingw64", "libexec", "git-core"))}\n` };
      if (command === "git") return run(command, args, maxBuffer, options);
      calls.push(command);
      throw { error: new Error("exit 1"), stderr: "error: stop here" };
    };
    const localBranches = createViewPrsLocalBranches({ runCommand: fakeRun, fs });
    const checkout = createViewPrsLocalCheckout({ runCommand: fakeRun, fs, localBranches, platform: "win32", env: {} });
    await expect(checkout.checkOut({ repo: "acme/app", cloneFolder: clone, settings: { command: "my-tool add {branch}" }, pr: pr() })).rejects.toMatchObject({
      message: "The checkout command failed: stop here",
    });
    expect(calls).toEqual([path.win32.resolve(gitRoot, "bin", "bash.exe")]);
  });

  test("one checkout at a time per clone", async () => {
    const clone = freshClone();
    let release;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    const slowRun = async (command, args, maxBuffer, options) => {
      if (args.includes("fetch")) await held;
      return run(command, args, maxBuffer, options);
    };
    const { checkout } = setUp(slowRun);
    const first = checkout.checkOut({ repo: "acme/app", cloneFolder: clone, settings: null, pr: pr() });
    await new Promise((resolve) => setTimeout(resolve, 200));
    await expect(checkout.checkOut({ repo: "acme/app", cloneFolder: clone, settings: null, pr: pr() })).rejects.toMatchObject({ status: 409 });
    release();
    await expect(first).resolves.toEqual(expect.objectContaining({ branch: "feature/x" }));
  });

  test("placeholders are the quoted variables; folder names have no / nor anything Windows refuses; the reason skips a shell's complaints", () => {
    expect(expandPlaceholders("my-tool add {branch} --pr {number} {unknown}")).toBe('my-tool add "$VIEW_PRS_BRANCH" --pr "$VIEW_PRS_NUMBER" {unknown}');
    expect(worktreeFolderFor("", path.join(root, "app"), "feature/a")).toBe(path.join(root, "app-feature_a"));
    expect(worktreeFolderFor("~/w/{branch}", path.join(root, "app"), "b", path.join(root, "me"))).toBe(path.join(root, "me", "w", "b"));
    // Only a leading ~ (and ~ alone or before a separator).
    expect(worktreeFolderFor("../~x/{branch}", path.join(root, "app"), "b", "/home")).toBe(path.join(root, "~x", "b"));
    expect(folderNameFor("feature/a/b")).toBe("feature_a_b");
    expect(folderNameFor('odd<>|"name')).toBe("odd____name");
    expect(
      reasonOf({ stderr: "bash: cannot set terminal process group (-1): Inappropriate ioctl for device\nbash: no job control in this shell\nfatal: couldn't find remote ref gone\n" }),
    ).toBe("couldn't find remote ref gone");
  });
});
