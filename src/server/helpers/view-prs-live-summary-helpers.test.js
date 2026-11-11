const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  toCheckState,
  toMergeState,
  normalizeLiveSummaryPr,
  applyLiveSummaryToEntry,
  findPrsWithChangedThreads,
  findPrsNoLongerOpen,
  createViewPrsLiveSummaryHelpers,
} = require("./view-prs-live-summary-helpers");

// A PR node as the GraphQL listing returns it.
const prNode = (overrides = {}) => ({
  number: 12,
  title: "Add widgets",
  url: "https://github.com/acme/api/pull/12",
  isDraft: false,
  updatedAt: "2026-10-31T10:00:00Z",
  additions: 40,
  deletions: 3,
  changedFiles: 2,
  mergeable: "MERGEABLE",
  labels: { nodes: [{ name: "backend" }] },
  assignees: { nodes: [{ login: "ann", name: "Ann" }] },
  reviewRequests: {
    nodes: [
      { requestedReviewer: { login: "zed", name: "Zed" } },
      { requestedReviewer: { login: "bob", name: "" } },
      { requestedReviewer: {} },
      { requestedReviewer: { login: "bob", name: "" } },
    ],
  },
  commits: {
    nodes: [
      {
        commit: {
          statusCheckRollup: {
            state: "SUCCESS",
            contexts: { checkRunCountsByState: [{ state: "SUCCESS", count: 3 }], statusContextCountsByState: [] },
          },
        },
      },
    ],
  },
  reviewThreads: { totalCount: 2, nodes: [{ isResolved: false }, { isResolved: true }] },
  files: { totalCount: 2, nodes: [{ viewerViewedState: "VIEWED" }, { viewerViewedState: "UNVIEWED" }] },
  ...overrides,
});

const counts = (checkRuns, statusContexts = []) => ({
  state: "PENDING",
  contexts: {
    checkRunCountsByState: checkRuns.map(([state, count]) => ({ state, count })),
    statusContextCountsByState: statusContexts.map(([state, count]) => ({ state, count })),
  },
});

describe("toCheckState", () => {
  test("any failure wins, then running, then a pass, then all skipped - as the script decides", () => {
    expect(toCheckState(counts([["SUCCESS", 2], ["FAILURE", 1], ["IN_PROGRESS", 1]]))).toBe("FAIL");
    expect(toCheckState(counts([["SUCCESS", 2], ["QUEUED", 1]]))).toBe("RUN");
    expect(toCheckState(counts([["SUCCESS", 2], ["SKIPPED", 1]]))).toBe("PASS");
    expect(toCheckState(counts([["SKIPPED", 2], ["NEUTRAL", 1]]))).toBe("SKIP");
    expect(toCheckState(counts([["CANCELLED", 1], ["SUCCESS", 1]]))).toBe("FAIL");
  });

  test("status contexts count too, and a zero count is ignored", () => {
    expect(toCheckState(counts([["SUCCESS", 1]], [["PENDING", 1]]))).toBe("RUN");
    expect(toCheckState(counts([["FAILURE", 0], ["SUCCESS", 1]], [["ERROR", 0]]))).toBe("PASS");
    expect(toCheckState(counts([], [["ERROR", 1]]))).toBe("FAIL");
  });

  test("without counts, the rollup's own state; without a rollup, NA", () => {
    expect(toCheckState({ state: "SUCCESS" })).toBe("PASS");
    expect(toCheckState({ state: "EXPECTED" })).toBe("RUN");
    expect(toCheckState({ state: "FAILURE" })).toBe("FAIL");
    expect(toCheckState(null)).toBe("NA");
  });
});

test("toMergeState gives null while GitHub hasn't worked mergeability out", () => {
  expect(toMergeState("MERGEABLE")).toBe("YES");
  expect(toMergeState("CONFLICTING")).toBe("NO");
  expect(toMergeState("UNKNOWN")).toBeNull();
  expect(toMergeState(undefined)).toBeNull();
});

