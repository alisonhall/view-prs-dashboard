#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");
const {
  getPrDetailStorageFilePath,
  buildPrDetailRef,
  extractHeavyPrDetailFields,
  stripHeavyPrDetailFields,
} = require("../server/helpers/view-prs-pr-detail-storage");

const viewPrsDir = path.resolve(__dirname, "../..");
const dataDir = process.env.DATA_DIR || path.join(viewPrsDir, "data");
const defaultDataBasename = ["check-open-pr-updates", "data.json"].join(".");
const dataFile = process.env.MIGRATE_DATA_FILE || path.join(dataDir, defaultDataBasename);
const detailDir = process.env.MIGRATE_DETAIL_DIR || path.join(dataDir, "pr-details");
const backupDir = process.env.STATE_BACKUP_DIR || path.join(dataDir, "backups");

const isObject = (value) =>
  value != null && typeof value === "object" && !Array.isArray(value);

const backupStamp = () => {
  const iso = new Date().toISOString();
  return iso.replace(/[-:]/g, "").replace(/\..+$/, "Z");
};

const writeAtomicJson = (filePath, value) => {
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tmpPath, filePath);
};

const ensureBackup = (filePath) => {
  fs.mkdirSync(backupDir, { recursive: true });
  const suffix = `${backupStamp()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const backupPath = path.join(
    backupDir,
    `${path.basename(filePath)}.pr-data.${suffix}.bak`,
  );
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
};

const hasInlineHeavyFields = (data) =>
  ["activityTimeline", "activityEvents", "reviewThreads", "commentEvents"].some((field) =>
    Array.isArray(data?.[field]),
  );

const isDestructiveSidecarWriteAllowed = (rawValue = process.env.VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE) =>
  /^(1|true|yes)$/i.test(String(rawValue || "").trim());

const countDetailPayloadEvents = (payload) =>
  ["activityTimeline", "activityEvents", "reviewThreads", "commentEvents"].reduce((sum, field) => {
    const entries = payload?.[field];
    return sum + (Array.isArray(entries) ? entries.length : 0);
  }, 0);

const shouldBlockDestructiveSidecarOverwrite = ({
  filePath,
  incomingPayload,
  allowDestructiveWrite,
}) => {
  if (allowDestructiveWrite || !fs.existsSync(filePath)) {
    return false;
  }

  let existing;
  try {
    existing = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_error) {
    return false;
  }
  const existingCount = countDetailPayloadEvents(existing);
  const incomingCount = countDetailPayloadEvents(incomingPayload);
  return existingCount > 0 && incomingCount === 0;
};

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let size = bytes;
  let idx = -1;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx += 1;
  }
  return `${size.toFixed(2)} ${units[idx]}`;
};

const runMigration = (options = {}) => {
  const { silent = false } = options;
  const log = silent ? () => {} : console.log;

  if (!fs.existsSync(dataFile)) {
    throw new Error(`Data file not found: ${dataFile}`);
  }

  const beforeStats = fs.statSync(dataFile);
  const raw = fs.readFileSync(dataFile, "utf8");
  const parsed = JSON.parse(raw);
  if (!isObject(parsed)) {
    throw new Error("Data file must contain a JSON object");
  }

  const byPrNumber = isObject(parsed.byPrNumber) ? parsed.byPrNumber : {};
  fs.mkdirSync(detailDir, { recursive: true });
  const allowDestructiveWrite = isDestructiveSidecarWriteAllowed();

  let migrated = 0;
  let skipped = 0;
  let protectedSkips = 0;

  Object.entries(byPrNumber).forEach(([prNumberKey, entry]) => {
    if (!isObject(entry) || !isObject(entry.data)) {
      return;
    }

    const rowData = entry.data;
    const repo = String(entry.repo || "").trim();
    const prNumber = String(rowData.number || prNumberKey || "").trim();

    if (!repo || !/^\d+$/.test(prNumber)) {
      skipped += 1;
      return;
    }

    if (!hasInlineHeavyFields(rowData)) {
      if (isObject(rowData.detailRef)) {
        return;
      }
      skipped += 1;
      return;
    }

    const detailPayload = extractHeavyPrDetailFields(rowData);
    const detailFilePath = getPrDetailStorageFilePath(detailDir, repo, prNumber);
    fs.mkdirSync(path.dirname(detailFilePath), { recursive: true });
    if (
      shouldBlockDestructiveSidecarOverwrite({
        filePath: detailFilePath,
        incomingPayload: detailPayload,
        allowDestructiveWrite,
      })
    ) {
      protectedSkips += 1;
    } else {
      writeAtomicJson(detailFilePath, detailPayload);
    }

    const nextRowData = stripHeavyPrDetailFields(rowData);

    const relativeDetailPath = detailFilePath.startsWith(`${viewPrsDir}${path.sep}`)
      ? detailFilePath.slice(viewPrsDir.length + 1)
      : detailFilePath;

    nextRowData.detailRef = buildPrDetailRef({
      filePath: relativeDetailPath,
      schemaVersion: "v1",
    });

    entry.data = nextRowData;
    migrated += 1;
  });

  if (migrated === 0) {
    log("[migrate:pr-detail] No inline-heavy rows needed migration.");
    log(`[migrate:pr-detail] skipped=${skipped}`);
    if (protectedSkips > 0) {
      log(`[migrate:pr-detail] protectedSkips=${protectedSkips}`);
    }
    return;
  }

  const backupPath = ensureBackup(dataFile);
  writeAtomicJson(dataFile, parsed);

  const afterStats = fs.statSync(dataFile);
  const delta = beforeStats.size - afterStats.size;

  log(`[migrate:pr-detail] backup: ${backupPath}`);
  log(`[migrate:pr-detail] migrated=${migrated} rows, skipped=${skipped}`);
  if (protectedSkips > 0) {
    log(`[migrate:pr-detail] protectedSkips=${protectedSkips}`);
  }
  log(
    `[migrate:pr-detail] size: ${beforeStats.size} -> ${afterStats.size} bytes (${formatBytes(beforeStats.size)} -> ${formatBytes(afterStats.size)}, saved ${delta} bytes)`,
  );
};

if (require.main === module) {
  try {
    runMigration();
  } catch (error) {
    console.error(`[migrate:pr-detail] ERROR: ${error.message || error}`);
    process.exit(1);
  }
}

module.exports = {
  runMigration,
};
