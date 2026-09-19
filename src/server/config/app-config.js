/**
 * App Configuration - Extracted from app.js
 * 
 * Creates application configuration with environment variable overrides
 * and validation for test environments.
 * 
 * @module app-config
 */

const path = require("path");

/**
 * Creates application configuration.
 * 
 * @param {Object} params - Parameters
 * @param {string} params.viewPrsDir - View PRS root directory
 * @param {Object} [params.env=process.env] - Environment variables
 * @param {boolean} [params.isTestEnv=false] - Whether running in test environment
 * @returns {Object} Configuration object
 */
function createAppConfig({ viewPrsDir, env = process.env, isTestEnv = false }) {
  // Path helpers
  const _defaultSchedulerFile = path.join(
    viewPrsDir,
    "data/check-open-pr-updates.scheduler.json",
  );
  const _defaultDataFile = path.join(
    viewPrsDir,
    "data/check-open-pr-updates.data.json",
  );
  const _defaultUserStateFile = path.join(
    viewPrsDir,
    "data/check-open-pr-updates.user-state.json",
  );
  const _defaultAuthorCommentsFile = path.join(
    path.dirname(_defaultUserStateFile),
    "check-open-pr-updates.author-comments.json",
  );
  const _defaultBackupDir = path.join(viewPrsDir, "data/backups");
  const _defaultPrDiffDir = path.join(viewPrsDir, "data/pr-diffs");
  const _defaultActorNameCacheFile = path.join(
    viewPrsDir,
    "data/actor-name-cache.json",
  );
  const _defaultActorLoginAliasesFile = path.join(
    viewPrsDir,
    "data/actor-login-aliases.json",
  );
  const _defaultActionLogFile = path.join(viewPrsDir, "data/action-log.json");

  // File paths (with env overrides)
  const viewPrsSchedulerFile = env.VIEW_PRS_SCHEDULER_FILE || _defaultSchedulerFile;
  const viewPrsDataFile = env.VIEW_PRS_DATA_FILE || _defaultDataFile;
  const viewPrsUserStateFile = env.VIEW_PRS_USER_STATE_FILE || _defaultUserStateFile;
  const viewPrsAuthorCommentsFile =
    env.VIEW_PRS_AUTHOR_COMMENTS_FILE || _defaultAuthorCommentsFile;
  const viewPrsBackupDir = env.VIEW_PRS_BACKUP_DIR || _defaultBackupDir;
  const viewPrsPrDiffDir = env.VIEW_PRS_PR_DIFF_DIR || _defaultPrDiffDir;
  const viewPrsActorNameCacheFile =
    env.VIEW_PRS_ACTOR_NAME_CACHE_FILE || _defaultActorNameCacheFile;
  const viewPrsActorLoginAliasesFile =
    env.VIEW_PRS_ACTOR_LOGIN_ALIASES_FILE || _defaultActorLoginAliasesFile;
  const viewPrsActionLogFile = env.VIEW_PRS_ACTION_LOG_FILE || _defaultActionLogFile;

  const viewPrsPrDetailDir =
    env.VIEW_PRS_PR_DETAIL_DIR || path.join(path.dirname(viewPrsDataFile), "pr-details");

  // Test environment validation
  if (isTestEnv) {
    if (
      viewPrsDataFile === _defaultDataFile ||
      viewPrsUserStateFile === _defaultUserStateFile
    ) {
      throw new Error(
        "[view-prs] NODE_ENV=test but real production state file paths are in use. " +
        "Set VIEW_PRS_DATA_FILE and VIEW_PRS_USER_STATE_FILE env vars to temp paths.",
      );
    }
    if (
      viewPrsActorNameCacheFile === _defaultActorNameCacheFile ||
      viewPrsActorLoginAliasesFile === _defaultActorLoginAliasesFile
    ) {
      throw new Error(
        "[view-prs] NODE_ENV=test but real actor cache file paths are in use. " +
        "Set VIEW_PRS_ACTOR_NAME_CACHE_FILE and VIEW_PRS_ACTOR_LOGIN_ALIASES_FILE env vars to temp paths.",
      );
    }
  }

  // Other paths (fixed relative to viewPrsDir - these locate the app's own
  // source/scripts, not mutable state, so there's no need to override them)
  const viewPrsUiDir = path.join(viewPrsDir, "src/ui");
  const viewPrsUiIndexFile = path.join(viewPrsDir, "src/ui/index.html");
  const viewPrsRunScriptRelativePath = "src/script/check-open-pr-updates.sh";
  const viewPrsBackfillManagerRelativePath = "src/backfill/backfill-missing-bg.sh";
  const viewPrsLegacySchedulerFile = path.join(
    viewPrsDir,
    "check-open-pr-updates.scheduler.json",
  );
  const viewPrsBackfillManagerScript = path.join(
    viewPrsDir,
    viewPrsBackfillManagerRelativePath,
  );
  const viewPrsBackfillPidFile =
    env.VIEW_PRS_BACKFILL_PID_FILE ||
    path.join(viewPrsDir, "data/backfill-missing.pid");
  const viewPrsBackfillLogFile =
    env.VIEW_PRS_BACKFILL_LOG_FILE ||
    path.join(viewPrsDir, "data/backfill-missing.log");
  const viewPrsUserDefaultsFile =
    env.VIEW_PRS_USER_DEFAULTS_FILE ||
    path.join(viewPrsDir, "data/user-defaults.json");

  // Timeouts and intervals (with env overrides and validation)
  const viewPrsAutoIntervalMs = 15 * 60 * 1000;
  const viewPrsManualCooldownMs = 15 * 60 * 1000;

  // Cheap "did it change" poll (listing calls only, no detail/diff fetch).
  // Runs far more often than the full fetch since it's nearly free.
  const viewPrsQuickCheckIntervalMs = Math.max(
    60 * 1000,
    Number.parseInt(env.VIEW_PRS_QUICK_CHECK_INTERVAL_MS || "300000", 10) ||
      300000,
  );

  // How often pending closed/merged PRs (lower priority, rarely change) get
  // batched into a full detail fetch once the quick-check has flagged them.
  const viewPrsMergedFullSweepIntervalMs = Math.max(
    60 * 1000,
    Number.parseInt(
      env.VIEW_PRS_MERGED_FULL_SWEEP_INTERVAL_MS || "1800000",
      10,
    ) || 1800000,
  );

  const viewPrsBackupRetention = Math.max(
    1,
    Number.parseInt(env.VIEW_PRS_BACKUP_RETENTION || "50", 10) || 50,
  );

  const viewPrsAutoCircuitFailureThreshold = Math.max(
    1,
    Number.parseInt(env.VIEW_PRS_AUTO_CIRCUIT_FAILURE_THRESHOLD || "3", 10) || 3,
  );

  const viewPrsAutoCircuitCooldownMs = Math.max(
    60 * 1000,
    Number.parseInt(env.VIEW_PRS_AUTO_CIRCUIT_COOLDOWN_MS || "1800000", 10) || 1800000,
  );

  const viewPrsAutoScriptTimeoutMs = Math.max(
    60 * 1000,
    Number.parseInt(env.VIEW_PRS_AUTO_SCRIPT_TIMEOUT_MS || "900000", 10) || 900000,
  );

  const viewPrsManualScriptTimeoutMs = Math.max(
    60 * 1000,
    Number.parseInt(env.VIEW_PRS_MANUAL_SCRIPT_TIMEOUT_MS || "1200000", 10) || 1200000,
  );

  // The quick check is a single listing-only `gh` call per repo (no
  // comments/reviews/diffs), so it should complete in seconds - not the
  // full manual-run timeout above, which is now also awaited synchronously
  // by the manual "Quick check" button (POST /quick-check) rather than only
  // ever running invisibly in the background scheduler.
  const viewPrsQuickCheckScriptTimeoutMs = Math.max(
    30 * 1000,
    Number.parseInt(env.VIEW_PRS_QUICK_CHECK_SCRIPT_TIMEOUT_MS || "60000", 10) || 60000,
  );

  const viewPrsAckScriptTimeoutMs = Math.max(
    60 * 1000,
    Number.parseInt(env.VIEW_PRS_ACK_SCRIPT_TIMEOUT_MS || "600000", 10) || 600000,
  );

  const viewPrsAckRefreshScriptTimeoutMs = Math.max(
    60 * 1000,
    Number.parseInt(env.VIEW_PRS_ACK_REFRESH_TIMEOUT_MS || "300000", 10) || 300000,
  );

  const viewPrsAckTotalRefreshTimeoutMs = Math.max(
    60 * 1000,
    Number.parseInt(env.VIEW_PRS_ACK_TOTAL_REFRESH_TIMEOUT_MS || "480000", 10) || 480000,
  );

  const viewPrsBackfillStatusTimeoutMs = Math.max(
    10 * 1000,
    Number.parseInt(env.VIEW_PRS_BACKFILL_STATUS_TIMEOUT_MS || "20000", 10) || 20000,
  );

  const viewPrsBackfillActionTimeoutMs = Math.max(
    10 * 1000,
    Number.parseInt(env.VIEW_PRS_BACKFILL_ACTION_TIMEOUT_MS || "120000", 10) || 120000,
  );

  const viewPrsPrDiffTimeoutMs = Math.max(
    30 * 1000,
    Number.parseInt(env.VIEW_PRS_PR_DIFF_TIMEOUT_MS || "120000", 10) || 120000,
  );

  const viewPrsPrDiffConcurrency = Math.max(
    0,
    Math.min(4, Number.parseInt(env.VIEW_PRS_PR_DIFF_CONCURRENCY || "2", 10) || 2),
  );

  const viewPrsViewerLoginCacheTtlMs = 5 * 60 * 1000;

  // Constants
  const defaultViewPrsRepo = env.VIEW_PRS_REPO;
  const requiredCommands = ["bash", "gh", "jq"];
  const requiredPackages = ["marked"];

  // Return configuration object
  return {
    // Directories
    viewPrsDir,
    viewPrsUiDir,
    viewPrsBackupDir,
    viewPrsPrDetailDir,
    viewPrsPrDiffDir,

    // File paths
    viewPrsUiIndexFile,
    viewPrsDataFile,
    viewPrsUserStateFile,
    viewPrsAuthorCommentsFile,
    viewPrsSchedulerFile,
    viewPrsLegacySchedulerFile,
    viewPrsActorNameCacheFile,
    viewPrsActorLoginAliasesFile,
    viewPrsUserDefaultsFile,
    viewPrsBackfillPidFile,
    viewPrsBackfillLogFile,
    viewPrsActionLogFile,

    // Script paths
    viewPrsRunScriptRelativePath,
    viewPrsBackfillManagerRelativePath,
    viewPrsBackfillManagerScript,

    // Timeouts and intervals
    viewPrsAutoIntervalMs,
    viewPrsManualCooldownMs,
    viewPrsQuickCheckIntervalMs,
    viewPrsMergedFullSweepIntervalMs,
    viewPrsAutoCircuitFailureThreshold,
    viewPrsAutoCircuitCooldownMs,
    viewPrsAutoScriptTimeoutMs,
    viewPrsManualScriptTimeoutMs,
    viewPrsQuickCheckScriptTimeoutMs,
    viewPrsAckScriptTimeoutMs,
    viewPrsAckRefreshScriptTimeoutMs,
    viewPrsAckTotalRefreshTimeoutMs,
    viewPrsBackfillStatusTimeoutMs,
    viewPrsBackfillActionTimeoutMs,
    viewPrsPrDiffTimeoutMs,
    viewPrsPrDiffConcurrency,
    viewPrsViewerLoginCacheTtlMs,

    // Other settings
    viewPrsBackupRetention,

    // Constants
    defaultViewPrsRepo,
    requiredCommands,
    requiredPackages,
  };
}

module.exports = { createAppConfig };
