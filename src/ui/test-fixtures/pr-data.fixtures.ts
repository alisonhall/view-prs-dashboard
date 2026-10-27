/**
 * PR Data Fixture Factories
 *
 * Provides reusable factories for creating complete PR data payloads
 * used in UI integration tests. Extends the basic pr-row fixtures with
 * full server response structures.
 */

import { createPrRowEntry, type FixtureShapeCheck, type PrRowEntryFixture } from "./pr-row.fixtures.ts";
import type {
  LastRun,
  PrData,
  PrDataPayload,
  PrEntry,
  PrNotes,
  PrNotesComment,
} from "../types/pr-data.ts";

type JsonRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/**
 * Creates a scheduler payload
 */
export const createSchedulerPayload = (overrides: JsonRecord = {}) => ({
  intervalMinutes: 15,
  manualCooldownMinutes: 15,
  isAutoRunInProgress: false,
  ...overrides,
});

/**
 * Creates a lastRun payload (null stays null)
 */
export const createLastRunPayload = (overrides: LastRun | null = {}): LastRun | null => {
  if (overrides === null) return null;

  return {
    repo: "owner/repo",
    updatedAt: "2026-03-10T10:00:00Z",
    ...overrides,
  };
};

/**
 * Creates an actorsMap (login -> display name mapping)
 */
export const createActorsMap = (entries: Record<string, string> = {}): Record<string, string> => ({
  ...entries,
});

/**
 * Creates a review thread object
 */
export const createReviewThread = (overrides: JsonRecord = {}) => ({
  id: "thread-1",
  isResolved: false,
  resolvedByLogin: "",
  participants: ["reviewer1", "author1"],
  comments: [],
  ...overrides,
});

/**
 * Creates a review comment object
 */
export const createReviewComment = (overrides: JsonRecord = {}) => ({
  id: "comment-1",
  authorLogin: "reviewer1",
  authorName: "Reviewer One",
  createdAt: "2026-03-10T10:45:00Z",
  body: "Please add a test case",
  state: "PENDING",
  ...overrides,
});

/**
 * Creates an activity timeline entry
 */
export const createActivityTimelineEntry = (overrides: JsonRecord = {}) => ({
  type: "comment",
  actorLogin: "reviewer1",
  actorName: "Reviewer One",
  createdAt: "2026-03-10T10:45:00Z",
  description: "Added a comment",
  ...overrides,
});

/**
 * Creates a notes object
 */
export const createNotes = (overrides: PrNotes = {}): PrNotes => ({
  comments: [],
  ...overrides,
});

/**
 * Creates a note comment object
 */
export const createNoteComment = (overrides: PrNotesComment = {}): PrNotesComment => ({
  id: "c1",
  author: "reviewer1",
  tone: "Neutral",
  note: "Note text",
  ...overrides,
});

export interface CreatePrDataPayloadOptions {
  byPrNumber?: Record<string, PrEntry>;
  actorsMap?: Record<string, string>;
  lastRun?: LastRun | null;
  scheduler?: JsonRecord | null;
}

/**
 * Creates a complete PR data payload (server response shape)
 */
export const createPrDataPayload = ({
  byPrNumber = {},
  actorsMap = {},
  lastRun = null,
  scheduler = null,
}: CreatePrDataPayloadOptions = {}): PrDataPayload => ({
  ok: true,
  byPrNumber,
  actorsMap,
  lastRun: createLastRunPayload(lastRun),
  scheduler: scheduler ? createSchedulerPayload(scheduler) : undefined,
});

// Fields a scenario sets that PrData doesn't declare (the factories pass
// them through untouched).
type ScenarioData = PrData & { isDraft?: boolean; approvers?: string[] };

const SCENARIOS: Record<string, { section: PrEntry["section"]; data: ScenarioData }> = {
  "open-no-change": {
    section: "open",
    data: {
      status: "NO_CHANGE",
      approved: "NO",
      approvalCount: "0",
      inReview: false,
      baseline: "2026-03-01T10:00:00Z",
    },
  },
  "open-changed": {
    section: "open",
    data: {
      status: "CHANGED",
      approved: "NO",
      approvalCount: "0",
      inReview: false,
      baseline: "-",
    },
  },
  "open-approved": {
    section: "open",
    data: {
      status: "NO_CHANGE",
      approved: "YES",
      approvalCount: "2",
      approvers: ["reviewer1", "reviewer2"],
      inReview: false,
      baseline: "2026-03-01T10:00:00Z",
    },
  },
  "open-in-review": {
    section: "open",
    data: {
      status: "NO_CHANGE",
      approved: "NO",
      approvalCount: "0",
      inReview: true,
      baseline: "-",
    },
  },
  merged: {
    section: "merged",
    data: {
      status: "MERGED",
      approved: "YES",
      approvalCount: "1",
      mergedAt: "2026-03-10T10:00:00Z",
    },
  },
  draft: {
    section: "draft",
    data: {
      status: "DRAFT",
      approved: "NO",
      approvalCount: "0",
      isDraft: true,
    },
  },
};

/**
 * Creates a single PR entry with common test scenarios
 */
