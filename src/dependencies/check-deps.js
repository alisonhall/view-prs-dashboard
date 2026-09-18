#!/usr/bin/env node
/**
 * Checks that every system command and npm package this project needs is
 * actually present, and says exactly what's missing and how to install it -
 * rather than letting a missing `jq`/`gh`/`bash` surface later as a cryptic
 * failure deep inside check-open-pr-updates.sh.
 *
 * Usage:
 *   node src/dependencies/check-deps.js          # exit 1 on anything missing
 *   node src/dependencies/check-deps.js --soft    # always exit 0, warn only
 *
 * Also reusable programmatically (see runCheckDeps/evaluateDeps below) -
 * the /view-prs/health/deps server route (view-prs-mutation-routes.js)
 * imports evaluateDeps() directly to report the same information live,
 * without shelling out to this file as a subprocess.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "..", "..");
const pkgPath = path.join(projectRoot, "package.json");
const depSections = ["dependencies", "devDependencies", "optionalDependencies"];

// `timeout`/`gtimeout` are deliberately NOT listed here even though
// check-open-pr-updates.sh uses them: that script already falls back to a
// perl-based alarm() when neither is present (see run_with_timeout_inner),
// so their absence is a real degrade-gracefully case, not a hard failure.
const REQUIRED_SYSTEM_COMMANDS = [
  {
    command: "bash",
    reason: "runs check-open-pr-updates.sh and its own shell-integration test suite",
    testRequired: true,
    install: {
      darwin: "Preinstalled on macOS.",
      linux: "Preinstalled on most Linux distributions.",
      win32: "Install Git for Windows (provides Git Bash): https://git-scm.com/download/win",
      default: "Install a POSIX-compatible bash shell.",
    },
  },
  {
    command: "gh",
    reason:
      "fetches PR data from GitHub in check-open-pr-updates.sh (must also be authenticated: run `gh auth login`)",
    // Not test-required: the jest shell-integration suite injects its own
    // fake get_pr_detail_json()/fetch_*_json() function overrides instead
    // of ever calling the real `gh` binary - confirmed empirically (the
    // full suite passes with `gh` absent). Real `gh` is only needed to
    // actually run check-open-pr-updates.sh against live GitHub data.
    testRequired: false,
    install: {
      darwin: "brew install gh",
      linux: "See https://github.com/cli/cli/blob/trunk/docs/install_linux.md",
      win32: "winget install GitHub.cli",
      default: "See https://cli.github.com/",
    },
  },
  {
    command: "jq",
    reason: "parses and builds JSON throughout check-open-pr-updates.sh",
    testRequired: true,
    // Normally auto-provided: `npm install` pulls in the node-jq
    // devDependency, which downloads a real jq binary into
    // node_modules/node-jq/bin - check-open-pr-updates.sh prefers that over
    // a system-wide `jq` (see its own JQ_BIN resolution). A system jq is
    // only needed as a fallback if node_modules is missing/incomplete.
    install: {
      darwin: "Run `npm install` (bundles jq via the node-jq dependency). Manual fallback: brew install jq",
      linux: "Run `npm install` (bundles jq via the node-jq dependency). Manual fallback: sudo apt-get install jq",
      win32: "Run `npm install` (bundles jq via the node-jq dependency). Manual fallback: winget install jqlang.jq --source winget",
      default: "Run `npm install` (bundles jq via the node-jq dependency). Manual fallback: https://jqlang.org/download/",
    },
  },
  {
    command: "mktemp",
    reason: "creates scratch files/directories in check-open-pr-updates.sh",
    testRequired: true,
    install: {
      darwin: "Preinstalled (part of coreutils).",
      linux: "Preinstalled (part of coreutils).",
      win32: "Bundled with Git for Windows' Git Bash.",
      default: "Install GNU coreutils.",
    },
  },
  {
    command: "xargs",
    reason: "runs parallel PR fetches in check-open-pr-updates.sh",
    testRequired: true,
    install: {
      darwin: "Preinstalled.",
      linux: "Preinstalled.",
      win32: "Bundled with Git for Windows' Git Bash.",
      default: "Install GNU findutils.",
    },
  },
  {
    command: "nohup",
    reason: "detaches the background backfill process in src/backfill/backfill-missing-bg.sh",
    // Not test-required: no test exercises backfill-missing-bg.sh.
    testRequired: false,
    install: {
      darwin: "Preinstalled.",
      linux: "Preinstalled.",
      win32: "Bundled with Git for Windows' Git Bash.",
      default: "Install GNU coreutils.",
    },
  },
];

const getInstallHint = (install) =>
  (install && (install[process.platform] || install.default)) || "";

const isCommandAvailable = (command) => {
  const result = spawnSync("bash", ["-lc", `command -v ${command}`], {
    stdio: "ignore",
  });
  return result.status === 0;
};

// jq is a special case: check-open-pr-updates.sh prefers the binary
// node-jq's postinstall downloaded into node_modules over a system-wide
// `jq` (see the script's own JQ_BIN resolution) - so a real, working jq is
// available here too even when nothing is on PATH, as long as `npm
// install` has run. Checking both keeps this report accurate instead of
// crying wolf about a "missing" jq that the script isn't actually using.
const isJqAvailable = () =>
  fs.existsSync(path.join(projectRoot, "node_modules", "node-jq", "bin", "jq.exe")) ||
  fs.existsSync(path.join(projectRoot, "node_modules", "node-jq", "bin", "jq")) ||
  isCommandAvailable("jq");

const evaluateSystemCommands = () =>
  REQUIRED_SYSTEM_COMMANDS.map((entry) => ({
    ...entry,
    installHint: getInstallHint(entry.install),
    available: entry.command === "jq" ? isJqAvailable() : isCommandAvailable(entry.command),
  }));

const readPackageJson = () => {
  const raw = fs.readFileSync(pkgPath, "utf8");
  return JSON.parse(raw);
};

const collectDeclaredDeps = (pkg) => {
  const names = new Set();
  for (const section of depSections) {
    const map = pkg && typeof pkg[section] === "object" ? pkg[section] : null;
    if (!map) continue;
    for (const name of Object.keys(map)) {
      names.add(name);
    }
  }
  return [...names];
};

// Checks for the package's presence on disk (its own package.json inside
// node_modules) rather than require.resolve(dep): a types-only package like
// @types/react ships no runtime entry point (no "main"/"exports" JS file,
// only .d.ts files), so require.resolve() falsely reports it "missing" even
// when npm installed it correctly - a false positive that would undermine
// trust in this exact check.
const evaluatePackageDeps = () => {
  const pkg = readPackageJson();
  const declaredDeps = collectDeclaredDeps(pkg);
  return declaredDeps.filter(
    (dep) => !fs.existsSync(path.join(projectRoot, "node_modules", dep, "package.json")),
  );
};

// scope "all" (default): every declared system command - used by
// `npm run deps:check`, `postinstall`, and the /view-prs/health/deps route,
// so a developer/operator sees the full picture regardless of what they're
// about to do. scope "test": only commands the jest suite itself actually
// exercises (see each entry's testRequired above) - used by `pretest`, so
// `npm test` doesn't fail over `gh`/`nohup` being absent when the test
// suite never touches them (confirmed empirically: the full suite passes
// without `gh` installed, since it mocks the script's own function
// wrappers rather than calling the real binary).
const evaluateDeps = ({ scope = "all" } = {}) => {
  const commands = evaluateSystemCommands();
  const scopedCommands =
    scope === "test" ? commands.filter((entry) => entry.testRequired) : commands;
  let missingPackages = [];
  let packageJsonError = null;
  try {
    missingPackages = evaluatePackageDeps();
  } catch (error) {
    packageJsonError = error.message;
  }

  return {
    commands,
    missingCommands: scopedCommands.filter((entry) => !entry.available),
    missingPackages,
    packageJsonError,
  };
};

const reportDeps = (evaluation, { soft = false, logger = console } = {}) => {
  const level = soft ? "warn" : "error";
  const prefix = soft ? "[deps:check] WARN " : "[deps:check]";

  if (evaluation.packageJsonError) {
    logger[level](`${prefix} Unable to read ${pkgPath}: ${evaluation.packageJsonError}`);
  }

  evaluation.missingCommands.forEach((entry) => {
    const hint = entry.installHint ? ` — install: ${entry.installHint}` : "";
    logger[level](`${prefix} Missing command \`${entry.command}\` (${entry.reason})${hint}`);
  });

  if (evaluation.missingPackages.length) {
    logger[level](
      `${prefix} Missing packages from package.json: ${evaluation.missingPackages.join(", ")} — run \`npm install\`.`,
    );
  }

  const hasIssues =
    Boolean(evaluation.packageJsonError) ||
    evaluation.missingCommands.length > 0 ||
    evaluation.missingPackages.length > 0;

  if (!hasIssues) {
    logger.log("[deps:check] OK: all required commands and packages are present.");
  }

  return hasIssues && !soft ? 1 : 0;
};

const runCheckDeps = ({ soft = false, scope = "all", logger = console } = {}) => {
  const evaluation = evaluateDeps({ scope });
  return reportDeps(evaluation, { soft, logger });
};

if (require.main === module) {
  const soft = process.argv.includes("--soft");
  const scope = process.argv.includes("--scope=test") ? "test" : "all";
  process.exit(runCheckDeps({ soft, scope }));
}

module.exports = {
  REQUIRED_SYSTEM_COMMANDS,
  getInstallHint,
  isCommandAvailable,
  evaluateSystemCommands,
  evaluatePackageDeps,
  evaluateDeps,
  reportDeps,
  runCheckDeps,
};
