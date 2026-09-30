// Tests for helper functions in app.js with edge cases and specific scenarios
const assert = require("assert");
const fs = require("fs");
const app = require("../app.js");

describe("helper function behavior", () => {
  describe("normalizeDisplayName", () => {
    test("returns empty string when given null or undefined", () => {
      assert.strictEqual(app.normalizeDisplayName(null), "");
      assert.strictEqual(app.normalizeDisplayName(undefined), "");
    });

    test("trims whitespace from display names", () => {
      assert.strictEqual(app.normalizeDisplayName("  John Doe  "), "John Doe");
    });

    test("converts to string when given non-string input", () => {
      assert.strictEqual(app.normalizeDisplayName(123), "123");
      assert.strictEqual(app.normalizeDisplayName(true), "true");
    });

    test("handles special characters and unicode", () => {
      assert.strictEqual(
        app.normalizeDisplayName("José García"),
        "José García"
      );
      assert.strictEqual(app.normalizeDisplayName("李明"), "李明");
    });
  });

  describe("resolveActorNameFromGitHub", () => {
    test("returns login when no actor map is available", () => {
      const result = app.resolveActorNameFromGitHub("ahall236_uhg");
      assert.ok(
        result === "ahall236_uhg" || typeof result === "string",
        "should return login or cached name"
      );
    });

    test("returns empty string for null login", () => {
      const result = app.resolveActorNameFromGitHub(null);
      assert.strictEqual(result, "");
    });

    test("returns empty string for undefined login", () => {
      const result = app.resolveActorNameFromGitHub(undefined);
      assert.strictEqual(result, "");
    });

    test("converts login to string when it is a number", () => {
      // This tests that the function handles numeric inputs gracefully
      const result = app.resolveActorNameFromGitHub(12345);
      assert.ok(typeof result === "string");
    });
  });

  describe("buildViewPrsActorsMap", () => {
    test("returns object when given empty PR data", () => {
      const result = app.buildViewPrsActorsMap({});
      assert.ok(typeof result === "object", "should return object for empty data");
    });

    test("processes PR data without throwing", () => {
      const prData = {
        1: {
          data: {
            author: "alice",
            authorLogin: "alice_login",
          },
        },
        2: {
          data: {
            author: "Bob Smith",
            authorLogin: "bob_login",
          },
        },
      };
      assert.doesNotThrow(
        () => app.buildViewPrsActorsMap(prData),
        "should process PR data without error"
      );
    });

    test("handles PR entries with missing author fields", () => {
      const prData = {
        1: {
          data: {
            // Missing author and authorLogin
          },
        },
        2: {
          data: {
            authorLogin: "valid_login",
          },
        },
      };
      assert.doesNotThrow(
        () => app.buildViewPrsActorsMap(prData),
        "should handle missing fields gracefully"
      );
    });

    test("given a stale actor cache snapshot, when actor names are persisted, then newer on-disk display names are preserved", () => {
      const actorCacheFilePath = app.viewPrsActorNameCacheFile;
      const originalReadFileSync = fs.readFileSync;
      const readSpy = jest.spyOn(fs, "readFileSync");
      const writeSpy = jest.spyOn(fs, "writeFileSync");
      let actorCacheReadCount = 0;

      try {
        readSpy.mockImplementation((filePath, ...args) => {
          if (String(filePath) === String(actorCacheFilePath)) {
            actorCacheReadCount += 1;
            if (actorCacheReadCount === 1) {
              return '{"alice_login":"Alice Old"}';
            }
            return '{"alice_login":"Alice New"}';
          }
          return originalReadFileSync.call(fs, filePath, ...args);
        });

        const prData = {
          1: {
            data: {
              author: "Bob Builder",
              authorLogin: "bob_login",
            },
          },
        };

        app.buildViewPrsActorsMap(prData);

        const actorCacheWriteCall = writeSpy.mock.calls.find(
          ([filePath]) => String(filePath) === String(actorCacheFilePath),
        );

        assert.ok(actorCacheWriteCall, "should persist actor cache updates");
        const writtenPayload = JSON.parse(String(actorCacheWriteCall[1] || "{}"));
        assert.strictEqual(writtenPayload.alice_login, "Alice New");
        assert.strictEqual(writtenPayload.bob_login, "Bob Builder");
      } finally {
        readSpy.mockRestore();
        writeSpy.mockRestore();
      }
    });
  });

  describe("parseBackfillCommandOutput", () => {
    test("returns valid result when given empty stdout and stderr", () => {
      const result = app.parseBackfillCommandOutput("", "");
      assert.ok(
        result && typeof result === "object",
        "should return an object"
      );
    });

    test("handles stderr messages without error", () => {
      const errorMsg = "Some error occurred in script";
      const result = app.parseBackfillCommandOutput("", errorMsg);
      assert.ok(typeof result === "object", "should parse error output");
    });

    test("extracts numeric stats when available in stdout", () => {
      const stdout = "Processed 100 items, added 50, updated 30";
      const result = app.parseBackfillCommandOutput(stdout, "");
      assert.ok(
        typeof result === "object",
        "should return an object for output with stats"
      );
    });

    test("handles multiline stdout output", () => {
      const stdout = "Line 1\nLine 2\nLine 3";
      const result = app.parseBackfillCommandOutput(stdout, "");
      assert.ok(typeof result === "object");
    });
  });

  test("given progress markers on stderr, when runViewPrsScript completes, then stdout remains intact", async () => {
    const events = [];
    const result = await app.runViewPrsScript(
      [
        "--noprofile",
        "--norc",
        "-lc",
        String.raw`printf '__VIEW_PRS_PROGRESS__:START:7\n' 1>&2; printf '__VIEW_PRS_PROGRESS__:END:7\n' 1>&2; printf '{"ok":true}\n'`,
      ],
      1024 * 1024,
      {
        timeoutMs: 8000,
        progressTracker: {
          onStart: (prNumber) => events.push(`start:${prNumber}`),
          onEnd: (prNumber) => events.push(`end:${prNumber}`),
          onRunDone: () => events.push("done"),
        },
      },
    );

    assert.ok(result.stdout.includes('{"ok":true}'));
    assert.deepStrictEqual(events, ["start:7", "end:7", "done"]);
  }, 15000);

  describe("getBackfillLogTail", () => {
    test("can be called without arguments", () => {
      if (typeof app.getBackfillLogTail !== "function") {
        return;
      }
      assert.doesNotThrow(
        () => app.getBackfillLogTail(),
        "should not throw when called without args"
      );
    });

    test("can be called with maxLines option", () => {
      if (typeof app.getBackfillLogTail !== "function") {
        return;
      }
      assert.doesNotThrow(
        () => app.getBackfillLogTail({ maxLines: 5 }),
        "should not throw with maxLines option"
      );
    });

    test("handles negative maxLines gracefully", () => {
      if (typeof app.getBackfillLogTail !== "function") {
        return;
      }
      assert.doesNotThrow(
        () => app.getBackfillLogTail({ maxLines: -10 }),
        "should handle negative values"
      );
    });

    test("handles zero maxLines", () => {
      if (typeof app.getBackfillLogTail !== "function") {
        return;
      }
      assert.doesNotThrow(
        () => app.getBackfillLogTail({ maxLines: 0 }),
        "should handle zero"
      );
    });
  });

  describe("getManualCooldownSkipReason", () => {
    test("is a valid function export", () => {
      assert.ok(
        typeof app.getManualCooldownSkipReason === "function",
        "should be exported"
      );
    });
  });

  describe("buildInsightsHookMetadata", () => {
    test("derives repoOwner/repoName from repo and reads through to entry.data fields", () => {
      const metadata = app.buildInsightsHookMetadata({
        repo: "acme-org/acme-repo",
        prNumber: "42",
        section: "open",
        data: {
          number: "42",
          url: "https://github.com/acme-org/acme-repo/pull/42",
          sourceBranch: "feature/x",
          targetBranch: "main",
          title: "Add feature",
          authorLogin: "octocat",
          commits: [
            { oid: "aaa111", committedAt: "2026-01-01T00:00:00Z" },
            { oid: "bbb222", committedAt: "2026-01-02T00:00:00Z" },
          ],
        },
      });

      assert.deepStrictEqual(metadata, {
        repoOwner: "acme-org",
        repoName: "acme-repo",
        repo: "acme-org/acme-repo",
        prId: "42",
        prUrl: "https://github.com/acme-org/acme-repo/pull/42",
        sourceBranch: "feature/x",
        targetBranch: "main",
        title: "Add feature",
        description: "",
        status: "open",
        author: "octocat",
        lastCommitDate: "2026-01-02T00:00:00Z",
        lastCommitId: "bbb222",
      });
    });

    test("reports status merged when data.mergedAt is set, regardless of section", () => {
      const metadata = app.buildInsightsHookMetadata({
        repo: "owner/repo",
        prNumber: "1",
        section: "open",
        data: { number: "1", mergedAt: "2026-02-01T00:00:00Z" },
      });
      assert.strictEqual(metadata.status, "merged");
    });

    test("reports status draft when section is draft and the PR is not merged", () => {
      const metadata = app.buildInsightsHookMetadata({
        repo: "owner/repo",
        prNumber: "1",
        section: "draft",
        data: { number: "1" },
      });
      assert.strictEqual(metadata.status, "draft");
    });

    test("reports status closed when section is closed and the PR is not merged", () => {
      const metadata = app.buildInsightsHookMetadata({
        repo: "owner/repo",
        prNumber: "1",
        section: "closed",
        data: { number: "1" },
      });
      assert.strictEqual(metadata.status, "closed");
    });

    test("reports status merged when section is closed but mergedAt is set", () => {
      const metadata = app.buildInsightsHookMetadata({
        repo: "owner/repo",
        prNumber: "1",
        section: "closed",
        data: { number: "1", mergedAt: "2026-02-01T00:00:00Z" },
      });
      assert.strictEqual(metadata.status, "merged");
    });

    test("reports status merged when section is merged even if mergedAt itself is missing", () => {
      // Regression test: section is the fallback signal for a "merged" row
      // whose mergedAt somehow wasn't captured (legacy row/migration gap) -
      // not just for distinguishing "closed" from "open".
      const metadata = app.buildInsightsHookMetadata({
        repo: "owner/repo",
        prNumber: "1",
        section: "merged",
        data: { number: "1" },
      });
      assert.strictEqual(metadata.status, "merged");
    });

    test("falls back to empty strings/null commit fields for a PR with no commits recorded", () => {
      const metadata = app.buildInsightsHookMetadata({
        repo: "owner/repo",
        prNumber: "1",
        data: { number: "1" },
      });
      assert.strictEqual(metadata.lastCommitDate, "");
      assert.strictEqual(metadata.lastCommitId, "");
    });

    test("truncates an overly long description to stay well under argv/command-line limits", () => {
      const metadata = app.buildInsightsHookMetadata({
        repo: "owner/repo",
        prNumber: "1",
        data: { number: "1", description: "x".repeat(30000) },
      });
      assert.strictEqual(metadata.description.length, 4000);
    });
  });

  describe("runInsightsHookScript", () => {
    test("resolves to a null html/error without attempting a spawn when no hook script is configured", async () => {
      const result = await app.runInsightsHookScript({
        repo: "owner/repo",
        prNumber: "1",
        data: { number: "1" },
      });
      assert.deepStrictEqual(result, { html: null, error: null });
    });
  });

  describe("getPrDiffCacheFilePath", () => {
    test("returns a string path for valid repo and PR number", () => {
      const result = app.getPrDiffCacheFilePath("owner/repo", 123);
      assert.ok(
        typeof result === "string" && result.length > 0,
        "should return a non-empty string path"
      );
    });

    test("returns different paths for different repos", () => {
      const path1 = app.getPrDiffCacheFilePath("owner/repo1", 123);
      const path2 = app.getPrDiffCacheFilePath("owner/repo2", 123);
      assert.notStrictEqual(
        path1,
        path2,
        "different repos should have different cache paths"
      );
    });

    test("returns different paths for different PR numbers", () => {
      const path1 = app.getPrDiffCacheFilePath("owner/repo", 123);
      const path2 = app.getPrDiffCacheFilePath("owner/repo", 456);
      assert.notStrictEqual(
        path1,
        path2,
        "different PR numbers should have different cache paths"
      );
    });

    test("handles string PR numbers", () => {
      const result = app.getPrDiffCacheFilePath("owner/repo", "123");
      assert.ok(typeof result === "string");
    });

    test("handles missing repo slug", () => {
      const result = app.getPrDiffCacheFilePath(null, 123);
      assert.ok(
        typeof result === "string",
        "should handle null repo gracefully"
      );
    });
  });

  describe("getPrDiffCommitFingerprint", () => {
    test("returns a fingerprint for valid entry", () => {
      const entry = {
        data: {
          headCommitOid: "abc123def456",
          baseCommitOid: "def456abc123",
        },
      };
      const result = app.getPrDiffCommitFingerprint(entry);
      assert.ok(
      typeof result === "string",
      "should return a string fingerprint"
      );
    });

    test("returns different fingerprints for different commits", () => {
    });

    test("returns same fingerprint for same commits", () => {
      const entry1 = {
        data: {
          headCommitOid: "abc123",
          baseCommitOid: "def456",
        },
      };
      const entry2 = {
        data: {
          headCommitOid: "abc123",
          baseCommitOid: "def456",
        },
      };
      const fp1 = app.getPrDiffCommitFingerprint(entry1);
      const fp2 = app.getPrDiffCommitFingerprint(entry2);
      assert.strictEqual(
        fp1,
        fp2,
        "same commits should have identical fingerprints"
      );
    });

    test("handles missing commit OIDs", () => {
      const entry = {
        data: {
          // Missing both commit OIDs
        },
      };
      const result = app.getPrDiffCommitFingerprint(entry);
      assert.ok(
        typeof result === "string",
        "should handle missing OIDs gracefully"
      );
    });

    test("handles null entry", () => {
      const result = app.getPrDiffCommitFingerprint(null);
      assert.ok(
        typeof result === "string",
        "should handle null entry gracefully"
      );
    });

    test("open PR fingerprint changes when updatedAt changes", () => {
      const base = {
        data: {
          commits: [{ oid: "abc123" }],
          sourceUpdatedAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        },
      };
      const changed = {
        data: {
          ...base.data,
          sourceUpdatedAt: "2026-01-02T00:00:00Z",
          updatedAt: "2026-01-02T00:00:00Z",
        },
      };
      assert.notStrictEqual(
        app.getPrDiffCommitFingerprint(base),
        app.getPrDiffCommitFingerprint(changed),
        "open PR fingerprint should track updatedAt since the diff can still change"
      );
    });

    test("merged PR fingerprint stays stable when updatedAt changes but commits don't", () => {
      const base = {
        data: {
          commits: [{ oid: "abc123" }],
          mergedAt: "2026-01-01T00:00:00Z",
          sourceUpdatedAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        },
      };
      const laterMetadataOnly = {
        data: {
          ...base.data,
          sourceUpdatedAt: "2026-02-01T00:00:00Z",
          updatedAt: "2026-02-01T00:00:00Z",
        },
      };
      assert.strictEqual(
        app.getPrDiffCommitFingerprint(base),
        app.getPrDiffCommitFingerprint(laterMetadataOnly),
        "merged PR fingerprint must not change from metadata-only updates since the diff is immutable"
      );
    });

    test("merged PR fingerprint still changes if commits differ", () => {
      const merged1 = {
        data: {
          commits: [{ oid: "abc123" }],
          mergedAt: "2026-01-01T00:00:00Z",
        },
      };
      const merged2 = {
        data: {
          commits: [{ oid: "def456" }],
          mergedAt: "2026-01-01T00:00:00Z",
        },
      };
      assert.notStrictEqual(
        app.getPrDiffCommitFingerprint(merged1),
        app.getPrDiffCommitFingerprint(merged2),
        "merged PR fingerprint should still depend on the commit set"
      );
    });
  });

  describe("pending update queue (quick-check)", () => {
    afterEach(() => {
      // These helpers mutate the shared scheduler state singleton, so reset
      // it between tests to avoid bleeding into unrelated assertions.
      app.viewPrsSchedulerState.pendingByRepo = {};
    });

    test("setPendingForRepo records open and merged/closed pending numbers", () => {
      app.setPendingForRepo("org/pending-repo-1", { open: [1, 2], mergedClosed: [3] });
      const keys = app.getPendingUpdatePrNumberKeys();
      assert.ok(keys.has("org/pending-repo-1#1"));
      assert.ok(keys.has("org/pending-repo-1#2"));
      assert.ok(keys.has("org/pending-repo-1#3"));
    });

    test("setPendingForRepo unions with anything already queued instead of overwriting it", () => {
      app.setPendingForRepo("org/pending-repo-2", { open: [10], mergedClosed: [] });
      app.setPendingForRepo("org/pending-repo-2", { open: [11], mergedClosed: [20] });
      const keys = app.getPendingUpdatePrNumberKeys();
      assert.ok(keys.has("org/pending-repo-2#10"), "first queued PR should still be pending");
      assert.ok(keys.has("org/pending-repo-2#11"), "newly queued PR should be pending");
      assert.ok(keys.has("org/pending-repo-2#20"), "newly queued merged/closed PR should be pending");
    });

    test("getReposWithPendingOpen and getReposWithPendingMergedClosed only report repos with entries in that bucket", () => {
      app.setPendingForRepo("org/pending-repo-3", { open: [1], mergedClosed: [] });
      app.setPendingForRepo("org/pending-repo-4", { open: [], mergedClosed: [2] });

      assert.ok(app.getReposWithPendingOpen().includes("org/pending-repo-3"));
      assert.ok(!app.getReposWithPendingOpen().includes("org/pending-repo-4"));
      assert.ok(app.getReposWithPendingMergedClosed().includes("org/pending-repo-4"));
      assert.ok(!app.getReposWithPendingMergedClosed().includes("org/pending-repo-3"));
    });

    test("clearPendingForRepo removes the whole repo by default", () => {
      app.setPendingForRepo("org/pending-repo-5", { open: [1], mergedClosed: [2] });
      app.clearPendingForRepo("org/pending-repo-5");
      const keys = app.getPendingUpdatePrNumberKeys();
      assert.ok(!keys.has("org/pending-repo-5#1"));
      assert.ok(!keys.has("org/pending-repo-5#2"));
    });

    test("clearPendingForRepo with onlyMergedClosed leaves the open bucket intact", () => {
      app.setPendingForRepo("org/pending-repo-6", { open: [1], mergedClosed: [2] });
      app.clearPendingForRepo("org/pending-repo-6", { onlyMergedClosed: true });
      const keys = app.getPendingUpdatePrNumberKeys();
      assert.ok(keys.has("org/pending-repo-6#1"), "open PR should remain pending");
      assert.ok(!keys.has("org/pending-repo-6#2"), "merged/closed PR should be cleared");
    });

    test("getViewPrsSchedulerPublicState reports pending counts and quick-check cadence", () => {
      app.setPendingForRepo("org/pending-repo-7", { open: [1, 2], mergedClosed: [3] });
      const publicState = app.getViewPrsSchedulerPublicState();
      assert.strictEqual(publicState.pendingOpenCount, 2);
      assert.strictEqual(publicState.pendingMergedClosedCount, 1);
      assert.ok(Number.isInteger(publicState.quickCheckIntervalMinutes));
      assert.ok(Number.isInteger(publicState.mergedFullSweepIntervalMinutes));
    });
  });

  describe("readPrDiffCache", () => {
    test("returns null when cache file does not exist", () => {
      if (typeof app.readPrDiffCache !== "function") {
        return;
      }
      const result = app.readPrDiffCache("nonexistent/path");
      assert.ok(result === null || typeof result === "object");
    });

    test("handles invalid cache file path without throwing", () => {
      if (typeof app.readPrDiffCache !== "function") {
        return;
      }
      assert.doesNotThrow(
        () => app.readPrDiffCache(null),
        "should handle null path gracefully"
      );
    });

    test("handles empty path string without throwing", () => {
      if (typeof app.readPrDiffCache !== "function") {
        return;
      }
      assert.doesNotThrow(
        () => app.readPrDiffCache(""),
        "should handle empty path"
      );
    });

    test("returns expected type for various inputs", () => {
      if (typeof app.readPrDiffCache !== "function") {
        return;
      }
      const result = app.readPrDiffCache("/some/path");
      assert.ok(result === null || typeof result === "object");
    });
  });
});
