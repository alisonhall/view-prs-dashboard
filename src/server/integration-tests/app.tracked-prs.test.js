// PRs added one by one, by URL, and those of a "numbers" subscription:
// kept up to date on their own - never by a full refresh of their repo -
// while open or merged/closed within the last 30 days, on a GitHub
// Enterprise host through GH_HOST.
const fs = require("fs");
const supertest = require("supertest");
const appModule = require("../app.js");

const {
  viewPrsSchedulerState,
  viewPrsSchedulerFile,
  viewPrsSourcesStorage,
  getViewPrsAutoRefreshRepos,
  getExplicitRefreshNumbers,
  runViewPrsAutoRefresh,
  runViewPrsQuickCheck,
} = appModule;

jest.setTimeout(20000);

const SUBSCRIBED = "acme-org/subscribed";
const dataFile = process.env.VIEW_PRS_DATA_FILE;
const savedAutoRepos = process.env.VIEW_PRS_AUTO_REPOS;
const savedRunViewPrsScript = appModule.runViewPrsScript;
const savedGetDependencyStatus = appModule.getDependencyStatus;
const savedVerifyGithubPr = appModule.verifyGithubPr;
const savedRunDispatcherTick = appModule.runDispatcherTick;
let savedSources;

const daysAgo = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

const writeRows = (rows) => {
  const byPrNumber = {};
  rows.forEach((row) => {
    byPrNumber[`${row.repo}#${row.prNumber}`] = { ...row, data: { number: row.prNumber, ...row.data } };
  });
  fs.writeFileSync(dataFile, JSON.stringify({ byPrNumber, lastRun: null }));
};

let scriptCalls;

beforeAll(() => {
  savedSources = viewPrsSourcesStorage.readSources();
});

beforeEach(() => {
  viewPrsSchedulerState.dispatcher = { entries: {}, reservedGhSlots: 0 };
  viewPrsSchedulerState.autoRefreshInProgressRepos = new Set();
  viewPrsSchedulerState.quickCheckInProgressRepos = new Set();
  viewPrsSchedulerState.quickCheckSkippedRepos = new Set();
  viewPrsSchedulerState.pendingByRepo = {};
  viewPrsSchedulerState.autoCircuitByRepo = {};
  viewPrsSchedulerState.lastManualRunAtByRepo = {};
  fs.rmSync(viewPrsSchedulerFile, { force: true });
  delete process.env.VIEW_PRS_AUTO_REPOS;
  appModule.getDependencyStatus = () => ({ ok: true, missing: [] });
  appModule.runDispatcherTick = async () => {};
  scriptCalls = [];
  appModule.runViewPrsScript = async (args, _maxBuffer, options) => {
    scriptCalls.push({ args, env: options?.env || {} });
    return { stdout: args.includes("--quick-check") ? "{}" : "", stderr: "" };
  };
  viewPrsSourcesStorage.writeSources({
    subscriptions: [
      { repo: SUBSCRIBED, mode: "recent" },
      { repo: "acme-org/picked", mode: "numbers", numbers: ["4", "5"] },
    ],
    trackedPrs: [
      { repo: SUBSCRIBED, number: "77" },
      { repo: "other-org/lib", number: "9" },
      { repo: "other-org/lib", number: "10" },
      { repo: "corp/tool", number: "3", host: "github.example.com" },
      { repo: "old-org/done", number: "1" },
    ],
  });
  writeRows([
    { repo: "other-org/lib", prNumber: "10", section: "merged", data: { mergedAt: daysAgo(29) } },
    { repo: "acme-org/picked", prNumber: "5", section: "closed", data: { mergedAt: "", closedAt: daysAgo(31) } },
    { repo: "old-org/done", prNumber: "1", section: "merged", data: { mergedAt: daysAgo(45) } },
  ]);
});

afterAll(() => {
  if (savedSources) viewPrsSourcesStorage.writeSources(savedSources);
  else fs.rmSync(viewPrsSourcesStorage.sourcesFile, { force: true });
  fs.rmSync(dataFile, { force: true });
  if (savedAutoRepos === undefined) delete process.env.VIEW_PRS_AUTO_REPOS;
  else process.env.VIEW_PRS_AUTO_REPOS = savedAutoRepos;
  appModule.runViewPrsScript = savedRunViewPrsScript;
  appModule.getDependencyStatus = savedGetDependencyStatus;
  appModule.verifyGithubPr = savedVerifyGithubPr;
  appModule.runDispatcherTick = savedRunDispatcherTick;
});

const callsFor = (repo) => scriptCalls.filter(({ args }) => args[args.indexOf("--repo") + 1] === repo);
const argAfter = (args, flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);

