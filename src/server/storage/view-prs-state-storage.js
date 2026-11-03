const path = require("path");
const {
  isLegacyPrEntryKey,
  prNumberFromKey,
  normalizePrEntryKeys,
  migrateNotesKeys,
} = require("../helpers/view-prs-pr-keys");

const createViewPrsStateStorage = ({
  fs,
  enforceProtectedWritePolicy,
  viewPrsBackupRetention,
  viewPrsBackupDir,
  viewPrsDataFile,
  viewPrsUserStateFile,
  viewPrsAuthorCommentsFile,
  readJsonFileIfExists,
  readJsonFileIfExistsDetailed,
  normalizeViewPrsUserState,
  normalizeViewPrsAuthorComments,
  normalizeNotes,
  normalizePerRepoMap,
  isObject,
  backupStamp,
}) => {
  const getFileMtimeMs = (fullPath) => {
    try {
      return fs.statSync(fullPath).mtimeMs || 0;
    } catch (_error) {
      return 0;
    }
  };

  const writeJsonFileWithBackup = (
    filePath,
    value,
    backupTag = "state",
    retention = viewPrsBackupRetention,
  ) => {
    enforceProtectedWritePolicy({
      filePath,
      incomingValue: value,
      viewPrsDataFile,
      viewPrsUserStateFile,
      viewPrsAuthorCommentsFile,
      readJsonFileIfExists,
      normalizeViewPrsUserState,
      normalizeViewPrsAuthorComments,
      isObject,
    });

    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    if (fs.existsSync(filePath)) {
      try {
        fs.mkdirSync(viewPrsBackupDir, { recursive: true });
        const suffix = `${backupStamp()}-${process.pid}-${Math.random()
          .toString(36)
          .slice(2, 8)}`;
        const backupPrefix = `${path.basename(filePath)}.${backupTag}.`;
        const backupPath = path.join(
          viewPrsBackupDir,
          `${backupPrefix}${suffix}.bak`,
        );
        fs.copyFileSync(filePath, backupPath);

        const backups = fs
          .readdirSync(viewPrsBackupDir)
          .filter(
            (name) =>
              name.startsWith(backupPrefix) &&
              name.endsWith(".bak") &&
              fs.existsSync(path.join(viewPrsBackupDir, name)),
          )
          .map((name) => {
            const fullPath = path.join(viewPrsBackupDir, name);
            return { name, fullPath, mtimeMs: getFileMtimeMs(fullPath) };
          })
          .sort((a, b) => b.mtimeMs - a.mtimeMs);

        backups.slice(Math.max(0, retention)).forEach((entry) => {
          try {
            fs.unlinkSync(entry.fullPath);
          } catch (_error) {
            // Best effort backup pruning.
          }
        });
      } catch (_error) {
        // Best effort backup creation.
      }
    }

    const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fs.renameSync(tempPath, filePath);
  };

  const tryRestoreJsonFileFromLatestBackup = (filePath, backupTag = "state") => {
    if (!fs.existsSync(viewPrsBackupDir)) {
      return null;
    }

    const backupPrefix = `${path.basename(filePath)}.${backupTag}.`;
    const backups = fs
      .readdirSync(viewPrsBackupDir)
      .filter((name) => name.startsWith(backupPrefix) && name.endsWith(".bak"))
      .map((name) => {
        const fullPath = path.join(viewPrsBackupDir, name);
        return { name, fullPath, mtimeMs: getFileMtimeMs(fullPath) };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);

    for (const backup of backups) {
      try {
        const parsed = JSON.parse(fs.readFileSync(backup.fullPath, "utf8"));
        if (!isObject(parsed)) {
          continue;
        }
        const tempPath = `${filePath}.restore-${process.pid}-${Date.now()}`;
        fs.writeFileSync(
          tempPath,
          `${JSON.stringify(parsed, null, 2)}\n`,
          "utf8",
        );
        fs.renameSync(tempPath, filePath);
        return backup.fullPath;
      } catch (_error) {
        // Continue scanning older backups until a valid JSON object is found.
      }
    }

    return null;
  };

  const mergeMissingPerRepoMap = (target, source) => {
    for (const [repo, perPr] of Object.entries(source || {})) {
      if (!isObject(perPr)) {
        continue;
      }
      target[repo] = target[repo] || {};
      for (const [prNumber, value] of Object.entries(perPr)) {
        if (!Object.prototype.hasOwnProperty.call(target[repo], prNumber)) {
          target[repo][prNumber] = value;
        }
      }
    }
  };

  const writeViewPrsUserState = (state) => {
    const incoming = normalizeViewPrsUserState(state);

    let existingRead = readJsonFileIfExistsDetailed(viewPrsUserStateFile);
    if (existingRead.exists && existingRead.parseError) {
      const restoredFrom = tryRestoreJsonFileFromLatestBackup(
        viewPrsUserStateFile,
        "user-state",
      );
      if (!restoredFrom) {
        throw new Error(
          `Refusing to overwrite malformed user-state file at ${viewPrsUserStateFile}: ${existingRead.parseError.message}`,
        );
      }
      existingRead = readJsonFileIfExistsDetailed(viewPrsUserStateFile);
      if (existingRead.parseError) {
        throw new Error(
          `Failed to restore malformed user-state file at ${viewPrsUserStateFile} from backup ${restoredFrom}: ${existingRead.parseError.message}`,
        );
      }
    }

    const existing = normalizeViewPrsUserState(existingRead.value || {});

    // Notes keyed by a bare number that the incoming state already has under
    // a repo key (migrated - see view-prs-pr-keys.js) aren't brought back.
    const incomingKeyedNumbers = new Set(
      Object.keys(incoming.notesByPrNumber)
        .filter((key) => !isLegacyPrEntryKey(key))
        .map((key) => prNumberFromKey(key)),
    );
    for (const [prKey, notes] of Object.entries(existing.notesByPrNumber)) {
      if (isLegacyPrEntryKey(prKey) && incomingKeyedNumbers.has(prKey)) {
        continue;
      }
      if (!incoming.notesByPrNumber[prKey]) {
        incoming.notesByPrNumber[prKey] = notes;
      }
    }

    mergeMissingPerRepoMap(incoming.ackByRepo, existing.ackByRepo);
    mergeMissingPerRepoMap(incoming.reverifyByRepo, existing.reverifyByRepo);
    mergeMissingPerRepoMap(incoming.inReviewByRepo, existing.inReviewByRepo);
    mergeMissingPerRepoMap(incoming.flaggedByRepo, existing.flaggedByRepo);
    // Only the script changes the Ack history (ACK_HISTORY_JQ in
    // check-open-pr-updates.sh), so the file's is always the latest: a write
    // here keeps it, rather than an older copy read before the script
    // recorded an Ack.
    incoming.ackHistoryByRepo = existing.ackHistoryByRepo;

    writeJsonFileWithBackup(viewPrsUserStateFile, incoming, "user-state");
  };

  const writeViewPrsAuthorComments = (state) => {
    const incoming = normalizeViewPrsAuthorComments(state);

    let existingRead = readJsonFileIfExistsDetailed(viewPrsAuthorCommentsFile);
    if (existingRead.exists && existingRead.parseError) {
      const restoredFrom = tryRestoreJsonFileFromLatestBackup(
        viewPrsAuthorCommentsFile,
        "author-comments",
      );
      if (!restoredFrom) {
        throw new Error(
          `Refusing to overwrite malformed author-comments file at ${viewPrsAuthorCommentsFile}: ${existingRead.parseError.message}`,
        );
      }
      existingRead = readJsonFileIfExistsDetailed(viewPrsAuthorCommentsFile);
      if (existingRead.parseError) {
        throw new Error(
          `Failed to restore malformed author-comments file at ${viewPrsAuthorCommentsFile} from backup ${restoredFrom}: ${existingRead.parseError.message}`,
        );
      }
    }

    writeJsonFileWithBackup(
      viewPrsAuthorCommentsFile,
      incoming,
      "author-comments",
    );
  };

  const migrateLegacyViewPrsUserState = (mainData, userState) => {
    const main = isObject(mainData) ? mainData : {};
    const migrated = normalizeViewPrsUserState(userState);
    let userStateChanged = false;
    let dataFileChanged = false;

    const byPrNumber = isObject(main.byPrNumber) ? main.byPrNumber : {};
    for (const [prNumber, entry] of Object.entries(byPrNumber)) {
      const notes = normalizeNotes(entry?.notes);
      if (notes && !migrated.notesByPrNumber[prNumber]) {
        migrated.notesByPrNumber[prNumber] = notes;
        userStateChanged = true;
      }
      if (
        isObject(entry) &&
        Object.prototype.hasOwnProperty.call(entry, "notes")
      ) {
        delete entry.notes;
        dataFileChanged = true;
      }
    }

    // Notes keyed by a bare number move to their PR's repo key (see
    // view-prs-pr-keys.js): two repos can each have a PR with that number.
    const migratedNotes = migrateNotesKeys(
      migrated.notesByPrNumber,
      normalizePrEntryKeys(byPrNumber),
      String(main.lastFullRun?.repo || main.lastRun?.repo || ""),
    );
    if (migratedNotes !== migrated.notesByPrNumber) {
      migrated.notesByPrNumber = migratedNotes;
      userStateChanged = true;
    }

    const legacyAckByRepo = normalizePerRepoMap(main.ackByRepo, "string");
    const legacyReverifyByRepo = normalizePerRepoMap(
      main.reverifyByRepo,
      "boolean",
    );
    const legacyInReviewByRepo = normalizePerRepoMap(
      main.inReviewByRepo,
      "boolean",
    );
    const legacyFlaggedByRepo = normalizePerRepoMap(
      main.flaggedByRepo,
      "boolean",
    );

    const beforeAck = JSON.stringify(migrated.ackByRepo);
    const beforeReverify = JSON.stringify(migrated.reverifyByRepo);
    const beforeInReview = JSON.stringify(migrated.inReviewByRepo);
    const beforeFlagged = JSON.stringify(migrated.flaggedByRepo);

    mergeMissingPerRepoMap(migrated.ackByRepo, legacyAckByRepo);
    mergeMissingPerRepoMap(migrated.reverifyByRepo, legacyReverifyByRepo);
    mergeMissingPerRepoMap(migrated.inReviewByRepo, legacyInReviewByRepo);
    mergeMissingPerRepoMap(migrated.flaggedByRepo, legacyFlaggedByRepo);

    if (JSON.stringify(migrated.ackByRepo) !== beforeAck) {
      userStateChanged = true;
    }
    if (JSON.stringify(migrated.reverifyByRepo) !== beforeReverify) {
      userStateChanged = true;
    }
    if (JSON.stringify(migrated.inReviewByRepo) !== beforeInReview) {
      userStateChanged = true;
    }
    if (JSON.stringify(migrated.flaggedByRepo) !== beforeFlagged) {
      userStateChanged = true;
    }

    if (Object.prototype.hasOwnProperty.call(main, "ackByRepo")) {
      delete main.ackByRepo;
      dataFileChanged = true;
    }
    if (Object.prototype.hasOwnProperty.call(main, "reverifyByRepo")) {
      delete main.reverifyByRepo;
      dataFileChanged = true;
    }
    if (Object.prototype.hasOwnProperty.call(main, "inReviewByRepo")) {
      delete main.inReviewByRepo;
      dataFileChanged = true;
    }
    if (Object.prototype.hasOwnProperty.call(main, "flaggedByRepo")) {
      delete main.flaggedByRepo;
      dataFileChanged = true;
    }

    if (userStateChanged) {
      try {
        writeViewPrsUserState(migrated);
      } catch (_error) {
        // Best effort migration; read path must still succeed.
      }
    }

    if (dataFileChanged) {
      try {
        writeJsonFileWithBackup(viewPrsDataFile, main, "pr-data");
      } catch (_error) {
        // Best effort migration; read path must still succeed.
      }
    }

    return migrated;
  };

  return {
    writeJsonFileWithBackup,
    writeViewPrsUserState,
    writeViewPrsAuthorComments,
    mergeMissingPerRepoMap,
    migrateLegacyViewPrsUserState,
  };
};

module.exports = {
  createViewPrsStateStorage,
};
