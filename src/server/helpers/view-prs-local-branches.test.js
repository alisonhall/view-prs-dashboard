const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile, execFileSync } = require("child_process");
const { createViewPrsLocalBranches, repoFromRemoteUrl, parseWorktrees, parseStatus, describeGitFailure } = require("./view-prs-local-branches");

// A real clone of acme/app in a temp folder: main with two commits, and
// branches as a developer would have them.
const git = (cwd, ...args) =>
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "init.defaultBranch=main", ...args], {
    cwd,
    encoding: "utf8",
  }).trim();
const commit = (cwd, message) => {
  git(cwd, "commit", "--allow-empty", "-q", "-m", message);
  return git(cwd, "rev-parse", "HEAD");
};
const track = (cwd, branch, remote, remoteRef) => {
  git(cwd, "config", `branch.${branch}.remote`, remote);
  git(cwd, "config", `branch.${branch}.merge`, remoteRef);
};

// Real git, failing as the server's runner does: { error, stderr }.
const run = (command, args) =>
  new Promise((resolve, reject) =>
    execFile(command, args, { encoding: "utf8" }, (error, stdout, stderr) => (error ? reject({ error, stderr }) : resolve({ stdout }))),
  );

describe("each PR's local branch", () => {
  let root;
  let clone;
  let oids;
  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "local-branches-"));
    clone = path.join(root, "app");
    fs.mkdirSync(clone);
    git(clone, "init", "-q");
    git(clone, "remote", "add", "origin", "git@github.com:acme/app.git");
    git(clone, "remote", "add", "fork", "https://github.com/me/app.git");
    oids = { base: commit(clone, "base") };
    // feature: two commits past main, tracking origin's feature.
    git(clone, "checkout", "-q", "-b", "feature");
    oids.feature1 = commit(clone, "feature 1");
    oids.feature2 = commit(clone, "feature 2");
    track(clone, "feature", "origin", "refs/heads/feature");
    // local-name: tracks origin's other-name (renamed locally).
    git(clone, "branch", "local-name", oids.feature1);
    track(clone, "local-name", "origin", "refs/heads/other-name");
    // pr-7: gh pr checkout of a fork's PR (its pull ref).
    git(clone, "branch", "pr-7", oids.feature1);
    track(clone, "pr-7", "origin", "refs/pull/7/head");
    // untracked: no upstream; on-fork: tracks the developer's fork only.
    git(clone, "branch", "untracked", oids.base);
    git(clone, "branch", "on-fork", oids.base);
    track(clone, "on-fork", "fork", "refs/heads/on-fork");
    git(clone, "checkout", "-q", "main");
    git(clone, "worktree", "add", "-q", path.join(root, "feature-tree"), "feature");
  });
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  const pr = (overrides) => ({ key: "acme/app#1", repo: "acme/app", number: "1", branch: "", headOid: "", crossRepository: false, commitOids: [], ...overrides });
  const lookUp = async (prs, helper = createViewPrsLocalBranches({ runCommand: run, fs })) =>
    helper.getLocalBranches({ localRepos: { "acme/app": clone }, prs });

  test("reads a remote's repo from its URL: https, ssh and scp-like", () => {
    expect(repoFromRemoteUrl("https://github.com/acme/app.git")).toBe("acme/app");
    expect(repoFromRemoteUrl("https://git.corp.example/acme/app")).toBe("acme/app");
    expect(repoFromRemoteUrl("git@github.com:acme/app.git")).toBe("acme/app");
    expect(repoFromRemoteUrl("ssh://git@github.com/acme/app.git")).toBe("acme/app");
    expect(repoFromRemoteUrl("not a url")).toBe("");
  });

  test("a clone's summary, and the folder checked: a clone of another repo or not one at all says so", async () => {
    const helper = createViewPrsLocalBranches({ runCommand: run, fs });
    expect(await helper.checkClone("acme/app", clone)).toEqual({ path: clone, ok: true, branchCount: 6, worktreeCount: 2 });
    expect(await helper.checkClone("other/repo", clone)).toEqual({
      path: clone,
      ok: false,
      error: "None of its remotes is other/repo (it has acme/app, me/app)",
    });
    expect((await helper.checkClone("acme/app", root)).error).toBe("Not a git repository");
    expect((await helper.checkClone("acme/app", path.join(root, "nope"))).error).toMatch(/^No such folder/);
  });

  test("a folder git won't read says why, in git's words - with how to allow a clone another user owns", async () => {
    const dubious = [
      "fatal: detected dubious ownership in repository at 'D:/code/app'",
      "'D:/code/app' is owned by:",
      "        BUILTIN/Administrators (S-1-5-32-544)",
      "To add an exception for this directory, call:",
      "",
      "        git config --global --add safe.directory D:/code/app",
    ].join("\n");
    const runCommand = async (_command, args) => {
      if (args[2] === "config") throw { error: new Error("Command exited with code 1"), stderr: "" };
      throw { error: new Error("Command exited with code 128"), stderr: dubious };
    };
    const helper = createViewPrsLocalBranches({ runCommand, fs });
    expect((await helper.checkClone("acme/app", clone)).error).toBe(
      "git won't read it: detected dubious ownership in repository at 'D:/code/app' (to allow it: git config --global --add safe.directory D:/code/app)",
    );
    expect(describeGitFailure({ stderr: "fatal: not a git repository (or any of the parent directories): .git" })).toBe("Not a git repository");
  });

  test("the branch tracking the PR's, with its worktree: up to date, behind, or ahead of the PR's newest commit", async () => {
    const { prs } = await lookUp([
      pr({ key: "same", branch: "feature", headOid: oids.feature2 }),
      pr({ key: "ahead", branch: "feature", headOid: oids.feature1 }),
      pr({ key: "behind", branch: "other-name", headOid: oids.feature2 }),
    ]);
    const worktreePath = expect.stringMatching(/feature-tree$/);
    expect(prs.same).toEqual({ branch: "feature", oid: oids.feature2, worktreePath, ahead: 0, behind: 0, exact: true });
    expect(prs.ahead).toEqual({ branch: "feature", oid: oids.feature2, worktreePath, ahead: 1, behind: 0, exact: true });
    // Renamed locally, found by what it tracks; not checked out.
    expect(prs.behind).toEqual({ branch: "local-name", oid: oids.feature1, ahead: 0, behind: 1, exact: true });
  });

  test("the PR's newest commit not in the clone: behind by the PR's commits after the local one, else it differs", async () => {
    const missing = "f".repeat(40);
    const { prs } = await lookUp([
      pr({ key: "counted", branch: "feature", headOid: missing, commitOids: [oids.feature1, oids.feature2, "c3", missing] }),
      pr({ key: "unknown", branch: "feature", headOid: missing, commitOids: ["c1", missing] }),
    ]);
    expect(prs.counted).toMatchObject({ ahead: 0, behind: 2, exact: false });
    expect(prs.unknown).toMatchObject({ branch: "feature", diverged: true });
  });

  test("a row from before the PR's newest commit was kept compares with its newest stored commit", async () => {
    const { prs } = await lookUp([
      pr({ key: "same", branch: "feature", commitOids: [oids.feature1, oids.feature2] }),
      pr({ key: "ahead", branch: "feature", commitOids: [oids.feature1] }),
      pr({ key: "nothing", branch: "feature" }),
    ]);
    expect(prs.same).toMatchObject({ ahead: 0, behind: 0, exact: true });
    expect(prs.ahead).toMatchObject({ ahead: 1, behind: 0, exact: true });
    expect(prs.nothing).toMatchObject({ diverged: true });
  });

  test("a count git couldn't work out is asked again: once a fetch brings the PR's newest commit, it's exact", async () => {
    // Someone else's clone, a commit ahead of feature.
    const other = path.join(root, "other");
    execFileSync("git", ["clone", "-q", "--branch", "feature", clone, other]);
    const head = commit(other, "pushed by someone");
    let nowMs = 1000;
    const helper = createViewPrsLocalBranches({ runCommand: run, fs, now: () => nowMs });
    const prs = [pr({ key: "x", branch: "feature", headOid: head, commitOids: [oids.feature2, head] })];
    expect((await lookUp(prs, helper)).prs.x).toMatchObject({ ahead: 0, behind: 1, exact: false });

    git(clone, "fetch", "-q", other, "feature");
    nowMs += 60 * 1000;
    expect((await lookUp(prs, helper)).prs.x).toMatchObject({ ahead: 0, behind: 1, exact: true });
  });

  test("a PR from a branch named as its base is a fork's, its row marked or not: this repo's branch of that name isn't the PR's", async () => {
    const { prs } = await lookUp([
      pr({ key: "fork-main", branch: "main", targetBranch: "main", headOid: oids.base }),
      pr({ key: "feature", branch: "feature", targetBranch: "main", headOid: oids.feature2 }),
    ]);
    expect(Object.keys(prs)).toEqual(["feature"]);
  });

  test("a fork's PR is found by its pull ref, not by a branch of the same name; a branch on another remote isn't the PR's", async () => {
    const { prs } = await lookUp([
      pr({ key: "fork", number: "7", branch: "feature", crossRepository: true, headOid: oids.feature1 }),
      pr({ key: "fork-unfetched", number: "8", branch: "feature", crossRepository: true, headOid: oids.feature1 }),
      pr({ key: "untracked", branch: "untracked", headOid: oids.base }),
      pr({ key: "elsewhere", branch: "on-fork", headOid: oids.base }),
      pr({ key: "none", branch: "nope", headOid: oids.base }),
    ]);
    expect(prs.fork).toMatchObject({ branch: "pr-7", ahead: 0, behind: 0 });
    expect(prs.fork.nameOnly).toBeUndefined();
    // Same name, no upstream: taken to be the PR's - marked as found by its
    // name alone, as it may not be.
    expect(prs.untracked).toMatchObject({ branch: "untracked", ahead: 0, behind: 0, nameOnly: true });
    expect(Object.keys(prs).sort()).toEqual(["fork", "untracked"]);
  });

  test("two git calls per clone however many PRs, shared for a few seconds; a count between two commits worked out once", async () => {
    const runCommand = jest.fn(run);
    let nowMs = 1000;
    const helper = createViewPrsLocalBranches({ runCommand, fs, now: () => nowMs });
    const prs = [pr({ key: "a", branch: "feature", headOid: oids.feature1 }), pr({ key: "b", branch: "feature", headOid: oids.feature1 })];
    await lookUp(prs, helper);
    await lookUp(prs, helper);
    const calls = () => runCommand.mock.calls.map(([, args]) => args[2]);
    // config, for-each-ref, worktree list; one rev-list for the pair.
    expect(calls().sort()).toEqual(["config", "for-each-ref", "rev-list", "worktree"]);
    nowMs += 60 * 1000;
    await lookUp(prs, helper);
    expect(calls().filter((name) => name === "rev-list")).toHaveLength(1);
    expect(calls().filter((name) => name === "worktree")).toHaveLength(2);
  });

  test("only the clone's own folder or one of its worktrees can be opened", async () => {
    const helper = createViewPrsLocalBranches({ runCommand: run, fs });
    expect(await helper.isOpenableFolder("acme/app", clone, `${clone}${path.sep}`)).toBe(true);
    expect(await helper.isOpenableFolder("acme/app", clone, path.join(root, "feature-tree"))).toBe(true);
    expect(await helper.isOpenableFolder("acme/app", clone, root)).toBe(false);
    expect(await helper.isOpenableFolder("acme/app", undefined, clone)).toBe(false);
  });

  test("a folder named another way - a junction or symlink, or Windows' short name for it - is the same folder", async () => {
    const alias = path.join(root, "alias");
    fs.symlinkSync(clone, alias, "junction");
    try {
      const helper = createViewPrsLocalBranches({ runCommand: run, fs });
      // Saved by one name, asked for by the other - the clone and a worktree.
      expect(await helper.isOpenableFolder("acme/app", alias, clone)).toBe(true);
      expect(await helper.isOpenableFolder("acme/app", alias, path.join(root, "feature-tree"))).toBe(true);
      expect(await helper.isOpenableFolder("acme/app", clone, alias)).toBe(true);
    } finally {
      fs.unlinkSync(alias);
    }
  });

  describe("finding clones in a folder", () => {
    let tree;
    // A clone of a repo, with a commit, at a path in the tree.
    const cloneAt = (relative, repo) => {
      const folder = path.join(tree, relative);
      fs.mkdirSync(folder, { recursive: true });
      git(folder, "init", "-q");
      git(folder, "remote", "add", "origin", `https://github.com/${repo}.git`);
      commit(folder, "base");
      return folder;
    };
    beforeAll(() => {
      tree = path.join(root, "sites");
      cloneAt("app", "acme/app");
      cloneAt("group/api", "acme/api");
      // A clone in main, a branch's worktree beside it.
      const web = cloneAt("web/main", "acme/web");
      git(web, "worktree", "add", "-q", "-b", "feature/x", path.join(tree, "web", "feature_x"));
      // The bare-repo layout: main is a worktree of .bare.
      const bare = path.join(tree, "docs");
      fs.mkdirSync(bare);
      git(bare, "clone", "-q", "--bare", path.join(tree, "app"), ".bare");
      git(path.join(bare, ".bare"), "remote", "set-url", "origin", "git@github.com:acme/docs.git");
      git(path.join(bare, ".bare"), "worktree", "add", "-q", path.join(bare, "main"));
      // That layout grouped by owner, three levels down.
      cloneAt("acme/tools/main", "acme/tools");
      // Not looked in: too deep, node_modules, hidden; and a repo not asked for.
      cloneAt("a/b/c/deep", "acme/deep");
      cloneAt("node_modules/dep", "acme/dep");
      cloneAt(".hidden/secret", "acme/secret");
      cloneAt("other", "someone/else");
    });

    test("finds the clones of the repos asked for, up to three levels down - a main folder, not the worktrees beside it", async () => {
      const helper = createViewPrsLocalBranches({ runCommand: run, fs });
      const repos = ["acme/app", "acme/api", "acme/web", "acme/docs", "acme/tools", "acme/deep", "acme/dep", "acme/secret", "ACME/Missing"];
      const result = await helper.findClones({ folder: tree, repos });
      expect(result).toEqual({
        ok: true,
        found: [
          { repo: "acme/api", path: path.join(tree, "group", "api") },
          { repo: "acme/app", path: path.join(tree, "app") },
          { repo: "acme/docs", path: path.join(tree, "docs", "main") },
          { repo: "acme/tools", path: path.join(tree, "acme", "tools", "main") },
          { repo: "acme/web", path: path.join(tree, "web", "main") },
        ],
      });
    });

    test("a repo's names match whatever their case; the folder itself can be the clone; a folder that isn't there says so", async () => {
      const helper = createViewPrsLocalBranches({ runCommand: run, fs });
      expect((await helper.findClones({ folder: path.join(tree, "app"), repos: ["Acme/App"] })).found).toEqual([
        { repo: "Acme/App", path: path.join(tree, "app") },
      ]);
      expect(await helper.findClones({ folder: path.join(tree, "nope"), repos: ["acme/app"] })).toEqual({
        ok: false,
        error: `No such folder: ${path.join(tree, "nope")}`,
      });
    });

    test("stops after looking in so many folders, and says so", async () => {
      const helper = createViewPrsLocalBranches({ runCommand: run, fs });
      const result = await helper.findClones({ folder: tree, repos: ["acme/app", "acme/web"], maxFolders: 3 });
      expect(result.truncated).toBe(true);
      expect(result.found.length).toBeLessThan(2);
    });
  });

  test("worktree list's blocks: a detached one has no branch, a bare one is marked", () => {
    expect(
      parseWorktrees("worktree /a\nHEAD 1\nbranch refs/heads/x\n\nworktree /b\nHEAD 2\ndetached\n\nworktree /c\nbare\n"),
    ).toEqual([
      { path: "/a", head: "1", branch: "x", bare: false },
      { path: "/b", head: "2", branch: "", bare: false },
      { path: "/c", head: "", branch: "", bare: true },
    ]);
  });
});

