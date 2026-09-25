#!/usr/bin/env node
/**
 * Runs a bash script, failing with a clear, actionable message instead of
 * a bare "'bash' is not recognized" when invoked from a native Windows
 * shell (plain cmd.exe/PowerShell, no Git Bash/WSL on PATH) - the same
 * class of silent-failure gap check-deps.js already closed for `npm test`/
 * `npm install`, applied here to the handful of npm scripts
 * (backfill:missing:bg*, verify:react-setup) that shell out directly and
 * aren't already gated by a `deps:check` step of their own (cli-view is:
 * it runs `npm run deps:check &&` first, so it doesn't need this wrapper).
 *
 * Usage: node src/dependencies/run-bash-script.js <script-path> [args...]
 */

"use strict";

const { spawnSync } = require("child_process");
const path = require("path");
const { evaluateSystemCommands } = require("./check-deps.js");

const [, , scriptRelativePath, ...scriptArgs] = process.argv;

if (!scriptRelativePath) {
  console.error("[view-prs] run-bash-script.js requires a script path argument.");
  process.exit(1);
}

const bashEntry = evaluateSystemCommands().find((entry) => entry.command === "bash");

if (!bashEntry || !bashEntry.available) {
  console.error("[view-prs] This command requires bash, which isn't available on PATH.");
  console.error(
    `[view-prs] Install: ${bashEntry?.installHint || "Install Git for Windows (provides Git Bash): https://git-scm.com/download/win"}`,
  );
  console.error("[view-prs] Then re-run this command from a Git Bash, WSL, or macOS/Linux terminal.");
  process.exit(1);
}

const scriptAbsolutePath = path.resolve(__dirname, "..", "..", scriptRelativePath);
const result = spawnSync("bash", [scriptAbsolutePath, ...scriptArgs], {
  stdio: "inherit",
});

if (result.error) {
  console.error(`[view-prs] Failed to run ${scriptRelativePath}: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
