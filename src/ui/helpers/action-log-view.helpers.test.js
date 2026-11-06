const {
  describeActionLog,
  describeActionLogEntry,
  filterActionLogRows,
  findActionLogRow,
  listActionLogFilterOptions,
  EMPTY_ACTION_LOG_FILTERS,
} = require("./action-log-view.helpers.ts");

const at = (iso) => Date.parse(iso);

describe("describeActionLogEntry", () => {
  test("a background quick check: its name, who, repos and what it found", () => {
    const row = describeActionLogEntry(
      {
        action: "job/quickCheck",
        kind: "quickCheck",
        origin: "background",
        ok: true,
        triggeredAt: "2026-11-05T10:00:00.000Z",
        timestamp: "2026-11-05T10:00:04.000Z",
        durationMs: 4000,
        detail: { repos: ["acme/api", "acme/web"], reposCheckedCount: 2, newPendingOpenCount: 3, newPendingMergedClosedCount: 0 },
      },
      0,
    );
    expect(row).toMatchObject({
      kind: "quickCheck",
      label: "Quick check",
      origin: "background",
      outcome: "ok",
      repos: ["acme/api", "acme/web"],
      atMs: at("2026-11-05T10:00:00.000Z"),
      loggedAtMs: at("2026-11-05T10:00:04.000Z"),
      durationMs: 4000,
      summary: "2 repos checked · 3 open changed",
    });
  });

  test("a skip says why; a failure its error", () => {
    expect(
      describeActionLogEntry({ action: "job/autoRefresh", kind: "changedPrs", skipped: true, ok: null, detail: { reason: "circuit-open" } }, 0),
    ).toMatchObject({ label: "Update changed PRs", outcome: "skipped", summary: "circuit-open", origin: "background" });
    expect(
      describeActionLogEntry({ action: "auto-refresh", kind: "mergedQueueDrain", ok: false, error: "gh auth expired", detail: { repos: "acme/api, acme/web" } }, 0),
    ).toMatchObject({ label: "Merged/closed drain", outcome: "failed", summary: "gh auth expired", repos: ["acme/api", "acme/web"] });
  });

  test("a full refresh from before entries said their kind and who: the scheduler's", () => {
    expect(
      describeActionLogEntry({ action: "auto-refresh", ok: true, detail: { repos: "acme/api", successCount: 1, failureCount: 0 } }, 0),
    ).toMatchObject({ kind: "autoRefresh", label: "Full refresh", origin: "background", summary: "1 repo refreshed" });
  });

  test("your actions by the names Activity uses; an unknown one by its action", () => {
    expect(describeActionLogEntry({ action: "post/merged/request-more", ok: true, detail: { repo: "acme/api" } }, 0)).toMatchObject({
      kind: "olderMerged",
      label: "Fetch older merged PRs",
      origin: "you",
      repos: ["acme/api"],
    });
    expect(describeActionLogEntry({ action: "post/quick-check", ok: true, detail: { reposChecked: ["acme/api"] } }, 0)).toMatchObject({
      kind: "quickCheck",
      origin: "you",
      repos: ["acme/api"],
      summary: "1 repo checked",
    });
    expect(describeActionLogEntry({ action: "manual-stop", ok: false, error: "boom" }, 0)).toMatchObject({
      kind: "manual-stop",
      label: "manual-stop",
      origin: "you",
      summary: "boom",
    });
  });

  test("its details, folded: the action and every value it has", () => {
    const row = describeActionLogEntry({ action: "post/ack", detail: { prNumber: 12, empty: "", list: ["a", "b"], nested: { x: 1 } } }, 0);
    expect(row.details).toEqual([
      ["action", "post/ack"],
      ["prNumber", "12"],
      ["list", "a, b"],
      ["nested", '{"x":1}'],
    ]);
  });
});

