import {
  backgroundUpdatesFor,
  describeRepoListing,
  describeReposChecked,
  describeRowFreshness,
  formatAgo,
} from "./pr-row-freshness.helpers.ts";

const NOW = Date.parse("2026-11-01T12:00:00Z");
const ago = (minutes: number) => new Date(NOW - minutes * 60000).toISOString();

describe("formatAgo", () => {
  test.each([
    [0.5, "just now"],
    [5, "5m ago"],
    [125, "2h ago"],
    [3 * 24 * 60, "3d ago"],
  ])("%s minutes -> %s", (minutes, expected) => {
    expect(formatAgo(ago(minutes), NOW)).toBe(expected);
  });

  test("unknown is empty", () => {
    expect(formatAgo("", NOW)).toBe("");
    expect(formatAgo("-", NOW)).toBe("");
    expect(formatAgo("nope", NOW)).toBe("");
  });
});

describe("describeRepoListing", () => {
  test("stale after about two of its repo's intervals", () => {
    const meta = { quickCheckIntervalMs: 10 * 60000 };
    expect(describeRepoListing({ ...meta, checkedAt: ago(20) }, { nowMs: NOW }).isStale).toBe(false);
    expect(describeRepoListing({ ...meta, checkedAt: ago(22) }, { nowMs: NOW }).isStale).toBe(true);
    expect(describeRepoListing({ ...meta, checkedAt: ago(20) }, { nowMs: NOW }).staleAfterMs).toBe(21 * 60000);
  });

  test("without its own interval (older data meta), the default one", () => {
    const listing = describeRepoListing({ checkedAt: ago(8) }, { nowMs: NOW, defaultIntervalMs: 3 * 60000 });
    expect(listing.staleAfterMs).toBe(7 * 60000);
    expect(listing.isStale).toBe(true);
  });

  test("failing when the last error is at or after the last success", () => {
    const failing = describeRepoListing(
      { checkedAt: ago(2), lastError: "boom", lastErrorAt: ago(1) },
      { nowMs: NOW },
    );
    expect(failing).toMatchObject({ isFailing: true, isStale: true, lastError: "boom" });

    const recovered = describeRepoListing(
      { checkedAt: ago(1), lastError: null, lastErrorAt: null },
      { nowMs: NOW },
    );
    expect(recovered).toMatchObject({ isFailing: false, isStale: false, lastError: "" });

    const neverListed = describeRepoListing({ lastError: "boom", lastErrorAt: ago(1) }, { nowMs: NOW });
    expect(neverListed.isFailing).toBe(true);
  });

  test("no meta: never checked, so stale", () => {
    expect(describeRepoListing(undefined, { nowMs: NOW })).toMatchObject({ checkedAt: "", isStale: true, isFailing: false });
  });
});

