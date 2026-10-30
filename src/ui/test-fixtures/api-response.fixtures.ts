/**
 * API Response Fixture Factories
 *
 * Provides reusable factories for creating mock API responses used in UI integration tests.
 * All factories support override patterns for test-specific customization.
 */

import type { FixtureShapeCheck } from "./pr-row.fixtures.ts";

// What a mocked fetch() resolves to.
export interface MockJsonResponse<T> {
  ok: boolean;
  status: number;
  json: () => Promise<T>;
}

/**
 * Creates a standard OK JSON response structure
 */
export const createOkJsonResponse = <T>(payload: T): MockJsonResponse<T> => ({
  ok: true,
  status: 200,
  json: async () => payload,
});

/**
 * Creates an error JSON response structure
 */
export const createErrorJsonResponse = <T>(status: number, payload: T): MockJsonResponse<T> => ({
  ok: false,
  status,
  json: async () => payload,
});

/**
 * Creates a user-defaults response payload
 */
export const createUserDefaultsResponse = (overrides: Record<string, unknown> = {}) => ({
  ok: true,
  overrides,
});

/**
 * Creates a backfill status response payload
 */
export const createBackfillStatusResponse = ({
  running = false,
  summary = "Backfill status: not running",
  output = "Backfill status: not running",
}: { running?: boolean; summary?: string; output?: string } = {}) => ({
  ok: true,
  running,
  summary,
  output,
});

/**
 * Creates a backfill action response payload ('start' or 'stop')
 */
export const createBackfillActionResponse = ({
  action = "start",
  running = true,
  pid = 321,
}: { action?: "start" | "stop"; running?: boolean; pid?: number } = {}) => {
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
 */
export const createBackfillLogResponse = ({ lines = ["line-1", "line-2"] }: { lines?: string[] } = {}) => ({
  ok: true,
  summary: `Showing ${lines.length} log line(s)`,
  tail: lines.join("\n"),
});

/**
 * Creates an action log response payload
 */
export const createActionLogResponse = ({ entries = [] }: { entries?: unknown[] } = {}) => ({
  ok: true,
  entries,
});

/**
 * Creates an actor name cache response payload (login -> name)
 */
export const createActorNameCacheResponse = (entries: Record<string, unknown> = {}) => ({
  ok: true,
  entries,
  count: Object.keys(entries).length,
});

/**
 * Creates an actor login aliases response payload
 */
export const createActorLoginAliasesResponse = (entries: Record<string, unknown> = {}) => ({
  ok: true,
  entries,
  count: Object.keys(entries).length,
});

/**
 * Creates an author comments response payload
 */
export const createAuthorCommentsResponse = ({ comments = [] }: { comments?: unknown[] } = {}) => ({
  ok: true,
  comments,
});

/**
 * Creates a diff response payload
 */
export const createDiffResponse = ({
  source = "cache",
  stale = false,
  warning = "",
  commitFingerprint = "abc123",
  fetchedAt = "2026-06-16T10:00:00Z",
  filePath = "data/pr-diffs/owner__repo__pr-101.json",
  diffText = "diff --git a/file.js b/file.js\n+console.log('hello');",
}: {
  source?: string;
  stale?: boolean;
  warning?: string;
  commitFingerprint?: string;
  fetchedAt?: string;
  filePath?: string;
  diffText?: string;
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
 */
export const createAckResponse = <T>(prData: T) => ({
  ok: true,
  prData,
});

/**
 * Validates API response fixture shape
 */
export const validateApiResponseShape = (response: unknown = {}): FixtureShapeCheck => {
  const issues: string[] = [];

  if (!response || typeof response !== "object" || Array.isArray(response)) {
    issues.push("response must be an object");
    return { valid: false, issues };
  }
  const { ok, status, json } = response as { ok?: unknown; status?: unknown; json?: unknown };

  if (typeof ok !== "boolean") {
    issues.push("response.ok must be a boolean");
  }

  if (ok && typeof status !== "undefined" && status !== 200) {
    issues.push("OK responses should have status 200");
  }

  if (!ok && (!status || Number(status) < 400)) {
    issues.push("Error responses should have status >= 400");
  }

  if (typeof json !== "function") {
    issues.push("response.json must be a function");
  }

  return {
    valid: issues.length === 0,
    issues,
  };
};
