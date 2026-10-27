const {
  createPrNeedsAttentionHelpers,
} = require("./pr-needs-attention.helpers.ts");

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

  test("given merge commit rules with a bot login, when merge-only filtering is enabled, then the bot's commits count as merges", () => {
    const helpers = createPrNeedsAttentionHelpers();
    const config = {
      ignoreMergeOnlyCommits: true,
      mergeCommitRules: { headlinePatterns: [], logins: ["dependabot[bot]"] },
    };
    const row = (commits) => ({ status: "CHANGED(commit)", reason: "commit", commits });

    expect(
      helpers.shouldTreatChangedAsAttention(
        row([{ messageHeadline: "chore(deps): bump x", authors: [{ login: "dependabot[bot]" }] }]),
        config,
      ),
    ).toBe(false);
    // With these rules a "Merge ..." headline is real work.
    expect(
      helpers.shouldTreatChangedAsAttention(
        row([{ messageHeadline: "Merge branch 'main'", authors: [{ login: "alice" }] }]),
        config,
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

  test("given no-activity mode mine-only and viewer is only a requested reviewer (not assigned), when checking no-activity attention, then result is true", () => {
    const helpers = createPrNeedsAttentionHelpers({
      getEffectiveViewerLogin: () => "alice",
      collectAssignedUsers: () => [],
      collectRequestedReviewers: () => [{ login: "Alice" }],
    });

    expect(
      helpers.shouldTreatNoActivityAsAttention(
        { status: "NO_ACTIVITY" },
        { noActivityMode: "mine-only" },
      ),
    ).toBe(true);
  });

  test("given no-activity mode assigned-only and viewer is assignee, when checking no-activity attention, then result is true", () => {
    const helpers = createPrNeedsAttentionHelpers({
      getEffectiveViewerLogin: () => "alice",
      collectAssignedUsers: () => [{ login: "Alice" }],
      collectRequestedReviewers: () => [],
    });

    expect(
      helpers.shouldTreatNoActivityAsAttention(
        { status: "NO_ACTIVITY" },
        { noActivityMode: "assigned-only" },
      ),
    ).toBe(true);
  });

  test("given no-activity mode assigned-only and viewer is only a requested reviewer (not assigned), when checking no-activity attention, then result is false", () => {
    const helpers = createPrNeedsAttentionHelpers({
      getEffectiveViewerLogin: () => "alice",
      collectAssignedUsers: () => [],
      collectRequestedReviewers: () => [{ login: "Alice" }],
    });

    expect(
      helpers.shouldTreatNoActivityAsAttention(
        { status: "NO_ACTIVITY" },
        { noActivityMode: "assigned-only" },
      ),
    ).toBe(false);
  });

  test("given no-activity mode reviewer-only and viewer is a requested reviewer, when checking no-activity attention, then result is true", () => {
    const helpers = createPrNeedsAttentionHelpers({
      getEffectiveViewerLogin: () => "alice",
      collectAssignedUsers: () => [],
      collectRequestedReviewers: () => [{ login: "Alice" }],
    });

    expect(
      helpers.shouldTreatNoActivityAsAttention(
        { status: "NO_ACTIVITY" },
        { noActivityMode: "reviewer-only" },
      ),
    ).toBe(true);
  });

  test("given no-activity mode reviewer-only and viewer is only assigned (not a requested reviewer), when checking no-activity attention, then result is false", () => {
    const helpers = createPrNeedsAttentionHelpers({
      getEffectiveViewerLogin: () => "alice",
      collectAssignedUsers: () => [{ login: "Alice" }],
      collectRequestedReviewers: () => [],
    });

    expect(
      helpers.shouldTreatNoActivityAsAttention(
        { status: "NO_ACTIVITY" },
        { noActivityMode: "reviewer-only" },
      ),
    ).toBe(false);
  });

  test("given no-activity mode assigned-only or reviewer-only and no effective viewer login, when checking no-activity attention, then result is false", () => {
    const helpers = createPrNeedsAttentionHelpers({
      getEffectiveViewerLogin: () => "",
      collectAssignedUsers: () => [{ login: "Alice" }],
      collectRequestedReviewers: () => [{ login: "Alice" }],
    });

    expect(
      helpers.shouldTreatNoActivityAsAttention(
        { status: "NO_ACTIVITY" },
        { noActivityMode: "assigned-only" },
      ),
    ).toBe(false);
    expect(
      helpers.shouldTreatNoActivityAsAttention(
        { status: "NO_ACTIVITY" },
        { noActivityMode: "reviewer-only" },
      ),
    ).toBe(false);
  });

  test("given a non-NO_ACTIVITY status, when checking no-activity attention under the new assigned-only/reviewer-only modes, then result is false regardless of assignment/review state", () => {
    const helpers = createPrNeedsAttentionHelpers({
      getEffectiveViewerLogin: () => "alice",
      collectAssignedUsers: () => [{ login: "Alice" }],
      collectRequestedReviewers: () => [{ login: "Alice" }],
    });

    expect(
      helpers.shouldTreatNoActivityAsAttention(
        { status: "CHANGED" },
        { noActivityMode: "assigned-only" },
      ),
    ).toBe(false);
    expect(
      helpers.shouldTreatNoActivityAsAttention(
        { status: "CHANGED" },
        { noActivityMode: "reviewer-only" },
      ),
    ).toBe(false);
  });

  test("given draft section and no changed/no-activity attention configured, when checking needs attention visibility, then result is false regardless of in-review state", () => {
    // The dedicated "In Review" smart group and status/reason override
    // (check-open-pr-updates.sh) already surface in-review PRs, so
    // shouldShowNeedsAttention no longer needs its own in-review carve-out.
    const helpers = createPrNeedsAttentionHelpers();

    expect(
      helpers.shouldShowNeedsAttention({
        row: { status: "NO_ACTIVITY", inReview: true },
        sectionKey: "draft",
        config: {
          includeDraftChanged: false,
          includeDraftNoActivity: false,
        },
      }),
    ).toBe(false);
  });

  test("given an open-section row with no changed/no-activity status, when checking entryNeedsAttention, then an in-review row no longer unconditionally needs attention", () => {
    const helpers = createPrNeedsAttentionHelpers();

    expect(
      helpers.entryNeedsAttention(
        { section: "open", data: { status: "NO_CHANGE", inReview: true } },
        {},
      ),
    ).toBe(false);
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

  describe("getNeedsAttentionReasons", () => {
    const helpers = createPrNeedsAttentionHelpers({
      getEffectiveViewerLogin: () => "me",
      collectAssignedUsers: (row) => row.assignees || [],
      collectRequestedReviewers: (row) => row.requestedReviewers || [],
    });

    test("given a changed PR, then each change-reason token is described in words, in order", () => {
      expect(
        helpers.getNeedsAttentionReasons({
          row: { status: "CHANGED", reason: "unanswered-thread|thread-reply|comment|review|commit" },
          sectionKey: "open",
        }),
      ).toEqual([
        "Unanswered review threads",
        "New replies in review threads",
        "New comments",
        "New reviews",
        "New commits",
      ]);
    });

    test("given a cleared ack, an unknown token, or no tokens at all, then each still has a reason", () => {
      expect(helpers.getNeedsAttentionReasons({ row: { status: "CHANGED", reason: "ack-cleared" }, sectionKey: "open" })).toEqual([
        "Ack was cleared",
      ]);
      expect(helpers.getNeedsAttentionReasons({ row: { status: "CHANGED", reason: "label" }, sectionKey: "open" })).toEqual([
        "Changed: label",
      ]);
      expect(helpers.getNeedsAttentionReasons({ row: { status: "CHANGED", reason: "-" }, sectionKey: "open" })).toEqual([
        "Changed since your last ack",
      ]);
    });

    test("given no recent activity, then the reason names the no-activity mode that matched", () => {
      const row = { status: "NO_ACTIVITY", assignees: [{ login: "me" }], requestedReviewers: [{ login: "me" }] };
      const reasonFor = (noActivityMode) =>
        helpers.getNeedsAttentionReasons({ row, sectionKey: "open", config: { noActivityMode } });

      expect(reasonFor("all")).toEqual(["No recent activity"]);
      expect(reasonFor("assigned-only")).toEqual(["No recent activity on a PR assigned to you"]);
      expect(reasonFor("reviewer-only")).toEqual(["No recent activity on a PR you're reviewing"]);
      expect(reasonFor("mine-only")).toEqual(["No recent activity on a PR assigned to you or that you're reviewing"]);
      expect(reasonFor("none")).toEqual([]);
    });

    test("given pending comments counted as attention, then the count is in the reason, first", () => {
      expect(
        helpers.getNeedsAttentionReasons({
          row: { status: "CHANGED", reason: "commit" },
          sectionKey: "open",
          hasPendingComments: true,
          pendingCommentCount: 2,
          config: { includePendingComments: true },
        }),
      ).toEqual(["2 unsubmitted pending comments", "New commits"]);
      expect(
        helpers.getNeedsAttentionReasons({
          row: {},
          sectionKey: "merged",
          hasPendingComments: true,
          pendingCommentCount: 1,
          config: { includePendingComments: true },
        }),
      ).toEqual(["1 unsubmitted pending comment"]);
    });

    test("given a section that doesn't count changes, then a change gives no reason", () => {
      expect(helpers.getNeedsAttentionReasons({ row: { status: "CHANGED", reason: "commit" }, sectionKey: "merged" })).toEqual([]);
      expect(helpers.getNeedsAttentionReasons({ row: { status: "CHANGED", reason: "commit" }, sectionKey: "flagged" })).toEqual([]);
      expect(
        helpers.getNeedsAttentionReasons({
          row: { status: "CHANGED", reason: "commit" },
          sectionKey: "draft",
          config: { includeDraftNoActivity: true },
        }),
      ).toEqual([]);
    });

    // shouldShowNeedsAttention is now "has any reason". This keeps its
    // previous body and checks the two agree on every combination.
    test("given every combination of section, status, pending comments and setting, then shouldShowNeedsAttention matches its previous rules", () => {
      const previousShouldShow = ({ row, sectionKey, hasPendingComments, config }) => {
        const changedAttention = helpers.shouldTreatChangedAsAttention(row, config);
        const noActivityAttention = helpers.shouldTreatNoActivityAsAttention(row, config);
        if (hasPendingComments && config.includePendingComments) return true;
        if (sectionKey === "open") return changedAttention || noActivityAttention;
        if (sectionKey === "merged" || sectionKey === "closed") {
          return Boolean(config.includeClosedMerged && (changedAttention || noActivityAttention));
        }
        if (sectionKey === "draft") {
          return Boolean(
            (config.includeDraftChanged && changedAttention) || (config.includeDraftNoActivity && noActivityAttention),
          );
        }
        return false;
      };

      const rows = [
        {},
        { status: "NO_CHANGE" },
        { status: "CHANGED", reason: "commit", commits: [{ messageHeadline: "Merge branch 'main'" }] },
        { status: "CHANGED", reason: "comment" },
        { status: "NO_ACTIVITY", assignees: [{ login: "me" }] },
        { status: "NO_ACTIVITY", requestedReviewers: [{ login: "someone" }] },
      ];
      const sections = ["open", "draft", "merged", "closed", "flagged", ""];
      const flags = ["includePendingComments", "includeClosedMerged", "includeDraftChanged", "includeDraftNoActivity", "ignoreMergeOnlyCommits"];
      const modes = ["all", "none", "assigned-only", "reviewer-only", "mine-only"];
      let checked = 0;

      rows.forEach((row) =>
        sections.forEach((sectionKey) =>
          [false, true].forEach((hasPendingComments) =>
            modes.forEach((noActivityMode) =>
              Array.from({ length: 2 ** flags.length }, (_, mask) => mask).forEach((mask) => {
                const config = { noActivityMode };
                flags.forEach((flag, index) => {
                  config[flag] = Boolean(mask & (1 << index));
                });
                const input = { row, sectionKey, hasPendingComments, config };
                expect([input, helpers.shouldShowNeedsAttention(input)]).toEqual([input, previousShouldShow(input)]);
                checked += 1;
              }),
            ),
          ),
        ),
      );
      expect(checked).toBe(rows.length * sections.length * 2 * modes.length * 2 ** flags.length);
    });
  });
});