describe("normalizeLiveSummaryPr", () => {
  test("gives each field in the shape the script writes", () => {
    expect(normalizeLiveSummaryPr(prNode())).toEqual({
      number: "12",
      title: "Add widgets",
      url: "https://github.com/acme/api/pull/12",
      isDraft: false,
      updatedAt: "2026-10-31T10:00:00Z",
      labels: ["backend"],
      additions: "40",
      deletions: "3",
      changedFiles: "2",
      viewedFiles: "1",
      checkState: "PASS",
      mergeState: "YES",
      assignees: [{ login: "ann", name: "Ann" }],
      // One per login, sorted by login; a team (no login) left out.
      requestedReviewers: [
        { login: "bob", name: "" },
        { login: "zed", name: "Zed" },
      ],
      openConversationCount: "1",
    });
  });

  test("counts from a connection cut off at its first page are left to the full refresh", () => {
    const summary = normalizeLiveSummaryPr(
      prNode({
        reviewThreads: { totalCount: 150, nodes: [{ isResolved: false }] },
        files: { totalCount: 120, nodes: [{ viewerViewedState: "VIEWED" }] },
      }),
    );
    expect(summary.openConversationCount).toBeNull();
    expect(summary.viewedFiles).toBeNull();
  });

  test("without threads, the conversation count is left to the full refresh (it estimates from comments)", () => {
    expect(normalizeLiveSummaryPr(prNode({ reviewThreads: { totalCount: 0, nodes: [] } })).openConversationCount).toBeNull();
  });
});

