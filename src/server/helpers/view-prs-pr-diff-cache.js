const createViewPrsPrDiffCache = ({
  fs,
  safeReadJsonFile,
  toTrimmedString,
  isRepoSlug,
  getPrDiffCommitFingerprint,
  extractRawDiffText,
  buildPrDiffCacheFilePath,
  runViewPrsCommand,
  viewPrsPrDiffDir,
  viewPrsPrDiffTimeoutMs,
  viewPrsPrDiffConcurrency,
  allowDestructiveWriteRaw = process.env.VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE,
}) => {
  const isDestructiveWriteAllowed =
    /^(1|true|yes)$/i.test(String(allowDestructiveWriteRaw || "").trim());
  const isBackgroundRefreshDisabled = /^(1|true|yes)$/i.test(
    String(process.env.VIEW_PRS_DISABLE_BACKGROUND_DIFF_REFRESH || "").trim(),
  );

  const getPrDiffCacheFilePath = (repo, prNumber) =>
    buildPrDiffCacheFilePath(viewPrsPrDiffDir, repo, prNumber);

  const readPrDiffCache = (repo, prNumber) => {
    const filePath = getPrDiffCacheFilePath(repo, prNumber);
    const parsed = safeReadJsonFile(filePath, null);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return {
      ...parsed,
      filePath,
    };
  };

  const fetchPrDiffText = async (repo, prNumber) => {
    const safeRepo = toTrimmedString(repo);
    const safePr = String(prNumber || "").trim();
    const result = await runViewPrsCommand(
      "gh",
      [
        "api",
        "-H",
        "Accept: application/vnd.github.v3.diff",
        `repos/${safeRepo}/pulls/${safePr}`,
      ],
      20 * 1024 * 1024,
      { timeoutMs: viewPrsPrDiffTimeoutMs },
    );
    return extractRawDiffText(result?.stdout);
  };

  const writePrDiffCache = (repo, prNumber, payload) => {
    fs.mkdirSync(viewPrsPrDiffDir, { recursive: true });
    const filePath = getPrDiffCacheFilePath(repo, prNumber);
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
    return filePath;
  };

  const buildPrDiffQueueKey = (repo, prNumber) => `${repo}#${prNumber}`;
  const viewPrsPrDiffQueue = [];
  const viewPrsPrDiffQueued = new Set();
  let viewPrsPrDiffActiveCount = 0;

  const syncPrDiffForEntry = async (entry, { force = false } = {}) => {
    const repo = toTrimmedString(entry?.repo);
    const prNumber = String(entry?.prNumber || entry?.data?.number || "").trim();
    if (!isRepoSlug(repo) || !/^\d+$/.test(prNumber)) {
      return { ok: false, error: "Invalid repo/prNumber" };
    }

    const commitFingerprint = getPrDiffCommitFingerprint(entry);
    const cached = readPrDiffCache(repo, prNumber);
    if (
      !force &&
      cached &&
      String(cached.commitFingerprint || "") === commitFingerprint &&
      typeof cached.diffText === "string"
    ) {
      return {
        ok: true,
        source: "cache",
        repo,
        prNumber,
        commitFingerprint,
        fetchedAt: cached.fetchedAt || null,
        filePath: cached.filePath,
        diffText: cached.diffText,
      };
    }

    try {
      const diffText = await fetchPrDiffText(repo, prNumber);
      const existingDiffText =
        cached && typeof cached.diffText === "string" ? cached.diffText.trim() : "";
      const incomingDiffText =
        typeof diffText === "string" ? diffText.trim() : "";

      if (
        !isDestructiveWriteAllowed &&
        existingDiffText.length > 0 &&
        incomingDiffText.length === 0
      ) {
        return {
          ok: true,
          source: "guarded-cache",
          repo,
          prNumber,
          commitFingerprint: cached.commitFingerprint || commitFingerprint,
          fetchedAt: cached.fetchedAt || null,
          filePath: cached.filePath,
          diffText: cached.diffText,
          stale: true,
          warning:
            "Protected pr-diff overwrite blocked: incoming diff text was empty while cached diff was non-empty",
        };
      }

      const payload = {
        repo,
        prNumber,
        commitFingerprint,
        fetchedAt: new Date().toISOString(),
        diffText,
      };
      const filePath = writePrDiffCache(repo, prNumber, payload);
      return {
        ok: true,
        source: "fresh",
        ...payload,
        filePath,
      };
    } catch (error) {
      if (cached && typeof cached.diffText === "string") {
        return {
          ok: true,
          source: "stale-cache",
          repo,
          prNumber,
          commitFingerprint: cached.commitFingerprint || commitFingerprint,
          fetchedAt: cached.fetchedAt || null,
          filePath: cached.filePath,
          diffText: cached.diffText,
          stale: true,
          warning: error?.message || "Failed to refresh diff",
        };
      }
      return {
        ok: false,
        error: error?.message || "Failed to fetch diff",
        repo,
        prNumber,
        commitFingerprint,
      };
    }
  };

  const drainPrDiffQueue = () => {
    while (
      viewPrsPrDiffActiveCount < viewPrsPrDiffConcurrency &&
      viewPrsPrDiffQueue.length > 0
    ) {
      const job = viewPrsPrDiffQueue.shift();
      if (!job) break;
      viewPrsPrDiffActiveCount += 1;

      void syncPrDiffForEntry(job.entry, { force: job.force })
        .catch(() => {
          // Ignore background refresh failures; on-demand /diff can retry.
        })
        .finally(() => {
          viewPrsPrDiffActiveCount = Math.max(0, viewPrsPrDiffActiveCount - 1);
          viewPrsPrDiffQueued.delete(job.key);
          drainPrDiffQueue();
        });
    }
  };

  const enqueuePrDiffRefresh = (entry, { force = false } = {}) => {
    if (isBackgroundRefreshDisabled || viewPrsPrDiffConcurrency < 1) {
      return;
    }

    const repo = toTrimmedString(entry?.repo);
    const prNumber = String(entry?.prNumber || entry?.data?.number || "").trim();
    if (!isRepoSlug(repo) || !/^\d+$/.test(prNumber)) {
      return;
    }

    const key = buildPrDiffQueueKey(repo, prNumber);
    if (viewPrsPrDiffQueued.has(key)) {
      return;
    }

    viewPrsPrDiffQueued.add(key);
    viewPrsPrDiffQueue.push({ entry, force, key });
    drainPrDiffQueue();
  };

  const enqueuePrDiffRefreshForData = (data) => {
    Object.values(data?.byPrNumber || {}).forEach((entry) => {
      enqueuePrDiffRefresh(entry);
    });
  };

  return {
    getPrDiffCacheFilePath,
    readPrDiffCache,
    syncPrDiffForEntry,
    enqueuePrDiffRefresh,
    enqueuePrDiffRefreshForData,
  };
};

module.exports = {
  createViewPrsPrDiffCache,
};