describe("filtering", () => {
  const rows = [
    { action: "job/quickCheck", kind: "quickCheck", origin: "background", ok: true, detail: { repos: ["acme/api"] } },
    { action: "job/autoRefresh", kind: "autoRefresh", origin: "background", skipped: true, detail: { repos: ["acme/web"] } },
    { action: "post/ack", ok: false, error: "boom", detail: { repo: "acme/api" } },
  ].map(describeActionLogEntry);

  test("by kind, outcome (failed or skipped together), who and repo", () => {
    const labels = (filters) => filterActionLogRows(rows, { ...EMPTY_ACTION_LOG_FILTERS, ...filters }).map((row) => row.label);
    expect(labels({})).toEqual(["Quick check", "Full refresh", "Ack/Clear"]);
    expect(labels({ kind: "quickCheck" })).toEqual(["Quick check"]);
    expect(labels({ outcome: "problems" })).toEqual(["Full refresh", "Ack/Clear"]);
    expect(labels({ outcome: "skipped" })).toEqual(["Full refresh"]);
    expect(labels({ origin: "you" })).toEqual(["Ack/Clear"]);
    expect(labels({ repo: "acme/api", origin: "background" })).toEqual(["Quick check"]);
  });

  test("the kinds and repos it has, for the filters", () => {
    expect(listActionLogFilterOptions(rows)).toEqual({
      kinds: [
        { kind: "ackClear", label: "Ack/Clear" },
        { kind: "autoRefresh", label: "Full refresh" },
        { kind: "quickCheck", label: "Quick check" },
      ],
      repos: ["acme/api", "acme/web"],
    });
  });
});

describe("findActionLogRow", () => {
  const rows = [
    { action: "job/quickCheck", kind: "quickCheck", timestamp: "2026-11-05T10:10:00.000Z" },
    { action: "auto-refresh", kind: "autoRefresh", timestamp: "2026-11-05T10:05:02.000Z" },
    { action: "job/quickCheck", kind: "quickCheck", timestamp: "2026-11-05T10:05:01.000Z" },
    { action: "job/quickCheck", kind: "quickCheck", timestamp: "2026-11-05T10:00:00.000Z" },
  ].map(describeActionLogEntry);

  test("a Just finished item's entry: of its kind, logged nearest its time", () => {
    expect(findActionLogRow(rows, { kind: "quickCheck", atMs: at("2026-11-05T10:05:00.000Z") })).toBe(rows[2]);
    expect(findActionLogRow(rows, { kind: "autoRefresh", atMs: at("2026-11-05T10:05:00.000Z") })).toBe(rows[1]);
  });

  test("a Single PR update is logged as a run of the script", () => {
    const runs = [{ action: "post/run", timestamp: "2026-11-05T10:05:01.000Z" }].map(describeActionLogEntry);
    expect(findActionLogRow(runs, { kind: "singlePr", atMs: at("2026-11-05T10:05:00.000Z") })).toBe(runs[0]);
  });

  test("none further than a minute off, or of another kind", () => {
    expect(findActionLogRow(rows, { kind: "autoRefresh", atMs: at("2026-11-05T10:20:00.000Z") })).toBeNull();
    expect(findActionLogRow(rows, { kind: "olderMerged", atMs: at("2026-11-05T10:05:00.000Z") })).toBeNull();
  });
});

describe("describeActionLog", () => {
  test("each entry keeps its id when newer ones arrive - two alike told apart from the oldest", () => {
    const older = [
      { action: "post/ack", timestamp: "2026-11-05T10:00:00.000Z" },
      { action: "post/ack", timestamp: "2026-11-05T10:00:00.000Z" },
      { action: "job/quickCheck", timestamp: "2026-11-05T09:55:00.000Z" },
    ];
    const before = describeActionLog(older).map((row) => row.id);
    const after = describeActionLog([{ action: "job/quickCheck", timestamp: "2026-11-05T10:05:00.000Z" }, ...older]).map((row) => row.id);

    expect(new Set(before).size).toBe(3);
    expect(after.slice(1)).toEqual(before);
  });
});