describe("applyLiveSummaryToEntry", () => {
  const entry = (overrides = {}) => ({
    prNumber: "12",
    repo: "acme/api",
    section: "open",
    updatedAt: "2026-10-31T09:00:00Z",
    data: {
      number: "12",
      title: "Old title",
      labels: [],
      checkState: "RUN",
      mergeState: "NO",
      titleDisplay: "Old title [CHK:RUN][MRG:NO]",
      openConversationCount: "4",
      viewedFilesCount: "0",
      changedFilesCount: "2",
      viewedFilesSummary: "0/2 viewed",
      sourceUpdatedAt: "2026-10-31T08:00:00Z",
      approvers: [{ login: "kim" }],
      status: "CHANGED",
    },
    ...overrides,
  });
  const repoSummary = (prs, checkedAt = "2026-10-31T10:05:00.000Z", complete = true) => ({
    checkedAt,
    complete,
    prs: Object.fromEntries(prs.map((pr) => [pr.number, pr])),
  });

  test("a listing after the row's refresh replaces what it lists, keeping the rest", () => {
    const result = applyLiveSummaryToEntry(entry(), repoSummary([normalizeLiveSummaryPr(prNode())]));
    expect(result.data).toMatchObject({
      title: "Add widgets",
      labels: ["backend"],
      checkState: "PASS",
      mergeState: "YES",
      titleDisplay: "Add widgets [CHK:PASS][MRG:YES]",
      openConversationCount: "1",
      viewedFilesCount: "1",
      viewedFilesSummary: "1/2 viewed",
      requestedReviewers: [{ login: "bob", name: "" }, { login: "zed", name: "Zed" }],
      // Only a full refresh has these.
      approvers: [{ login: "kim" }],
      status: "CHANGED",
      sourceUpdatedAt: "2026-10-31T08:00:00Z",
    });
    // When the repo was listed is in the data meta, not on each row.
    expect(result.data.live).toEqual({
      updatedAt: "2026-10-31T10:00:00Z",
      detailsBehind: true,
      stillOpen: true,
    });
  });

  test("a full refresh after the listing keeps its own values, and still gets the PR's facts", () => {
    const fresher = entry({ updatedAt: "2026-10-31T10:10:00Z", data: { ...entry().data, sourceUpdatedAt: "2026-10-31T10:00:00Z" } });
    const result = applyLiveSummaryToEntry(fresher, repoSummary([normalizeLiveSummaryPr(prNode())]));
    expect(result.data.title).toBe("Old title");
    expect(result.data.checkState).toBe("RUN");
    expect(result.data.live).toEqual({ updatedAt: "2026-10-31T10:00:00Z", detailsBehind: false, stillOpen: true });
  });

  test("a row written after the listing keeps its own values, though its run started before", () => {
    // updatedAt is the run's start; a long run writes later rows well after.
    const lateInRun = entry({ updatedAt: "2026-10-31T10:00:00Z", fetchedAt: "2026-10-31T10:08:00Z" });
    const result = applyLiveSummaryToEntry(lateInRun, repoSummary([normalizeLiveSummaryPr(prNode())]));
    expect(result.data.checkState).toBe("RUN");
    // A row written before the listing takes it.
    const early = entry({ updatedAt: "2026-10-31T10:00:00Z", fetchedAt: "2026-10-31T10:01:00Z" });
    expect(applyLiveSummaryToEntry(early, repoSummary([normalizeLiveSummaryPr(prNode())])).data.checkState).toBe("PASS");
  });

  test("CI and mergeability fetched again after the listing (a reused row) are kept; the rest is replaced", () => {
    // A run reused the row (fetchedAt unchanged) but fetched its CI at 10:07.
    const reused = entry({ fetchedAt: "2026-10-31T09:00:00Z", ciFetchedAt: "2026-10-31T10:07:00Z" });
    const result = applyLiveSummaryToEntry(reused, repoSummary([normalizeLiveSummaryPr(prNode())]));
    expect(result.data).toMatchObject({
      title: "Add widgets",
      checkState: "RUN",
      mergeState: "NO",
      titleDisplay: "Add widgets [CHK:RUN][MRG:NO]",
      viewedFilesCount: "1",
    });
    // A listing after that replaces them too.
    const olderCi = entry({ fetchedAt: "2026-10-31T09:00:00Z", ciFetchedAt: "2026-10-31T10:01:00Z" });
    expect(applyLiveSummaryToEntry(olderCi, repoSummary([normalizeLiveSummaryPr(prNode())])).data).toMatchObject({
      checkState: "PASS",
      mergeState: "YES",
    });
  });

  test("a PR turned into a draft moves to the draft section", () => {
    const result = applyLiveSummaryToEntry(entry(), repoSummary([normalizeLiveSummaryPr(prNode({ isDraft: true }))]));
    expect(result.section).toBe("draft");
  });

  test("while GitHub works out mergeability, the row keeps what it had", () => {
    const result = applyLiveSummaryToEntry(entry(), repoSummary([normalizeLiveSummaryPr(prNode({ mergeable: "UNKNOWN" }))]));
    expect(result.data.mergeState).toBe("NO");
    expect(result.data.titleDisplay).toBe("Add widgets [CHK:PASS][MRG:NO]");
  });

  test("an open row its repo's newer, complete listing doesn't have is marked no longer open", () => {
    const result = applyLiveSummaryToEntry(entry(), repoSummary([]));
    expect(result.data.live).toEqual({ stillOpen: false });
    expect(result.data.title).toBe("Old title");
    // An older listing says nothing about it, nor does one stopped at its
    // page limit (the PR may be on a page it didn't reach).
    expect(applyLiveSummaryToEntry(entry(), repoSummary([], "2026-10-31T08:30:00Z"))).toEqual(entry());
    expect(applyLiveSummaryToEntry(entry(), repoSummary([], undefined, false))).toEqual(entry());
  });

  test("merged and closed rows, and repos never listed, are left alone", () => {
    const summary = repoSummary([normalizeLiveSummaryPr(prNode())]);
    expect(applyLiveSummaryToEntry(entry({ section: "merged" }), summary)).toEqual(entry({ section: "merged" }));
    expect(applyLiveSummaryToEntry(entry(), undefined)).toEqual(entry());
    expect(applyLiveSummaryToEntry(entry(), { prs: {} })).toEqual(entry());
  });
});

describe("findPrsWithChangedThreads", () => {
  const summary = {
    checkedAt: "2026-10-31T10:00:00Z",
    prs: {
      12: { openConversationCount: "1" },
      13: { openConversationCount: "2" },
      14: { openConversationCount: null },
      15: { openConversationCount: "0" },
      16: { openConversationCount: "3" },
    },
  };
  const row = (number, openThreads, overrides = {}) => ({
    prNumber: String(number),
    repo: "acme/api",
    section: "open",
    fetchedAt: "2026-10-31T09:00:00Z",
    data: { number: String(number), metrics: { conversationSummary: { openThreads } } },
    ...overrides,
  });

  test("open rows whose unresolved-thread count differs from a newer listing", () => {
    const entries = [
      row(12, 2), // resolved one since: queued
      row(13, 2), // unchanged
      row(14, 1), // the listing couldn't count (over 100 threads): left alone
      row(15, 1, { section: "draft" }), // drafts too
      row(16, 1, { fetchedAt: "2026-10-31T10:01:00Z" }), // fetched after the listing: its own count is newer
      row(17, 1), // not listed
      row(12, 5, { repo: "acme/web" }), // another repo
      row(13, 0, { section: "merged" }), // not open
      { prNumber: "18", repo: "acme/api", section: "open", data: {} }, // no stored count
    ];
    expect(findPrsWithChangedThreads(entries, "acme/api", summary)).toEqual([12, 15]);
  });

  test("nothing without a listing", () => {
    expect(findPrsWithChangedThreads([row(12, 2)], "acme/api", undefined)).toEqual([]);
    expect(findPrsWithChangedThreads([row(12, 2)], "acme/api", { prs: summary.prs })).toEqual([]);
  });
});

