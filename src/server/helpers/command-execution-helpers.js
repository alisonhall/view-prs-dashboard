/**
 * Command Execution Helpers - Extracted from app.js
 *
 * Provides utilities for executing commands, scripts, and managing processes.
 * Handles timeouts, process trees, progress tracking, and dependency checking.
 *
 * @module command-execution-helpers
 */

const fs = require("fs");
const path = require("path");

/**
 * Creates command execution helper functions.
 * 
 * @param {Object} deps - Dependencies
 * @param {Function} deps.spawn - Node.js child_process.spawn
 * @param {Function} deps.spawnSync - Node.js child_process.spawnSync
 * @param {Object} deps.process - Node.js process object
 * @param {string} deps.viewPrsDir - View PRS directory path
 * @param {string} deps.viewPrsScriptsDir - Scripts directory path
 * @param {Array<string>} deps.requiredCommands - Required system commands
 * @param {Array<string>} deps.requiredPackages - Required npm packages
 * @param {Object} deps.viewPrsProgressTracker - Progress tracker for scheduler
 * @returns {Object} Command execution helper functions
 */
function createCommandExecutionHelpers({
  spawn,
  spawnSync,
  process,
  viewPrsDir,
  viewPrsScriptsDir: _viewPrsScriptsDir,
  requiredCommands,
  requiredPackages,
  viewPrsProgressTracker,
}) {
  // Constants
  const VIEW_PRS_PROGRESS_PREFIX = "__VIEW_PRS_PROGRESS__:";
  
  // Watchdog counter (module state)
  let viewPrsWatchdogForceStopCount = 0;

  /**
   * Terminates a process tree by PID.
   * Attempts to kill the entire process group, falls back to individual process.
   * 
   * @param {number} pid - Process ID
   * @param {string} signal - Signal to send (e.g., "SIGTERM", "SIGKILL")
   * @returns {void}
   */
  const terminateProcessTree = (pid, signal) => {
    if (!Number.isFinite(Number(pid)) || Number(pid) <= 0) {
      return;
    }

    try {
      // Child processes run in their own process group, so kill the whole group.
      process.kill(-Number(pid), signal);
    } catch (_error) {
      try {
        process.kill(Number(pid), signal);
      } catch (_ignore) {
        // Best effort cleanup.
      }
    }
  };

  /**
   * Formats script failure messages with timeout information.
   * 
   * @param {Object} failure - Failure object with error details
   * @param {string} [fallbackMessage="Script failed"] - Fallback message
   * @returns {string} Formatted error message
   */
  const formatScriptFailureMessage = (
    failure,
    fallbackMessage = "Script failed",
  ) => {
    if (failure?.didTimeout === true) {
      const timeoutMs = Number(failure?.timeoutMs || 0);
      const timeoutSeconds = timeoutMs > 0 ? Math.round(timeoutMs / 1000) : null;
      return timeoutSeconds
        ? `Script timed out after ${timeoutSeconds}s`
        : "Script timed out";
    }
    return failure?.error?.message || fallbackMessage;
  };

  /**
   * Executes a view-prs command with process management.
   * 
   * @param {string} command - Command to execute
   * @param {Array<string>} args - Command arguments
   * @param {number} [maxBufferBytes=10*1024*1024] - Max buffer size
   * @param {Object} [options={}] - Execution options
   * @param {number} [options.timeoutMs] - Timeout in milliseconds
   * @returns {Promise<{stdout: string, stderr: string}>} Command output
   */
  const runViewPrsCommand = (
    command,
    args,
    maxBufferBytes = 10 * 1024 * 1024,
    options = {},
  ) =>
    new Promise((resolve, reject) => {
      const timeoutMs =
        Number.isFinite(Number(options?.timeoutMs)) &&
          Number(options?.timeoutMs) > 0
          ? Number(options.timeoutMs)
          : 0;

      const maxBuffer =
        Number.isFinite(Number(maxBufferBytes)) && Number(maxBufferBytes) > 0
          ? Number(maxBufferBytes)
          : 10 * 1024 * 1024;

      const child = spawn(command, Array.isArray(args) ? args : [], {
        cwd: viewPrsDir,
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          GH_PAGER: "cat",
        },
      });

      let stdout = "";
      let stderr = "";
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let didTimeout = false;
      let settled = false;
      let timeoutHandle = null;
      let forceKillTimeoutHandle = null;

      const forceStopProcessTree = () => {
        terminateProcessTree(child.pid, "SIGTERM");
        if (forceKillTimeoutHandle) {
          clearTimeout(forceKillTimeoutHandle);
        }
        forceKillTimeoutHandle = setTimeout(
          () => terminateProcessTree(child.pid, "SIGKILL"),
          1000,
        );
      };

      const finishResolve = (value) => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        if (forceKillTimeoutHandle) {
          clearTimeout(forceKillTimeoutHandle);
        }
        resolve(value);
      };

      const finishReject = (error) => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        if (forceKillTimeoutHandle) {
          clearTimeout(forceKillTimeoutHandle);
        }
        reject({
          error,
          stdout,
          stderr,
          command: `${command} ${Array.isArray(args) ? args.join(" ") : ""}`,
          didTimeout,
          timeoutMs,
        });
      };

      const appendChunk = (chunk, target) => {
        const chunkText = chunk.toString();
        const chunkBytes = Buffer.byteLength(chunkText);
        if (target === "stdout") {
          stdout += chunkText;
          stdoutBytes += chunkBytes;
          if (stdoutBytes > maxBuffer) {
            forceStopProcessTree();
            finishReject(new Error("stdout maxBuffer exceeded"));
          }
          return;
        }

        stderr += chunkText;
        stderrBytes += chunkBytes;
        if (stderrBytes > maxBuffer) {
          forceStopProcessTree();
          finishReject(new Error("stderr maxBuffer exceeded"));
        }
      };

      if (timeoutMs > 0) {
        timeoutHandle = setTimeout(() => {
          didTimeout = true;
          forceStopProcessTree();
        }, timeoutMs);
      }

      child.stdout.on("data", (chunk) => appendChunk(chunk, "stdout"));
      child.stderr.on("data", (chunk) => appendChunk(chunk, "stderr"));

      child.on("error", (error) => {
        finishReject(error);
      });

      child.on("close", (code, signal) => {
        if (didTimeout) {
          const timeoutSeconds = Math.round(timeoutMs / 1000);
          finishReject(
            new Error(
              timeoutSeconds > 0
                ? `Command timed out after ${timeoutSeconds}s`
                : "Command timed out",
            ),
          );
          return;
        }

        if (code !== 0) {
          finishReject(
            new Error(
              signal
                ? `Command terminated by ${signal}`
                : `Command exited with code ${code}`,
            ),
          );
          return;
        }

        finishResolve({ stdout, stderr });
      });
    });

  /**
   * Executes a bash command with progress tracking support.
   * 
   * @param {Array<string>} bashArgs - Bash arguments
   * @param {number} [maxBufferBytes=10*1024*1024] - Max buffer size
   * @param {Object} [options={}] - Execution options
   * @param {number} [options.timeoutMs] - Timeout in milliseconds
   * @param {Object} [options.env] - Additional environment variables
   * @param {Object} [options.progressTracker] - Progress tracker callbacks
   * @returns {Promise<{stdout: string, stderr: string, command: string}>} Command output
   */
  const runViewPrsBashCommand = (
    bashArgs,
    maxBufferBytes = 10 * 1024 * 1024,
    options = {},
  ) =>
    new Promise((resolve, reject) => {
      const timeoutMs =
        Number.isFinite(Number(options?.timeoutMs)) &&
          Number(options?.timeoutMs) > 0
          ? Number(options.timeoutMs)
          : 0;

      const maxBuffer =
        Number.isFinite(Number(maxBufferBytes)) && Number(maxBufferBytes) > 0
          ? Number(maxBufferBytes)
          : 10 * 1024 * 1024;

      const command = `bash ${bashArgs.join(" ")}`;
      const progressTracker =
        options?.progressTracker && typeof options.progressTracker === "object"
          ? options.progressTracker
          : null;
      // The repo this specific invocation targets (constant for the whole
      // run, since one call = one `--repo` shell invocation) - threaded
      // through so PR numbers, which are only unique within a repo, don't
      // collide across repos in the scheduler's active-PR tracking (see
      // app.js's incrementActivePrNumber/decrementActivePrNumber). Omitted
      // entirely (not even as `undefined`) when no repo is given, so
      // existing single-arg progressTracker callers/tests are unaffected.
      const progressTrackerRepo =
        typeof options?.repo === "string" && options.repo ? options.repo : "";
      const callProgressTracker = (fn, prNumber) => {
        if (typeof fn !== "function") {
          return;
        }
        if (progressTrackerRepo) {
          fn(prNumber, progressTrackerRepo);
        } else {
          fn(prNumber);
        }
      };
      const child = spawn("bash", bashArgs, {
        cwd: viewPrsDir,
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          ...(options?.env || {}),
        },
      });

      let stdout = "";
      let stderr = "";
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let didTimeout = false;
      let settled = false;
      let timeoutHandle = null;
      let forceKillTimeoutHandle = null;
      let forceStopLogged = false;
      let stdoutProgressRemainder = "";
      let stderrProgressRemainder = "";
      const runProgressCounts = new Map();

      const trackRunProgress = (action, prNumber) => {
        if (!progressTracker) {
          return;
        }

        if (action === "START") {
          const currentCount = runProgressCounts.get(prNumber) || 0;
          runProgressCounts.set(prNumber, currentCount + 1);
          callProgressTracker(progressTracker.onStart, prNumber);
          return;
        }

        const currentCount = runProgressCounts.get(prNumber) || 0;
        if (currentCount > 1) {
          runProgressCounts.set(prNumber, currentCount - 1);
        } else {
          runProgressCounts.delete(prNumber);
        }
        callProgressTracker(progressTracker.onEnd, prNumber);
      };

      const parseProgressLine = (line) => {
        const safeLine = String(line || "").trim();
        if (!safeLine.startsWith(VIEW_PRS_PROGRESS_PREFIX)) {
          return false;
        }

        const progressParts = safeLine.slice(VIEW_PRS_PROGRESS_PREFIX.length).split(":");
        const action = String(progressParts[0] || "").trim();
        const prNumber = String(progressParts[1] || "").trim();
        if (!["START", "END"].includes(action) || !/^\d+$/.test(prNumber)) {
          return false;
        }

        trackRunProgress(action, prNumber);
        return true;
      };

      const sanitizeProgressChunk = (chunkText, streamName) => {
        const isStdout = streamName === "stdout";
        const remainder = isStdout ? stdoutProgressRemainder : stderrProgressRemainder;
        const combined = `${remainder}${chunkText}`;
        const lines = combined.split(/\r?\n/);
        const nextRemainder = lines.pop() || "";
        if (isStdout) {
          stdoutProgressRemainder = nextRemainder;
        } else {
          stderrProgressRemainder = nextRemainder;
        }

        let sanitized = "";
        lines.forEach((line) => {
          if (parseProgressLine(line)) {
            return;
          }
          sanitized += `${line}\n`;
        });
        return sanitized;
      };

      const flushProgressRemainder = (streamName) => {
        const isStdout = streamName === "stdout";
        const remainder = isStdout ? stdoutProgressRemainder : stderrProgressRemainder;
        if (isStdout) {
          stdoutProgressRemainder = "";
        } else {
          stderrProgressRemainder = "";
        }
        if (!remainder) {
          return;
        }

        if (!parseProgressLine(remainder)) {
          if (isStdout) {
            stdout += remainder;
            stdoutBytes += Buffer.byteLength(remainder);
          } else {
            stderr += remainder;
            stderrBytes += Buffer.byteLength(remainder);
          }
        }
      };

      const forceStopProcessTree = (reason) => {
        if (!forceStopLogged) {
          forceStopLogged = true;
          viewPrsWatchdogForceStopCount += 1;
          const nowIso = new Date().toISOString();
          const timeoutSec = timeoutMs > 0 ? Math.round(timeoutMs / 1000) : 0;
          console.warn(
            `[view-prs][watchdog] force-stop #${viewPrsWatchdogForceStopCount} at ${nowIso} reason=${reason} timeoutSec=${timeoutSec} pid=${child.pid} command="${command}"`,
          );
        }

        terminateProcessTree(child.pid, "SIGTERM");
        if (forceKillTimeoutHandle) {
          clearTimeout(forceKillTimeoutHandle);
        }
        forceKillTimeoutHandle = setTimeout(
          () => terminateProcessTree(child.pid, "SIGKILL"),
          1000,
        );
      };

      const finishResolve = (value) => {
        if (settled) {
          return;
        }
        settled = true;
        flushProgressRemainder("stdout");
        flushProgressRemainder("stderr");
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        if (forceKillTimeoutHandle) {
          clearTimeout(forceKillTimeoutHandle);
        }
        if (
          progressTracker &&
          typeof progressTracker.onRunDone === "function"
        ) {
          callProgressTracker(progressTracker.onRunDone, runProgressCounts);
        }
        resolve(value);
      };

      const finishReject = (error) => {
        if (settled) {
          return;
        }
        settled = true;
        flushProgressRemainder("stdout");
        flushProgressRemainder("stderr");
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        if (forceKillTimeoutHandle) {
          clearTimeout(forceKillTimeoutHandle);
        }
        if (
          progressTracker &&
          typeof progressTracker.onRunDone === "function"
        ) {
          callProgressTracker(progressTracker.onRunDone, runProgressCounts);
        }
        reject({
          error,
          stdout,
          stderr,
          command,
          didTimeout,
          timeoutMs,
        });
      };

      const appendChunk = (chunk, target) => {
        const chunkText = chunk.toString();
        if (target === "stdout") {
          const sanitizedChunk = sanitizeProgressChunk(chunkText, target);
          stdout += sanitizedChunk;
          stdoutBytes += Buffer.byteLength(sanitizedChunk);
          if (stdoutBytes > maxBuffer) {
            forceStopProcessTree("stdout-maxBuffer");
            finishReject(new Error("stdout maxBuffer exceeded"));
          }
          return;
        }

        const sanitizedChunk = sanitizeProgressChunk(chunkText, target);
        stderr += sanitizedChunk;
        stderrBytes += Buffer.byteLength(sanitizedChunk);
        if (stderrBytes > maxBuffer) {
          forceStopProcessTree("stderr-maxBuffer");
          finishReject(new Error("stderr maxBuffer exceeded"));
        }
      };

      if (timeoutMs > 0) {
        timeoutHandle = setTimeout(() => {
          didTimeout = true;
          forceStopProcessTree("timeout");
        }, timeoutMs);
      }

      child.stdout.on("data", (chunk) => appendChunk(chunk, "stdout"));
      child.stderr.on("data", (chunk) => appendChunk(chunk, "stderr"));

      child.on("error", (error) => {
        finishReject(error);
      });

      child.on("close", (code, signal) => {
        if (didTimeout) {
          const timeoutSeconds = Math.round(timeoutMs / 1000);
          finishReject(
            new Error(
              timeoutSeconds > 0
                ? `Command timed out after ${timeoutSeconds}s`
                : "Command timed out",
            ),
          );
          return;
        }

        if (code !== 0) {
          finishReject(
            new Error(
              signal
                ? `Command terminated by ${signal}`
                : `Command exited with code ${code}`,
            ),
          );
          return;
        }

        finishResolve({ stdout, stderr, command });
      });
    });

  /**
   * Executes a view-prs script with progress tracking.
   * 
   * @param {Array<string>} scriptArgs - Script arguments
   * @param {number} [maxBufferBytes=10*1024*1024] - Max buffer size
   * @param {Object} [options={}] - Execution options
   * @returns {Promise} Command result
   */
  const runViewPrsScript = (
    scriptArgs,
    maxBufferBytes = 10 * 1024 * 1024,
    options = {},
  ) => {
    const trackSchedulerPrProgress =
      options?.trackSchedulerPrProgress !== false;
    const userProgressTracker = options?.progressTracker || null;
    const schedulerProgressTracker = trackSchedulerPrProgress
      ? viewPrsProgressTracker
      : null;
    const progressTracker =
      userProgressTracker && schedulerProgressTracker
        ? {
            // `repo` is forwarded by runViewPrsBashCommand's own
            // callProgressTracker only when options.repo was given (see
            // its own comment) - passed through untouched here, not
            // defaulted, so a caller that doesn't pass `repo` keeps the
            // exact same single-arg calling convention downstream.
            onStart: (prNumber, repo) => {
              schedulerProgressTracker.onStart?.(prNumber, repo);
              userProgressTracker.onStart?.(prNumber, repo);
            },
            onEnd: (prNumber, repo) => {
              schedulerProgressTracker.onEnd?.(prNumber, repo);
              userProgressTracker.onEnd?.(prNumber, repo);
            },
            onRunDone: (runProgressCounts, repo) => {
              schedulerProgressTracker.onRunDone?.(runProgressCounts, repo);
              userProgressTracker.onRunDone?.(runProgressCounts, repo);
            },
          }
        : userProgressTracker || schedulerProgressTracker;

    return runViewPrsBashCommand(scriptArgs, maxBufferBytes, {
      ...options,
      env: {
        ...(options?.env || {}),
        VIEW_PRS_PROGRESS_MARKERS: trackSchedulerPrProgress ? "1" : "0",
      },
      progressTracker,
    });
  };

  /**
   * Executes a view-prs shell script from the scripts directory.
   * 
   * @param {string} scriptName - Script file name
   * @param {Array<string>} [scriptArgs=[]] - Script arguments
   * @param {number} [maxBufferBytes=1024*1024] - Max buffer size
   * @param {Object} [options={}] - Execution options
   * @returns {Promise} Command result
   */
  const runViewPrsShellScript = (
    scriptName,
    scriptArgs = [],
    maxBufferBytes = 1024 * 1024,
    options = {},
  ) =>
    runViewPrsBashCommand([scriptName, ...scriptArgs], maxBufferBytes, options);

  /**
   * Checks if a command is available on the system.
   * 
   * @param {string} cmd - Command name
   * @returns {boolean} True if command exists
   */
  const isCommandAvailable = (cmd) => {
    const check = spawnSync("bash", ["-lc", `command -v ${cmd}`], {
      stdio: "ignore",
    });
    return check.status === 0;
  };

  // jq is a special case: check-open-pr-updates.sh prefers the binary
  // node-jq's postinstall downloaded into node_modules over a system-wide
  // `jq` (see the script's own JQ_BIN resolution), so it's genuinely
  // available here too as long as `npm install` has run, even with
  // nothing on PATH - matches src/dependencies/check-deps.js's own
  // isJqAvailable, kept as a separate check here since this module has no
  // shared import path to that CLI-only script.
  const isJqAvailable = () =>
    fs.existsSync(path.join(viewPrsDir, "node_modules", "node-jq", "bin", "jq.exe")) ||
    fs.existsSync(path.join(viewPrsDir, "node_modules", "node-jq", "bin", "jq")) ||
    isCommandAvailable("jq");

  /**
   * Checks whether `gh` is actually authenticated (`gh auth status`), not
   * just installed. Deliberately kept OUT of getDependencyStatus() below:
   * that function is also called on every scheduler auto-refresh attempt
   * (see app.js's callGetDependencyStatus() call sites) as a cheap
   * pre-flight gate, and `gh auth status` makes a real GitHub API call to
   * validate the token - fine for an on-demand /health/deps request, too
   * costly (extra API calls + latency) to run on every scheduler tick.
   * check-open-pr-updates.sh already has its own `gh auth status` gate
   * for the scheduler's actual run attempts, which is reactive but
   * sufficient there; this is the proactive version for the health route.
   *
   * @returns {boolean|null} true/false if gh is installed, null if it
   *   isn't (so callers can distinguish "not authenticated" from
   *   "nothing to check")
   */
  const isGhAuthenticated = () => {
    if (!isCommandAvailable("gh")) {
      return null;
    }
    const check = spawnSync("gh", ["auth", "status"], { stdio: "ignore" });
    return check.status === 0;
  };

  /**
   * Gets the status of all required dependencies.
   *
   * @returns {Object} Dependency status with commands, packages, and missing items
   */
  const getDependencyStatus = () => {
    const commands = {};
    for (const cmd of requiredCommands) {
      commands[cmd] = cmd === "jq" ? isJqAvailable() : isCommandAvailable(cmd);
    }

    const packages = {};
    for (const pkg of requiredPackages) {
      try {
        require.resolve(pkg);
        packages[pkg] = true;
      } catch (_error) {
        packages[pkg] = false;
      }
    }

    const missingCommands = Object.entries(commands)
      .filter(([, available]) => !available)
      .map(([name]) => name);

    const missingPackages = Object.entries(packages)
      .filter(([, available]) => !available)
      .map(([name]) => name);

    const missing = [
      ...missingCommands,
      ...missingPackages.map((pkg) => `npm:${pkg}`),
    ];

    return {
      ok: missingCommands.length === 0 && missingPackages.length === 0,
      commands,
      packages,
      missingCommands,
      missingPackages,
      missing,
    };
  };

  // Return public API
  return {
    terminateProcessTree,
    formatScriptFailureMessage,
    runViewPrsCommand,
    runViewPrsBashCommand,
    runViewPrsScript,
    runViewPrsShellScript,
    isCommandAvailable,
    getDependencyStatus,
    isGhAuthenticated,
    // For testing
    _getWatchdogForceStopCount: () => viewPrsWatchdogForceStopCount,
  };
}

module.exports = { createCommandExecutionHelpers };
