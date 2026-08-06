#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..", "..");

const PROTECTED_FILE_MARKERS = [
  "check-open-pr-updates.data.json",
  "check-open-pr-updates.user-state.json",
  "viewPrsDataFile",
  "viewPrsUserStateFile",
  "PR_STATE_FILE",
  "USER_STATE_FILE",
];

const WRITE_OP_MARKERS = [
  "writeFileSync",
  "appendFileSync",
  "truncateSync",
  "renameSync",
  "copyFileSync",
  "unlinkSync",
  "rm -f",
  "mv ",
  "cp ",
  "replace_state_file",
];

const ALLOWED_WRITER_FILES = new Set([
  "src/server/app.js",
  "src/server/storage/view-prs-state-storage.js",
  "src/script/check-open-pr-updates.sh",
  "src/dependencies/check-protected-state-writes.js",
]);

const EXCLUDED_DIRS = new Set(["node_modules", ".git", "data", "coverage"]);

const isTestLikeFile = (name) =>
  /\.test\.[cm]?[jt]s$/.test(name) || /(^|\.)test\.sh$/.test(name);

const shouldScanFile = (relativePath) => {
  const normalized = relativePath.split(path.sep).join("/");
  if (isTestLikeFile(path.basename(normalized))) {
    return false;
  }

  return /\.(js|mjs|cjs|sh)$/.test(normalized);
};

const walkFiles = (
  dirPath,
  {
    fsImpl = fs,
    rootDir = projectRoot,
    out = [],
    excludedDirs = EXCLUDED_DIRS,
  } = {},
) => {
  const entries = fsImpl.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(rootDir, fullPath);

    if (entry.isDirectory()) {
      if (excludedDirs.has(entry.name)) {
        continue;
      }
      walkFiles(fullPath, { fsImpl, rootDir, out, excludedDirs });
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (!shouldScanFile(relativePath)) {
      continue;
    }

    out.push(fullPath);
  }

  return out;
};

const includesAnyMarker = (content, markers) =>
  markers.some((marker) => content.includes(marker));

const findProtectedWriteViolations = ({
  fsImpl = fs,
  rootDir = projectRoot,
  allowedWriterFiles = ALLOWED_WRITER_FILES,
  excludedDirs = EXCLUDED_DIRS,
} = {}) => {
  const violations = [];

  for (const fullPath of walkFiles(rootDir, { fsImpl, rootDir, excludedDirs })) {
    const relativePath = path
      .relative(rootDir, fullPath)
      .split(path.sep)
      .join("/");
    if (allowedWriterFiles.has(relativePath)) {
      continue;
    }

    const content = fsImpl.readFileSync(fullPath, "utf8");
    const hasProtectedMarker = includesAnyMarker(content, PROTECTED_FILE_MARKERS);
    if (!hasProtectedMarker) {
      continue;
    }

    const hasWriteMarker = includesAnyMarker(content, WRITE_OP_MARKERS);
    if (!hasWriteMarker) {
      continue;
    }

    violations.push(relativePath);
  }

  return violations;
};

const reportProtectedWriteViolations = (
  violations,
  {
    logger = console,
    allowedWriterFiles = ALLOWED_WRITER_FILES,
  } = {},
) => {
  if (violations.length > 0) {
    logger.error(
      "[guard:state-writes] Found disallowed direct protected-state write usage in:",
    );
    for (const filePath of violations) {
      logger.error(`- ${filePath}`);
    }
    logger.error("Allowed writer files:");
    for (const filePath of [...allowedWriterFiles].sort()) {
      logger.error(`- ${filePath}`);
    }
    return 1;
  }

  logger.log(
    "[guard:state-writes] OK: no disallowed protected-state write usage found.",
  );
  return 0;
};

const runProtectedStateWritesGuard = (options = {}, logger = console) => {
  const violations = findProtectedWriteViolations(options);
  return reportProtectedWriteViolations(violations, { logger });
};

if (require.main === module) {
  process.exit(runProtectedStateWritesGuard());
}

module.exports = {
  findProtectedWriteViolations,
  isTestLikeFile,
  shouldScanFile,
  runProtectedStateWritesGuard,
};