describe("findPrsNoLongerOpen", () => {
  const summary = { checkedAt: "2026-10-31T10:00:00Z", complete: true, prs: { 12: {}, 13: {} } };
  const row = (number, overrides = {}) => ({
    prNumber: String(number),
    repo: "acme/api",
    section: "open",
    fetchedAt: "2026-10-31T09:00:00Z",
    data: { number: String(number) },
    ...overrides,
  });

  test("open and draft rows a complete listing made after them doesn't have - merged or closed since", () => {
    const entries = [
      row(12), // listed: still open
      row(20), // gone: queued
      row(21, { section: "draft" }), // drafts too
      row(22, { fetchedAt: "2026-10-31T10:01:00Z" }), // fetched after the listing: its own section is newer
      row(23, { section: "merged" }), // already merged
      row(24, { repo: "acme/web" }), // another repo
    ];
    expect(findPrsNoLongerOpen(entries, "acme/api", summary)).toEqual([20, 21]);
  });

  test("nothing from a listing cut off at its page limit, or without one", () => {
    expect(findPrsNoLongerOpen([row(20)], "acme/api", { ...summary, complete: false })).toEqual([]);
    expect(findPrsNoLongerOpen([row(20)], "acme/api", undefined)).toEqual([]);
  });
});

describe("createViewPrsLiveSummaryHelpers", () => {
  let dir;
  let liveSummaryFile;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "live-summary-"));
    liveSummaryFile = path.join(dir, "live-summary.json");
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const page = (nodes, endCursor = null) => ({
    stdout: JSON.stringify({
      data: { repository: { pullRequests: { nodes, pageInfo: { hasNextPage: Boolean(endCursor), endCursor } } } },
    }),
  });
  const create = (runViewPrsCommand, isoNow = "2026-10-31T10:05:00.000Z") =>
    createViewPrsLiveSummaryHelpers({ fs, liveSummaryFile, runViewPrsCommand, now: () => new Date(isoNow) });

  test("lists a GitHub Enterprise repo's PRs on its host (GH_HOST)", async () => {
    const run = jest.fn().mockResolvedValue(page([prNode({ number: 12 })]));
    const helpers = createViewPrsLiveSummaryHelpers({
      fs,
      liveSummaryFile,
      runViewPrsCommand: run,
      getRepoGhEnv: (repo) => (repo === "corp/tool" ? { GH_HOST: "github.example.com" } : {}),
      now: () => new Date("2026-10-31T10:05:00.000Z"),
    });

    await helpers.refreshRepoLiveSummary("corp/tool");

    expect(run.mock.calls[0][3]).toMatchObject({ env: { GH_HOST: "github.example.com" } });
  });

  test("lists every page of the repo's open PRs and saves them with when they were listed", async () => {
    const run = jest
      .fn()
      .mockResolvedValueOnce(page([prNode({ number: 12 })], "cursor-1"))
      .mockResolvedValueOnce(page([prNode({ number: 13, title: "Second" })]));
    const helpers = create(run);

    await expect(helpers.refreshRepoLiveSummary("acme/api")).resolves.toEqual({ ok: true, prCount: 2, complete: true });

    expect(run).toHaveBeenCalledTimes(2);
    const [command, firstArgs] = run.mock.calls[0];
    expect(command).toBe("gh");
    expect(firstArgs).toEqual(expect.arrayContaining(["api", "graphql", "owner=acme", "name=api"]));
    expect(firstArgs.some((arg) => arg.startsWith("after="))).toBe(false);
    expect(run.mock.calls[1][1]).toContain("after=cursor-1");
    // Paged in creation order, which can't change while the pages are read:
    // in update order, a PR updated meanwhile moved ahead of the cursor and
    // was skipped, so a complete listing marked it no longer open.
    const query = firstArgs.find((arg) => arg.startsWith("query="));
    expect(query).toContain("orderBy: {field: CREATED_AT, direction: DESC}");
    expect(query).not.toContain("UPDATED_AT");

    const saved = helpers.readLiveSummary().byRepo["acme/api"];
    expect(saved.checkedAt).toBe("2026-10-31T10:05:00.000Z");
    expect(Object.keys(saved.prs)).toEqual(["12", "13"]);
    expect(saved.prs["13"].title).toBe("Second");
    expect(saved.complete).toBe(true);
    expect(saved.lastError).toBeNull();
    expect(helpers.getLiveSummaryMeta()).toEqual({
      "acme/api": { checkedAt: "2026-10-31T10:05:00.000Z", complete: true, lastError: null, lastErrorAt: null },
    });
  });

  test("a repo with more open PRs than the page limit is listed as incomplete", async () => {
    let page_ = 0;
    const run = jest.fn(async () => {
      page_ += 1;
      return page([prNode({ number: page_ })], `cursor-${page_}`);
    });
    const helpers = create(run);

    await expect(helpers.refreshRepoLiveSummary("acme/api")).resolves.toEqual({ ok: true, prCount: 20, complete: false });
    expect(run).toHaveBeenCalledTimes(20);
    expect(helpers.readLiveSummary().byRepo["acme/api"].complete).toBe(false);
  });

  test("a failure keeps the last good listing and records why", async () => {
    const helpers = create(jest.fn().mockResolvedValueOnce(page([prNode()])));
    await helpers.refreshRepoLiveSummary("acme/api");

    // gh exits non-zero on a GraphQL error, with the reason on stdout.
    const failing = create(
      jest.fn().mockRejectedValueOnce({ stdout: JSON.stringify({ errors: [{ message: "rate limited" }] }) }),
      "2026-10-31T10:10:00.000Z",
    );
    await expect(failing.refreshRepoLiveSummary("acme/api")).resolves.toEqual({ ok: false, error: "rate limited" });

    const saved = failing.readLiveSummary().byRepo["acme/api"];
    expect(saved.checkedAt).toBe("2026-10-31T10:05:00.000Z");
    expect(Object.keys(saved.prs)).toEqual(["12"]);
    expect(saved).toMatchObject({ lastError: "rate limited", lastErrorAt: "2026-10-31T10:10:00.000Z" });
    expect(failing.getLiveSummaryMeta()["acme/api"]).toEqual({
      checkedAt: "2026-10-31T10:05:00.000Z",
      complete: true,
      lastError: "rate limited",
      lastErrorAt: "2026-10-31T10:10:00.000Z",
    });
  });

  test("a timeout or a gh failure with no output is reported too", async () => {
    await expect(create(jest.fn().mockRejectedValueOnce({ didTimeout: true })).refreshRepoLiveSummary("acme/api")).resolves.toEqual({
      ok: false,
      error: "timed out",
    });
    await expect(
      create(jest.fn().mockRejectedValueOnce({ stderr: "gh: not logged in\n" })).refreshRepoLiveSummary("acme/web"),
    ).resolves.toEqual({ ok: false, error: "gh: not logged in" });
  });

  test("each repo's listing is kept apart, and the version changes with each save", async () => {
    const helpers = create(jest.fn().mockResolvedValue(page([prNode()])));
    expect(helpers.getLiveSummaryVersion()).toBe("none");
    await helpers.refreshRepoLiveSummary("acme/api");
    const first = helpers.getLiveSummaryVersion();
    await helpers.refreshRepoLiveSummary("acme/web");
    expect(helpers.getLiveSummaryVersion()).not.toBe(first);
    expect(Object.keys(helpers.readLiveSummary().byRepo)).toEqual(["acme/api", "acme/web"]);
  });

  test("a missing or malformed file reads as no listings", () => {
    const helpers = create(jest.fn());
    expect(helpers.readLiveSummary()).toEqual({ byRepo: {} });
    fs.writeFileSync(liveSummaryFile, "{not json");
    expect(helpers.readLiveSummary()).toEqual({ byRepo: {} });
  });
});
