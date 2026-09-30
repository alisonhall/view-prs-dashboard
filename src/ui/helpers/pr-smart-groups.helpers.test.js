const { createPrSmartGroupsHelpers } = require("./pr-smart-groups.helpers.js");

describe("Smart Groups Helpers", () => {
  describe("isFlagged", () => {
    test("given PR is flagged in repo, when checking, then returns true", () => {
      const { isFlagged } = createPrSmartGroupsHelpers();
      const entry = { prNumber: "123", repo: "owner/repo", data: { number: "123" } };
      const flaggedByRepo = { "owner/repo": { "123": true } };

      expect(isFlagged(entry, flaggedByRepo, "owner/repo")).toBe(true);
    });

    test("given PR is not flagged in repo, when checking, then returns false", () => {
      const { isFlagged } = createPrSmartGroupsHelpers();
      const entry = { prNumber: "123", repo: "owner/repo", data: { number: "123" } };
      const flaggedByRepo = { "owner/repo": {} };

      expect(isFlagged(entry, flaggedByRepo, "owner/repo")).toBe(false);
    });

    test("given different PR is flagged, when checking, then returns false", () => {
      const { isFlagged } = createPrSmartGroupsHelpers();
      const entry = { prNumber: "123", repo: "owner/repo", data: { number: "123" } };
      const flaggedByRepo = { "owner/repo": { "456": true } };

      expect(isFlagged(entry, flaggedByRepo, "owner/repo")).toBe(false);
    });

    test("given PR uses data.number field, when checking, then matches correctly", () => {
      const { isFlagged } = createPrSmartGroupsHelpers();
      const entry = { repo: "owner/repo", data: { number: "789" } };
      const flaggedByRepo = { "owner/repo": { "789": true } };

      expect(isFlagged(entry, flaggedByRepo, "owner/repo")).toBe(true);
    });

    test("given repo not in flaggedByRepo, when checking, then returns false", () => {
      const { isFlagged } = createPrSmartGroupsHelpers();
      const entry = { prNumber: "123", repo: "owner/repo", data: { number: "123" } };
      const flaggedByRepo = { "other/repo": { "123": true } };

      expect(isFlagged(entry, flaggedByRepo, "owner/repo")).toBe(false);
    });

    test("given empty flaggedByRepo, when checking, then returns false", () => {
      const { isFlagged } = createPrSmartGroupsHelpers();
      const entry = { prNumber: "123", repo: "owner/repo", data: { number: "123" } };

      expect(isFlagged(entry, {}, "owner/repo")).toBe(false);
    });
  });

  describe("isInReview", () => {
    test("given PR is in review in repo, when checking, then returns true", () => {
      const { isInReview } = createPrSmartGroupsHelpers();
      const entry = { prNumber: "456", repo: "owner/repo", data: { number: "456" } };
      const inReviewByRepo = { "owner/repo": { "456": true } };

      expect(isInReview(entry, inReviewByRepo, "owner/repo")).toBe(true);
    });

    test("given PR is not in review in repo, when checking, then returns false", () => {
      const { isInReview } = createPrSmartGroupsHelpers();
      const entry = { prNumber: "456", repo: "owner/repo", data: { number: "456" } };
      const inReviewByRepo = { "owner/repo": {} };

      expect(isInReview(entry, inReviewByRepo, "owner/repo")).toBe(false);
    });

    test("given empty inReviewByRepo, when checking, then returns false", () => {
      const { isInReview } = createPrSmartGroupsHelpers();
      const entry = { prNumber: "456", repo: "owner/repo", data: { number: "456" } };

      expect(isInReview(entry, {}, "owner/repo")).toBe(false);
    });
  });

  describe("needsAttention", () => {
    test("given hasNeedsAttentionFlag returns true, when checking, then returns true", () => {
      const hasNeedsAttentionFlag = jest.fn(() => true);
      const { needsAttention } = createPrSmartGroupsHelpers({ hasNeedsAttentionFlag });
      const entry = { data: { status: "CHANGED" } };

      expect(needsAttention(entry)).toBe(true);
      expect(hasNeedsAttentionFlag).toHaveBeenCalledWith(entry);
    });

    test("given hasNeedsAttentionFlag returns false, when checking, then returns false", () => {
      const hasNeedsAttentionFlag = jest.fn(() => false);
      const { needsAttention } = createPrSmartGroupsHelpers({ hasNeedsAttentionFlag });
      const entry = { data: { status: "NO_CHANGE" } };

      expect(needsAttention(entry)).toBe(false);
    });

    test("given no hasNeedsAttentionFlag provided, when checking, then returns false", () => {
      const { needsAttention } = createPrSmartGroupsHelpers();
      const entry = { data: { status: "CHANGED" } };

      expect(needsAttention(entry)).toBe(false);
    });
  });

  describe("hasInteraction", () => {
    test("given hasUserInteraction returns true, when checking, then returns true", () => {
      const hasUserInteraction = jest.fn(() => true);
      const { hasInteraction } = createPrSmartGroupsHelpers({ hasUserInteraction });
      const entry = { data: { authorLogin: "alice" } };

      expect(hasInteraction(entry)).toBe(true);
      expect(hasUserInteraction).toHaveBeenCalledWith(entry);
    });

    test("given hasUserInteraction returns false, when checking, then returns false", () => {
      const hasUserInteraction = jest.fn(() => false);
      const { hasInteraction } = createPrSmartGroupsHelpers({ hasUserInteraction });
      const entry = { data: { authorLogin: "bob" } };

      expect(hasInteraction(entry)).toBe(false);
    });

    test("given no hasUserInteraction provided, when checking, then returns false", () => {
      const { hasInteraction } = createPrSmartGroupsHelpers();
      const entry = { data: { authorLogin: "alice" } };

      expect(hasInteraction(entry)).toBe(false);
    });
  });

  describe("buildSmartGroupConfigs", () => {
    test("given parameters, when building configs, then returns all smart group configs", () => {
      const { buildSmartGroupConfigs } = createPrSmartGroupsHelpers();
      const flaggedByRepo = { "owner/repo": { "1": true } };
      const inReviewByRepo = { "owner/repo": { "2": true } };

      const configs = buildSmartGroupConfigs({
        flaggedByRepo,
        inReviewByRepo,
        repo: "owner/repo",
      });

      expect(configs).toHaveLength(4);
      expect(configs[0]).toMatchObject({
        groupKey: "flagged",
        title: "Flagged",
        icon: "🚩",
        defaultOpen: false,
      });
      expect(configs[1]).toMatchObject({
        groupKey: "in-review",
        title: "In Review",
        icon: "👁️",
        defaultOpen: true,
      });
      expect(configs[2]).toMatchObject({
        groupKey: "needs-attention",
        title: "Needs Attention",
        icon: "⚠️",
        defaultOpen: true,
      });
      expect(configs[3]).toMatchObject({
        groupKey: "interacted",
        title: "Open PRs I'm Involved In",
        icon: "💬",
        defaultOpen: false,
      });
    });

    test("given no parameters, when building configs, then returns configs with empty context", () => {
      const { buildSmartGroupConfigs } = createPrSmartGroupsHelpers();

      const configs = buildSmartGroupConfigs();

      expect(configs).toHaveLength(4);
      expect(typeof configs[0].predicate).toBe("function");
    });

    test("given config predicates, when called with matching entry, then predicates work correctly", () => {
      const { buildSmartGroupConfigs } = createPrSmartGroupsHelpers();
      const flaggedByRepo = { "owner/repo": { "123": true } };
      const inReviewByRepo = { "owner/repo": { "456": true } };

      const configs = buildSmartGroupConfigs({
        flaggedByRepo,
        inReviewByRepo,
        repo: "owner/repo",
      });

      const flaggedEntry = { prNumber: "123", repo: "owner/repo", data: { number: "123" } };
      const inReviewEntry = { prNumber: "456", repo: "owner/repo", data: { number: "456" } };
      const otherEntry = { prNumber: "789", repo: "owner/repo", data: { number: "789" } };

      expect(configs[0].predicate(flaggedEntry)).toBe(true);
      expect(configs[0].predicate(inReviewEntry)).toBe(false);
      expect(configs[1].predicate(inReviewEntry)).toBe(true);
      expect(configs[1].predicate(otherEntry)).toBe(false);
    });
  });

  describe("applySmartGroups", () => {
    test("given rows and smart group configs, when applying, then groups PRs correctly", () => {
      const hasNeedsAttentionFlag = (entry) => entry.data.status === "CHANGED";
      const { buildSmartGroupConfigs, applySmartGroups } = createPrSmartGroupsHelpers({
        hasNeedsAttentionFlag,
      });

      const rows = [
        { prNumber: "1", repo: "owner/repo", data: { number: "1", status: "CHANGED" } },
        { prNumber: "2", repo: "owner/repo", data: { number: "2", status: "NO_CHANGE" } },
        { prNumber: "3", repo: "owner/repo", data: { number: "3", status: "CHANGED" } },
      ];

      const flaggedByRepo = { "owner/repo": { "1": true } };
      const inReviewByRepo = { "owner/repo": { "2": true } };

      const configs = buildSmartGroupConfigs({
        flaggedByRepo,
        inReviewByRepo,
        repo: "owner/repo",
      });
      const result = applySmartGroups(rows, configs);

      expect(result.flagged.rows).toHaveLength(1);
      expect(result.flagged.rows[0].prNumber).toBe("1");
      expect(result.flagged.count).toBe(1);

      expect(result["in-review"].rows).toHaveLength(1);
      expect(result["in-review"].rows[0].prNumber).toBe("2");

      expect(result["needs-attention"].rows).toHaveLength(2);
      expect(result["needs-attention"].rows.map((r) => r.prNumber).sort()).toEqual([
        "1",
        "3",
      ]);
    });

    test("given PR matches multiple groups, when applying, then PR appears in all matching groups", () => {
      const hasNeedsAttentionFlag = (entry) => entry.data.status === "CHANGED";
      const { buildSmartGroupConfigs, applySmartGroups } = createPrSmartGroupsHelpers({
        hasNeedsAttentionFlag,
      });

      const rows = [
        {
          prNumber: "1",
          repo: "owner/repo",
          data: { number: "1", status: "CHANGED" },
        },
      ];

      const flaggedByRepo = { "owner/repo": { "1": true } };
      const inReviewByRepo = { "owner/repo": { "1": true } };

      const configs = buildSmartGroupConfigs({
        flaggedByRepo,
        inReviewByRepo,
        repo: "owner/repo",
      });
      const result = applySmartGroups(rows, configs);

      // PR #1 should appear in flagged, in-review, AND needs-attention
      expect(result.flagged.rows).toHaveLength(1);
      expect(result["in-review"].rows).toHaveLength(1);
      expect(result["needs-attention"].rows).toHaveLength(1);
    });

    test("given empty rows array, when applying, then returns empty groups", () => {
      const { buildSmartGroupConfigs, applySmartGroups } = createPrSmartGroupsHelpers();

      const configs = buildSmartGroupConfigs();
      const result = applySmartGroups([], configs);

      expect(result.flagged.rows).toHaveLength(0);
      expect(result["in-review"].rows).toHaveLength(0);
      expect(result["needs-attention"].rows).toHaveLength(0);
      expect(result.interacted.rows).toHaveLength(0);
    });

    test("given no rows match any groups, when applying, then returns empty groups", () => {
      const { buildSmartGroupConfigs, applySmartGroups } = createPrSmartGroupsHelpers();

      const rows = [
        { prNumber: "999", repo: "owner/repo", data: { number: "999", status: "NO_CHANGE" } },
      ];

      const configs = buildSmartGroupConfigs();
      const result = applySmartGroups(rows, configs);

      expect(result.flagged.rows).toHaveLength(0);
      expect(result["in-review"].rows).toHaveLength(0);
      expect(result["needs-attention"].rows).toHaveLength(0);
      expect(result.interacted.rows).toHaveLength(0);
    });

    test("given invalid rows input, when applying, then handles gracefully", () => {
      const { buildSmartGroupConfigs, applySmartGroups } = createPrSmartGroupsHelpers();

      const configs = buildSmartGroupConfigs();
      const result = applySmartGroups(null, configs);

      expect(result.flagged.rows).toHaveLength(0);
    });

    test("given invalid configs input, when applying, then handles gracefully", () => {
      const { applySmartGroups } = createPrSmartGroupsHelpers();

      const rows = [
        { prNumber: "1", repo: "owner/repo", data: { number: "1" } },
      ];

      const result = applySmartGroups(rows, null);

      expect(result).toEqual({});
    });

    test("given config with invalid predicate, when applying, then skips that config", () => {
      const { applySmartGroups } = createPrSmartGroupsHelpers();

      const rows = [
        { prNumber: "1", repo: "owner/repo", data: { number: "1" } },
      ];

      const configs = [
        {
          groupKey: "test",
          title: "Test",
          predicate: null, // Invalid
        },
      ];

      const result = applySmartGroups(rows, configs);

      expect(result.test).toBeUndefined();
    });

    test("given predicate throws error, when applying, then filters out that entry", () => {
      const { applySmartGroups } = createPrSmartGroupsHelpers();

      const rows = [
        { prNumber: "1", repo: "owner/repo", data: { number: "1" } },
        { prNumber: "2", repo: "owner/repo", data: { number: "2" } },
      ];

      let callCount = 0;
      const configs = [
        {
          groupKey: "test",
          title: "Test",
          predicate: (entry) => {
            callCount++;
            if (entry.prNumber === "1") {
              throw new Error("Test error");
            }
            return true;
          },
        },
      ];

      const result = applySmartGroups(rows, configs);

      expect(callCount).toBe(2);
      expect(result.test.rows).toHaveLength(1);
      expect(result.test.rows[0].prNumber).toBe("2");
    });

    test("given result object, when checking structure, then includes all expected fields", () => {
      const { buildSmartGroupConfigs, applySmartGroups } = createPrSmartGroupsHelpers();

      const rows = [
        { prNumber: "1", repo: "owner/repo", data: { number: "1" } },
      ];

      const flaggedByRepo = { "owner/repo": { "1": true } };
      const configs = buildSmartGroupConfigs({ flaggedByRepo, repo: "owner/repo" });
      const result = applySmartGroups(rows, configs);

      expect(result.flagged).toMatchObject({
        title: "Flagged",
        icon: "🚩",
        rows: expect.any(Array),
        count: 1,
        defaultOpen: false,
      });
    });
  });

  describe("hasUserInteraction - real-world logic", () => {
    // These tests verify the actual interaction detection logic
    // matching the implementation in index.page.js

    const createHasUserInteractionFn = () => (entry) => {
      // Only show OPEN PRs that viewer has interacted with
      const isOpenPr = entry?.section === "open" || entry?.section === "draft";
      if (!isOpenPr) return false;

      const row = entry?.data || {};
      const viewerLogin = String(row?.viewerLogin || "").toLowerCase();
      if (!viewerLogin) return false;

      // Check if viewer authored the PR
      const authorLogin = String(row?.authorLogin || "").toLowerCase();
      if (authorLogin === viewerLogin) return true;

      // Check if viewer has commented
      const comments = row?.comments || [];
      if (comments.some((c) => String(c?.author?.login || "").toLowerCase() === viewerLogin)) {
        return true;
      }

      // Check if viewer has reviewed
      const reviews = row?.reviews || [];
      if (reviews.some((r) => String(r?.author?.login || "").toLowerCase() === viewerLogin)) {
        return true;
      }

      // Check if viewer is a requested reviewer
      const requestedReviewers = row?.requestedReviewers || [];
      if (requestedReviewers.some((r) => String(r?.login || "").toLowerCase() === viewerLogin)) {
        return true;
      }

      // Check if viewer is assigned
      const assignees = row?.assignees || [];
      if (assignees.some((a) => String(a?.login || "").toLowerCase() === viewerLogin)) {
        return true;
      }

      return false;
    };

    test("given viewer is author of open PR, when checking interaction, then returns true", () => {
      const hasUserInteraction = createHasUserInteractionFn();
      const { hasInteraction } = createPrSmartGroupsHelpers({ hasUserInteraction });
      const entry = {
        section: "open",
        data: { viewerLogin: "alice", authorLogin: "alice" },
      };

      expect(hasInteraction(entry)).toBe(true);
    });

    test("given viewer commented on open PR, when checking interaction, then returns true", () => {
      const hasUserInteraction = createHasUserInteractionFn();
      const { hasInteraction } = createPrSmartGroupsHelpers({ hasUserInteraction });
      const entry = {
        section: "open",
        data: {
          viewerLogin: "alice",
          authorLogin: "bob",
          comments: [{ author: { login: "alice" } }],
        },
      };

      expect(hasInteraction(entry)).toBe(true);
    });

    test("given viewer reviewed open PR, when checking interaction, then returns true", () => {
      const hasUserInteraction = createHasUserInteractionFn();
      const { hasInteraction } = createPrSmartGroupsHelpers({ hasUserInteraction });
      const entry = {
        section: "open",
        data: {
          viewerLogin: "alice",
          authorLogin: "bob",
          reviews: [{ author: { login: "alice" } }],
        },
      };

      expect(hasInteraction(entry)).toBe(true);
    });

    test("given viewer is requested reviewer on open PR, when checking interaction, then returns true", () => {
      const hasUserInteraction = createHasUserInteractionFn();
      const { hasInteraction } = createPrSmartGroupsHelpers({ hasUserInteraction });
      const entry = {
        section: "open",
        data: {
          viewerLogin: "alice",
          authorLogin: "bob",
          requestedReviewers: [{ login: "alice" }],
        },
      };

      expect(hasInteraction(entry)).toBe(true);
    });

    test("given viewer is assigned to open PR, when checking interaction, then returns true", () => {
      const hasUserInteraction = createHasUserInteractionFn();
      const { hasInteraction } = createPrSmartGroupsHelpers({ hasUserInteraction });
      const entry = {
        section: "open",
        data: {
          viewerLogin: "alice",
          authorLogin: "bob",
          assignees: [{ login: "alice" }],
        },
      };

      expect(hasInteraction(entry)).toBe(true);
    });

    test("given viewer has no interaction with open PR, when checking, then returns false", () => {
      const hasUserInteraction = createHasUserInteractionFn();
      const { hasInteraction } = createPrSmartGroupsHelpers({ hasUserInteraction });
      const entry = {
        section: "open",
        data: {
          viewerLogin: "alice",
          authorLogin: "bob",
          comments: [{ author: { login: "charlie" } }],
          reviews: [],
        },
      };

      expect(hasInteraction(entry)).toBe(false);
    });

    test("given viewer authored closed PR, when checking interaction, then returns false", () => {
      const hasUserInteraction = createHasUserInteractionFn();
      const { hasInteraction } = createPrSmartGroupsHelpers({ hasUserInteraction });
      const entry = {
        section: "closed",
        data: { viewerLogin: "alice", authorLogin: "alice" },
      };

      expect(hasInteraction(entry)).toBe(false);
    });

    test("given viewer authored merged PR, when checking interaction, then returns false", () => {
      const hasUserInteraction = createHasUserInteractionFn();
      const { hasInteraction } = createPrSmartGroupsHelpers({ hasUserInteraction });
      const entry = {
        section: "merged",
        data: { viewerLogin: "alice", authorLogin: "alice" },
      };

      expect(hasInteraction(entry)).toBe(false);
    });

    test("given no viewerLogin, when checking interaction, then returns false", () => {
      const hasUserInteraction = createHasUserInteractionFn();
      const { hasInteraction } = createPrSmartGroupsHelpers({ hasUserInteraction });
      const entry = {
        section: "open",
        data: { authorLogin: "bob" },
      };

      expect(hasInteraction(entry)).toBe(false);
    });

    test("given viewer login is case-insensitive match, when checking interaction, then returns true", () => {
      const hasUserInteraction = createHasUserInteractionFn();
      const { hasInteraction } = createPrSmartGroupsHelpers({ hasUserInteraction });
      const entry = {
        section: "open",
        data: {
          viewerLogin: "Alice",
          authorLogin: "ALICE",
        },
      };

      expect(hasInteraction(entry)).toBe(true);
    });
  });
});
