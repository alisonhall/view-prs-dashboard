const {
  createPrNeedsAttentionHelpers,
} = require("./pr-needs-attention.helpers.js");

describe("pr needs attention helpers", () => {
  test("given explicit reason text, when parsing changed reason tokens, then pipe-delimited lowercase tokens are returned", () => {
    const helpers = createPrNeedsAttentionHelpers();

    expect(
      helpers.parseChangedReasonTokens({ reason: " Commit | REVIEW " }),
    ).toEqual(["commit", "review"]);
  });

  test("given changed status with reason payload, when parsing changed reason tokens, then status reason tokens are returned", () => {
    const helpers = createPrNeedsAttentionHelpers();

    expect(
      helpers.parseChangedReasonTokens({ status: "CHANGED(commit, review)" }),
    ).toEqual(["commit", "review"]);
  });

  test("given changed status and merge-only commits, when merge-only filtering is enabled, then changed attention is false", () => {
    const helpers = createPrNeedsAttentionHelpers();

    expect(
      helpers.shouldTreatChangedAsAttention(
        {
          status: "CHANGED(commit)",
          reason: "commit",
          commits: [{ messageHeadline: "Merge branch 'main'" }],
        },
        { ignoreMergeOnlyCommits: true },
      ),
    ).toBe(false);
  });

  test("given changed status and non-merge commit headline, when merge-only filtering is enabled, then changed attention is true", () => {
    const helpers = createPrNeedsAttentionHelpers();

    expect(
      helpers.shouldTreatChangedAsAttention(
        {
          status: "CHANGED(commit)",
          reason: "commit",
          commits: [{ messageHeadline: "feat: update behavior" }],
        },
        { ignoreMergeOnlyCommits: true },
      ),
    ).toBe(true);
  });

  test("given no-activity mode mine-only and viewer is assignee, when checking no-activity attention, then result is true", () => {
    const helpers = createPrNeedsAttentionHelpers({
      getEffectiveViewerLogin: () => "alice",
      collectAssignedUsers: () => [{ login: "Alice" }],
      collectRequestedReviewers: () => [],
    });

    expect(
      helpers.shouldTreatNoActivityAsAttention(
        { status: "NO_ACTIVITY" },
        { noActivityMode: "mine-only" },
      ),
    ).toBe(true);
  });

  test("given draft section and in-review enabled row, when checking needs attention visibility, then result is true", () => {
    const helpers = createPrNeedsAttentionHelpers({
      isInReviewEnabled: () => true,
    });

    expect(
      helpers.shouldShowNeedsAttention({
        row: { status: "NO_ACTIVITY" },
        sectionKey: "draft",
        config: {
          includeDraftChanged: false,
          includeDraftNoActivity: false,
        },
      }),
    ).toBe(true);
  });

  test("given entry baseline value, when checking last activity flag, then non-empty non-dash values return true", () => {
    const helpers = createPrNeedsAttentionHelpers();

    expect(helpers.entryHasYourLastActivity({ data: { baseline: "1d" } })).toBe(
      true,
    );
    expect(helpers.entryHasYourLastActivity({ data: { baseline: "-" } })).toBe(
      false,
    );
  });
});
