#!/usr/bin/env node
/**
 * CI guard: runs Jest and fails the process if Jest's own --detectOpenHandles
 * diagnostic reports any leaked handles/timers, even though Jest's own exit
 * code only reflects test pass/fail, never handle leaks.
 *
 * Without this, a leaked setInterval/setTimeout (or any other open handle)
 * either hangs the run forever (no --forceExit) or gets silently forced
 * closed (--forceExit) - --detectOpenHandles prints a diagnostic naming the
 * leak either way, but nothing turns that diagnostic into an actual
 * failure. Confirmed real: a test-only leaked scheduler interval kept a
 * local Jest run alive indefinitely before this existed.
 *
 * Usage: node src/dependencies/run-jest-guarded.js [...jest args]
 * (drop-in replacement for `jest [...jest args]` - forwards args, exit
 * code, and streamed stdout/stderr unchanged, except it also fails on a
 * detected-open-handles report.)
 */

"use strict";

const path = require("path");
const { spawn } = require("child_process");

const jestPackageJsonPath = require.resolve("jest/package.json");
const jestBin = require(jestPackageJsonPath).bin;
const jestBinPath = path.join(path.dirname(jestPackageJsonPath), jestBin);

const jestArgs = process.argv.slice(2);

const child = spawn(process.execPath, [jestBinPath, ...jestArgs], {
  stdio: ["inherit", "pipe", "pipe"],
});

// Jest wraps this exact phrase (see @jest/core's collectHandles reporting)
// in ANSI color codes at the boundaries, not split through the middle, so
// a plain substring match on the combined output is reliable regardless of
// color support.
const OPEN_HANDLES_MARKER = "Jest has detected the following";
let combinedOutput = "";

const relay = (source, destination) => {
  source.on("data", (chunk) => {
    combinedOutput += chunk.toString("utf8");
    destination.write(chunk);
  });
};

relay(child.stdout, process.stdout);
relay(child.stderr, process.stderr);

child.on("error", (error) => {
  console.error("[run-jest-guarded] Failed to start Jest:", error.message);
  process.exit(1);
});

child.on("close", (code) => {
  if (combinedOutput.includes(OPEN_HANDLES_MARKER)) {
    console.error(
      "\n[run-jest-guarded] Jest reported open handles above (--detectOpenHandles) - " +
        `failing this run even though Jest's own exit code was ${code}. ` +
        "A leaked timer/handle can otherwise let a run report success while " +
        "something keeps the process alive (or, under --forceExit, gets " +
        "silently force-closed instead of cleaned up properly) - fix the " +
        "leak (e.g. clearInterval/clearTimeout in the offending test's own " +
        "cleanup) rather than removing this check.",
    );
    process.exit(1);
    return;
  }

  process.exit(code === null ? 1 : code);
});
