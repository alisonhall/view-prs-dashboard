/**
 * Data Processing Helpers - Extracted from app.js
 * 
 * Provides utilities for data transformation, entry hydration,
 * actor resolution, and state reading.
 * 
 * @module data-processing-helpers
 */

/**
 * Creates data processing helper functions.
 * 
 * @param {Object} deps - Dependencies
 * @param {Object} deps.fs - Node.js fs module
 * @param {Object} deps.path - Node.js path module
 * @param {Function} deps.spawnSync - Node.js child_process.spawnSync
 * @param {Object} deps.fileIoHelpers - File I/O helper functions
 * @param {Object} deps.dataHelpers - View PRS data helper functions
 * @param {Object} deps.actorHelpers - View PRS actor helper functions
 * @param {Object} deps.stateStorage - View PRS state storage
 * @param {Object} deps.prDetailHelpers - PR detail helper functions
 * @param {string} deps.viewPrsDir - View PRS directory
 * @param {string} deps.viewPrsDataFile - Data file path
 * @param {string} deps.viewPrsUserStateFile - User state file path
 * @param {string} deps.viewPrsPrDetailDir - PR detail directory
 * @param {string} deps.viewPrsPrDiffDir - PR diff directory
 * @param {string} deps.viewPrsActorLoginAliasesFile - Actor aliases file
 * @param {string} deps.viewPrsActorNameCacheFile - Actor name cache file
 * @param {string} deps.defaultViewPrsRepo - Default repository
 * @returns {Object} Data processing helper functions
 */
