/**
 * PR Data Fixtures Contract Tests
 * 
 * Validates that all PR data fixture factories produce valid payloads
 * with correct shape and structure for integration testing.
 */

const {
  createSchedulerPayload,
  createLastRunPayload,
  createActorsMap,
  createReviewThread,
  createReviewComment,
  createActivityTimelineEntry,
  createNotes,
  createNoteComment,
  createPrDataPayload,
  createPrEntryByScenario,
  createMultiPrPayload,
  validatePrDataPayloadShape,
} = require("./pr-data.fixtures.js");

describe("PR data fixtures", () => {
  describe("createSchedulerPayload", () => {
    test("given default options, when creating scheduler, then returns complete payload", () => {
      const scheduler = createSchedulerPayload();

      expect(scheduler.intervalMinutes).toBe(15);
      expect(scheduler.manualCooldownMinutes).toBe(15);
      expect(scheduler.isAutoRunInProgress).toBe(false);
    });

    test("given overrides, when creating scheduler, then applies overrides", () => {
      const scheduler = createSchedulerPayload({
        intervalMinutes: 30,
        isAutoRunInProgress: true,
      });

      expect(scheduler.intervalMinutes).toBe(30);
      expect(scheduler.isAutoRunInProgress).toBe(true);
    });
  });

  describe("createLastRunPayload", () => {
    test("given default options, when creating lastRun, then returns complete payload", () => {
      const lastRun = createLastRunPayload();

      expect(lastRun.repo).toBe("owner/repo");
      expect(lastRun.updatedAt).toBeTruthy();
    });

    test("given null, when creating lastRun, then returns null", () => {
      const lastRun = createLastRunPayload(null);

      expect(lastRun).toBeNull();
    });

    test("given overrides, when creating lastRun, then applies overrides", () => {
      const lastRun = createLastRunPayload({
        repo: "other/repo",
        updatedAt: "2026-01-01T00:00:00Z",
      });

      expect(lastRun.repo).toBe("other/repo");
      expect(lastRun.updatedAt).toBe("2026-01-01T00:00:00Z");
    });
  });

  describe("createActorsMap", () => {
    test("given entries, when creating actors map, then returns entries", () => {
      const entries = { user1: "User One", user2: "User Two" };
      const map = createActorsMap(entries);

      expect(map).toEqual(entries);
    });

    test("given no entries, when creating actors map, then returns empty object", () => {
      const map = createActorsMap();

      expect(map).toEqual({});
    });
  });

  describe("createReviewThread", () => {
    test("given default options, when creating thread, then returns complete thread", () => {
      const thread = createReviewThread();

      expect(thread.id).toBeTruthy();
      expect(thread.isResolved).toBe(false);
      expect(Array.isArray(thread.participants)).toBe(true);
      expect(Array.isArray(thread.comments)).toBe(true);
    });

    test("given overrides, when creating thread, then applies overrides", () => {
      const thread = createReviewThread({
        id: "custom-thread",
        isResolved: true,
        resolvedByLogin: "resolver",
      });

      expect(thread.id).toBe("custom-thread");
      expect(thread.isResolved).toBe(true);
      expect(thread.resolvedByLogin).toBe("resolver");
    });
  });

  describe("createReviewComment", () => {
    test("given default options, when creating comment, then returns complete comment", () => {
      const comment = createReviewComment();

      expect(comment.id).toBeTruthy();
      expect(comment.authorLogin).toBeTruthy();
      expect(comment.body).toBeTruthy();
      expect(comment.createdAt).toBeTruthy();
    });

    test("given overrides, when creating comment, then applies overrides", () => {
      const comment = createReviewComment({
        id: "custom-comment",
        body: "Custom comment text",
      });

      expect(comment.id).toBe("custom-comment");
      expect(comment.body).toBe("Custom comment text");
    });
  });

  describe("createActivityTimelineEntry", () => {
    test("given default options, when creating entry, then returns complete entry", () => {
      const entry = createActivityTimelineEntry();

      expect(entry.type).toBe("comment");
      expect(entry.actorLogin).toBeTruthy();
      expect(entry.description).toBeTruthy();
    });

    test("given overrides, when creating entry, then applies overrides", () => {
      const entry = createActivityTimelineEntry({
        type: "approval",
        description: "Approved the PR",
      });

      expect(entry.type).toBe("approval");
      expect(entry.description).toBe("Approved the PR");
    });
  });

  describe("createNotes", () => {
    test("given default options, when creating notes, then returns empty comments", () => {
      const notes = createNotes();

      expect(Array.isArray(notes.comments)).toBe(true);
      expect(notes.comments).toHaveLength(0);
    });

    test("given comment overrides, when creating notes, then includes comments", () => {
      const notes = createNotes({
        comments: [{ id: "c1", note: "test" }],
        otherNotes: "Additional notes",
      });

      expect(notes.comments).toHaveLength(1);
      expect(notes.otherNotes).toBe("Additional notes");
    });
  });

  describe("createNoteComment", () => {
    test("given default options, when creating comment, then returns complete comment", () => {
      const comment = createNoteComment();

      expect(comment.id).toBeTruthy();
      expect(comment.author).toBeTruthy();
      expect(comment.tone).toBe("Neutral");
      expect(comment.note).toBeTruthy();
    });

    test("given overrides, when creating comment, then applies overrides", () => {
      const comment = createNoteComment({
        tone: "Positive",
        note: "Great work!",
      });

      expect(comment.tone).toBe("Positive");
      expect(comment.note).toBe("Great work!");
    });
  });

  describe("createPrDataPayload", () => {
    test("given default options, when creating payload, then returns valid structure", () => {
      const payload = createPrDataPayload();

      expect(payload.ok).toBe(true);
      expect(payload.byPrNumber).toEqual({});
      expect(payload.actorsMap).toEqual({});
      expect(payload.lastRun).toBeNull();

      const validation = validatePrDataPayloadShape(payload);
      expect(validation.valid).toBe(true);
    });

    test("given PR entries, when creating payload, then includes entries", () => {
      const byPrNumber = {
        "123": { prNumber: "123", repo: "owner/repo", data: {} },
      };
      const payload = createPrDataPayload({ byPrNumber });

      expect(payload.byPrNumber).toEqual(byPrNumber);
    });

    test("given lastRun data, when creating payload, then includes lastRun", () => {
      const payload = createPrDataPayload({
        lastRun: { repo: "owner/repo", updatedAt: "2026-01-01T00:00:00Z" },
      });

      expect(payload.lastRun.repo).toBe("owner/repo");
      expect(payload.lastRun.updatedAt).toBe("2026-01-01T00:00:00Z");
    });

    test("given scheduler data, when creating payload, then includes scheduler", () => {
      const payload = createPrDataPayload({
        scheduler: { intervalMinutes: 30 },
      });

      expect(payload.scheduler.intervalMinutes).toBe(30);
    });
  });

  describe("createPrEntryByScenario", () => {
    test("given open-no-change scenario, when creating entry, then returns NO_CHANGE PR", () => {
      const entry = createPrEntryByScenario("open-no-change");

      expect(entry.section).toBe("open");
      expect(entry.data.status).toBe("NO_CHANGE");
      expect(entry.data.approved).toBe("NO");
      expect(entry.data.inReview).toBe(false);
    });

    test("given open-changed scenario, when creating entry, then returns CHANGED PR", () => {
      const entry = createPrEntryByScenario("open-changed");

      expect(entry.data.status).toBe("CHANGED");
    });

    test("given open-approved scenario, when creating entry, then returns approved PR", () => {
      const entry = createPrEntryByScenario("open-approved");

      expect(entry.data.approved).toBe("YES");
      expect(entry.data.approvalCount).toBe("2");
      expect(entry.data.approvers).toHaveLength(2);
    });

    test("given merged scenario, when creating entry, then returns merged PR", () => {
      const entry = createPrEntryByScenario("merged");

      expect(entry.section).toBe("merged");
      expect(entry.data.status).toBe("MERGED");
      expect(entry.data.mergedAt).toBeTruthy();
    });

    test("given scenario with overrides, when creating entry, then applies overrides", () => {
      const entry = createPrEntryByScenario("open-no-change", {
        prNumber: "999",
        data: { title: "Custom Title" },
      });

      expect(entry.prNumber).toBe("999");
      expect(entry.data.title).toBe("Custom Title");
      expect(entry.data.status).toBe("NO_CHANGE"); // Scenario default preserved
    });
  });

  describe("createMultiPrPayload", () => {
    test("given count 3, when creating payload, then returns 3 PRs", () => {
      const payload = createMultiPrPayload(3);

      expect(Object.keys(payload.byPrNumber)).toHaveLength(3);
      expect(Object.keys(payload.actorsMap)).toHaveLength(3);
      expect(payload.lastRun).not.toBeNull();
    });

    test("given count 0, when creating payload, then returns empty PRs", () => {
      const payload = createMultiPrPayload(0);

      expect(Object.keys(payload.byPrNumber)).toHaveLength(0);
    });

    test("given customizer function, when creating payload, then applies customizer", () => {
      const customizer = (index, pr) => ({
        ...pr,
        data: { ...pr.data, custom: `value-${index}` },
      });
      const payload = createMultiPrPayload(2, customizer);

      expect(payload.byPrNumber["100"].data.custom).toBe("value-0");
      expect(payload.byPrNumber["101"].data.custom).toBe("value-1");
    });

    // New config-based API tests
    test("given config with single PR and scenario, when creating payload, then returns PR with scenario defaults", () => {
      const payload = createMultiPrPayload({
        prs: [{ scenario: "open-changed", prNumber: 42 }],
      });

      expect(payload.byPrNumber["42"]).toBeDefined();
      expect(payload.byPrNumber["42"].data.status).toBe("CHANGED");
      expect(payload.byPrNumber["42"].section).toBe("open");
    });

    test("given config with multiple PRs with different scenarios, when creating payload, then returns all PRs", () => {
      const payload = createMultiPrPayload({
        prs: [
          { scenario: "open-no-change", prNumber: 100 },
          { scenario: "open-approved", prNumber: 101 },
          { scenario: "merged", prNumber: 102 },
        ],
      });

      expect(Object.keys(payload.byPrNumber)).toHaveLength(3);
      expect(payload.byPrNumber["100"].data.status).toBe("NO_CHANGE");
      expect(payload.byPrNumber["101"].data.approved).toBe("YES");
      expect(payload.byPrNumber["102"].section).toBe("merged");
    });

    test("given config with scenario and overrides, when creating payload, then applies both", () => {
      const payload = createMultiPrPayload({
        prs: [
          {
            scenario: "open-changed",
            prNumber: 42,
            overrides: {
              data: {
                title: "Custom Title",
                author: "Alison Hall",
                authorLogin: "ahall236",
              },
            },
          },
        ],
      });

      expect(payload.byPrNumber["42"].data.title).toBe("Custom Title");
      expect(payload.byPrNumber["42"].data.author).toBe("Alison Hall");
      expect(payload.byPrNumber["42"].data.status).toBe("CHANGED"); // Scenario default
    });

    test("given config with custom actors map, when creating payload, then includes custom actors", () => {
      const payload = createMultiPrPayload({
        prs: [{ scenario: "open-changed", prNumber: 42 }],
        actorsMap: {
          "custom-login": "Custom Name",
        },
      });

      expect(payload.actorsMap["custom-login"]).toBe("Custom Name");
    });

    test("given config with PR data, when creating payload, then auto-populates actors map", () => {
      const payload = createMultiPrPayload({
        prs: [
          {
            scenario: "open-changed",
            prNumber: 42,
            overrides: {
              data: {
                author: "Test Author",
                authorLogin: "testauthor",
              },
            },
          },
        ],
      });

      expect(payload.actorsMap["testauthor"]).toBe("Test Author");
    });

    test("given config with custom lastRun, when creating payload, then uses custom lastRun", () => {
      const customLastRun = {
        repo: "custom/repo",
        updatedAt: "2026-04-01T12:00:00Z",
      };
      const payload = createMultiPrPayload({
        prs: [{ scenario: "open-changed", prNumber: 42 }],
        lastRun: customLastRun,
      });

      expect(payload.lastRun).toEqual(customLastRun);
    });

    test("given config with custom scheduler, when creating payload, then includes custom scheduler", () => {
      const customScheduler = {
        intervalMinutes: 30,
        isAutoRunInProgress: true,
      };
      const payload = createMultiPrPayload({
        prs: [{ scenario: "open-changed", prNumber: 42 }],
        scheduler: customScheduler,
      });

      expect(payload.scheduler).toMatchObject(customScheduler);
      expect(payload.scheduler.intervalMinutes).toBe(30);
      expect(payload.scheduler.isAutoRunInProgress).toBe(true);
    });

    test("given config with custom repo, when creating payload, then uses custom repo", () => {
      const payload = createMultiPrPayload({
        prs: [{ scenario: "open-changed", prNumber: 42 }],
        repo: "custom/repo",
      });

      expect(payload.byPrNumber["42"].repo).toBe("custom/repo");
      expect(payload.lastRun.repo).toBe("custom/repo");
    });

    test("given config without scenario, when creating payload, then uses overrides only", () => {
      const payload = createMultiPrPayload({
        prs: [
          {
            prNumber: 42,
            overrides: {
              section: "closed",
              data: {
                title: "Manual PR",
                status: "CLOSED",
              },
            },
          },
        ],
      });

      expect(payload.byPrNumber["42"].section).toBe("closed");
      expect(payload.byPrNumber["42"].data.title).toBe("Manual PR");
    });

    test("given empty prs array, when creating payload, then returns empty byPrNumber", () => {
      const payload = createMultiPrPayload({ prs: [] });

      expect(Object.keys(payload.byPrNumber)).toHaveLength(0);
      expect(payload.ok).toBe(true);
      expect(payload.lastRun).toBeDefined();
    });

    test("given config without prNumber, when creating payload, then uses default sequential numbers", () => {
      const payload = createMultiPrPayload({
        prs: [
          { scenario: "open-changed" },
          { scenario: "open-approved" },
        ],
      });

      expect(payload.byPrNumber["100"]).toBeDefined();
      expect(payload.byPrNumber["101"]).toBeDefined();
    });
  });

  describe("validatePrDataPayloadShape", () => {
    test("given valid payload, when validating, then validation passes", () => {
      const payload = createPrDataPayload();
      const result = validatePrDataPayloadShape(payload);

      expect(result.valid).toBe(true);
      expect(result.issues).toEqual([]);
    });

    test("given missing ok field, when validating, then validation fails", () => {
      const payload = { byPrNumber: {} };
      const result = validatePrDataPayloadShape(payload);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain("payload.ok must be a boolean");
    });

    test("given missing byPrNumber, when validating, then validation fails", () => {
      const payload = { ok: true };
      const result = validatePrDataPayloadShape(payload);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain("payload.byPrNumber must be an object");
    });

    test("given lastRun without required fields, when validating, then validation fails", () => {
      const payload = {
        ok: true,
        byPrNumber: {},
        lastRun: { repo: "" },
      };
      const result = validatePrDataPayloadShape(payload);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain("payload.lastRun.updatedAt is required when lastRun is present");
    });

    test("given non-object payload, when validating, then validation fails immediately", () => {
      const result = validatePrDataPayloadShape(null);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain("payload must be an object");
    });
  });
});
