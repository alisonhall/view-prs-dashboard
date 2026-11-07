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

  // The user state file as it is, normalized - restored from its latest
  // backup first when it's malformed (refusing when there's none to restore).
  const readUserStateRestoringBackup = () => {
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
    return normalizeViewPrsUserState(existingRead.value || {});
  };

  const writeViewPrsUserStateUnlocked = (state) => {
    const incoming = normalizeViewPrsUserState(state);
    const existing = readUserStateRestoringBackup();

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

  // The script's user-state lock (USER_STATE_LOCK_DIR in
  // check-open-pr-updates.sh, beside the file), held around a read and its
  // write so neither side writes over a change the other made in between -
  // the script's jq, validation, backup and rename take long enough for a
  // notes save to land in the middle. A bare directory, with no lock-info:
  // the script then judges it by its age, not a pid (Git Bash's pids aren't
  // Node's), as the server's PR-data lock (acquirePrStateLockForPatch).
  // The script holds it for one write; one older than a minute was left by
  // a script that died, and is passed over (written without, as before
  // there was this lock) rather than failing every save until the script
  // recovers it.
  const userStateLockDir = viewPrsUserStateFile.replace(/\.json$/, "") + ".lock";
  const USER_STATE_LOCK_WAIT_MS = 3000;
  const USER_STATE_LOCK_ABANDONED_MS = 60000;
  const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  const isLockAbandoned = () => {
    try {
      return Date.now() - fs.statSync(userStateLockDir).mtimeMs > USER_STATE_LOCK_ABANDONED_MS;
    } catch (_error) {
      return false;
    }
  };
  const withUserStateLock = (fn) => {
    const deadlineMs = Date.now() + USER_STATE_LOCK_WAIT_MS;
    let held = false;
    for (;;) {
      try {
        fs.mkdirSync(userStateLockDir);
        held = true;
        break;
      } catch (error) {
        // No data folder yet (or an fs without mkdirSync): nothing to
        // race with.
        if (error?.code !== "EEXIST" || isLockAbandoned()) break;
        if (Date.now() >= deadlineMs) {
          throw new Error("Unable to acquire the user state lock", { cause: error });
        }
        sleepSync(25);
      }
    }
    try {
      return fn();
    } finally {
      if (held) {
        try {
          fs.rmdirSync(userStateLockDir);
        } catch (_error) {
          // Best effort.
        }
      }
    }
  };

  const writeViewPrsUserState = (state) => withUserStateLock(() => writeViewPrsUserStateUnlocked(state));

  // Reads the user state, hands it (normalized) to change, and writes what
  // that returns - all under the lock, so the change is made to the latest
  // (a malformed file's backup, not an empty state that would drop what
  // the merge doesn't bring back, like conversation confirmations).
  const updateViewPrsUserState = (change) =>
    withUserStateLock(() => {
      const current = readUserStateRestoringBackup();
      const next = change(current) || current;
      writeViewPrsUserStateUnlocked(next);
      return next;
    });

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
    updateViewPrsUserState,
    writeViewPrsAuthorComments,
    mergeMissingPerRepoMap,
    migrateLegacyViewPrsUserState,
  };
};

module.exports = {
  createViewPrsStateStorage,
};
