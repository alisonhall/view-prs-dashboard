/**
 * API Response Fixture Factories
 * 
 * Provides reusable factories for creating mock API responses used in UI integration tests.
 * All factories support override patterns for test-specific customization.
 */

/**
 * Creates a standard OK JSON response structure
 * @param {Object} payload - Response payload
 * @returns {Object} Mock fetch response
 */
const createOkJsonResponse = (payload) => ({
  ok: true,
  status: 200,
  json: async () => payload,
});

/**
 * Creates an error JSON response structure
 * @param {number} status - HTTP status code
 * @param {Object} payload - Error payload
 * @returns {Object} Mock fetch response
 */
const createErrorJsonResponse = (status, payload) => ({
  ok: false,
  status,
  json: async () => payload,
});

/**
 * Creates a user-defaults response payload
 * @param {Object} overrides - User defaults override values
 * @returns {Object} User defaults response
 */
const createUserDefaultsResponse = (overrides = {}) => ({
  ok: true,
  overrides,
});

/**
 * Creates a backfill status response payload
 * @param {Object} options - Backfill status options
 * @param {boolean} options.running - Whether backfill is running
 * @param {string} options.summary - Status summary text
 * @param {string} options.output - Status output text
 * @returns {Object} Backfill status response
 */
const createBackfillStatusResponse = ({
  running = false,
  summary = "Backfill status: not running",
  output = "Backfill status: not running",
} = {}) => ({
  ok: true,
  running,
  summary,
  output,
});

/**
 * Creates a backfill action response payload
 * @param {Object} options - Action response options
 * @param {string} options.action - Action name ('start' or 'stop')
 * @param {boolean} options.running - Whether backfill is running after action
 * @param {number} options.pid - Process ID
 * @returns {Object} Backfill action response
 */
const createBackfillActionResponse = ({
  action = "start",
  running = true,
  pid = 321,
} = {}) => {
  const verb = action === "start" ? "Started" : "Stopped";
  const summary = `${verb} background backfill (PID: ${pid}).`;
  
  return {
    ok: true,
    running,
    summary,
    output: summary,
  };
};

/**
 * Creates a backfill log response payload
 * @param {Object} options - Log response options
 * @param {string[]} options.lines - Log lines
 * @returns {Object} Backfill log response
 */
const createBackfillLogResponse = ({
  lines = ["line-1", "line-2"],
} = {}) => ({
  ok: true,
  summary: `Showing ${lines.length} log line(s)`,
  tail: lines.join("\n"),
});

/**
 * Creates an action log response payload
 * @param {Object} options - Action log options
 * @param {Array} options.entries - Action log entries
 * @returns {Object} Action log response
 */
const createActionLogResponse = ({
  entries = [],
} = {}) => ({
  ok: true,
  entries,
});

/**
 * Creates an actor name cache response payload
 * @param {Object} entries - Actor name cache entries (login -> name mapping)
 * @returns {Object} Actor name cache response
 */
const createActorNameCacheResponse = (entries = {}) => ({
  ok: true,
  entries,
  count: Object.keys(entries).length,
});

/**
 * Creates an actor login aliases response payload
 * @param {Object} entries - Actor login alias entries
 * @returns {Object} Actor login aliases response
 */
const createActorLoginAliasesResponse = (entries = {}) => ({
  ok: true,
  entries,
  count: Object.keys(entries).length,
});

/**
 * Creates an author comments response payload
 * @param {Object} options - Author comments options
 * @param {Array} options.comments - Array of comment objects
 * @returns {Object} Author comments response
 */
const createAuthorCommentsResponse = ({
  comments = [],
} = {}) => ({
  ok: true,
  comments,
});

/**
 * Creates a diff response payload
 * @param {Object} options - Diff response options
 * @returns {Object} Diff response
 */
const createDiffResponse = ({
  source = "cache",
  stale = false,
  warning = "",
  commitFingerprint = "abc123",
  fetchedAt = "2026-06-16T10:00:00Z",
  filePath = "data/pr-diffs/owner__repo__pr-101.json",
  diffText = "diff --git a/file.js b/file.js\n+console.log('hello');",
} = {}) => ({
  ok: true,
  source,
  stale,
  warning,
  commitFingerprint,
  fetchedAt,
  filePath,
  diffText,
});

/**
 * Creates an ack response payload
 * @param {Object} prData - PR data payload
 * @returns {Object} Ack response
 */
const createAckResponse = (prData) => ({
  ok: true,
  prData,
});

/**
 * Validates API response fixture shape
 * @param {Object} response - Response object to validate
 * @returns {Object} Validation result with { valid, issues }
 */
const validateApiResponseShape = (response = {}) => {
  const issues = [];

  if (!response || typeof response !== "object" || Array.isArray(response)) {
    issues.push("response must be an object");
    return { valid: false, issues };
  }

  if (typeof response.ok !== "boolean") {
    issues.push("response.ok must be a boolean");
  }

  if (response.ok && typeof response.status !== "undefined" && response.status !== 200) {
    issues.push("OK responses should have status 200");
  }

  if (!response.ok && (!response.status || response.status < 400)) {
    issues.push("Error responses should have status >= 400");
  }

  if (typeof response.json !== "function") {
    issues.push("response.json must be a function");
  }

  return {
    valid: issues.length === 0,
    issues,
  };
};

module.exports = {
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
};