describe("which PRs a repo's background refresh is limited to", () => {
  test("a repo's own PRs, while open or merged/closed within 30 days; none for one with only older ones; no limit for a subscribed repo or one asked for by name", () => {
    expect(getExplicitRefreshNumbers("other-org/lib")).toEqual(["9", "10"]);
    expect(getExplicitRefreshNumbers("acme-org/picked")).toEqual(["4"]);
    expect(getExplicitRefreshNumbers("corp/tool")).toEqual(["3"]);
    expect(getExplicitRefreshNumbers("old-org/done")).toEqual([]);
    expect(getExplicitRefreshNumbers(SUBSCRIBED)).toBeNull();
    expect(getExplicitRefreshNumbers("someone/else")).toBeNull();
  });

  test("the background updates' repos: the subscribed ones, then those with PRs left to check", () => {
    expect(getViewPrsAutoRefreshRepos("")).toEqual([SUBSCRIBED, "acme-org/picked", "other-org/lib", "corp/tool"]);
  });

  test("only PRs added one by one don't bring in VIEW_PRS_REPO's full refresh", () => {
    viewPrsSourcesStorage.writeSources({ trackedPrs: [{ repo: "other-org/lib", number: "9" }] });
    expect(getViewPrsAutoRefreshRepos("")).toEqual(["other-org/lib"]);
  });
});

describe("the background refresh", () => {
  test("refreshes the subscribed repo in full, and the others' own PRs alone, an Enterprise one through GH_HOST", async () => {
    const result = await runViewPrsAutoRefresh({ skipCooldownChecks: true });

    expect(result.failedRepos).toEqual([]);
    expect(argAfter(callsFor(SUBSCRIBED)[0].args, "--prs")).toBeNull();
    expect(argAfter(callsFor("other-org/lib")[0].args, "--prs")).toBe("9,10");
    expect(argAfter(callsFor("acme-org/picked")[0].args, "--prs")).toBe("4");
    expect(argAfter(callsFor("corp/tool")[0].args, "--prs")).toBe("3");
    expect(callsFor("corp/tool")[0].env).toEqual({ GH_HOST: "github.example.com" });
    expect(callsFor("other-org/lib")[0].env).toEqual({});
  });

  test("follows a subscribed repo's full run with its added PRs that run didn't refresh", async () => {
    await runViewPrsAutoRefresh({ skipCooldownChecks: true, reposOverride: [SUBSCRIBED] });

    expect(callsFor(SUBSCRIBED).map(({ args }) => argAfter(args, "--prs"))).toEqual([null, "77"]);
  });

  test("a run of chosen PRs that fetched some is done, with the ones it couldn't; one that fetched none failed", async () => {
    appModule.runViewPrsScript = async (args) => {
      scriptCalls.push({ args, env: {} });
      const stderr = argAfter(args, "--prs") === "9,10" ? "Could not fetch PR(s): 10\n" : "Could not fetch PR(s): 4\n";
      throw Object.assign(new Error("Command exited with code 1"), { stderr });
    };

    const some = await runViewPrsAutoRefresh({ skipCooldownChecks: true, reposOverride: ["other-org/lib"] });
    const none = await runViewPrsAutoRefresh({ skipCooldownChecks: true, reposOverride: ["acme-org/picked"] });

    expect(some).toMatchObject({ succeededRepos: ["other-org/lib"], failedRepos: [], missingPrNumbersByRepo: { "other-org/lib": ["10"] } });
    expect(none).toMatchObject({ succeededRepos: [], failedRepos: ["acme-org/picked"] });
  });

  test("never refreshes a repo of PRs added one by one in full - with none left to check, it's skipped", async () => {
    expect(await runViewPrsAutoRefresh({ skipCooldownChecks: true, reposOverride: ["old-org/done"] })).toEqual({
      skipped: true,
      skipReason: "nothing-to-fetch",
    });
    expect(callsFor("old-org/done")).toEqual([]);

    // Too many queued for a targeted refresh would mean a full one elsewhere.
    await runViewPrsAutoRefresh({ skipCooldownChecks: true, reposOverride: ["other-org/lib"] });
    expect(argAfter(callsFor("other-org/lib")[0].args, "--prs")).toBe("9,10");
  });

  test("the quick check looks up just those PRs, by number, instead of listing the repo", async () => {
    await runViewPrsQuickCheck({ repoRequests: [{ repo: "other-org/lib" }, { repo: "corp/tool" }, { repo: SUBSCRIBED }] });

    expect(argAfter(callsFor("other-org/lib")[0].args, "--quick-check-numbers")).toBe("9,10");
    expect(argAfter(callsFor("corp/tool")[0].args, "--quick-check-numbers")).toBe("3");
    expect(callsFor("corp/tool")[0].env).toEqual({ GH_HOST: "github.example.com" });
    expect(argAfter(callsFor(SUBSCRIBED)[0].args, "--quick-check-numbers")).toBeNull();
  });
});

