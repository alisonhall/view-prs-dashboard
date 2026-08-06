/**
 * PR Data Fixture Factories
 * 
 * Provides reusable factories for creating complete PR data payloads
 * used in UI integration tests. Extends the basic pr-row fixtures with
 * full server response structures.
 */

const { createPrRowEntry } = require("./pr-row.fixtures.js");

/**
 * Creates a scheduler payload
 * @param {Object} overrides - Scheduler field overrides
 * @returns {Object} Scheduler payload
 */
const createSchedulerPayload = (overrides = {}) => ({
  intervalMinutes: 15,
  manualCooldownMinutes: 15,
  isAutoRunInProgress: false,
  ...overrides,
});

/**
 * Creates a lastRun payload
 * @param {Object} overrides - LastRun field overrides
 * @returns {Object|null} LastRun payload or null
 */
const createLastRunPayload = (overrides = {}) => {
  if (overrides === null) return null;
  
  return {
    repo: "owner/repo",
    updatedAt: "2026-03-10T10:00:00Z",
    ...overrides,
  };
};

/**
 * Creates an actorsMap (login -> display name mapping)
 * @param {Object} entries - Actor login to name mappings
 * @returns {Object} Actors map
 */
const createActorsMap = (entries = {}) => ({
  ...entries,
});

/**
 * Creates a review thread object
 * @param {Object} overrides - Review thread field overrides
 * @returns {Object} Review thread
 */
const createReviewThread = (overrides = {}) => ({
  id: "thread-1",
  isResolved: false,
  resolvedByLogin: "",
  participants: ["reviewer1", "author1"],
  comments: [],
  ...overrides,
});

/**
 * Creates a review comment object
 * @param {Object} overrides - Review comment field overrides
 * @returns {Object} Review comment
 */
const createReviewComment = (overrides = {}) => ({
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
 * @param {Object} overrides - Timeline entry field overrides
 * @returns {Object} Activity timeline entry
 */
const createActivityTimelineEntry = (overrides = {}) => ({
  type: "comment",
  actorLogin: "reviewer1",
  actorName: "Reviewer One",
  createdAt: "2026-03-10T10:45:00Z",
  description: "Added a comment",
  ...overrides,
});

/**
 * Creates a notes object
 * @param {Object} overrides - Notes field overrides
 * @returns {Object} Notes object
 */
const createNotes = (overrides = {}) => {
  const base = {
    comments: [],
    ...overrides,
  };
  
  return base;
};

/**
 * Creates a note comment object
 * @param {Object} overrides - Comment field overrides
 * @returns {Object} Note comment
 */
const createNoteComment = (overrides = {}) => ({
  id: "c1",
  author: "reviewer1",
  tone: "Neutral",
  note: "Note text",
  ...overrides,
});

/**
 * Creates a complete PR data payload (server response shape)
 * @param {Object} options - Payload options
 * @param {Object} options.byPrNumber - PR entries keyed by PR number
 * @param {Object} options.actorsMap - Actor login to name mapping
 * @param {Object|null} options.lastRun - Last run metadata
 * @param {Object} options.scheduler - Scheduler state
 * @returns {Object} Complete PR data payload
 */
const createPrDataPayload = ({
  byPrNumber = {},
  actorsMap = {},
  lastRun = null,
  scheduler = null,
} = {}) => ({
  ok: true,
  byPrNumber,
  actorsMap,
  lastRun: createLastRunPayload(lastRun),
  scheduler: scheduler ? createSchedulerPayload(scheduler) : undefined,
});

/**
 * Creates a single PR entry with common test scenarios
 * @param {string} scenario - Pre-configured scenario name
 * @param {Object} overrides - Additional overrides
 * @returns {Object} PR entry
 */
const createPrEntryByScenario = (scenario, overrides = {}) => {
  const scenarios = {
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
    "merged": {
      section: "merged",
      data: {
        status: "MERGED",
        approved: "YES",
        approvalCount: "1",
        mergedAt: "2026-03-10T10:00:00Z",
      },
    },
    "draft": {
      section: "draft",
      data: {
        status: "DRAFT",
        approved: "NO",
        approvalCount: "0",
        isDraft: true,
      },
    },
  };

  const scenarioDefaults = scenarios[scenario] || {};
  return createPrRowEntry({
    ...scenarioDefaults,
    ...overrides,
    data: {
      ...scenarioDefaults.data,
      ...overrides.data,
    },
  });
};

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
 * 
 * @param {number|Object} countOrConfig - Number of PRs (legacy) or config object (new API)
 * @param {Function} customizer - Optional function to customize each PR (legacy API only)
 * @returns {Object} PR data payload with multiple entries
 */
const createMultiPrPayload = (countOrConfig = 3, customizer = null) => {
  // Detect which API style is being used
  const isConfigObject = typeof countOrConfig === "object" && countOrConfig !== null && !Array.isArray(countOrConfig);

  if (isConfigObject) {
    // New config-based API
    const {
      prs = [],
      actorsMap: providedActorsMap = {},
      lastRun: providedLastRun = null,
      scheduler: providedScheduler = {},
      repo = "owner/repo",
      ...additionalFields  // Capture any additional fields (flaggedByRepo, etc.)
    } = countOrConfig;

    const byPrNumber = {};
    const actorsMap = { ...providedActorsMap };

    prs.forEach((prConfig, index) => {
      const {
        scenario = null,
        prNumber = 100 + index,
        overrides = {},
      } = prConfig;

      const prNumberStr = String(prNumber);

      // Create PR using scenario if provided, otherwise use overrides directly
      let pr;
      if (scenario) {
        pr = createPrEntryByScenario(scenario, {
          prNumber: prNumberStr,
          repo,
          ...overrides,
          data: {
            number: prNumberStr,
            ...overrides.data,
          },
        });
      } else {
        pr = createPrRowEntry({
          prNumber: prNumberStr,
          repo,
          ...overrides,
          data: {
            number: prNumberStr,
            ...overrides.data,
          },
        });
      }

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
      ...additionalFields,  // Include any additional fields like flaggedByRepo
    };
  }

  // Legacy API (backwards compatible)
  const count = countOrConfig;
  const byPrNumber = {};
  const actorsMap = {};

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
 * @param {Object} payload - Payload to validate
 * @returns {Object} Validation result with { valid, issues }
 */
const validatePrDataPayloadShape = (payload = {}) => {
  const issues = [];

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    issues.push("payload must be an object");
    return { valid: false, issues };
  }

  if (typeof payload.ok !== "boolean") {
    issues.push("payload.ok must be a boolean");
  }

  if (!payload.byPrNumber || typeof payload.byPrNumber !== "object" || Array.isArray(payload.byPrNumber)) {
    issues.push("payload.byPrNumber must be an object");
  }

  if (payload.actorsMap && (typeof payload.actorsMap !== "object" || Array.isArray(payload.actorsMap))) {
    issues.push("payload.actorsMap must be an object when present");
  }

  if (payload.lastRun !== null && payload.lastRun !== undefined) {
    if (typeof payload.lastRun !== "object" || Array.isArray(payload.lastRun)) {
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

module.exports = {
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
};