describe("the uncommitted changes in a PR's worktree", () => {
  let root;
  let clone;
  let tree;
  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "local-changes-"));
    clone = path.join(root, "app");
    tree = path.join(root, "app-feature");
    fs.mkdirSync(clone);
    git(clone, "init", "-q");
    git(clone, "remote", "add", "origin", "git@github.com:acme/app.git");
    fs.writeFileSync(path.join(clone, "a.txt"), "a\n");
    fs.writeFileSync(path.join(clone, "b.txt"), "b\n");
    git(clone, "add", ".");
    git(clone, "commit", "-q", "-m", "base");
    git(clone, "branch", "feature");
    track(clone, "feature", "origin", "refs/heads/feature");
    git(clone, "branch", "clean");
    track(clone, "clean", "origin", "refs/heads/clean");
    git(clone, "branch", "elsewhere");
    track(clone, "elsewhere", "origin", "refs/heads/elsewhere");
    git(clone, "worktree", "add", "-q", tree, "feature");
    git(clone, "worktree", "add", "-q", path.join(root, "app-clean"), "clean");
    git(clone, "worktree", "add", "-q", "-b", "gone", path.join(root, "app-gone"));
    track(clone, "gone", "origin", "refs/heads/gone");
    fs.rmSync(path.join(root, "app-gone"), { recursive: true, force: true });
    // a.txt staged, then changed again; b.txt renamed (staged); two new
    // files in a new folder, which git lists as the folder alone; one new
    // file at the top.
    fs.writeFileSync(path.join(tree, "a.txt"), "a2\n");
    git(tree, "add", "a.txt");
    fs.writeFileSync(path.join(tree, "a.txt"), "a3\n");
    git(tree, "mv", "b.txt", "c.txt");
    fs.mkdirSync(path.join(tree, "new"));
    fs.writeFileSync(path.join(tree, "new", "x.txt"), "x\n");
    fs.writeFileSync(path.join(tree, "new", "y.txt"), "y\n");
    fs.writeFileSync(path.join(tree, "d.txt"), "d\n");
    // rebasing: its worktree's rebase onto main stopped on a conflict in
    // a.txt - git lists the worktree as detached.
    git(clone, "branch", "rebasing");
    track(clone, "rebasing", "origin", "refs/heads/rebasing");
    const rebasingTree = path.join(root, "app-rebasing");
    git(clone, "worktree", "add", "-q", rebasingTree, "rebasing");
    fs.writeFileSync(path.join(rebasingTree, "a.txt"), "theirs\n");
    git(rebasingTree, "commit", "-q", "-am", "theirs");
    fs.writeFileSync(path.join(clone, "a.txt"), "ours\n");
    git(clone, "commit", "-q", "-am", "ours");
    expect(() =>
      execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "rebase", "main"], { cwd: rebasingTree, stdio: "ignore" }),
    ).toThrow();
  });
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  const pr = (branch) => ({ key: `acme/app#1`, repo: "acme/app", number: "1", branch, headOid: "", crossRepository: false, commitOids: [] });
  const changesOf = (branch, runCommand = run) =>
    createViewPrsLocalBranches({ runCommand, fs }).getWorktreeChanges({ repo: "acme/app", folder: clone, pr: pr(branch) });

  test("counts what's staged, changed and new - a file staged and changed again as both, a rename once, a new folder once", async () => {
    const changes = await changesOf("feature");
    expect(changes).toEqual({
      worktreePath: expect.any(String),
      staged: 2,
      changed: 1,
      untracked: 2,
      conflicted: 0,
      total: 4,
      files: expect.arrayContaining([
        { path: "a.txt", code: "MM" },
        { path: "c.txt", code: "R " },
        { path: "new/", code: "??" },
        { path: "d.txt", code: "??" },
      ]),
    });
    expect(fs.realpathSync.native(changes.worktreePath)).toBe(fs.realpathSync.native(tree));
  });

  test("a clean worktree has nothing; a branch not checked out, or no local branch for the PR, has no answer", async () => {
    expect(await changesOf("clean")).toMatchObject({ staged: 0, changed: 0, untracked: 0, conflicted: 0, total: 0, files: [] });
    expect(await changesOf("elsewhere")).toBeNull();
    expect(await changesOf("no-such-branch")).toBeNull();
  });

  test("a worktree whose folder was deleted says so", async () => {
    expect(await changesOf("gone")).toEqual({ worktreePath: expect.any(String), error: expect.stringMatching(/^Its folder is gone/) });
  });

  test("never takes the index's lock, so the user's own git isn't made to fail", async () => {
    const runCommand = jest.fn(run);
    await changesOf("feature", runCommand);
    const status = runCommand.mock.calls.map(([, args]) => args).find((args) => args.includes("status"));
    expect(status.indexOf("--no-optional-locks")).toBeLessThan(status.indexOf("status"));
  });

  test("a worktree stopped mid-rebase is still its branch's: checked out there, rebasing, its conflicts counted", async () => {
    const helper = createViewPrsLocalBranches({ runCommand: run, fs });
    const { prs } = await helper.getLocalBranches({ localRepos: { "acme/app": clone }, prs: [pr("rebasing")] });
    expect(prs["acme/app#1"]).toEqual(expect.objectContaining({ branch: "rebasing", rebasing: true }));
    expect(fs.realpathSync.native(prs["acme/app#1"].worktreePath)).toBe(fs.realpathSync.native(path.join(root, "app-rebasing")));
    expect(await changesOf("rebasing")).toEqual(expect.objectContaining({ conflicted: 1, files: [{ path: "a.txt", code: "UU" }] }));
    // A worktree not rebasing isn't marked.
    const { prs: others } = await helper.getLocalBranches({ localRepos: { "acme/app": clone }, prs: [pr("feature")] });
    expect(others["acme/app#1"].rebasing).toBeUndefined();
  });

  test("asks at once share one git status; one that takes too long says so", async () => {
    let finish = () => {};
    let statusStarted = () => {};
    const started = new Promise((resolve) => (statusStarted = resolve));
    const runCommand = jest.fn(async (command, args, ...rest) => {
      if (args.includes("status")) {
        const held = new Promise((resolve) => (finish = resolve));
        statusStarted();
        await held;
      }
      return run(command, args, ...rest);
    });
    const helper = createViewPrsLocalBranches({ runCommand, fs });
    const ask = () => helper.getWorktreeChanges({ repo: "acme/app", folder: clone, pr: pr("feature") });
    const first = ask();
    // The second asks while the first's status is running.
    await started;
    const second = ask();
    await new Promise((resolve) => setTimeout(resolve, 20));
    finish();
    expect(await second).toEqual(await first);
    expect(runCommand.mock.calls.filter(([, args]) => args.includes("status"))).toHaveLength(1);

    const slow = createViewPrsLocalBranches({
      fs,
      statusTimeoutMs: 45000,
      runCommand: async (command, args, ...rest) => {
        if (args.includes("status")) throw new Error("Command timed out after 45s");
        return run(command, args, ...rest);
      },
    });
    expect(await slow.getWorktreeChanges({ repo: "acme/app", folder: clone, pr: pr("feature") })).toEqual({
      worktreePath: expect.any(String),
      error: "git status took over 45s (a very large worktree, or one on a slow drive)",
    });
  });

  test("status lines: conflicts counted apart, ignored files left out, at most so many listed but all counted", () => {
    const stdout = ["UU both.txt", "AA added.txt", "!! ignored.log", "R  new.txt", "old.txt", " M x.txt", "?? y.txt", ""].join("\0");
    expect(parseStatus(stdout)).toEqual({
      staged: 1,
      changed: 1,
      untracked: 1,
      conflicted: 2,
      total: 5,
      files: [
        { path: "both.txt", code: "UU" },
        { path: "added.txt", code: "AA" },
        { path: "new.txt", code: "R " },
        { path: "x.txt", code: " M" },
        { path: "y.txt", code: "??" },
      ],
    });
    expect(parseStatus(stdout, 2)).toMatchObject({ total: 5, files: [{ path: "both.txt" }, { path: "added.txt" }] });
    expect(parseStatus("")).toEqual({ staged: 0, changed: 0, untracked: 0, conflicted: 0, total: 0, files: [] });
  });
});
