const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile, execFileSync } = require("child_process");
const { createViewPrsLocalBranches, repoFromRemoteUrl, parseWorktrees, parseStatus, describeGitFailure, findDefaultBranch } = require("./view-prs-local-branches");

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
    expect(prs.same).toEqual({ branch: "feature", oid: oids.feature2, worktreePath, ahead: 0, behind: 0, exact: true, unpushed: 0 });
    // The clone has no copy of origin's feature: its commit past the PR's
    // isn't pushed, as far as it can tell.
    expect(prs.ahead).toEqual({ branch: "feature", oid: oids.feature2, worktreePath, ahead: 1, behind: 0, exact: true, unpushed: 1 });
    // Renamed locally, found by what it tracks; not checked out.
    expect(prs.behind).toEqual({ branch: "local-name", oid: oids.feature1, ahead: 0, behind: 1, exact: true, unpushed: 0 });
  });

  test("not pushed: commits on neither the PR nor the clone's copy of the remote branch - a push from here counts at once", async () => {
    try {
      // Pushed from here: origin's feature, as the clone has it, is the local one.
      git(clone, "update-ref", "refs/remotes/origin/feature", oids.feature2);
      const missing = "f".repeat(40);
      let { prs } = await lookUp([
        pr({ key: "pushed", branch: "feature", headOid: oids.feature1 }),
        pr({ key: "unfetched", branch: "feature", headOid: missing, commitOids: ["c1", missing] }),
      ]);
      // Ahead of the PR as the dashboard last fetched it, but pushed.
      expect(prs.pushed).toMatchObject({ ahead: 1, unpushed: 0 });
      expect(prs.unfetched).toMatchObject({ diverged: true, unpushed: 0 });

      // Last fetched a commit back: one local commit past both.
      git(clone, "update-ref", "refs/remotes/origin/feature", oids.feature1);
      ({ prs } = await lookUp([
        pr({ key: "ahead", branch: "feature", headOid: oids.base }),
        pr({ key: "unfetched", branch: "feature", headOid: missing, commitOids: ["c1", missing] }),
        pr({ key: "name-only", branch: "untracked", headOid: missing }),
      ]));
      expect(prs.ahead).toMatchObject({ ahead: 2, unpushed: 1 });
      expect(prs.unfetched).toMatchObject({ diverged: true, unpushed: 1 });
      // Found by its name alone: perhaps not the PR's, so not said.
      expect(prs["name-only"].unpushed).toBeUndefined();
    } finally {
      git(clone, "update-ref", "-d", "refs/remotes/origin/feature");
    }
    // Neither the PR's newest nor a copy of the remote branch in the clone:
    // it can't say.
    const { prs } = await lookUp([pr({ key: "unknown", branch: "feature", headOid: "f".repeat(40), commitOids: ["c1"] })]);
    expect(prs.unknown).toMatchObject({ diverged: true });
    expect(prs.unknown.unpushed).toBeUndefined();
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

  test("four git calls per clone however many PRs, shared for a few seconds; the counts between commits worked out once", async () => {
    const runCommand = jest.fn(run);
    let nowMs = 1000;
    const helper = createViewPrsLocalBranches({ runCommand, fs, now: () => nowMs });
    const prs = [pr({ key: "a", branch: "feature", headOid: oids.feature1 }), pr({ key: "b", branch: "feature", headOid: oids.feature1 })];
    await lookUp(prs, helper);
    await lookUp(prs, helper);
    const calls = () => runCommand.mock.calls.map(([, args]) => args[2]);
    // config, for-each-ref (local branches, remote ones), worktree list;
    // for the pair one rev-list for ahead/behind, one for what's not pushed.
    expect(calls().sort()).toEqual(["config", "for-each-ref", "for-each-ref", "rev-list", "rev-list", "worktree"]);
    nowMs += 60 * 1000;
    await lookUp(prs, helper);
    expect(calls().filter((name) => name === "rev-list")).toHaveLength(2);
    expect(calls().filter((name) => name === "worktree")).toHaveLength(2);
  });

  test("remote branches git can't list (too many, say) fail nothing else: what's not pushed is told from the PR alone", async () => {
    try {
      git(clone, "update-ref", "refs/remotes/origin/feature", oids.feature2);
      const runCommand = async (command, args, ...rest) => {
        if (args.includes("refs/remotes")) throw { error: new Error("stdout maxBuffer length exceeded"), stderr: "" };
        return run(command, args, ...rest);
      };
      const helper = createViewPrsLocalBranches({ runCommand, fs });
      const result = await lookUp([pr({ key: "ahead", branch: "feature", headOid: oids.feature1 })], helper);
      expect(result.repos["acme/app"]).toMatchObject({ ok: true });
      // Pushed, but without the clone's copy of origin's feature it can't
      // tell: counted against the PR alone.
      expect(result.prs.ahead).toMatchObject({ branch: "feature", ahead: 1, unpushed: 1 });
    } finally {
      git(clone, "update-ref", "-d", "refs/remotes/origin/feature");
    }
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

  test("worktree list's blocks: a detached one has no branch, a bare one is marked, the first is the main one, a locked one is marked", () => {
    expect(
      parseWorktrees(
        "worktree /a\nHEAD 1\nbranch refs/heads/x\n\nworktree /b\nHEAD 2\ndetached\n\nworktree /c\nbare\n\nworktree /d\nHEAD 3\nbranch refs/heads/y\nlocked\n\nworktree /e\nHEAD 4\nbranch refs/heads/z\nlocked on a usb drive\n",
      ),
    ).toEqual([
      { path: "/a", head: "1", branch: "x", bare: false, main: true },
      { path: "/b", head: "2", branch: "", bare: false },
      { path: "/c", head: "", branch: "", bare: true },
      { path: "/d", head: "3", branch: "y", bare: false, locked: true },
      { path: "/e", head: "4", branch: "z", bare: false, locked: true },
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

// A clone made by git clone (so origin/HEAD names the default branch), with
// branches that have no PR: pushed, local only, behind its upstream, and one
// that is a PR's.
describe("branches tracked without a PR", () => {
  let root;
  let remote;
  let clone;
  const helper = () => createViewPrsLocalBranches({ runCommand: run, fs });
  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "tracked-branches-"));
    const seed = path.join(root, "seed");
    remote = path.join(root, "remote.git");
    fs.mkdirSync(seed);
    git(seed, "init", "-q");
    commit(seed, "base");
    git(seed, "checkout", "-q", "-b", "pushed");
    commit(seed, "pushed 1");
    git(seed, "checkout", "-q", "-b", "stale");
    commit(seed, "stale 1");
    commit(seed, "stale 2");
    git(seed, "checkout", "-q", "-b", "feature-pr", "main");
    commit(seed, "pr work");
    git(seed, "checkout", "-q", "main");
    git(root, "clone", "-q", "--bare", seed, remote);
    clone = path.join(root, "app");
    git(root, "clone", "-q", remote, clone);
    // The remote is a local folder; the repo is told by its URL, so name it
    // as GitHub would.
    git(clone, "remote", "set-url", "origin", "git@github.com:acme/app.git");
    git(clone, "config", "remote.origin.pushurl", remote);
    // pushed: tracks origin/pushed, one commit ahead of main.
    git(clone, "checkout", "-q", "-b", "pushed", "origin/pushed");
    // stale: tracks origin/stale but is a commit behind it.
    git(clone, "branch", "stale", "origin/stale~1");
    track(clone, "stale", "origin", "refs/heads/stale");
    // local-only: two commits on none of the remote's branches, in a worktree.
    git(clone, "checkout", "-q", "-b", "local-only", "main");
    commit(clone, "local 1");
    commit(clone, "local 2");
    git(clone, "checkout", "-q", "main");
    git(clone, "worktree", "add", "-q", path.join(root, "local-tree"), "local-only");
    // feature-pr: the branch of an open PR.
    git(clone, "branch", "feature-pr", "origin/feature-pr");
    track(clone, "feature-pr", "origin", "refs/heads/feature-pr");
  });
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  const prs = [{ key: "acme/app#5", repo: "acme/app", number: "5", branch: "feature-pr", targetBranch: "main", headOid: "", crossRepository: false, commitOids: [], done: false }];

  test("the default branch comes from origin/HEAD, else main or master", async () => {
    const result = await helper().getBranchCandidates({ repo: "acme/app", folder: clone });
    expect(result.defaultBranch).toBe("main");
    expect(findDefaultBranch("", ["origin"], [{ name: "master" }])).toBe("master");
    expect(findDefaultBranch("refs/remotes/origin/HEAD\tabc\trefs/remotes/origin/develop", ["origin"], [])).toBe("develop");
    expect(findDefaultBranch("", ["origin"], [])).toBe("");
  });

  test("candidates: the main branches first (the default, PRs' bases), then local branches with no PR, not tracked already, newest first", async () => {
    const result = await helper().getBranchCandidates({ repo: "acme/app", folder: clone, prs, tracked: ["stale"] });
    expect(result.ok).toBe(true);
    const names = result.branches.map((branch) => branch.name);
    expect(names[0]).toBe("main");
    expect(result.branches[0]).toMatchObject({ main: true, upstream: "origin/main" });
    expect(names.slice(1).sort()).toEqual(["local-only", "pushed"]);
    expect(result.branches.filter((branch) => branch.main)).toHaveLength(1);
    // A PR's base is a main branch too, even when it's another PR's branch (develop into main).
    const develop = [{ ...prs[0], key: "acme/app#6", number: "6", branch: "pushed", targetBranch: "main" }, { ...prs[0], key: "acme/app#7", number: "7", targetBranch: "pushed" }];
    const withBase = await helper().getBranchCandidates({ repo: "acme/app", folder: clone, prs: develop, tracked: ["stale"] });
    expect(withBase.branches.filter((branch) => branch.main).map((branch) => branch.name)).toEqual(["main", "pushed"]);
    const localOnly = result.branches.find((branch) => branch.name === "local-only");
    expect(localOnly).toMatchObject({ subject: "local 2", committedAt: expect.any(String), worktreePath: expect.stringContaining("local-tree") });
    expect(localOnly.upstream).toBeUndefined();
    expect(result.branches.find((branch) => branch.name === "pushed").upstream).toBe("origin/pushed");
  });

  test("a local-only branch: its worktree, nothing pushed, ahead of the default branch", async () => {
    const found = await helper().getTrackedBranches({ localRepos: { "acme/app": clone }, branches: [{ repo: "acme/app", branch: "local-only" }] });
    expect(found["acme/app:local-only"]).toMatchObject({
      found: true,
      branch: "local-only",
      subject: "local 2",
      worktreePath: expect.stringContaining("local-tree"),
      pushed: false,
      unpushed: 2,
      base: "main",
      baseAhead: 2,
      baseBehind: 0,
    });
    expect(found["acme/app:local-only"].upstream).toBeUndefined();
  });

  test("a pushed branch, one behind its upstream, and one compared with a base of its own", async () => {
    const found = await helper().getTrackedBranches({
      localRepos: { "acme/app": clone },
      branches: [
        { repo: "acme/app", branch: "pushed" },
        { repo: "acme/app", branch: "stale", base: "pushed" },
      ],
    });
    expect(found["acme/app:pushed"]).toMatchObject({ pushed: true, unpushed: 0, upstream: { remote: "origin", branch: "pushed", ahead: 0, behind: 0 }, baseAhead: 1, baseBehind: 0 });
    expect(found["acme/app:pushed"].worktreePath).toBeUndefined();
    expect(found["acme/app:stale"]).toMatchObject({ pushed: true, upstream: { ahead: 0, behind: 1 }, base: "pushed", baseAhead: 1, baseBehind: 0 });
  });

  test("commits since a branch left its base, newest first, each marked when it isn't on GitHub; a main branch lists its newest", async () => {
    const local = await helper().getBranchCommits({ repo: "acme/app", folder: clone, branch: "local-only" });
    expect(local).toMatchObject({ ok: true, branch: "local-only", base: "main", behind: 0, more: false, mergeBase: git(clone, "rev-parse", "main") });
    expect(local.commits.map((item) => [item.subject, item.pushed])).toEqual([
      ["local 2", false],
      ["local 1", false],
    ]);
    expect(local.commits[0]).toMatchObject({ oid: git(clone, "rev-parse", "local-only"), author: expect.any(String), committedAt: expect.any(String), parents: [git(clone, "rev-parse", "local-only~1")] });
    // A base of its own; pushed commits.
    const stale = await helper().getBranchCommits({ repo: "acme/app", folder: clone, branch: "stale", base: "pushed" });
    expect(stale.commits.map((item) => [item.subject, item.pushed])).toEqual([["stale 1", true]]);
    // Its own base (main): the newest commits, with more past the limit.
    const main = await helper().getBranchCommits({ repo: "acme/app", folder: clone, branch: "main", limit: 1 });
    expect(main).toMatchObject({ recent: true, more: false, commits: [{ subject: "base" }] });
    const pushed = await helper().getBranchCommits({ repo: "acme/app", folder: clone, branch: "pushed", base: "nope", limit: 1 });
    expect(pushed).toMatchObject({ recent: true, baseMissing: true, more: true, commits: [{ subject: "pushed 1", pushed: true }] });
    expect(await helper().getBranchCommits({ repo: "acme/app", folder: clone, branch: "nope" })).toMatchObject({ ok: false, status: 404 });
  });

  test("the files a commit changed: lines added and removed, a rename followed, a binary file, a merge against its first parent", async () => {
    const tree = fs.mkdtempSync(path.join(root, "files-"));
    git(root, "clone", "-q", clone, path.join(tree, "c"));
    const folder = path.join(tree, "c");
    git(folder, "remote", "set-url", "origin", "git@github.com:acme/files.git");
    fs.writeFileSync(path.join(folder, "a.txt"), "one\ntwo\n");
    fs.writeFileSync(path.join(folder, "old name.txt"), "a\nb\nc\nd\ne\n");
    git(folder, "add", "-A");
    git(folder, "-c", "user.name=T", "-c", "user.email=t@e.com", "commit", "-q", "-m", "files");
    fs.writeFileSync(path.join(folder, "a.txt"), "one\nthree\nfour\n");
    git(folder, "mv", "old name.txt", "new name.txt");
    fs.writeFileSync(path.join(folder, "pic.bin"), Buffer.from([0, 1, 2, 0, 255]));
    git(folder, "add", "-A");
    git(folder, "-c", "user.name=T", "-c", "user.email=t@e.com", "commit", "-q", "-m", "change");
    const oid = git(folder, "rev-parse", "HEAD");
    const result = await helper().getCommitFiles({ repo: "acme/files", folder, oid: oid.slice(0, 10) });
    expect(result.ok).toBe(true);
    expect(result.oid).toBe(oid);
    const byPath = Object.fromEntries(result.files.map((file) => [file.path, file]));
    expect(byPath["a.txt"]).toMatchObject({ added: 2, removed: 1 });
    expect(byPath["new name.txt"]).toMatchObject({ oldPath: "old name.txt", added: 0, removed: 0 });
    expect(byPath["pic.bin"]).toMatchObject({ binary: true });
    // A merge: what it brought in against its first parent.
    git(folder, "checkout", "-q", "-b", "side", "HEAD~1");
    fs.writeFileSync(path.join(folder, "side.txt"), "x\n");
    git(folder, "add", "-A");
    git(folder, "-c", "user.name=T", "-c", "user.email=t@e.com", "commit", "-q", "-m", "side");
    git(folder, "checkout", "-q", "-");
    git(folder, "-c", "user.name=T", "-c", "user.email=t@e.com", "merge", "-q", "--no-ff", "-m", "merge side", "side");
    const merge = await helper().getCommitFiles({ repo: "acme/files", folder, oid: git(folder, "rev-parse", "HEAD") });
    expect(merge.files).toEqual([{ path: "side.txt", added: 1, removed: 0 }]);
    expect(await helper().getCommitFiles({ repo: "acme/files", folder, oid: "nothex" })).toMatchObject({ ok: false, status: 400 });
    expect(await helper().getCommitFiles({ repo: "acme/files", folder, oid: "0123456789abcdef" })).toMatchObject({ ok: false, status: 404 });
  });

  test("a branch the clone doesn't have, a base it doesn't have, an upstream gone, and a branch whose PR has opened", async () => {
    git(clone, "branch", "orphan", "main");
    track(clone, "orphan", "origin", "refs/heads/deleted-on-github");
    const found = await helper().getTrackedBranches({
      localRepos: { "acme/app": clone, "other/repo": path.join(root, "nowhere") },
      branches: [
        { repo: "acme/app", branch: "nope" },
        { repo: "acme/app", branch: "orphan", base: "no-such-base" },
        { repo: "acme/app", branch: "feature-pr" },
        { repo: "other/repo", branch: "x" },
      ],
      prs,
    });
    expect(found["acme/app:nope"]).toEqual({ found: false });
    expect(found["acme/app:orphan"]).toMatchObject({ upstream: { branch: "deleted-on-github", gone: true }, base: "no-such-base", baseMissing: true });
    expect(found["acme/app:feature-pr"].pr).toEqual({ number: "5", done: false });
    expect(found["other/repo:x"]).toBeUndefined();
  });

  test("what isn't pushed is asked of git again only once the commit or the remote branches change", async () => {
    const asked = [];
    const counting = (command, args) => {
      if (args.includes("--not")) asked.push(args.join(" "));
      return run(command, args);
    };
    const tracker = createViewPrsLocalBranches({ runCommand: counting, fs, cacheMs: 0 });
    const look = () => tracker.getTrackedBranches({ localRepos: { "acme/app": clone }, branches: [{ repo: "acme/app", branch: "local-only" }] });
    expect((await look())["acme/app:local-only"].unpushed).toBe(2);
    expect((await look())["acme/app:local-only"].unpushed).toBe(2);
    expect(asked).toHaveLength(1);
    // A remote branch with one of its commits (as a push would leave it).
    git(clone, "update-ref", "refs/remotes/origin/local-only", "local-only~1");
    try {
      expect((await look())["acme/app:local-only"].unpushed).toBe(1);
      expect(asked).toHaveLength(2);
    } finally {
      git(clone, "update-ref", "-d", "refs/remotes/origin/local-only");
    }
  });

  test("a branch tracking another local branch (remote \".\") has no remote branch, rather than one gone", async () => {
    git(clone, "branch", "--track", "on-main", "main");
    const found = await helper().getTrackedBranches({ localRepos: { "acme/app": clone }, branches: [{ repo: "acme/app", branch: "on-main" }] });
    expect(found["acme/app:on-main"]).toMatchObject({ found: true, pushed: true, unpushed: 0 });
    expect(found["acme/app:on-main"].upstream).toBeUndefined();
    const candidates = await helper().getBranchCandidates({ repo: "acme/app", folder: clone, prs });
    expect(candidates.branches.find((branch) => branch.name === "on-main").upstream).toBeUndefined();
    git(clone, "branch", "-q", "-D", "on-main");
  });

  test("uncommitted changes for each tracked branch checked out, none for one that isn't", async () => {
    fs.writeFileSync(path.join(root, "local-tree", "new.txt"), "x");
    const changes = await helper().getTrackedBranchChanges({
      localRepos: { "acme/app": clone },
      branches: [
        { repo: "acme/app", branch: "local-only" },
        { repo: "acme/app", branch: "stale" },
      ],
    });
    expect(Object.keys(changes)).toEqual(["acme/app:local-only"]);
    expect(changes["acme/app:local-only"]).toMatchObject({ untracked: 1, total: 1 });
  });
});
