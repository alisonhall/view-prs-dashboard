/**
 * Backfill Helpers - Extracted from app.js
 * 
 * Provides utilities for backfill operations: listing merged PR candidates,
 * parsing backfill output, managing backfill state, and executing backfill actions.
 * 
 * @module backfill-helpers
 */

/**
 * Creates backfill helper functions.
 * 
 * @param {Object} deps - Dependencies
 * @param {Object} deps.fs - Node.js fs module
 * @param {Object} deps.commandHelpers - Command execution helpers
 * @param {Object} deps.dataHelpers - Data helper functions
 * @param {string} deps.viewPrsBackfillLogFile - Backfill log file path
 * @param {string} deps.viewPrsBackfillPidFile - Backfill PID file path
 * @param {string} deps.viewPrsBackfillManagerRelativePath - Backfill manager script path
 * @param {number} deps.viewPrsBackfillStatusTimeoutMs - Status check timeout
 * @param {number} deps.viewPrsBackfillActionTimeoutMs - Action execution timeout
 * @returns {Object} Backfill helper functions
 */
function createBackfillHelpers({
  fs,
  commandHelpers,
  dataHelpers,
  viewPrsBackfillLogFile,
  viewPrsBackfillPidFile,
  viewPrsBackfillManagerRelativePath,
  viewPrsBackfillStatusTimeoutMs,
  viewPrsBackfillActionTimeoutMs,
}) {
  const {
    runViewPrsBashCommand,
    runViewPrsShellScript,
    formatScriptFailureMessage,
  } = commandHelpers;

  const {
    toTrimmedString,
    isRepoSlug,
  } = dataHelpers;

  /**
   * Lists merged PR candidates from a repository.
   * 
   * @param {Object} params - Parameters
   * @param {string} params.repo - Repository slug (e.g., "owner/repo")
   * @param {number} [params.limit=100] - Maximum number of PRs to return (1-200)
   * @returns {Promise<Array>} Array of merged PR objects with number and mergedAt
   */
  const listMergedPrCandidates = async ({ repo, limit = 100 }) => {
    const safeRepo = toTrimmedString(repo);
    const safeLimit = Math.max(
      1,
      Math.min(200, Number.parseInt(String(limit), 10) || 100),
    );

    if (!isRepoSlug(safeRepo)) {
      throw new Error(`Invalid repo: ${safeRepo}`);
    }

    const result = await runViewPrsBashCommand(
      [
        "-lc",
        `GH_PAGER=cat gh pr list -R ${safeRepo} --state merged --limit ${safeLimit} --json number,mergedAt --jq '.'`,
      ],
      2 * 1024 * 1024,
      { timeoutMs: 120000 },
    );

    const parsed = (() => {
      try {
        return JSON.parse(String(result?.stdout || "[]"));
      } catch (_error) {
        return [];
      }
    })();

    return Array.isArray(parsed)
      ? parsed
        .map((item) => ({
          number: String(item?.number || "").trim(),
          mergedAt: String(item?.mergedAt || "").trim(),
        }))
        .filter((item) => /^\d+$/.test(item.number) && item.mergedAt)
        .sort((a, b) => {
          const aTime = Date.parse(a.mergedAt) || 0;
          const bTime = Date.parse(b.mergedAt) || 0;
          return bTime - aTime;
        })
      : [];
  };

  /**
   * Parses backfill command output to extract status information.
   * 
   * @param {string} stdout - Standard output from command
   * @param {string} stderr - Standard error from command
   * @returns {Object} Parsed backfill status
   */
  const parseBackfillCommandOutput = (stdout, stderr) => {
    const combined = [stdout, stderr]
      .filter((value) => String(value || "").trim())
      .join("\n")
      .trim();
    const statusLine = combined
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) =>
        /^(Started background backfill|Backfill status|Stopped background backfill|Backfill is already running|Backfill is not running)\b/.test(
          line,
        ),
      );
    const pidMatch = combined.match(/PID:\s*(\d+)/i);
    const logMatch = combined.match(/Log:\s*(.+)$/im);
    const running = /Backfill status:\s*running\b/i.test(combined);

    return {
      running,
      pid: pidMatch ? pidMatch[1] : null,
      logFile: logMatch ? logMatch[1].trim() : null,
      summary: statusLine || (combined ? combined.split(/\r?\n/)[0] : ""),
      rawOutput: combined,
    };
  };

  /**
   * Gets the tail of the backfill log file.
   * 
   * @param {Object} [options={}] - Options
   * @param {number} [options.maxLines=80] - Maximum lines to return (1-500)
   * @returns {Object} Log tail information
   */
  const getBackfillLogTail = ({ maxLines = 80 } = {}) => {
    const linesRequested = Number.parseInt(String(maxLines), 10);
    const safeLines = Number.isFinite(linesRequested)
      ? Math.min(Math.max(linesRequested, 1), 500)
      : 80;

    if (!fs.existsSync(viewPrsBackfillLogFile)) {
      return {
        ok: true,
        logFile: viewPrsBackfillLogFile,
        linesRequested: safeLines,
        lineCount: 0,
        updatedAt: null,
        tail: "",
        isTruncated: false,
        summary: "Backfill log file does not exist yet",
      };
    }

    const stats = fs.statSync(viewPrsBackfillLogFile);
    const raw = fs.readFileSync(viewPrsBackfillLogFile, "utf8");
    const allLines = raw.split(/\r?\n/);
    if (allLines.length > 0 && allLines[allLines.length - 1] === "") {
      allLines.pop();
    }
    const tailLines = allLines.slice(-safeLines);

    return {
      ok: true,
      logFile: viewPrsBackfillLogFile,
      linesRequested: safeLines,
      lineCount: tailLines.length,
      totalLineCount: allLines.length,
      updatedAt: stats.mtime ? new Date(stats.mtime).toISOString() : null,
      tail: tailLines.join("\n"),
      isTruncated: allLines.length > tailLines.length,
      summary:
        tailLines.length > 0
          ? `Showing ${tailLines.length}${allLines.length > tailLines.length ? ` of ${allLines.length}` : ""} log line(s)`
          : "Backfill log is empty",
    };
  };

  /**
   * Gets the current public state of the backfill process.
   * 
   * @returns {Promise<Object>} Backfill state information
   */
  const getViewPrsBackfillPublicState = async () => {
    try {
      const { stdout, stderr, command } = await runViewPrsShellScript(
        viewPrsBackfillManagerRelativePath,
        ["status"],
        1024 * 1024,
        { timeoutMs: viewPrsBackfillStatusTimeoutMs },
      );
      const parsed = parseBackfillCommandOutput(stdout, stderr);

      return {
        ok: true,
        command,
        running: parsed.running,
        pid: parsed.pid,
        logFile: parsed.logFile || viewPrsBackfillLogFile,
        pidFile: viewPrsBackfillPidFile,
        summary: parsed.summary || "Backfill status unavailable",
        output: parsed.rawOutput,
        error: null,
      };
    } catch (failure) {
      return {
        ok: false,
        command:
          failure?.command || `bash ${viewPrsBackfillManagerRelativePath} status`,
        running: false,
        pid: null,
        logFile: viewPrsBackfillLogFile,
        pidFile: viewPrsBackfillPidFile,
        summary: formatScriptFailureMessage(failure, "Backfill status failed"),
        output: failure?.stdout || "",
        error: formatScriptFailureMessage(failure, "Backfill status failed"),
      };
    }
  };

  /**
   * Runs a backfill action (start, stop, restart).
   * 
   * @param {string} action - Action to perform ("start", "stop", "restart")
   * @returns {Promise<Object>} Action result
   */
  const runViewPrsBackfillAction = async (action) => {
    const result = await runViewPrsShellScript(
      viewPrsBackfillManagerRelativePath,
      [action],
      4 * 1024 * 1024,
      { timeoutMs: viewPrsBackfillActionTimeoutMs },
    );
    const parsed = parseBackfillCommandOutput(result.stdout, result.stderr);

    return {
      ok: true,
      command: result.command,
      running: parsed.running,
      pid: parsed.pid,
      logFile: parsed.logFile || viewPrsBackfillLogFile,
      pidFile: viewPrsBackfillPidFile,
      summary: parsed.summary || `Backfill ${action} started`,
      output: parsed.rawOutput,
      error: null,
    };
  };

  // Return public API
  return {
    listMergedPrCandidates,
    parseBackfillCommandOutput,
    getBackfillLogTail,
    getViewPrsBackfillPublicState,
    runViewPrsBackfillAction,
  };
}

module.exports = { createBackfillHelpers };