describe("describeRowFreshness", () => {
  const listing = describeRepoListing({ checkedAt: ago(2) }, { nowMs: NOW });

  test("a listed open row: summary confirmed by the listing, details by the fetch", () => {
    const freshness = describeRowFreshness({
      entry: { section: "open", fetchedAt: ago(90), data: { live: { stillOpen: true, detailsBehind: false } } },
      listing,
      nowMs: NOW,
    });
    expect(freshness).toMatchObject({
      summaryConfirmedAt: ago(2),
      detailsFetchedAt: ago(90),
      detailsBehind: false,
      noLongerOpen: false,
      isStale: false,
    });
    expect(freshness.lines).toEqual([
      expect.stringMatching(/^Summary confirmed 2m ago \(.+\)\.$/),
      expect.stringMatching(/^Details fetched 1h ago \(.+\)\.$/),
    ]);
  });

  test("a row fetched after the listing is confirmed by its fetch", () => {
    const freshness = describeRowFreshness({
      entry: { section: "draft", fetchedAt: ago(1), data: { live: { stillOpen: true } } },
      listing,
      nowMs: NOW,
    });
    expect(freshness.summaryConfirmedAt).toBe(ago(1));
  });

  test("an unlisted open row (no data.live) is confirmed only by its fetch, so goes stale", () => {
    const freshness = describeRowFreshness({ entry: { section: "open", fetchedAt: ago(30), data: {} }, listing, nowMs: NOW });
    expect(freshness).toMatchObject({ summaryConfirmedAt: ago(30), isStale: true });
    expect(freshness.lines.at(-1)).toBe("Stale: not confirmed recently.");
  });

  test("an unlisted row a full run reused is confirmed by that run (its CI fetch, its run stamp)", () => {
    // fetchedAt stays for up to 4 hours while full runs reuse the row.
    const reused = describeRowFreshness({
      entry: { section: "open", fetchedAt: ago(120), ciFetchedAt: ago(3), updatedAt: ago(4), data: {} },
      listing,
      nowMs: NOW,
    });
    expect(reused).toMatchObject({ summaryConfirmedAt: ago(3), detailsFetchedAt: ago(120), isStale: false });
    // Without a CI stamp (older rows), the run's stamp.
    const olderRow = describeRowFreshness({
      entry: { section: "open", fetchedAt: ago(120), updatedAt: ago(4), data: {} },
      listing,
      nowMs: NOW,
    });
    expect(olderRow).toMatchObject({ summaryConfirmedAt: ago(4), isStale: false });
  });

  test("a reused row whose CI fetch failed isn't confirmed by the run's stamp", () => {
    // The run moved updatedAt, but not ciFetchedAt (still its last fetch).
    const freshness = describeRowFreshness({
      entry: { section: "open", fetchedAt: ago(120), ciFetchedAt: ago(120), updatedAt: ago(4), data: {} },
      listing,
      nowMs: NOW,
    });
    expect(freshness).toMatchObject({ summaryConfirmedAt: ago(120), isStale: true });
  });

  test("a repo whose background updates are paused: its rows say until when, and why", () => {
    const pausedUntil = new Date(NOW + 10 * 60000).toISOString();
    const paused = describeRepoListing(
      { checkedAt: ago(30) },
      { nowMs: NOW, background: { quickCheckIntervalMs: 300000, pausedUntil } },
    );
    expect(paused).toMatchObject({ isPaused: true, pausedUntil, isStale: true, isScheduled: true });
    const freshness = describeRowFreshness({
      entry: { section: "open", fetchedAt: ago(30), data: { live: { stillOpen: true } } },
      listing: paused,
      nowMs: NOW,
    });
    expect(freshness.isStale).toBe(true);
    expect(freshness.lines.at(-1)).toMatch(/^Stale: background updates for its repo are paused until .+, after repeated failures\.$/);

    // Recently confirmed: paused, not stale yet.
    const recent = describeRowFreshness({
      entry: { section: "open", fetchedAt: ago(1), data: {} },
      listing: describeRepoListing({ checkedAt: ago(1) }, { nowMs: NOW, background: { quickCheckIntervalMs: 300000, pausedUntil } }),
      nowMs: NOW,
    });
    expect(recent.isStale).toBe(false);
    expect(recent.lines.at(-1)).toMatch(/^Background updates for its repo are paused until /);

    // A pause that has ended isn't one.
    const ended = describeRepoListing(
      { checkedAt: ago(1) },
      { nowMs: NOW, background: { quickCheckIntervalMs: 300000, pausedUntil: ago(1) } },
    );
    expect(ended).toMatchObject({ isPaused: false, pausedUntil: "" });
  });

  test("background updates the server sends: their interval, and a repo missing from them isn't checked", () => {
    const backgroundUpdates = { "a/one": { quickCheckIntervalMs: 30 * 60000, pausedUntil: null } };
    // Not listed (the live summary off), but checked every 30 minutes.
    const unlisted = describeRepoListing(undefined, { nowMs: NOW, background: backgroundUpdatesFor(backgroundUpdates, "a/one") });
    expect(unlisted).toMatchObject({ isScheduled: true, staleAfterMs: 61 * 60000 });
    const row = describeRowFreshness({ entry: { section: "open", fetchedAt: ago(20), data: {} }, listing: unlisted, nowMs: NOW });
    expect(row.isStale).toBe(false);

    const missing = describeRepoListing({ checkedAt: ago(1), quickCheckIntervalMs: 300000 }, {
      nowMs: NOW,
      background: backgroundUpdatesFor(backgroundUpdates, "b/two"),
    });
    expect(missing.isScheduled).toBe(false);

    // Older servers send none: the listing's own interval.
    expect(backgroundUpdatesFor(undefined, "a/one")).toBeUndefined();
    expect(describeRepoListing({ checkedAt: ago(1), quickCheckIntervalMs: null }, { nowMs: NOW, background: undefined }).isScheduled).toBe(false);
  });

  test("a repo with no background updates: its rows say so rather than go stale", () => {
    const unscheduled = describeRepoListing({ checkedAt: ago(60 * 24), quickCheckIntervalMs: null }, { nowMs: NOW });
    expect(unscheduled).toMatchObject({ isScheduled: false, isStale: false });
    const freshness = describeRowFreshness({
      entry: { section: "open", fetchedAt: ago(60 * 24), data: { live: { stillOpen: true } } },
      listing: unscheduled,
      nowMs: NOW,
    });
    expect(freshness.isStale).toBe(false);
    expect(freshness.lines.at(-1)).toBe("Not checked automatically: its repo has no background updates.");
    // Data meta from before the field: scheduled.
    expect(describeRepoListing({ checkedAt: ago(1) }, { nowMs: NOW }).isScheduled).toBe(true);
  });

  test("older rows without fetchedAt use updatedAt", () => {
    const freshness = describeRowFreshness({ entry: { section: "open", updatedAt: ago(4), data: {} }, listing: null, nowMs: NOW });
    expect(freshness).toMatchObject({ detailsFetchedAt: ago(4), isStale: false });
  });

  test("details behind while GitHub has newer activity or the PR is queued", () => {
    const behind = (data: object) =>
      describeRowFreshness({ entry: { section: "open", fetchedAt: ago(1), data }, listing, nowMs: NOW }).detailsBehind;
    expect(behind({ live: { stillOpen: true, detailsBehind: true } })).toBe(true);
    expect(behind({ updatePending: true })).toBe(true);
    expect(behind({ live: { stillOpen: true, detailsBehind: false } })).toBe(false);
  });

  test("no longer open: merged or closed since, and behind", () => {
    const freshness = describeRowFreshness({
      entry: { section: "open", fetchedAt: ago(1), data: { live: { stillOpen: false } } },
      listing,
      nowMs: NOW,
    });
    expect(freshness).toMatchObject({ noLongerOpen: true, detailsBehind: true });
    expect(freshness.lines).toContain("No longer open on GitHub (merged or closed); its update is queued.");
  });

  test("stale while its repo's listing fails, however recent", () => {
    const failing = describeRepoListing({ checkedAt: ago(1), lastError: "rate limited", lastErrorAt: ago(0) }, { nowMs: NOW });
    const freshness = describeRowFreshness({
      entry: { section: "open", fetchedAt: ago(1), data: { live: { stillOpen: true } } },
      listing: failing,
      nowMs: NOW,
    });
    expect(freshness.isStale).toBe(true);
    expect(freshness.lines.at(-1)).toBe("Stale: checking its repo is failing (rate limited).");
  });

  test("merged and closed rows are never stale, and only show their fetch", () => {
    const freshness = describeRowFreshness({
      entry: { section: "merged", fetchedAt: ago(60 * 24 * 30), data: { updatePending: true } },
      listing: describeRepoListing({ lastError: "x", lastErrorAt: ago(1) }, { nowMs: NOW }),
      nowMs: NOW,
    });
    expect(freshness).toMatchObject({ isStale: false, detailsBehind: false });
    expect(freshness.lines).toEqual([expect.stringMatching(/^Details fetched 30d ago/)]);
  });
});

