/**
 * API Response Fixtures Contract Tests
 * 
 * Validates that all API response fixture factories produce valid mock responses
 * with correct shape and structure.
 */

const {
  createOkJsonResponse,
  createErrorJsonResponse,
  createUserDefaultsResponse,
  createBackfillStatusResponse,
  createBackfillActionResponse,
  createBackfillLogResponse,
  createActionLogResponse,
  createActorNameCacheResponse,
  createActorLoginAliasesResponse,
  createAuthorCommentsResponse,
  createDiffResponse,
  createAckResponse,
  validateApiResponseShape,
} = require("./api-response.fixtures.js");

describe("API response fixtures", () => {
  describe("createOkJsonResponse", () => {
    test("given payload, when creating OK response, then response shape is valid", () => {
      const payload = { ok: true, data: "test" };
      const response = createOkJsonResponse(payload);

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      expect(typeof response.json).toBe("function");

      const validation = validateApiResponseShape(response);
      expect(validation.valid).toBe(true);
      expect(validation.issues).toEqual([]);
    });

    test("given payload, when json() called, then returns payload", async () => {
      const payload = { ok: true, value: 42 };
      const response = createOkJsonResponse(payload);
      const result = await response.json();

      expect(result).toEqual(payload);
    });
  });

  describe("createErrorJsonResponse", () => {
    test("given status and payload, when creating error response, then response shape is valid", () => {
      const response = createErrorJsonResponse(404, { ok: false, error: "Not found" });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(404);
      expect(typeof response.json).toBe("function");

      const validation = validateApiResponseShape(response);
      expect(validation.valid).toBe(true);
    });

    test("given payload, when json() called, then returns error payload", async () => {
      const payload = { ok: false, error: "Server error" };
      const response = createErrorJsonResponse(500, payload);
      const result = await response.json();

      expect(result).toEqual(payload);
    });
  });

  describe("createUserDefaultsResponse", () => {
    test("given overrides, when creating response, then includes ok and overrides", () => {
      const overrides = { theme: "dark" };
      const response = createUserDefaultsResponse(overrides);

      expect(response.ok).toBe(true);
      expect(response.overrides).toEqual(overrides);
    });

    test("given no overrides, when creating response, then returns empty overrides", () => {
      const response = createUserDefaultsResponse();

      expect(response.ok).toBe(true);
      expect(response.overrides).toEqual({});
    });
  });

  describe("createBackfillStatusResponse", () => {
    test("given default options, when creating response, then returns not-running status", () => {
      const response = createBackfillStatusResponse();

      expect(response.ok).toBe(true);
      expect(response.running).toBe(false);
      expect(response.summary).toBe("Backfill status: not running");
      expect(response.output).toBe("Backfill status: not running");
    });

    test("given running status, when creating response, then returns custom status", () => {
      const response = createBackfillStatusResponse({
        running: true,
        summary: "Backfill in progress",
        output: "Processing...",
      });

      expect(response.running).toBe(true);
      expect(response.summary).toBe("Backfill in progress");
      expect(response.output).toBe("Processing...");
    });
  });

  describe("createBackfillActionResponse", () => {
    test("given start action, when creating response, then returns started message", () => {
      const response = createBackfillActionResponse({ action: "start" });

      expect(response.ok).toBe(true);
      expect(response.running).toBe(true);
      expect(response.summary).toContain("Started");
      expect(response.summary).toContain("321");
    });

    test("given stop action, when creating response, then returns stopped message", () => {
      const response = createBackfillActionResponse({
        action: "stop",
        running: false,
        pid: 123,
      });

      expect(response.running).toBe(false);
      expect(response.summary).toContain("Stopped");
      expect(response.summary).toContain("123");
    });
  });

  describe("createBackfillLogResponse", () => {
    test("given log lines, when creating response, then returns formatted log", () => {
      const lines = ["line-1", "line-2", "line-3"];
      const response = createBackfillLogResponse({ lines });

      expect(response.ok).toBe(true);
      expect(response.summary).toBe("Showing 3 log line(s)");
      expect(response.tail).toBe("line-1\nline-2\nline-3");
    });

    test("given default lines, when creating response, then returns default log", () => {
      const response = createBackfillLogResponse();

      expect(response.summary).toBe("Showing 2 log line(s)");
      expect(response.tail).toBe("line-1\nline-2");
    });
  });

  describe("createActionLogResponse", () => {
    test("given entries, when creating response, then returns entries array", () => {
      const entries = [{ action: "test", timestamp: "2026-01-01" }];
      const response = createActionLogResponse({ entries });

      expect(response.ok).toBe(true);
      expect(response.entries).toEqual(entries);
    });

    test("given no entries, when creating response, then returns empty array", () => {
      const response = createActionLogResponse();

      expect(response.entries).toEqual([]);
    });
  });

  describe("createActorNameCacheResponse", () => {
    test("given entries, when creating response, then includes count", () => {
      const entries = { user1: "User One", user2: "User Two" };
      const response = createActorNameCacheResponse(entries);

      expect(response.ok).toBe(true);
      expect(response.entries).toEqual(entries);
      expect(response.count).toBe(2);
    });

    test("given empty entries, when creating response, then count is zero", () => {
      const response = createActorNameCacheResponse();

      expect(response.count).toBe(0);
    });
  });

  describe("createActorLoginAliasesResponse", () => {
    test("given alias entries, when creating response, then includes count", () => {
      const entries = { alias1: "user1", alias2: "user2" };
      const response = createActorLoginAliasesResponse(entries);

      expect(response.ok).toBe(true);
      expect(response.entries).toEqual(entries);
      expect(response.count).toBe(2);
    });
  });

  describe("createAuthorCommentsResponse", () => {
    test("given comments, when creating response, then returns comments array", () => {
      const comments = [{ id: "c1", text: "comment" }];
      const response = createAuthorCommentsResponse({ comments });

      expect(response.ok).toBe(true);
      expect(response.comments).toEqual(comments);
    });

    test("given no comments, when creating response, then returns empty array", () => {
      const response = createAuthorCommentsResponse();

      expect(response.comments).toEqual([]);
    });
  });

  describe("createDiffResponse", () => {
    test("given default options, when creating response, then returns complete diff payload", () => {
      const response = createDiffResponse();

      expect(response.ok).toBe(true);
      expect(response.source).toBe("cache");
      expect(response.stale).toBe(false);
      expect(response.commitFingerprint).toBeTruthy();
      expect(response.diffText).toBeTruthy();
    });

    test("given custom diff text, when creating response, then uses custom text", () => {
      const diffText = "diff --git a/custom.js b/custom.js\n+added line";
      const response = createDiffResponse({ diffText });

      expect(response.diffText).toBe(diffText);
    });
  });

  describe("createAckResponse", () => {
    test("given PR data, when creating response, then wraps data in prData field", () => {
      const prData = { byPrNumber: {}, lastRun: null };
      const response = createAckResponse(prData);

      expect(response.ok).toBe(true);
      expect(response.prData).toEqual(prData);
    });
  });

  describe("validateApiResponseShape", () => {
    test("given valid OK response, when validating, then validation passes", () => {
      const response = { ok: true, status: 200, json: async () => ({}) };
      const result = validateApiResponseShape(response);

      expect(result.valid).toBe(true);
      expect(result.issues).toEqual([]);
    });

    test("given missing ok field, when validating, then validation fails", () => {
      const response = { status: 200, json: async () => ({}) };
      const result = validateApiResponseShape(response);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain("response.ok must be a boolean");
    });

    test("given missing json function, when validating, then validation fails", () => {
      const response = { ok: true, status: 200 };
      const result = validateApiResponseShape(response);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain("response.json must be a function");
    });

    test("given error response with low status, when validating, then validation fails", () => {
      const response = { ok: false, status: 200, json: async () => ({}) };
      const result = validateApiResponseShape(response);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain("Error responses should have status >= 400");
    });

    test("given non-object response, when validating, then validation fails immediately", () => {
      const result = validateApiResponseShape(null);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain("response must be an object");
    });
  });
});
