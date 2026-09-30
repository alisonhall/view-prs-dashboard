#!/usr/bin/env node
/**
 * One-command "getting started" helper - run via `npm run setup`
 * (chained after `npm install`, so `npm run setup` alone is the whole
 * fresh-clone-to-running path). `npm install` already triggers
 * check-deps.js in --soft mode via the postinstall hook; this adds the one
 * check that isn't a simple command-presence check (whether `gh` is
 * actually *authenticated*, not just installed) and prints the concrete
 * next steps, so a new user doesn't have to piece together README
 * sections themselves to find `gh auth login`, the repo-override env var,
 * or how to actually start the server.
 */

"use strict";

const { spawnSync } = require("child_process");
const { evaluateDeps } = require("./check-deps.js");

const isGhAuthenticated = () =>
  spawnSync("gh", ["auth", "status"], { stdio: "ignore" }).status === 0;

const evaluation = evaluateDeps({ scope: "all" });
const ghEntry = evaluation.commands.find((entry) => entry.command === "gh");
const hasGh = Boolean(ghEntry && ghEntry.available);

console.log("");
console.log("=== view-prs setup ===");
console.log("");

if (evaluation.missingCommands.length === 0 && evaluation.missingPackages.length === 0) {
  console.log("Dependencies: OK (see `npm run deps:check` to re-check any time)");
} else {
  console.log(
    "Dependencies: some are missing - see the warnings above from `npm install`'s own check, or run `npm run deps:check` for full detail.",
  );
}

if (hasGh) {
  if (isGhAuthenticated()) {
    console.log("GitHub CLI: authenticated.");
  } else {
    console.log("GitHub CLI: installed but NOT authenticated.");
    console.log("  -> Run `gh auth login` before starting the server, or PR data fetches will fail.");
  }
} else {
  console.log("GitHub CLI (`gh`): not installed - required to fetch real PR data.");
  console.log(`  -> Install: ${ghEntry ? ghEntry.installHint : "https://cli.github.com/"}`);
}

console.log("");
console.log("Next steps:");
console.log("  1. Point this at your own repo (optional, defaults to a placeholder):");
console.log("       export VIEW_PRS_REPO='owner/repo'   (or pass --repo owner/repo to the CLI script)");
console.log("  2. Start the server:");
console.log("       npm start");
console.log("  3. Open the UI:");
console.log("       http://localhost:3456        (npm start - Vite dev server with HMR)");
console.log("       http://localhost:9000/view-prs/index.html   (npm run start:server-only)");
console.log("  4. Check dependency health any time (once the server is running):");
console.log("       curl -s http://localhost:9000/health/deps");
console.log("");
