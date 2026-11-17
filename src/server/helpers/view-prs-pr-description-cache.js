// A PR's description (its body on GitHub), for the detail pane's
// Description tab: fetched with `gh pr view --json body` the first time
// it's asked for, and kept per PR in viewPrsPrDescriptionDir. A copy is
// used while the PR's sourceUpdatedAt is what it was fetched for - an edit
// to the description moves GitHub's updatedAt, so the next full refresh
// moves the row's, and the next ask fetches again. A fetch that fails
// falls back to the copy, said to be stale; with no copy it's an error.
const createViewPrsPrDescriptionCache = ({
  fs,
  safeReadJsonFile,
  toTrimmedString,
  isRepoSlug,
  buildCacheFilePath,
  runViewPrsCommand,
  viewPrsPrDescriptionDir,
  timeoutMs,
  // (repo) => the env gh needs for it (GH_HOST for a GitHub Enterprise
  // repo); none without it.
  getRepoGhEnv = () => ({}),
}) => {
  const cacheFilePath = (repo, prNumber) => buildCacheFilePath(viewPrsPrDescriptionDir, repo, prNumber);

  const readCached = (repo, prNumber) => {
    const parsed = safeReadJsonFile(cacheFilePath(repo, prNumber), null);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) && typeof parsed.body === "string" ? parsed : null;
  };

  // Through a temp file and a rename, as the diffs: no half-written file is
  // ever read.
  const writeCached = (repo, prNumber, payload) => {
    fs.mkdirSync(viewPrsPrDescriptionDir, { recursive: true });
    const filePath = cacheFilePath(repo, prNumber);
    const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), "utf8");
    fs.renameSync(tempPath, filePath);
  };

  const fetchBody = async (repo, prNumber) => {
    const result = await runViewPrsCommand("gh", ["pr", "view", prNumber, "-R", repo, "--json", "body"], 5 * 1024 * 1024, {
      timeoutMs,
      env: getRepoGhEnv(repo),
    });
    const parsed = JSON.parse(String(result?.stdout || "").trim() || "{}");
    return typeof parsed?.body === "string" ? parsed.body : "";
  };

  const getPrDescription = async (entry) => {
    const repo = toTrimmedString(entry?.repo);
    const prNumber = String(entry?.prNumber || entry?.data?.number || "").trim();
    if (!isRepoSlug(repo) || !/^\d+$/.test(prNumber)) return { ok: false, error: "Invalid repo/prNumber" };

    const forUpdatedAt = toTrimmedString(entry?.data?.sourceUpdatedAt);
    const cached = readCached(repo, prNumber);
    const fromCache = (extra = {}) => ({ ok: true, repo, prNumber, body: cached.body, fetchedAt: cached.fetchedAt || null, ...extra });
    if (cached && forUpdatedAt && cached.forUpdatedAt === forUpdatedAt) return fromCache({ source: "cache" });

    try {
      const body = await fetchBody(repo, prNumber);
      const payload = { repo, prNumber, forUpdatedAt, fetchedAt: new Date().toISOString(), body };
      writeCached(repo, prNumber, payload);
      return { ok: true, source: "fresh", repo, prNumber, body, fetchedAt: payload.fetchedAt };
    } catch (error) {
      const warning = error?.message || "Couldn't fetch the description";
      return cached ? fromCache({ source: "stale-cache", stale: true, warning }) : { ok: false, repo, prNumber, error: warning };
    }
  };

  return { getPrDescription };
};

module.exports = {
  createViewPrsPrDescriptionCache,
};
