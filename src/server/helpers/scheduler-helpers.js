/**
 * Scheduler Helpers - Extracted from app.js
 * 
 * Provides utilities for scheduler state management, action logging,
 * and active PR tracking.
 * 
 * Note: The main auto-refresh logic (runViewPrsAutoRefresh) remains in app.js
 * due to tight coupling with app state. This module extracts reusable components.
 * 
 * @module scheduler-helpers
 */

// Import view-prs-data-helpers directly (plain module)
const dataHelpers = require('./view-prs-data-helpers');

/**
 * Creates scheduler helper functions.
 * 
 * @param {Object} deps - Dependencies
 * @param {Object} deps.fs - Node.js fs module
 * @param {Object} deps.path - Node.js path module
 * @param {string} deps.viewPrsActionLogFile - Action log file path
 * @returns {Object} Scheduler helper functions
 */
function createSchedulerHelpers({
  fs,
  path,
  viewPrsActionLogFile,
}) {
  const { toTrimmedString } = dataHelpers;

  // Constants
  const ACTION_LOG_MAX_ENTRIES = 500;

  // Active PR tracking state (module-level)
  const viewPrsActivePrCounts = new Map();

  /**
   * Progress tracker for scheduler operations.
   */
  const viewPrsProgressTracker = {
    onStart: (prNumber) => {
      const safePrNumber = toTrimmedString(prNumber);
      if (!safePrNumber) {
        return;
      }
      const currentCount = viewPrsActivePrCounts.get(safePrNumber) || 0;
      viewPrsActivePrCounts.set(safePrNumber, currentCount + 1);
    },
    onEnd: (prNumber) => {
      const safePrNumber = toTrimmedString(prNumber);
      if (!safePrNumber) {
        return;
      }
      const currentCount = viewPrsActivePrCounts.get(safePrNumber) || 0;
      if (currentCount > 1) {
        viewPrsActivePrCounts.set(safePrNumber, currentCount - 1);
      } else {
        viewPrsActivePrCounts.delete(safePrNumber);
      }
    },
    onRunDone: () => {
      // Optional hook for run completion
    },
  };

  /**
   * Increments active count for a PR number.
   * @param {string} prNumber - PR number
   */
  const incrementActivePrNumber = (prNumber) => {
    viewPrsProgressTracker.onStart(prNumber);
  };

  /**
   * Decrements active count for a PR number.
   * @param {string} prNumber - PR number
   */
  const decrementActivePrNumber = (prNumber) => {
    viewPrsProgressTracker.onEnd(prNumber);
  };

  /**
   * Adds multiple PR numbers to active tracking.
   * @param {Array<string>} prNumbers - Array of PR numbers
   */
  const addSchedulerActivePrNumbers = (prNumbers) => {
    const uniqueNumbers = Array.isArray(prNumbers) ? [...new Set(prNumbers)] : [];
    uniqueNumbers.forEach((prNumber) => {
      incrementActivePrNumber(prNumber);
    });
  };

  /**
   * Removes multiple PR numbers from active tracking.
   * @param {Array<string>} prNumbers - Array of PR numbers
   */
  const removeSchedulerActivePrNumbers = (prNumbers) => {
    const uniqueNumbers = Array.isArray(prNumbers) ? [...new Set(prNumbers)] : [];
    uniqueNumbers.forEach((prNumber) => {
      decrementActivePrNumber(prNumber);
    });
  };

  /**
   * Gets latest merged PR numbers for a repository.
   * @param {string} repo - Repository slug
   * @param {number} [limit=15] - Maximum number of PRs
   * @param {Function} readViewPrsData - Function to read PR data
   * @returns {Array<string>} Array of PR numbers
   */
  const getLatestMergedPrNumbersForRepo = (repo, limit = 15, readViewPrsData) => {
    const safeRepo = toTrimmedString(repo);
    if (!safeRepo) {
      return [];
    }

    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 15));
    const { byPrNumber = {} } = readViewPrsData();

    return Object.values(byPrNumber)
      .filter(
        (entry) =>
          entry?.data?.repo === safeRepo &&
          entry?.data?.state === "MERGED" &&
          entry?.data?.mergedAt,
      )
      .sort((a, b) => {
        const aTime = Date.parse(a?.data?.mergedAt || "") || 0;
        const bTime = Date.parse(b?.data?.mergedAt || "") || 0;
        return bTime - aTime;
      })
      .slice(0, safeLimit)
      .map((entry) => toTrimmedString(entry?.data?.number))
      .filter(Boolean);
  };

  /**
   * Appends an entry to the action log.
   * @param {Object} entry - Log entry
   */
  const appendActionLogEntry = (entry) => {
    try {
      fs.mkdirSync(path.dirname(viewPrsActionLogFile), { recursive: true });
      let entries = [];
      if (fs.existsSync(viewPrsActionLogFile)) {
        try {
          const raw = fs.readFileSync(viewPrsActionLogFile, "utf8");
          entries = JSON.parse(raw);
        } catch (_error) {
          // Ignore parse errors, start fresh
        }
      }

      if (!Array.isArray(entries)) {
        entries = [];
      }

      entries.unshift({
        ...entry,
        timestamp: entry.timestamp || new Date().toISOString(),
      });

      // Keep only the most recent entries (newest stays at the front)
      if (entries.length > ACTION_LOG_MAX_ENTRIES) {
        entries = entries.slice(0, ACTION_LOG_MAX_ENTRIES);
      }

      fs.writeFileSync(
        viewPrsActionLogFile,
        JSON.stringify(entries, null, 2),
        "utf8",
      );
    } catch (_error) {
      // Best-effort logging, don't fail on log errors
    }
  };

  /**
   * Reads the action log.
   * @param {Object} [options={}] - Options
   * @param {number} [options.limit=100] - Maximum entries to return
   * @returns {Array} Log entries
   */
  const readActionLog = ({ limit = 100 } = {}) => {
    try {
      if (!fs.existsSync(viewPrsActionLogFile)) {
        return [];
      }

      const raw = fs.readFileSync(viewPrsActionLogFile, "utf8");
      const entries = JSON.parse(raw);

      if (!Array.isArray(entries)) {
        return [];
      }

      const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 100));
      return entries.slice(-safeLimit);
    } catch (_error) {
      return [];
    }
  };

  /**
   * Gets auto repository concurrency.
   * @returns {number} Concurrency level (1-5)
   */
  const getViewPrsAutoRepoConcurrency = () => {
    // Can be made configurable later
    return 2;
  };

  /**
   * Creates scheduler state object.
   * @returns {Object} Initial scheduler state
   */
  const createSchedulerState = () => ({
    startedAt: new Date().toISOString(),
    lastManualRunAt: null,
    lastAutoAttemptAt: null,
    lastAutoRunAt: null,
    lastAutoSkipReason: null,
    lastAutoError: null,
    isAutoRunInProgress: false,
  });

  // Return public API
  return {
    viewPrsProgressTracker,
    incrementActivePrNumber,
    decrementActivePrNumber,
    addSchedulerActivePrNumbers,
    removeSchedulerActivePrNumbers,
    getLatestMergedPrNumbersForRepo,
    appendActionLogEntry,
    readActionLog,
    getViewPrsAutoRepoConcurrency,
    createSchedulerState,
    // For testing
    _getActivePrCounts: () => new Map(viewPrsActivePrCounts),
  };
}

module.exports = { createSchedulerHelpers };