function createDataProcessingHelpers({
  fs,
  path,
  spawnSync,
  fileIoHelpers,
  dataHelpers,
  actorHelpers,
  stateStorage,
  prDetailHelpers,
  viewPrsDir,
  viewPrsDataFile,
  viewPrsUserStateFile,
  viewPrsPrDetailDir,
  viewPrsPrDiffDir,
  viewPrsActorLoginAliasesFile,
  viewPrsActorNameCacheFile,
  defaultViewPrsRepo,
}) {
  const {
    readJsonFileIfExists,
    safeReadJsonFile,
    writeJsonFileBestEffort,
  } = fileIoHelpers;

  const {
    isViewPrsFixtureRow,
    toTrimmedString,
    isRepoSlug,
    normalizeDisplayName,
    isObject,
    inferFallbackRepoForNotesOnlyEntries: inferFallbackRepoForNotesOnlyEntriesWithDefault,
    buildNotesOnlyMergedEntry: buildNotesOnlyMergedEntryWithDefault,
    buildGitDiffOnlyMergedEntry: buildGitDiffOnlyMergedEntryWithDefault,
    normalizeViewPrsUserState,
    buildViewPrsDataManifest,
  } = dataHelpers;

  const {
    addActorName,
    normalizeActorLoginAliases,
    normalizeActorNameCacheEntries,
  } = actorHelpers;

  const {
    migrateLegacyViewPrsUserState,
  } = stateStorage;

  const {
    mergePrDetailFields,
  } = prDetailHelpers;

  /**
   * Checks if a path is inside a root directory.
   * 
   * @param {string} candidatePath - Path to check
   * @param {string} rootPath - Root directory
   * @returns {boolean} True if path is inside root
   */
  const isPathInside = (candidatePath, rootPath) => {
    const resolvedCandidate = path.resolve(candidatePath);
    const resolvedRoot = path.resolve(rootPath);
    const relative = path.relative(resolvedRoot, resolvedCandidate);
    return (
      relative === "" ||
      (!relative.startsWith("..") && !path.isAbsolute(relative))
    );
  };

  /**
   * Resolves the file path for a PR detail reference.
   * 
   * @param {Object} detailRef - Detail reference object
   * @returns {string} Resolved file path or empty string
   */
  const resolveViewPrsDetailFilePath = (detailRef) => {
    if (!isObject(detailRef)) {
      return "";
    }

    const rawFilePath = toTrimmedString(detailRef.file);
    if (!rawFilePath) {
      return "";
    }

    if (path.isAbsolute(rawFilePath)) {
      const absolutePath = path.resolve(rawFilePath);
      if (!isPathInside(absolutePath, viewPrsPrDetailDir)) {
        return "";
      }
      return absolutePath;
    }

    const resolvedPath = path.resolve(viewPrsDir, rawFilePath);
    if (!isPathInside(resolvedPath, viewPrsDir)) {
      return "";
    }
    return resolvedPath;
  };

  /**
   * Reads PR detail payload from a detail reference.
   * 
   * @param {Object} detailRef - Detail reference object
   * @returns {Object|null} Detail payload or null
   */
  const readViewPrsDetailPayload = (detailRef) => {
    const detailFilePath = resolveViewPrsDetailFilePath(detailRef);
    if (!detailFilePath || !fs.existsSync(detailFilePath)) {
      return null;
    }

    const parsed = readJsonFileIfExists(detailFilePath, null);
    return isObject(parsed) ? parsed : null;
  };

  /**
   * Hydrates a PR entry with detail payload if available.
   * 
   * @param {Object} entry - PR entry
   * @returns {Object} Hydrated entry
   */
  const hydrateViewPrsEntryWithDetail = (entry) => {
    if (!isObject(entry) || !isObject(entry.data)) {
      return entry;
    }

    const detailPayload = readViewPrsDetailPayload(entry.data.detailRef);
    if (!detailPayload) {
      return entry;
    }

    return {
      ...entry,
      data: mergePrDetailFields(entry.data, detailPayload),
    };
  };

  /**
   * Infers fallback repo for notes-only entries.
   * 
   * @param {Object} byPrNumberRaw - Raw PR data by number
   * @param {string} lastRun - Last run timestamp
   * @returns {string} Inferred fallback repo
   */
  const inferFallbackRepoForNotesOnlyEntries = (byPrNumberRaw = {}, lastRun) =>
    inferFallbackRepoForNotesOnlyEntriesWithDefault(
      byPrNumberRaw,
      lastRun,
      defaultViewPrsRepo,
    );

  /**
   * Builds a notes-only merged entry.
   * 
   * @param {string} prNumber - PR number
   * @param {string} notes - Notes content
   * @param {string} repo - Repository slug
   * @returns {Object} Notes-only entry
   */
  const buildNotesOnlyMergedEntry = (prNumber, notes, repo) =>
    buildNotesOnlyMergedEntryWithDefault(
      defaultViewPrsRepo,
      prNumber,
      notes,
      repo,
    );

  /**
   * Builds a git-diff-only merged entry.
   * 
   * @param {string} prNumber - PR number
   * @param {string} repo - Repository slug
   * @param {string} [fetchedAt=""] - Fetch timestamp
   * @returns {Object} Diff-only entry
   */
  const buildGitDiffOnlyMergedEntry = (prNumber, repo, fetchedAt = "") =>
    buildGitDiffOnlyMergedEntryWithDefault(
      defaultViewPrsRepo,
      prNumber,
      repo,
      fetchedAt,
    );

  /**
   * Collects missing PRs from diff cache.
   * 
   * @param {Object} [existingByPrNumber={}] - Existing PR data
   * @param {string} [fallbackRepo=""] - Fallback repository
   * @returns {Array} Array of missing PR objects
   */
  const collectMissingPrsFromDiffCache = (existingByPrNumber = {}, fallbackRepo = "") => {
    if (!fs.existsSync(viewPrsPrDiffDir)) {
      return [];
    }

    let fileNames;
    try {
      fileNames = fs.readdirSync(viewPrsPrDiffDir);
    } catch (_error) {
      return [];
    }

    const existingPrNumbers = new Set(Object.keys(existingByPrNumber || {}));
    const collected = [];

    fileNames
      .filter((name) => String(name || "").toLowerCase().endsWith(".json"))
      .forEach((fileName) => {
        const absolutePath = path.join(viewPrsPrDiffDir, fileName);
        const parsed = safeReadJsonFile(absolutePath, null);
        if (!isObject(parsed)) {
          return;
        }

        const prNumberFromPayload = String(parsed.prNumber || "").trim();
        const prNumberFromName = String(fileName || "").match(/__pr-(\d+)\.json$/i)?.[1] || "";
        const prNumber = prNumberFromPayload || prNumberFromName;
        if (!/^\d+$/.test(prNumber) || existingPrNumbers.has(prNumber)) {
          return;
        }

        const repo = isRepoSlug(parsed.repo) ? parsed.repo : fallbackRepo;
        collected.push({
          prNumber,
          repo,
          fetchedAt: toTrimmedString(parsed.fetchedAt),
        });
        existingPrNumbers.add(prNumber);
      });

    return collected;
  };

  /**
   * Reads actor login aliases from file.
   * 
   * @returns {Object} Actor login aliases
   */
  const readViewPrsActorLoginAliases = () =>
    normalizeActorLoginAliases(
      readJsonFileIfExists(viewPrsActorLoginAliasesFile, {}),
    );

  /**
   * Resolves actor name from GitHub API.
   * 
   * @param {string} login - GitHub login
   * @returns {string} Resolved name or empty string
   */
  const resolveActorNameFromGitHub = (login) => {
    const normalizedLogin = toTrimmedString(login);
    if (!normalizedLogin || normalizedLogin === "unknown") {
      return "";
    }
    if (normalizedLogin === "copilot-pull-request-reviewer") {
      return "Copilot";
    }

    const result = spawnSync(
      "gh",
      ["api", `users/${normalizedLogin}`, "--jq", '.name // ""'],
      {
        encoding: "utf8",
        timeout: 15000,
      },
    );

    if (result.status !== 0) {
      return "";
    }

    const resolved = normalizeDisplayName(result.stdout);
    if (!resolved || resolved === normalizedLogin) {
      return "";
    }

    return resolved;
  };

  /**
   * Builds actors map from PR data with name resolution.
   * 
   * @param {Object} [byPrNumberRaw={}] - Raw PR data by number
   * @returns {Object} Map of actor logins to display names
   */
  const buildViewPrsActorsMap = (byPrNumberRaw = {}) => {
    const actorNameCacheEntries = normalizeActorNameCacheEntries(
      readJsonFileIfExists(viewPrsActorNameCacheFile, {}),
    );
    const actorsMap = {
      ...actorNameCacheEntries,
    };
    const unresolvedLogins = new Set();
    const observedLogins = new Set();
    const fallbackNamesByLogin = {};

    const addActorNameOrTrack = (login, name) => {
      const normalizedLogin = toTrimmedString(login);
      const normalizedName = normalizeDisplayName(name);
      if (!normalizedLogin) {
        return;
      }

      observedLogins.add(normalizedLogin);
      fallbackNamesByLogin[normalizedLogin] =
        normalizedName || fallbackNamesByLogin[normalizedLogin] || normalizedLogin;

      addActorName(actorsMap, normalizedLogin, normalizedName);
      if (!actorsMap[normalizedLogin]) {
        unresolvedLogins.add(normalizedLogin);
      }
    };

    Object.values(byPrNumberRaw).forEach((entry) => {
      const row = entry?.data || {};
      addActorNameOrTrack(row.authorLogin, row.author);

      (Array.isArray(row.approvers) ? row.approvers : []).forEach((approver) => {
        addActorNameOrTrack(approver?.login, approver?.name);
      });

      (Array.isArray(row.comments) ? row.comments : []).forEach((comment) => {
        addActorNameOrTrack(
          comment?.authorLogin,
          comment?.authorName || comment?.author?.name,
        );
      });

      (Array.isArray(row.reviews) ? row.reviews : []).forEach((review) => {
        addActorNameOrTrack(
          review?.authorLogin,
          review?.authorName || review?.author?.name,
        );
      });

      (Array.isArray(row.reviewThreads) ? row.reviewThreads : []).forEach(
        (thread) => {
          (Array.isArray(thread?.comments) ? thread.comments : []).forEach(
            (comment) => {
              addActorNameOrTrack(
                comment?.authorLogin,
                comment?.authorName || comment?.author?.name,
              );
            },
          );
        },
      );

      (Array.isArray(row.commits) ? row.commits : []).forEach((commit) => {
        (Array.isArray(commit?.authors) ? commit.authors : []).forEach(
          (author) => {
            addActorNameOrTrack(author?.login, author?.name);
          },
        );
      });

      (Array.isArray(row.activityTimeline) ? row.activityTimeline : []).forEach(
        (bucket) => {
          addActorNameOrTrack(
            bucket?.actor,
            bucket?.author?.name || bucket?.author,
          );
          (Array.isArray(bucket?.events) ? bucket.events : []).forEach(
            (event) => {
              addActorNameOrTrack(
                event?.actor,
                event?.author?.name || event?.author || event?.actorName,
              );
            },
          );
        },
      );
    });

    let cacheUpdated = false;
    for (const login of unresolvedLogins) {
      if (actorsMap[login]) {
        continue;
      }
      const resolvedName = resolveActorNameFromGitHub(login);
      if (resolvedName) {
        actorsMap[login] = resolvedName;
        cacheUpdated = true;
      }
    }

    for (const login of observedLogins) {
      if (login === "unknown") {
        continue;
      }

      const resolvedOrFallbackName =
        toTrimmedString(actorsMap[login]) ||
        toTrimmedString(fallbackNamesByLogin[login]) ||
        login;

      if (!actorsMap[login]) {
        actorsMap[login] = resolvedOrFallbackName;
      }

      if (!toTrimmedString(actorNameCacheEntries[login])) {
        actorNameCacheEntries[login] = resolvedOrFallbackName;
        cacheUpdated = true;
      }
    }

    if (cacheUpdated) {
      const latestActorNameCacheEntries = normalizeActorNameCacheEntries(
        readJsonFileIfExists(viewPrsActorNameCacheFile, {}),
      );
      const mergedActorNameCacheEntries = {
        ...latestActorNameCacheEntries,
      };
      let mergedHasUpdates = false;

      Object.entries(actorNameCacheEntries).forEach(([login, displayName]) => {
        const normalizedLogin = toTrimmedString(login);
        const normalizedName = normalizeDisplayName(displayName);
        if (!normalizedLogin || !normalizedName) {
          return;
        }
        if (toTrimmedString(mergedActorNameCacheEntries[normalizedLogin])) {
          return;
        }

        mergedActorNameCacheEntries[normalizedLogin] = normalizedName;
        mergedHasUpdates = true;
      });

      if (mergedHasUpdates) {
        writeJsonFileBestEffort(
          viewPrsActorNameCacheFile,
          mergedActorNameCacheEntries,
        );
      }
    }

    return actorsMap;
  };

  /**
   * Reads complete view-prs data with all transformations applied.
   * 
   * @param {Function} getViewPrsViewerLogin - Function to get viewer login
   * @returns {Object} Complete view-prs data
   */
  const createReadViewPrsData = (getViewPrsViewerLogin) => {
    return () => {
      const rawUserState = readJsonFileIfExists(viewPrsUserStateFile, {});
      const normalizedUserState = normalizeViewPrsUserState(rawUserState);

      if (!fs.existsSync(viewPrsDataFile)) {
        return {
          byPrNumber: {},
          lastRun: null,
          viewerLogin: getViewPrsViewerLogin(),
          actorsMap: {},
          actorLoginAliases: readViewPrsActorLoginAliases(),
          ackByRepo: normalizedUserState.ackByRepo,
          reverifyByRepo: normalizedUserState.reverifyByRepo,
          inReviewByRepo: normalizedUserState.inReviewByRepo,
          flaggedByRepo: normalizedUserState.flaggedByRepo,
        };
      }

      try {
        const raw = fs.readFileSync(viewPrsDataFile, "utf8");
        const parsed = JSON.parse(raw);
        const mergedUserState = migrateLegacyViewPrsUserState(
          parsed,
          normalizedUserState,
        );
        const byPrNumberRaw = parsed.byPrNumber || {};
        const fallbackRepo = inferFallbackRepoForNotesOnlyEntries(
          byPrNumberRaw,
          parsed.lastRun,
        );
        const byPrNumber = Object.fromEntries(
          Object.entries(byPrNumberRaw)
            .filter(([, entry]) => !isViewPrsFixtureRow(entry))
            .map(([prNumber, entry]) => {
              if (!isObject(entry)) {
                return [prNumber, entry];
              }
              const hydratedEntry = hydrateViewPrsEntryWithDetail(entry);
              const notes = mergedUserState.notesByPrNumber[prNumber];
              if (!notes) {
                return [prNumber, hydratedEntry];
              }
              return [prNumber, { ...hydratedEntry, notes }];
            }),
        );
        collectMissingPrsFromDiffCache(byPrNumber, fallbackRepo).forEach(
          ({ prNumber, repo, fetchedAt }) => {
            const notes = mergedUserState.notesByPrNumber[prNumber] || null;
            const diffOnlyEntry = buildGitDiffOnlyMergedEntry(prNumber, repo, fetchedAt);
            byPrNumber[prNumber] = notes
              ? { ...diffOnlyEntry, notes }
              : diffOnlyEntry;
          },
        );
        Object.entries(mergedUserState.notesByPrNumber).forEach(
          ([prNumber, notes]) => {
            if (byPrNumber[prNumber]) {
              return;
            }
            byPrNumber[prNumber] = buildNotesOnlyMergedEntry(
              prNumber,
              notes,
              fallbackRepo,
            );
          },
        );
        return {
          byPrNumber,
          lastRun: parsed.lastRun || null,
          viewerLogin:
            Object.values(byPrNumber)
              .map((entry) => toTrimmedString(entry?.data?.viewerLogin))
              .find(Boolean) || getViewPrsViewerLogin(),
          actorsMap: buildViewPrsActorsMap(byPrNumber),
          actorLoginAliases: readViewPrsActorLoginAliases(),
          ackByRepo: mergedUserState.ackByRepo,
          reverifyByRepo: mergedUserState.reverifyByRepo,
          inReviewByRepo: mergedUserState.inReviewByRepo,
          flaggedByRepo: mergedUserState.flaggedByRepo,
        };
      } catch (error) {
        return {
          byPrNumber: {},
          lastRun: null,
          viewerLogin: getViewPrsViewerLogin(),
          actorsMap: {},
          actorLoginAliases: readViewPrsActorLoginAliases(),
          ackByRepo: normalizedUserState.ackByRepo,
          reverifyByRepo: normalizedUserState.reverifyByRepo,
          inReviewByRepo: normalizedUserState.inReviewByRepo,
          flaggedByRepo: normalizedUserState.flaggedByRepo,
          readError: error.message,
        };
      }
    };
  };

  /**
   * Gets metadata about view-prs data file.
   * 
   * @returns {Object} Data file metadata
   */
  const getViewPrsDataMeta = () => {
    try {
      if (!fs.existsSync(viewPrsDataFile)) {
        return {
          dataVersion: "missing",
          lastModifiedAt: null,
          sizeBytes: 0,
        };
      }

      const stats = fs.statSync(viewPrsDataFile);
      const mtimeMs = Number.isFinite(stats.mtimeMs)
        ? Math.trunc(stats.mtimeMs)
        : Date.parse(String(stats.mtime || "")) || 0;

      return {
        dataVersion: `${mtimeMs}:${stats.size}`,
        lastModifiedAt: mtimeMs > 0 ? new Date(mtimeMs).toISOString() : null,
        sizeBytes: Number.isFinite(stats.size) ? stats.size : 0,
      };
    } catch (error) {
      return {
        dataVersion: "unavailable",
        lastModifiedAt: null,
        sizeBytes: 0,
        readError: error.message,
      };
    }
  };

  /**
   * Gets view-prs data manifest.
   * 
   * @param {Function} readViewPrsData - Function to read data
   * @param {Object} [dataOverride=null] - Optional data override
   * @returns {Object} Data manifest
   */
  const getViewPrsDataManifest = (readViewPrsData, dataOverride = null) => {
    try {
      const data = dataOverride && isObject(dataOverride)
        ? dataOverride
        : readViewPrsData();
      return buildViewPrsDataManifest(data);
    } catch (_error) {
      return {};
    }
  };

  // Return public API
  return {
    isPathInside,
    resolveViewPrsDetailFilePath,
    readViewPrsDetailPayload,
    hydrateViewPrsEntryWithDetail,
    inferFallbackRepoForNotesOnlyEntries,
    buildNotesOnlyMergedEntry,
    buildGitDiffOnlyMergedEntry,
    collectMissingPrsFromDiffCache,
    readViewPrsActorLoginAliases,
    resolveActorNameFromGitHub,
    buildViewPrsActorsMap,
    createReadViewPrsData,
    getViewPrsDataMeta,
    getViewPrsDataManifest,
  };
}

module.exports = { createDataProcessingHelpers };