describe("describeReposChecked", () => {
  test("the least recently checked repo, each one in the title, and the last run", () => {
    const checked = describeReposChecked({
      repos: ["a/one", "b/two"],
      liveSummary: { "a/one": { checkedAt: ago(1) }, "b/two": { checkedAt: ago(4) } },
      lastRunAt: ago(30),
      nowMs: NOW,
    });
    expect(checked.label).toBe("Checked 4m ago");
    expect(checked.isStale).toBe(false);
    expect(checked.title.split("\n")).toEqual([
      expect.stringMatching(/^a\/one: checked 1m ago \(.+\)$/),
      expect.stringMatching(/^b\/two: checked 4m ago \(.+\)$/),
      expect.stringMatching(/^Last run 30m ago \(.+\)\.$/),
    ]);
  });

  test("stale when one repo is failing", () => {
    const checked = describeReposChecked({
      repos: ["a/one"],
      liveSummary: { "a/one": { checkedAt: ago(1), lastError: "boom", lastErrorAt: ago(0) } },
      nowMs: NOW,
    });
    expect(checked.isStale).toBe(true);
    expect(checked.title).toMatch(/^a\/one: checked 1m ago \(.+\); failing \(boom\)$/);
  });

  test("a repo with no background updates is listed as such, and doesn't set the label or the tone", () => {
    const checked = describeReposChecked({
      repos: ["a/one", "b/old"],
      liveSummary: {
        "a/one": { checkedAt: ago(2), quickCheckIntervalMs: 300000 },
        "b/old": { checkedAt: ago(60 * 24 * 3), quickCheckIntervalMs: null },
      },
      nowMs: NOW,
    });
    expect(checked.label).toBe("Checked 2m ago");
    expect(checked.isStale).toBe(false);
    expect(checked.title).toMatch(/\nb\/old: checked 3d ago \(.+\); not checked automatically$/);

    // Only such repos: the label still says when.
    const onlyOld = describeReposChecked({
      repos: ["b/old"],
      liveSummary: { "b/old": { checkedAt: ago(60 * 24 * 3), quickCheckIntervalMs: null } },
      nowMs: NOW,
    });
    expect(onlyOld).toMatchObject({ label: "Checked 3d ago", isStale: false });
  });

  test("a paused repo says until when", () => {
    const pausedUntil = new Date(NOW + 10 * 60000).toISOString();
    const checked = describeReposChecked({
      repos: ["a/one"],
      liveSummary: { "a/one": { checkedAt: ago(2) } },
      backgroundUpdates: { "a/one": { quickCheckIntervalMs: 300000, pausedUntil } },
      nowMs: NOW,
    });
    expect(checked.title).toMatch(/^a\/one: checked 2m ago \(.+\); paused until .+, after repeated failures$/);
  });

  test("only the repos shown; none listed yet gives no label", () => {
    const checked = describeReposChecked({
      repos: ["a/one"],
      liveSummary: { "z/other": { checkedAt: ago(1) } },
      lastRunAt: ago(2),
      nowMs: NOW,
    });
    expect(checked.label).toBe("");
    expect(checked.title).toMatch(/^Last run 2m ago/);
  });
});
