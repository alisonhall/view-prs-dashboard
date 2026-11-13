const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile, execFileSync } = require("child_process");
const { createViewPrsLocalBranches, repoFromRemoteUrl, parseWorktrees, describeGitFailure } = require("./view-prs-local-branches");

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
    // Same name, no upstream: taken to be the PR's.
    expect(prs.untracked).toMatchObject({ branch: "untracked", ahead: 0, behind: 0 });
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