export const createPrEntryByScenario = (scenario: string, overrides: PrEntry = {}): PrRowEntryFixture => {
  const scenarioDefaults = SCENARIOS[scenario];
  return createPrRowEntry({
    ...scenarioDefaults,
    ...overrides,
    data: {
      ...scenarioDefaults?.data,
      ...overrides.data,
    },
  });
};

// One PR for createMultiPrPayload's config form.
export interface MultiPrConfigEntry {
  scenario?: string | null;
  prNumber?: string | number;
  overrides?: PrEntry;
}

export interface MultiPrConfig {
  prs?: MultiPrConfigEntry[];
  actorsMap?: Record<string, string>;
  lastRun?: LastRun | null;
  scheduler?: JsonRecord;
  repo?: string;
  // Anything else (flaggedByRepo, ...) is copied onto the payload.
  [field: string]: unknown;
}

/**
 * Creates a payload with multiple PRs for testing filtering/grouping
 *
 * Supports two API styles:
 *
 * 1. Legacy API (backwards compatible):
 *    createMultiPrPayload(count, customizer)
 *
 * 2. New config-based API:
 *    createMultiPrPayload({
 *      prs: [{ scenario, prNumber, overrides }],
 *      actorsMap: {},
 *      lastRun: {},
 *      scheduler: {},
 *      repo: 'owner/repo'
 *    })
 */
export const createMultiPrPayload = (
  countOrConfig: number | MultiPrConfig = 3,
  customizer: ((index: number, pr: PrRowEntryFixture) => PrRowEntryFixture) | null = null,
): PrDataPayload => {
  if (isRecord(countOrConfig)) {
    // New config-based API
    const {
      prs = [],
      actorsMap: providedActorsMap = {},
      lastRun: providedLastRun = null,
      scheduler: providedScheduler = {},
      repo = "owner/repo",
      ...additionalFields // Capture any additional fields (flaggedByRepo, etc.)
    } = countOrConfig as MultiPrConfig;

    const byPrNumber: Record<string, PrEntry> = {};
    const actorsMap: Record<string, string> = { ...providedActorsMap };

    prs.forEach((prConfig, index) => {
      const { scenario = null, prNumber = 100 + index, overrides = {} } = prConfig;

      const prNumberStr = String(prNumber);
      const prOverrides: PrEntry = {
        prNumber: prNumberStr,
        repo,
        ...overrides,
        data: {
          number: prNumberStr,
          ...overrides.data,
        },
      };

      // Create PR using scenario if provided, otherwise use overrides directly
      const pr = scenario ? createPrEntryByScenario(scenario, prOverrides) : createPrRowEntry(prOverrides);

      byPrNumber[prNumberStr] = pr;

      // Auto-populate actorsMap from PR data if not explicitly provided
      const authorLogin = pr.data?.authorLogin;
      const author = pr.data?.author;
      if (authorLogin && author && !actorsMap[authorLogin]) {
        actorsMap[authorLogin] = author;
      }
    });

    return {
      ...createPrDataPayload({
        byPrNumber,
        actorsMap,
        lastRun: providedLastRun || { repo, updatedAt: "2026-03-10T10:00:00Z" },
        scheduler: providedScheduler,
      }),
      ...additionalFields, // Include any additional fields like flaggedByRepo
    };
  }

  // Legacy API (backwards compatible)
  const count = Number(countOrConfig);
  const byPrNumber: Record<string, PrEntry> = {};
  const actorsMap: Record<string, string> = {};

  for (let i = 0; i < count; i++) {
    const prNumber = String(100 + i);
    const authorLogin = `author${i}`;
    const authorName = `Author ${i}`;

    let pr = createPrRowEntry({
      prNumber,
      repo: "owner/repo",
      data: {
        number: prNumber,
        title: `PR ${prNumber} title`,
        titleDisplay: `PR ${prNumber} title`,
        authorLogin,
        author: authorName,
      },
    });

    if (typeof customizer === "function") {
      pr = customizer(i, pr);
    }

    byPrNumber[prNumber] = pr;
    actorsMap[authorLogin] = authorName;
  }

  return createPrDataPayload({
    byPrNumber,
    actorsMap,
    lastRun: { repo: "owner/repo", updatedAt: "2026-03-10T10:00:00Z" },
    scheduler: {},
  });
};

/**
 * Validates PR data payload shape
 */
export const validatePrDataPayloadShape = (payload: unknown = {}): FixtureShapeCheck => {
  const issues: string[] = [];

  if (!isRecord(payload)) {
    issues.push("payload must be an object");
    return { valid: false, issues };
  }

  if (typeof payload.ok !== "boolean") {
    issues.push("payload.ok must be a boolean");
  }

  if (!isRecord(payload.byPrNumber)) {
    issues.push("payload.byPrNumber must be an object");
  }

  if (payload.actorsMap && !isRecord(payload.actorsMap)) {
    issues.push("payload.actorsMap must be an object when present");
  }

  if (payload.lastRun !== null && payload.lastRun !== undefined) {
    if (!isRecord(payload.lastRun)) {
      issues.push("payload.lastRun must be an object or null");
    } else {
      if (!payload.lastRun.repo) {
        issues.push("payload.lastRun.repo is required when lastRun is present");
      }
      if (!payload.lastRun.updatedAt) {
        issues.push("payload.lastRun.updatedAt is required when lastRun is present");
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
};