describe("the tracked PR routes", () => {
  let server;
  let verified;
  beforeEach(() => {
    verified = [];
    appModule.verifyGithubPr = async (pr) => {
      verified.push(pr);
      if (pr.number === "404") throw new Error("Could not resolve to a PullRequest");
    };
    server = appModule.createViewPrsApp().listen(0);
  });
  afterEach(async () => {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  });

  const trackedKeys = () => viewPrsSourcesStorage.readSources().trackedPrs.map((entry) => `${entry.repo}#${entry.number}`);

  test("adds a PR by its URL once gh finds it, fetches just it, and says it did", async () => {
    const res = await supertest(server)
      .post("/view-prs/tracked-prs")
      .send({ url: "https://github.example.com/corp/tool/pull/8/files" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, key: "corp/tool#8", added: true, fetched: true });
    expect(verified).toEqual([{ repo: "corp/tool", number: "8", host: "github.example.com", url: "https://github.example.com/corp/tool/pull/8" }]);
    expect(trackedKeys()).toContain("corp/tool#8");
    expect(argAfter(callsFor("corp/tool")[0].args, "--prs")).toBe("8");
    expect(callsFor("corp/tool")[0].env).toEqual({ GH_HOST: "github.example.com" });
  });

  test("a PR tracked already is left as it was", async () => {
    const res = await supertest(server).post("/view-prs/tracked-prs").send({ url: "other-org/lib#9" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ added: false, key: "other-org/lib#9", fetched: true });
    expect(trackedKeys().filter((key) => key === "other-org/lib#9")).toHaveLength(1);
  });

  test("says when the PR was added but its fetch failed", async () => {
    appModule.runViewPrsScript = async (args) => {
      scriptCalls.push({ args, env: {} });
      throw Object.assign(new Error("Command exited with code 1"), { stderr: "Could not fetch PR(s): 8\n" });
    };

    const res = await supertest(server).post("/view-prs/tracked-prs").send({ url: "other-org/lib#8" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, added: true, fetched: false });
    expect(trackedKeys()).toContain("other-org/lib#8");
  });

  test("while its repo's run is in progress, waits for that to finish, then fetches it", async () => {
    viewPrsSchedulerState.autoRefreshInProgressRepos.add("other-org/lib");
    setTimeout(() => viewPrsSchedulerState.autoRefreshInProgressRepos.delete("other-org/lib"), 200);

    const res = await supertest(server).post("/view-prs/tracked-prs").send({ url: "other-org/lib#8" });

    expect(res.body).toMatchObject({ added: true, fetched: true });
    expect(argAfter(callsFor("other-org/lib")[0].args, "--prs")).toBe("8");
  });

  test("refuses what isn't a PR's URL, or one gh can't find, and tracks neither", async () => {
    const before = trackedKeys();

    const notUrl = await supertest(server).post("/view-prs/tracked-prs").send({ url: "https://github.com/acme/api/issues/3" });
    const missing = await supertest(server).post("/view-prs/tracked-prs").send({ url: "https://github.com/acme/api/pull/404" });

    expect(notUrl.status).toBe(400);
    expect(missing.status).toBe(422);
    expect(missing.body.error).toMatch(/Couldn't find acme\/api#404: Could not resolve/);
    expect(trackedKeys()).toEqual(before);
    expect(scriptCalls).toEqual([]);
  });

  test("stops tracking a PR, and says whether it was", async () => {
    const res = await supertest(server).delete("/view-prs/tracked-prs").send({ repo: "other-org/lib", number: "9" });
    const again = await supertest(server).delete("/view-prs/tracked-prs").send({ repo: "other-org/lib", number: "9" });

    expect(res.body).toEqual({ ok: true, removed: true });
    expect(again.body).toEqual({ ok: true, removed: false });
    expect(trackedKeys()).not.toContain("other-org/lib#9");
  });

  test("lists the sources", async () => {
    const res = await supertest(server).get("/view-prs/sources");

    expect(res.status).toBe(200);
    expect(res.body.sources.subscriptions.map((entry) => entry.repo)).toEqual([SUBSCRIBED, "acme-org/picked"]);
  });

  test("a manual run of several PRs is a run of chosen PRs, on the repo's Enterprise host", async () => {
    const res = await supertest(server).post("/run").send({ repo: "corp/tool", prNumber: "3, 8", openMode: "none" });

    expect(res.status).toBe(200);
    expect(argAfter(scriptCalls[0].args, "--prs")).toBe("3,8");
    expect(scriptCalls[0].args).not.toContain("--pr");
    expect(scriptCalls[0].env).toEqual({ VIEW_PRS_SKIP_UNCHANGED: "0", GH_HOST: "github.example.com" });
  });
});
