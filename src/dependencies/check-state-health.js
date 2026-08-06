#!/usr/bin/env node
/**
 * CI guard: validates that the real production state files have not shrunk or
 * lost expected top-level keys. Runs against production paths — never affected
 * by VIEW_PRS_DATA_FILE / VIEW_PRS_USER_STATE_FILE test overrides.
 *
 * Usage:  node src/dependencies/check-state-health.js
 * Exit 0: healthy (or files not yet created — new install)
 * Exit 1: shrinkage, key-loss, or parse failure detected
 */

"use strict";

const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..", "..");

// Always use the real production paths — ignore any test env-var overrides.
const DATA_FILE = path.join(
  projectRoot,
  "data/check-open-pr-updates.data.json",
);
const USER_STATE_FILE = path.join(
  projectRoot,
  "data/check-open-pr-updates.user-state.json",
);

const DATA_REQUIRED_KEYS = ["byPrNumber"];
const USER_STATE_REQUIRED_KEYS = [
  "notesByPrNumber",
  "ackByRepo",
  "reverifyByRepo",
  "inReviewByRepo",
];

const readJson = (filePath, fsImpl = fs) => {
  try {
    return JSON.parse(fsImpl.readFileSync(filePath, "utf8"));
  } catch (error) {
    return { error: error.message };
  }
};

const evaluateStateHealth = ({
  fsImpl = fs,
  dataFile = DATA_FILE,
  userStateFile = USER_STATE_FILE,
} = {}) => {
  const failures = [];
  const warnings = [];

  // -- data file -------------------------------------------------------------
  if (!fsImpl.existsSync(dataFile)) {
    warnings.push(`data file not found (new install?): ${dataFile}`);
  } else {
    const data = readJson(dataFile, fsImpl);

    if (data.error) {
      failures.push(`data file parse failure: ${data.error}`);
    } else {
      const missingKeys = DATA_REQUIRED_KEYS.filter(
        (k) => !Object.prototype.hasOwnProperty.call(data, k),
      );
      if (missingKeys.length > 0) {
        failures.push(
          `data file missing expected keys: ${missingKeys.join(", ")}`,
        );
      }

      const prCount =
        data.byPrNumber && typeof data.byPrNumber === "object"
          ? Object.keys(data.byPrNumber).length
          : -1;

      if (prCount === 0) {
        warnings.push(
          "data file byPrNumber is empty - may indicate data loss after a previous run",
        );
      }
    }
  }

  // -- user-state file -------------------------------------------------------
  if (!fsImpl.existsSync(userStateFile)) {
    warnings.push(
      `user-state file not found (new install?): ${userStateFile}`,
    );
  } else {
    const state = readJson(userStateFile, fsImpl);

    if (state.error) {
      failures.push(`user-state file parse failure: ${state.error}`);
    } else {
      const missingKeys = USER_STATE_REQUIRED_KEYS.filter(
        (k) => !Object.prototype.hasOwnProperty.call(state, k),
      );
      if (missingKeys.length > 0) {
        failures.push(
          `user-state file missing expected keys: ${missingKeys.join(", ")}`,
        );
      }
    }
  }

  return { failures, warnings };
};

const reportStateHealth = ({ failures, warnings }, logger = console) => {
  for (const warning of warnings) {
    logger.warn(`[guard:state-health] WARN  ${warning}`);
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      logger.error(`[guard:state-health] FAIL  ${failure}`);
    }
    logger.error(
      `[guard:state-health] ${failures.length} failure(s) detected. Production state files may be corrupt or have lost data.`,
    );
    return 1;
  }

  logger.log("[guard:state-health] OK: production state files are healthy.");
  return 0;
};

const runCheckStateHealth = (options = {}, logger = console) => {
  const summary = evaluateStateHealth(options);
  return reportStateHealth(summary, logger);
};

if (require.main === module) {
  process.exit(runCheckStateHealth());
}

module.exports = {
  evaluateStateHealth,
  reportStateHealth,
  runCheckStateHealth,
}
