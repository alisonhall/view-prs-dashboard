const path = require("path");
const {
  VIEW_PRS_DETAIL_SCHEMA_VERSION,
  HEAVY_PR_DETAIL_FIELDS,
  getPrDetailStorageFilePath,
  buildPrDetailRef,
  extractHeavyPrDetailFields,
  stripHeavyPrDetailFields,
  mergePrDetailFields,
  slimPrDetailFields,
  extractMentionedLogins,
  hasPrDetailContent,
} = require("../helpers/view-prs-pr-detail-storage.js");

describe("view-prs PR detail storage helpers", () => {
  test("builds stable detail file paths for repo and PR number", () => {
    const filePath = getPrDetailStorageFilePath(
      "/tmp/pr-details",
      "Optum-Rx-ClinicalProducts/orx_cpp-mp-uis",
      "1234",
    );

    // getPrDetailStorageFilePath uses path.join internally, which emits the
    // platform's native separator - build the expectation the same way
    // rather than hardcoding a POSIX path (fails on Windows).
    expect(filePath).toBe(
      path.join(
        "/tmp/pr-details",
        "optum_rx_clinicalproducts_orx_cpp_mp_uis__pr-1234.json",
      ),
    );
  });

  test("returns expected default detailRef metadata", () => {
    const ref = buildPrDetailRef({ filePath: "data/pr-details/owner_repo__pr-1.json" });

    expect(ref).toEqual({
      file: "data/pr-details/owner_repo__pr-1.json",
      version: VIEW_PRS_DETAIL_SCHEMA_VERSION,
    });
  });

  test("extracts heavy detail fields and defaults missing fields to arrays", () => {
    const detail = extractHeavyPrDetailFields({
      activityTimeline: [{ date: "2026-06-01" }],
      reviewThreads: [{ id: "thread-1" }],
    });

    expect(detail.activityTimeline).toHaveLength(1);
    expect(detail.reviewThreads).toHaveLength(1);
    expect(detail.activityEvents).toEqual([]);
    expect(detail.commentEvents).toEqual([]);
  });

  test("strips heavy fields while preserving summary fields", () => {
    const summary = stripHeavyPrDetailFields({
      number: "100",
      title: "Example",
      activityTimeline: [{ date: "2026-06-01" }],
      activityEvents: [{ type: "comment" }],
      reviewThreads: [{ id: "thread-1" }],
      commentEvents: [{ type: "thread" }],
    });

    expect(summary.number).toBe("100");
    expect(summary.title).toBe("Example");
    HEAVY_PR_DETAIL_FIELDS.forEach((field) => {
      expect(summary[field]).toBeUndefined();
    });
  });

  test("merges detail arrays into summary data and preserves non-heavy fields", () => {
    const merged = mergePrDetailFields(
      {
        number: "100",
        title: "Example",
      },
      {
        activityTimeline: [{ date: "2026-06-01" }],
        activityEvents: [{ type: "comment" }],
        reviewThreads: [{ id: "thread-1" }],
        commentEvents: [{ type: "thread" }],
      },
    );

    expect(merged.number).toBe("100");
    expect(merged.title).toBe("Example");
    expect(merged.activityTimeline).toHaveLength(1);
    expect(merged.activityEvents).toHaveLength(1);
    expect(merged.reviewThreads).toHaveLength(1);
    expect(merged.commentEvents).toHaveLength(1);
  });

  test("fills missing heavy fields with defaults when detail payload is absent", () => {
    const merged = mergePrDetailFields({ number: "100" }, null);

    HEAVY_PR_DETAIL_FIELDS.forEach((field) => {
      expect(Array.isArray(merged[field])).toBe(true);
      expect(merged[field]).toHaveLength(0);
    });
  });

  describe("the list's slim detail", () => {
    test("given a row's detail, when slimmed, then the text and links are gone and everything else is kept", () => {
      const slim = slimPrDetailFields({
        number: "5",
        activityEvents: [{ sourceId: "e1", type: "commit", actor: "bob", occurredAt: "2026-01-01T00:00:00Z", messageHeadline: "Fix", messageBody: "Long", url: "u" }],
        commentEvents: [{ sourceId: "c1", type: "comment", actor: "alice", body: "Hi", url: "u" }],
        reviewThreads: [
          {
            id: "t1",
            isResolved: false,
            resolvedByLogin: "",
            path: "a.ts",
            comments: [
              { id: "x", authorLogin: "alice", body: "@Bob and @carol-x, see @bob", state: "SUBMITTED", diffHunk: "@@", url: "u" },
              { id: "y", authorLogin: "bob", body: "Done" },
            ],
          },
        ],
        activityTimeline: [{ date: "2026-01-01", events: [{ sourceId: "e1" }] }],
      });

      expect(slim.number).toBe("5");
      expect(slim.activityTimeline).toEqual([]);
      expect(slim.activityEvents).toEqual([{ sourceId: "e1", type: "commit", actor: "bob", occurredAt: "2026-01-01T00:00:00Z" }]);
      expect(slim.commentEvents).toEqual([{ sourceId: "c1", type: "comment", actor: "alice" }]);
      expect(slim.reviewThreads).toEqual([
        {
          id: "t1",
          isResolved: false,
          resolvedByLogin: "",
          path: "a.ts",
          comments: [
            { id: "x", authorLogin: "alice", state: "SUBMITTED", mentions: ["bob", "carol-x"] },
            { id: "y", authorLogin: "bob" },
          ],
        },
      ]);
    });

    test("given a row with only a timeline (older data), when slimmed, then its events become the row's activityEvents", () => {
      const slim = slimPrDetailFields({
        activityEvents: [],
        activityTimeline: [
          { date: "d1", events: [{ sourceId: "a", body: "x" }] },
          { date: "d2", events: [{ sourceId: "b" }] },
        ],
      });
      expect(slim.activityEvents).toEqual([{ sourceId: "a" }, { sourceId: "b" }]);
    });

    test("finds the logins a comment mentions as the page's mentions() would", () => {
      expect(extractMentionedLogins("Thanks @Alice. cc @dependabot[bot], not me@example.com or @-x or @bob-")).toEqual(["alice", "dependabot[bot]"]);
      expect(extractMentionedLogins(undefined)).toEqual([]);
    });

    test("tells whether a row has any detail", () => {
      expect(hasPrDetailContent({ reviewThreads: [{ id: "t" }] })).toBe(true);
      expect(hasPrDetailContent({ reviewThreads: [], activityEvents: [] })).toBe(false);
      expect(hasPrDetailContent(null)).toBe(false);
    });
  });
});
