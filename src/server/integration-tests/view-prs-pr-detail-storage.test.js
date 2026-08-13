const {
  VIEW_PRS_DETAIL_SCHEMA_VERSION,
  HEAVY_PR_DETAIL_FIELDS,
  getPrDetailStorageFilePath,
  buildPrDetailRef,
  extractHeavyPrDetailFields,
  stripHeavyPrDetailFields,
  mergePrDetailFields,
} = require("../helpers/view-prs-pr-detail-storage.js");

describe("view-prs PR detail storage helpers", () => {
  test("builds stable detail file paths for repo and PR number", () => {
    const filePath = getPrDetailStorageFilePath(
      "/tmp/pr-details",
      "Optum-Rx-ClinicalProducts/orx_cpp-mp-uis",
      "1234",
    );

    expect(filePath).toBe(
      "/tmp/pr-details/optum_rx_clinicalproducts_orx_cpp_mp_uis__pr-1234.json",
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
});
