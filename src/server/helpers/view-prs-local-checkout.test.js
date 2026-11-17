const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile, execFileSync } = require("child_process");
const { createViewPrsLocalBranches } = require("./view-prs-local-branches");
const {
  createViewPrsLocalCheckout,
  planCheckout,
  commandNameOf,
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
    // A marker line printed to stdout and stderr once the shell's started (new each run), then the command
    expect(calls[0].args).toEqual([
      "-ic",
      expect.stringMatching(/^exec <\/dev\/null\nprintf '@@view-prs-%s@@\\n' ([0-9a-f]{16}); printf '@@view-prs-%s@@\\n' \1 >&2\ncd -- "\$VIEW_PRS_FOLDER" \|\| exit 1\nmy-tool add "\$VIEW_PRS_BRANCH"$/),
    ]);
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

  test("Check commands: whether the user's shell (its rc file read) knows each command's first word, past NAME=value words", async () => {
    const rc = path.join(root, "home", ".bashrc");
    fs.writeFileSync(rc, "echo 'Hello from the rc file'\nmy-fn() { :; }\n");
    try {
      const { checkout } = setUp();
      const results = await checkout.checkCommands({
        cloneFolder: freshClone(),
        commands: ['MY_DIR="$(dirname "$VIEW_PRS_CLONE")" my-fn add {branch}', "no-such-command-here {branch}", '"$MY_TOOL" add'],
      });
      expect(results).toEqual([
        expect.objectContaining({ name: "my-fn", found: true, detail: "my-fn is a function" }),
        expect.objectContaining({ name: "no-such-command-here", found: false, detail: expect.stringMatching(/^no-such-command-here isn't known to your shell \(bash\)/) }),
        expect.objectContaining({ name: "", found: null }),
      ]);
    } finally {
      fs.rmSync(rc, { force: true });
    }
  });

  test("the plan: the repo's command, unless the clone has a branch for the PR or it's a fork's PR the command isn't for", () => {
    const settings = { command: "my-tool {branch}" };
    expect(planCheckout({ existing: false, isFork: false, settings })).toBe("command");
    expect(planCheckout({ existing: true, isFork: false, settings })).toBe("git");
    expect(planCheckout({ existing: false, isFork: true, settings })).toBe("git");
    expect(planCheckout({ existing: false, isFork: true, settings: { ...settings, forks: true } })).toBe("command");
    expect(planCheckout({ existing: false, isFork: false, settings: { after: "npm ci" } })).toBe("git");
    expect(planCheckout({ existing: false, isFork: false, settings: null })).toBe("git");
  });

  test("a command's first word: past NAME=value words (quoted, or a substitution); none when it's itself a variable", () => {
    expect(commandNameOf("my-tool add {branch}")).toBe("my-tool");
    expect(commandNameOf('  A=1 B="two words" C=$(dirname "$X") my-tool add')).toBe("my-tool");
    expect(commandNameOf('cd "$VIEW_PRS_CLONE" && npm ci')).toBe("cd");
    expect(commandNameOf("~/bin/my-tool;echo")).toBe("~/bin/my-tool");
    expect(commandNameOf('"$TOOL" add')).toBe("");
    expect(commandNameOf("$(which tool) add")).toBe("");
    expect(commandNameOf("A=1")).toBe("");
    expect(commandNameOf("")).toBe("");
  });

  test("one checkout, fetch or pull at a time per clone", async () => {
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
    // A checkout waits for a fetch too.
    let releaseFetch;
    const heldFetch = new Promise((resolve) => {
      releaseFetch = resolve;
    });
    const { checkout: other } = setUp(async (command, args, maxBuffer, options) => {
      if (args.includes("fetch")) await heldFetch;
      return run(command, args, maxBuffer, options);
    });
    const fetching = other.fetchPr({ repo: "acme/app", cloneFolder: clone, pr: pr() });
    await new Promise((resolve) => setTimeout(resolve, 200));
    await expect(other.checkOut({ repo: "acme/app", cloneFolder: clone, settings: null, pr: pr() })).rejects.toMatchObject({ status: 409 });
    // And a pull.
    await expect(other.pullPr({ repo: "acme/app", cloneFolder: clone, pr: pr() })).rejects.toMatchObject({
      status: 409,
      message: "A checkout, fetch or pull in acme/app's clone is already running",
    });
    releaseFetch();
    await expect(fetching).resolves.toEqual(expect.objectContaining({ remote: "origin" }));
  });

  describe("Fetch: the PR's branch into the clone, for an exact count", () => {
    // A branch the remote has moved on since the clone was made: the
    // clone's local branch tracks it, a commit behind, the PR's newest not
    // in the clone.
    const movedOn = (name) => {
      const seed = path.join(root, "seed");
      git(seed, "push", "-q", remote, `${oids.feature}:refs/heads/${name}`);
      const clone = freshClone();
      git(clone, "branch", "-q", "--track", name, `origin/${name}`);
      git(seed, "checkout", "-q", "--detach", oids.feature);
      const head = commit(seed, `more on ${name}`);
      git(seed, "push", "-q", remote, `${head}:refs/heads/${name}`);
      git(seed, "checkout", "-q", "main");
      return { clone, head };
    };
    const countOf = async (localBranches, clone, row) =>
      (await localBranches.getLocalBranches({ localRepos: { "acme/app": clone }, prs: [{ key: "k", repo: "acme/app", ...row }] })).prs.k;

    test("from the remote the local branch tracks: the count is exact after, and no files or local branches change", async () => {
      const { clone, head } = movedOn("feature/f");
      const { localBranches, checkout } = setUp();
      const row = { number: "3", branch: "feature/f", targetBranch: "main", headOid: head, commitOids: [oids.feature, head] };
      expect(await countOf(localBranches, clone, row)).toEqual(expect.objectContaining({ behind: 1, exact: false }));
      const branchesBefore = git(clone, "for-each-ref", "refs/heads");

      expect(await checkout.fetchPr({ repo: "acme/app", cloneFolder: clone, pr: { ...row, crossRepository: false } })).toEqual({
        remote: "origin",
        ref: "refs/heads/feature/f",
      });
      expect(await countOf(localBranches, clone, row)).toEqual(expect.objectContaining({ ahead: 0, behind: 1, exact: true }));
      expect(git(clone, "for-each-ref", "refs/heads")).toBe(branchesBefore);
      expect(git(clone, "status", "--porcelain")).toBe("");
    });

    test("a fork's PR: its pull ref, no branch made", async () => {
      const clone = freshClone();
      const { checkout } = setUp();
      expect(await checkout.fetchPr({ repo: "acme/app", cloneFolder: clone, pr: { ...forkPr(), headOid: oids.fork } })).toEqual({
        remote: "origin",
        ref: "refs/pull/9/head",
      });
      expect(git(clone, "rev-parse", "FETCH_HEAD")).toBe(oids.fork);
      expect(git(clone, "branch", "--list", "pr-9")).toBe("");
    });

    test("the PR's newest commit still not there after (pushed over since) is a warning; a branch git can't fetch says why", async () => {
      const clone = freshClone();
      const { checkout } = setUp();
      const gone = "0123456789abcdef0123456789abcdef01234567";
      const result = await checkout.fetchPr({ repo: "acme/app", cloneFolder: clone, pr: pr({ headOid: gone }) });
      expect(result.warning).toBe(
        "Fetched refs/heads/feature/x from origin, but the PR's newest commit as last fetched here (0123456) isn't on it - it may have been pushed over since; update the PR",
      );
      // A row from before headOid was kept: its newest stored commit, as the count uses.
      const older = await checkout.fetchPr({ repo: "acme/app", cloneFolder: clone, pr: pr({ headOid: "", commitOids: [oids.base, gone] }) });
      expect(older.warning).toMatch(/newest commit as last fetched here \(0123456\) isn't on it/);
      expect(await checkout.fetchPr({ repo: "acme/app", cloneFolder: clone, pr: pr({ headOid: "", commitOids: [oids.feature] }) })).toEqual({
        remote: "origin",
        ref: "refs/heads/feature/x",
      });
      // None known (or not a commit id, never given to git): nothing to count against.
      for (const unknown of [{ headOid: "" }, { headOid: "--output=x", commitOids: [] }]) {
        expect((await checkout.fetchPr({ repo: "acme/app", cloneFolder: clone, pr: pr(unknown) })).warning).toBe(
          "Fetched refs/heads/feature/x from origin, but the dashboard doesn't know the PR's newest commit yet, so there's nothing to count against - update the PR",
        );
      }
      await expect(checkout.fetchPr({ repo: "acme/app", cloneFolder: clone, pr: pr({ branch: "no/such" }) })).rejects.toMatchObject({
        status: 502,
        message: expect.stringMatching(/^git fetch failed: couldn't find remote ref/),
      });
      await expect(checkout.fetchPr({ repo: "acme/app", cloneFolder: clone, pr: pr({ branch: "" }) })).rejects.toMatchObject({ status: 422 });
    });
  });

  describe("Pull: the PR's local branch fast-forwarded to the PR's branch", () => {
    // As Fetch's: a local branch tracking a branch the remote has moved on
    // since, a commit behind - here checked out in a worktree, or not.
    const movedOn = (name, { worktree = true } = {}) => {
      const seed = path.join(root, "seed");
      git(seed, "push", "-q", remote, `${oids.feature}:refs/heads/${name}`);
      const clone = freshClone();
      git(clone, "branch", "-q", "--track", name, `origin/${name}`);
      const tree = path.join(path.dirname(clone), folderNameFor(name));
      if (worktree) git(clone, "worktree", "add", "-q", tree, name);
      git(seed, "checkout", "-q", "--detach", oids.feature);
      const head = commit(seed, `more on ${name}`);
      git(seed, "push", "-q", remote, `${head}:refs/heads/${name}`);
      git(seed, "checkout", "-q", "main");
      return { clone, tree, head };
    };
    const rowFor = (name, head) => ({ number: "4", branch: name, targetBranch: "main", crossRepository: false, headOid: head, commitOids: [oids.feature, head] });

    test("in its worktree: fast-forwarded to the PR's newest commit, then up to date - a new file there doesn't stop it", async () => {
      const { clone, tree, head } = movedOn("feature/p");
      fs.writeFileSync(path.join(tree, "notes.txt"), "mine\n");
      const { localBranches, checkout } = setUp();
      const result = await checkout.pullPr({ repo: "acme/app", cloneFolder: clone, pr: rowFor("feature/p", head) });
      expect(result).toEqual({ branch: "feature/p", from: oids.feature, to: head, commits: 1, worktreePath: expect.any(String) });
      samePath(result.worktreePath, tree);
      expect(git(tree, "rev-parse", "HEAD")).toBe(head);
      expect(fs.readFileSync(path.join(tree, "notes.txt"), "utf8")).toBe("mine\n");
      const { prs } = await localBranches.getLocalBranches({ localRepos: { "acme/app": clone }, prs: [{ key: "k", repo: "acme/app", ...rowFor("feature/p", head) }] });
      expect(prs.k).toMatchObject({ ahead: 0, behind: 0, exact: true });
      // Again: nothing to do.
      expect(await checkout.pullPr({ repo: "acme/app", cloneFolder: clone, pr: rowFor("feature/p", head) })).toMatchObject({ already: true, commits: 0 });
    });

    test("a branch not checked out has its ref moved, no files touched", async () => {
      const { clone, head } = movedOn("feature/q", { worktree: false });
      const { checkout } = setUp();
      const result = await checkout.pullPr({ repo: "acme/app", cloneFolder: clone, pr: rowFor("feature/q", head) });
      expect(result).toEqual({ branch: "feature/q", from: oids.feature, to: head, commits: 1 });
      expect(git(clone, "rev-parse", "refs/heads/feature/q")).toBe(head);
      expect(git(clone, "status", "--porcelain")).toBe("");
    });

    test("refused, nothing changed: uncommitted changes, commits of its own, no local branch, or one tracking nothing", async () => {
      const { clone, tree, head } = movedOn("feature/r");
      const { checkout } = setUp();
      const pull = (row) => checkout.pullPr({ repo: "acme/app", cloneFolder: clone, pr: row });
      // A change staged in the worktree.
      fs.writeFileSync(path.join(tree, "staged.txt"), "x\n");
      git(tree, "add", "staged.txt");
      await expect(pull(rowFor("feature/r", head))).rejects.toMatchObject({
        status: 409,
        message: expect.stringMatching(/^Uncommitted changes in .* - commit or stash them first$/),
      });
      expect(git(tree, "rev-parse", "HEAD")).toBe(oids.feature);
      // Committed: now a commit the PR's branch doesn't have.
      git(tree, "commit", "-q", "-m", "mine");
      const mine = git(tree, "rev-parse", "HEAD");
      await expect(pull(rowFor("feature/r", head))).rejects.toMatchObject({
        status: 409,
        message: "feature/r has commits refs/heads/feature/r on origin doesn't, so it can't be fast-forwarded - nothing was changed (merge or rebase it yourself)",
      });
      expect(git(tree, "rev-parse", "HEAD")).toBe(mine);
      await expect(pull(rowFor("no/branch", head))).rejects.toMatchObject({ status: 409, message: "No local branch for #4 in acme/app's clone" });
      // Same name, tracking nothing: perhaps not the PR's.
      git(clone, "branch", "-q", "lonely", oids.base);
      await expect(pull(rowFor("lonely", head))).rejects.toMatchObject({
        status: 409,
        message: "lonely tracks no branch of acme/app, so it may not be the PR's - pull it yourself",
      });
    });
  });

  describe("Clean up after merged and closed PRs", () => {
    // A branch on the remote at the feature commit, tracked by a local one
    // - in a worktree beside the clone, or not.
    const tracked = (clone, name, { worktree = true } = {}) => {
      git(path.join(root, "seed"), "push", "-q", "-f", remote, `${oids.feature}:refs/heads/${name}`);
      git(clone, "fetch", "-q", "origin", `+refs/heads/${name}:refs/remotes/origin/${name}`);
      git(clone, "branch", "-q", "--track", name, `origin/${name}`);
      const tree = path.join(path.dirname(clone), folderNameFor(name));
      if (worktree) git(clone, "worktree", "add", "-q", tree, name);
      return tree;
    };
    const row = (number, name, { done = true } = {}) => ({
      key: `acme/app#${number}`,
      repo: "acme/app",
      number: String(number),
      branch: name,
      targetBranch: "main",
      crossRepository: false,
      headOid: oids.feature,
      commitOids: [oids.feature],
      done,
    });
    const byBranch = (result) => Object.fromEntries(result.items.map((item) => [item.branch || item.worktreePath, item]));

    test("plain git: merged and closed PRs' branches, with their worktrees - safe, or not and why; open PRs' not listed", async () => {
      const clone = freshClone();
      const merged = tracked(clone, "done/merged");
      tracked(clone, "done/only", { worktree: false });
      const dirty = tracked(clone, "done/dirty");
      fs.writeFileSync(path.join(dirty, "new.txt"), "x\n");
      const ahead = tracked(clone, "done/ahead");
      commit(ahead, "mine");
      tracked(clone, "still/open");
      tracked(clone, "shared");
      git(clone, "branch", "-q", "lonely", oids.feature);
      const locked = tracked(clone, "done/locked");
      git(clone, "worktree", "lock", locked);
      const prs = [
        row(1, "done/merged"),
        row(2, "done/only"),
        row(3, "done/dirty"),
        row(4, "done/ahead"),
        row(5, "still/open", { done: false }),
        row(6, "shared"),
        row(7, "shared", { done: false }),
        row(8, "lonely"),
        row(9, "done/locked"),
      ];
      const { checkout } = setUp();
      const result = await checkout.listCleanup({ repo: "acme/app", cloneFolder: clone, settings: null, prs });
      expect(result.by).toBe("git");
      const items = byBranch(result);
      expect(Object.keys(items).sort()).toEqual(["done/ahead", "done/dirty", "done/locked", "done/merged", "done/only", "lonely", "shared"]);
      expect(items["done/merged"]).toMatchObject({ safe: true, reasons: [], prs: [{ number: "1", done: true }] });
      samePath(items["done/merged"].worktreePath, merged);
      expect(items["done/only"]).toMatchObject({ safe: true, oid: oids.feature });
      expect(items["done/only"].worktreePath).toBeUndefined();
      expect(items["done/dirty"]).toMatchObject({ safe: false, reasons: ["Uncommitted: 1 new"] });
      expect(items["done/ahead"]).toMatchObject({ safe: false, reasons: ["1 commit not on GitHub"] });
      expect(items.shared).toMatchObject({ safe: false, reasons: ["#7 is still open"] });
      expect(items.lonely).toMatchObject({ safe: false, reasons: ["lonely tracks nothing - found by its name alone, so it may not be the PR's"] });
      expect(items["done/locked"]).toMatchObject({ safe: false, reasons: ["Its worktree is locked (git worktree unlock it first)"] });
      // The safe ones first.
      expect(result.items.slice(0, 2).map((item) => item.branch)).toEqual(["done/merged", "done/only"]);
    });

    test("a long-lived branch a merged PR came from - a PR's base, or the source of several - is kept, though clean and pushed", async () => {
      const clone = freshClone();
      tracked(clone, "develop");
      tracked(clone, "release/1", { worktree: false });
      tracked(clone, "done/one", { worktree: false });
      const prs = [
        // develop into main, merged twice.
        row(1, "develop"),
        row(2, "develop"),
        // A release branch merged, and the base of a PR still open.
        row(3, "release/1"),
        { ...row(4, "feature/y", { done: false }), targetBranch: "release/1" },
        row(5, "done/one"),
      ];
      const { checkout } = setUp();
      const items = byBranch(await checkout.listCleanup({ repo: "acme/app", cloneFolder: clone, settings: null, prs }));
      expect(items.develop).toMatchObject({ safe: false, reasons: ["2 PRs have come from develop - a long-lived branch?"] });
      expect(items["release/1"]).toMatchObject({ safe: false, reasons: ["release/1 is the base of #4 - a long-lived branch"] });
      expect(items["done/one"]).toMatchObject({ safe: true });
      await expect(
        checkout.removeCleanup({ repo: "acme/app", cloneFolder: clone, settings: null, prs, branch: "release/1", worktreePath: "" }),
      ).rejects.toMatchObject({ status: 409, message: "Not safe to remove: release/1 is the base of #4 - a long-lived branch" });
      expect(git(clone, "branch", "--list", "release/1")).toContain("release/1");
    });

    test("a branch checked out in the clone's own folder is never safe", async () => {
      const clone = freshClone();
      tracked(clone, "done/here", { worktree: false });
      git(clone, "checkout", "-q", "done/here");
      const { checkout } = setUp();
      const result = await checkout.listCleanup({ repo: "acme/app", cloneFolder: clone, settings: null, prs: [row(1, "done/here")] });
      expect(byBranch(result)["done/here"]).toMatchObject({ safe: false, reasons: ["It's the clone's own folder"] });
    });

    test("removing: the worktree and the branch with its tracking settings - only once listed again and still safe", async () => {
      const clone = freshClone();
      const tree = tracked(clone, "done/merged");
      tracked(clone, "done/only", { worktree: false });
      const gone = tracked(clone, "done/gone");
      fs.rmSync(gone, { recursive: true, force: true });
      const prs = [row(1, "done/merged"), row(2, "done/only"), row(3, "done/gone")];
      const { checkout, localBranches } = setUp();
      const listed = byBranch(await checkout.listCleanup({ repo: "acme/app", cloneFolder: clone, settings: null, prs }));
      expect(listed["done/gone"]).toMatchObject({ safe: true, notes: ["Its folder is gone already - git still lists it"] });
      const remove = (item) =>
        checkout.removeCleanup({ repo: "acme/app", cloneFolder: clone, settings: null, prs, branch: item.branch, worktreePath: item.worktreePath });

      // A change made since it was listed: refused, nothing removed.
      fs.writeFileSync(path.join(tree, "late.txt"), "x\n");
      await expect(remove(listed["done/merged"])).rejects.toMatchObject({ status: 409, message: "Not safe to remove: Uncommitted: 1 new" });
      expect(fs.existsSync(tree)).toBe(true);
      fs.rmSync(path.join(tree, "late.txt"));

      expect(await remove(listed["done/merged"])).toEqual({
        removed: { worktreePath: listed["done/merged"].worktreePath, branch: "done/merged" },
        how: "git",
        output: "",
      });
      expect(fs.existsSync(tree)).toBe(false);
      expect(git(clone, "branch", "--list", "done/merged")).toBe("");
      expect(() => git(clone, "config", "branch.done/merged.remote")).toThrow();
      expect(await remove(listed["done/only"])).toMatchObject({ removed: { branch: "done/only" } });
      expect(await remove(listed["done/gone"])).toMatchObject({ removed: { branch: "done/gone" } });
      expect(git(clone, "worktree", "list", "--porcelain")).not.toContain("done_gone");
      // Gone now: no longer listed.
      await expect(remove(listed["done/only"])).rejects.toMatchObject({ status: 409, message: "It's no longer in the list - look again" });
      const { prs: after } = await localBranches.getLocalBranches({ localRepos: { "acme/app": clone }, prs });
      expect(after).toEqual({});
    });

    test("the repo's list and remove commands: the worktrees it prints that are the clone's, the dashboard's checks still applied", async () => {
      const clone = freshClone();
      const tree = tracked(clone, "mine/old");
      const open = tracked(clone, "still/open");
      const log = path.join(root, "clean-log");
      const settings = {
        cleanupList: `printf '%s\\n' "$VIEW_PRS_CLONE" "${toPosix(tree)}" "${toPosix(open)}" /not/a/worktree; echo "why: they're old" >&2`,
        cleanupRemove: `printf '%s|%s\\n' "$VIEW_PRS_WORKTREE" "$VIEW_PRS_LOCAL_BRANCH" >> "${toPosix(log)}" && git worktree remove {worktree}`,
      };
      const prs = [row(5, "still/open", { done: false })];
      const { checkout } = setUp();
      const result = await checkout.listCleanup({ repo: "acme/app", cloneFolder: clone, settings, prs });
      expect(result).toMatchObject({ by: "command", ignored: ["/not/a/worktree"], output: "why: they're old" });
      const items = byBranch(result);
      expect(items["mine/old"]).toMatchObject({ safe: true, notes: ["No PR on the page has this branch, so what's pushed isn't checked"] });
      expect(items["still/open"]).toMatchObject({ safe: false, reasons: ["#5 is still open"] });
      expect(items.main).toMatchObject({ safe: false, reasons: ["main is the base of #5 - a long-lived branch", "It's the clone's own folder"] });

      const removed = await checkout.removeCleanup({ repo: "acme/app", cloneFolder: clone, settings, prs, branch: "mine/old", worktreePath: items["mine/old"].worktreePath });
      expect(removed).toMatchObject({ removed: { worktreePath: items["mine/old"].worktreePath }, how: "command" });
      expect(fs.readFileSync(log, "utf8").trim()).toBe(`${toPosix(items["mine/old"].worktreePath)}|mine/old`);
      expect(fs.existsSync(tree)).toBe(false);
      // The branch is the command's to remove: left as it is.
      expect(git(clone, "branch", "--list", "mine/old")).toContain("mine/old");
    });

    test("what the user's shell prints as it starts - their rc file's greeting - is left out of the commands' output; all kept when it stops while starting", async () => {
      const rc = path.join(root, "home", ".bashrc");
      // Like a greeting, and like a version manager's complaint on stderr
      fs.writeFileSync(rc, "echo 'Hello from the rc file'\necho 'error: the rc file complains' >&2\n");
      try {
        const clone = freshClone();
        const tree = tracked(clone, "mine/old");
        const settings = { cleanupList: `echo "${toPosix(tree)}"; echo "why: it's old" >&2`, cleanupRemove: "echo removing it; git worktree remove {worktree}" };
        const { checkout } = setUp();
        const listed = await checkout.listCleanup({ repo: "acme/app", cloneFolder: clone, settings, prs: [] });
        expect(listed.ignored).toBeUndefined();
        expect(listed.output).toBe("why: it's old");
        const [item] = listed.items;
        const removed = await checkout.removeCleanup({ repo: "acme/app", cloneFolder: clone, settings, prs: [], branch: item.branch, worktreePath: item.worktreePath });
        expect(removed.output).toBe("removing it");
        // A failing command's reason is its own, not the rc file's error line
        await expect(
          checkout.listCleanup({ repo: "acme/app", cloneFolder: clone, settings: { cleanupList: "echo 'no such layout' >&2; exit 3" }, prs: [] }),
        ).rejects.toMatchObject({ status: 502, message: "The list command failed: no such layout", output: "no such layout" });
        // An rc file's set -x traces the script's lines to stderr: the marker's isn't taken for it
        fs.writeFileSync(rc, "echo 'Hello from the rc file'\nset -x\n");
        const traced = await checkout.listCleanup({ repo: "acme/app", cloneFolder: clone, settings: { cleanupList: "echo 'why: it is traced' >&2" }, prs: [] });
        expect(traced.output).not.toMatch(/@@view-prs|printf|Hello/);
        expect(traced.output).toMatch(/why: it is traced$/);
        // A shell that stops as it starts prints no marker: all of it is kept, to say why
        fs.writeFileSync(rc, "echo 'error: the rc file gave up' >&2\nexit 3\n");
        await expect(checkout.listCleanup({ repo: "acme/app", cloneFolder: clone, settings, prs: [] })).rejects.toMatchObject({
          status: 502,
          message: "The list command failed: the rc file gave up",
        });
      } finally {
        fs.rmSync(rc, { force: true });
      }
    });

    test("a remove command that leaves the worktree there says so; a list command that fails says why", async () => {
      const clone = freshClone();
      const tree = tracked(clone, "mine/kept");
      const { checkout } = setUp();
      const settings = { cleanupList: `echo "${toPosix(tree)}"`, cleanupRemove: "echo did nothing" };
      const [item] = (await checkout.listCleanup({ repo: "acme/app", cloneFolder: clone, settings, prs: [] })).items;
      await expect(
        checkout.removeCleanup({ repo: "acme/app", cloneFolder: clone, settings, prs: [], branch: item.branch, worktreePath: item.worktreePath }),
      ).rejects.toMatchObject({ status: 502, message: `The remove command finished, but ${item.worktreePath} is still a worktree of the clone`, output: "did nothing" });
      await expect(
        checkout.listCleanup({ repo: "acme/app", cloneFolder: clone, settings: { cleanupList: "echo 'error: no such layout' >&2; exit 3" }, prs: [] }),
      ).rejects.toMatchObject({ status: 502, message: "The list command failed: no such layout" });
    });
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
    // The "exit" an interactive shell prints when a command exits it
    expect(reasonOf({ stderr: "no such layout\nexit\n" })).toBe("no such layout");
  });
});
