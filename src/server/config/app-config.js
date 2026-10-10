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
  // Global default auto-refresh cadence - the per-repo dispatcher (see
  // view-prs-dispatcher-helpers.js) falls back to this when a repo has no
  // schedulerRepoConfig override. Gains an env override here for
  // consistency with quick-check/merged-drain below, which already have one.
  const viewPrsAutoIntervalMs = Math.max(
    60 * 1000,
    Number.parseInt(env.VIEW_PRS_AUTO_INTERVAL_MS || "900000", 10) || 900000,
  );
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

  // "Quick check all existing PRs" scopes a quick check to every PR number
  // already loaded, across every repo represented in the loaded data - one
  // gh pr view call per PR number (not one cheap listing call per repo like
  // the default/single-repo quick check paths above), so it needs a much
  // bigger per-repo budget. Repos are checked sequentially server-side, so
  // this is a PER-REPO ceiling, not a total-sweep one.
  const viewPrsQuickCheckAllScriptTimeoutMs = Math.max(
    60 * 1000,
    Number.parseInt(env.VIEW_PRS_QUICK_CHECK_ALL_SCRIPT_TIMEOUT_MS || "300000", 10) || 300000,
  );

  // Bumped from the script's own JOBS=6 default - safe to increase here
  // since repos are processed one at a time for this action, so this bounds
  // the total number of concurrent `gh pr view` processes, not a multiple of it.
  const viewPrsQuickCheckAllJobs = Math.max(
    1,
    Number.parseInt(env.VIEW_PRS_QUICK_CHECK_ALL_JOBS || "12", 10) || 12,
  );

  const viewPrsAckScriptTimeoutMs = Math.max(
    60 * 1000,
    Number.parseInt(env.VIEW_PRS_ACK_SCRIPT_TIMEOUT_MS || "600000", 10) || 600000,
  );

  const viewPrsAckRefreshScriptTimeoutMs = Math.max(
    60 * 1000,
    Number.parseInt(env.VIEW_PRS_ACK_REFRESH_TIMEOUT_MS || "300000", 10) || 300000,
  );

  // Activity drawer feature (SSE, see REACT_MIGRATION_PLAN.md): how often a
  // keep-alive comment is written to an idle /view-prs/events connection,
  // and how many concurrent connections that route accepts before
  // responding 503 to further ones.
  const viewPrsEventsHeartbeatIntervalMs = Math.max(
    1000,
    Number.parseInt(env.VIEW_PRS_EVENTS_HEARTBEAT_INTERVAL_MS || "25000", 10) || 25000,
  );

  const viewPrsEventsMaxClients = Math.max(
    1,
    Number.parseInt(env.VIEW_PRS_EVENTS_MAX_CLIENTS || "25", 10) || 25,
  );

  // Caps how often the job-events emitter will push a job-agnostic
  // "scheduler" SSE frame (activePrNumbers progress) - incrementActivePrNumber/
  // decrementActivePrNumber fire roughly twice per PR touched by a refresh,
  // which without this bound could emit (and have every connected client
  // re-render from) many frames per second during a large multi-repo run.
  const viewPrsSchedulerStateThrottleMs = Math.max(
    0,
    Number.parseInt(env.VIEW_PRS_SCHEDULER_STATE_THROTTLE_MS || "250", 10) || 250,
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

  // Dispatcher's single ceiling on total concurrent `gh` processes across
  // all background-scheduler-launched tasks (quick-check/auto-refresh/
  // merged-drain combined) - see view-prs-dispatcher-helpers.js. Deliberately
  // NOT the same knob as viewPrsPrDiffConcurrency above (that one governs an
  // unrelated PR-diff fetch pool) so the two can't be tuned against each
  // other by accident.
  const viewPrsDispatcherGhProcessBudget = Math.max(
    1,
    Number.parseInt(env.VIEW_PRS_DISPATCHER_GH_PROCESS_BUDGET || "8", 10) || 8,
  );

  // How often the dispatcher re-evaluates due entries. Short enough that an
  // urgency bump (quick-check finding a change) is acted on with no
  // perceptible added latency vs. a direct function call, long enough to be
  // cheap when idle (most of this process's life).
  const viewPrsDispatcherTickIntervalMs = Math.max(
    1000,
    Number.parseInt(env.VIEW_PRS_DISPATCHER_TICK_INTERVAL_MS || "5000", 10) || 5000,
  );

  const viewPrsViewerLoginCacheTtlMs = 5 * 60 * 1000;

  // Optional, absent by default - only present if the user opts in to a
  // custom "More Insights" hook script (see runInsightsHookScript in app.js).
  const viewPrsInsightsHookScript = env.VIEW_PRS_INSIGHTS_HOOK_SCRIPT || "";

  const viewPrsInsightsHookTimeoutMs = Math.max(
    1000,
    Number.parseInt(env.VIEW_PRS_INSIGHTS_HOOK_TIMEOUT_MS || "10000", 10) || 10000,
  );

  // Constants
  const defaultViewPrsRepo = env.VIEW_PRS_REPO;
  const requiredCommands = ["bash", "gh", "jq"];
  const requiredPackages = ["marked", "dompurify"];

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
    viewPrsQuickCheckAllScriptTimeoutMs,
    viewPrsQuickCheckAllJobs,
    viewPrsAckScriptTimeoutMs,
    viewPrsAckRefreshScriptTimeoutMs,
    viewPrsAckTotalRefreshTimeoutMs,
    viewPrsEventsHeartbeatIntervalMs,
    viewPrsEventsMaxClients,
    viewPrsSchedulerStateThrottleMs,
    viewPrsBackfillStatusTimeoutMs,
    viewPrsBackfillActionTimeoutMs,
    viewPrsPrDiffTimeoutMs,
    viewPrsPrDiffConcurrency,
    viewPrsDispatcherGhProcessBudget,
    viewPrsDispatcherTickIntervalMs,
    viewPrsViewerLoginCacheTtlMs,
    viewPrsInsightsHookTimeoutMs,

    // Other settings
    viewPrsInsightsHookScript,
    viewPrsBackupRetention,

    // Constants
    defaultViewPrsRepo,
    requiredCommands,
    requiredPackages,
  };
}

module.exports = { createAppConfig };
