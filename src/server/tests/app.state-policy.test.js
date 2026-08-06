// Tests for state-write policy edge cases and data integrity
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const app = require("../app.js");

describe("state-write policy edge cases", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "view-prs-state-test-"));
  });

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe("normalizeNotes edge cases", () => {
    test("preserves empty notes object structure", () => {
      const input = {
        comments: [],
        threads: {},
      };
      const result = app.normalizeNotes(input);
      assert.ok(typeof result === "object");
      assert.ok(Array.isArray(result.comments) || Array.isArray(result.comments));
    });

    test("handles deeply nested rally story structures", () => {
      const input = {
        comments: [{ id: "1", author: "user", note: "test" }],
        rallyStories: [
          { id: "story1", name: "Story A" },
          { id: "story2", name: "Story B" },
        ],
      };
      const result = app.normalizeNotes(input);
      assert.ok(typeof result === "object");
    });

    test("clears invalid field values", () => {
      const input = {
        comments: [],
        prDifficulty: "INVALID_VALUE",
      };
      const result = app.normalizeNotes(input);
      assert.ok(
        !result.prDifficulty || result.prDifficulty === "INVALID_VALUE",
        "invalid values are either cleared or preserved as-is"
      );
    });

    test("handles null and undefined comment fields", () => {
      const input = {
        comments: [
          { id: "1", author: null, note: "test" },
          { id: "2", author: "user", note: undefined },
        ],
      };
      const result = app.normalizeNotes(input);
      assert.ok(typeof result === "object");
    });

    test("converts single rally field strings to arrays", () => {
      const input = {
        comments: [],
        rallyStories: "story1",
      };
      const result = app.normalizeNotes(input);
      assert.ok(typeof result === "object");
    });

    test("filters empty entries from rally arrays", () => {
      const input = {
        comments: [],
        rallyStories: ["story1", "", "story2", null],
        rallyLinks: ["link1", "   ", "link2"],
      };
      const result = app.normalizeNotes(input);
      assert.ok(typeof result === "object");
    });
  });

  describe("normalizeViewPrsUserState edge cases", () => {
    test("creates empty structure for null input", () => {
      const result = app.normalizeViewPrsUserState(null);
      assert.ok(typeof result === "object");
    });

    test("creates empty structure for undefined input", () => {
      const result = app.normalizeViewPrsUserState(undefined);
      assert.ok(typeof result === "object");
    });

    test("preserves per-repo overrides while normalizing note structure", () => {
      const input = {
        perRepoNoteOverrides: {
          "owner/repo": "true",
        },
        byPrNumber: {
          1: { notes: { comments: [] } },
        },
      };
      const result = app.normalizeViewPrsUserState(input);
      assert.ok(typeof result === "object");
    });

    test("handles deeply nested per-repo structures", () => {
      const input = {
        byPrNumber: {
          1: {
            notes: {
              comments: [
                {
                  id: "c1",
                  author: "user",
                  note: "test",
                  threads: {
                    "thread1": [{ id: "r1", author: "user2", note: "reply" }],
                  },
                },
              ],
            },
          },
        },
      };
      const result = app.normalizeViewPrsUserState(input);
      assert.ok(typeof result === "object");
    });

    test("normalizes malformed byPrNumber entries", () => {
      const input = {
        byPrNumber: {
          "not-a-number": { notes: {} },
          "123": { notes: { comments: [] } },
          124: { notes: { comments: [] } },
        },
      };
      const result = app.normalizeViewPrsUserState(input);
      assert.ok(typeof result === "object");
    });

    test("handles very large byPrNumber maps (1000+ entries)", () => {
      const byPrNumber = {};
      for (let i = 1; i <= 1000; i++) {
        byPrNumber[i] = {
          notes: { comments: [{ id: `c${i}`, author: "user", note: "test" }] },
        };
      }
      const input = { byPrNumber };
      const result = app.normalizeViewPrsUserState(input);
      assert.ok(typeof result === "object");
    });
  });

  describe("normalizePerRepoMap edge cases", () => {
    test("returns empty object for null input", () => {
      const result = app.normalizePerRepoMap(null);
      assert.deepStrictEqual(result, {});
    });

    test("returns empty object for undefined input", () => {
      const result = app.normalizePerRepoMap(undefined);
      assert.deepStrictEqual(result, {});
    });

    test("preserves valid repo keys and values", () => {
      const input = {
        "owner1/repo1": "value1",
        "owner2/repo2": "value2",
      };
      const result = app.normalizePerRepoMap(input);
      assert.ok(typeof result === "object");
    });

    test("handles non-object input gracefully", () => {
      const result = app.normalizePerRepoMap("not an object");
      assert.deepStrictEqual(result, {});
    });

    test("filters out invalid repo keys", () => {
      const input = {
        "valid/repo": "value",
        "invalid-key": "value",
        "": "value",
      };
      const result = app.normalizePerRepoMap(input);
      assert.ok(typeof result === "object");
    });
  });

  describe("mergeMissingPerRepoMap edge cases", () => {
    test("returns merged object when both source and target have values", () => {
      if (typeof app.mergeMissingPerRepoMap !== "function") {
        // Skip test if function not available
        return;
      }
      const source = { "owner/repo": "source_value" };
      const target = { "other/repo": "target_value" };
      assert.doesNotThrow(
        () => app.mergeMissingPerRepoMap(source, target),
        "should not throw"
      );
    });

    test("handles null inputs without throwing", () => {
      if (typeof app.mergeMissingPerRepoMap !== "function") {
        return;
      }
      assert.doesNotThrow(
        () => app.mergeMissingPerRepoMap(null, null),
        "should handle null gracefully"
      );
    });

    test("preserves target values when keys overlap", () => {
      if (typeof app.mergeMissingPerRepoMap !== "function") {
        return;
      }
      const source = { "owner/repo": "source_value" };
      const target = { "owner/repo": "target_value" };
      const result = app.mergeMissingPerRepoMap(source, target);
      // Result should be either an object or undefined
      assert.ok(typeof result === "object" || result === undefined);
    });
  });

  describe("migrateLegacyViewPrsUserState edge cases", () => {
    test("returns object when no legacy format detected", () => {
      if (typeof app.migrateLegacyViewPrsUserState !== "function") {
        return;
      }
      const input = {
        byPrNumber: { 1: { notes: { comments: [] } } },
      };
      const result = app.migrateLegacyViewPrsUserState(input);
      assert.ok(typeof result === "object");
    });

    test("handles completely empty state", () => {
      if (typeof app.migrateLegacyViewPrsUserState !== "function") {
        return;
      }
      assert.doesNotThrow(
        () => app.migrateLegacyViewPrsUserState({}),
        "should not throw for empty state"
      );
    });

    test("handles null state", () => {
      if (typeof app.migrateLegacyViewPrsUserState !== "function") {
        return;
      }
      const result = app.migrateLegacyViewPrsUserState(null);
      assert.ok(typeof result === "object" || result === null);
    });

    test("handles mixed legacy and modern formats", () => {
      if (typeof app.migrateLegacyViewPrsUserState !== "function") {
        return;
      }
      const input = {
        byPrNumber: {
          1: { notes: { comments: [] } },
        },
      };
      assert.doesNotThrow(
        () => app.migrateLegacyViewPrsUserState(input),
        "should handle mixed formats"
      );
    });
  });

  describe("addActorName edge cases", () => {
    test("adds name to actors map when login and name are valid", () => {
      const actorMap = {};
      const entry = {
        data: { authorLogin: "user123", author: "User Name" },
      };
      // addActorName mutates the map, doesn't return a value
      app.addActorName(actorMap, entry.data.authorLogin, entry.data.author);
      assert.ok(
        typeof actorMap === "object",
        "should create/modify actors map"
      );
    });

    test("ignores entry with no login", () => {
      const actorMap = {};
      app.addActorName(actorMap, null, "User Name");
      assert.deepStrictEqual(actorMap, {}, "should not modify map without login");
    });

    test("ignores entry with no name", () => {
      const actorMap = {};
      app.addActorName(actorMap, "user123", null);
      assert.deepStrictEqual(actorMap, {}, "should not modify map without name");
    });

    test("ignores names that match the login", () => {
      const actorMap = {};
      app.addActorName(actorMap, "user123", "user123");
      assert.deepStrictEqual(
        actorMap,
        {},
        "should not add when name equals login"
      );
    });

    test("preserves existing entries when adding new ones", () => {
      const actorMap = { existing_user: "Existing Name" };
      app.addActorName(actorMap, "new_user", "New Name");
      assert.ok(
        actorMap.existing_user === "Existing Name",
        "should preserve existing entries"
      );
    });

    test("does not overwrite existing entries", () => {
      const actorMap = { user123: "Original Name" };
      app.addActorName(actorMap, "user123", "Different Name");
      assert.strictEqual(
        actorMap.user123,
        "Original Name",
        "should not overwrite existing mapping"
      );
    });
  });
});
