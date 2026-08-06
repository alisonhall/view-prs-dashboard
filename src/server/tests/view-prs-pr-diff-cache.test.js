const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  createViewPrsPrDiffCache,
} = require("../helpers/view-prs-pr-diff-cache");
const {
  getPrDiffCacheFilePath,
} = require("../helpers/view-prs-data-helpers");

const safeReadJsonFile = (filePath, fallback = null) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_error) {
    return fallback;
  }
};

const toTrimmedString = (value) => String(value ?? "").trim();

const isRepoSlug = (value) => /^[^/]+\/[^/]+$/.test(String(value || ""));

describe("view-prs pr-diff cache protection", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "view-prs-pr-diff-"));
  });

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("keeps existing non-empty diff when refresh returns empty text by default", async () => {
    const cache = createViewPrsPrDiffCache({
      fs,
      safeReadJsonFile,
      toTrimmedString,
      isRepoSlug,
      getPrDiffCommitFingerprint: (entry) => String(entry?.fingerprint || ""),
      extractRawDiffText: (stdout) => String(stdout || ""),
      buildPrDiffCacheFilePath: getPrDiffCacheFilePath,
      runViewPrsCommand: async () => ({ stdout: "" }),
      viewPrsPrDiffDir: tmpDir,
      viewPrsPrDiffTimeoutMs: 5000,
      viewPrsPrDiffConcurrency: 1,
      allowDestructiveWriteRaw: "",
    });

    const existingPath = cache.getPrDiffCacheFilePath("owner/repo", "123");
    fs.mkdirSync(path.dirname(existingPath), { recursive: true });
    fs.writeFileSync(
      existingPath,
      JSON.stringify(
        {
          repo: "owner/repo",
          prNumber: "123",
          commitFingerprint: "old-fp",
          fetchedAt: "2026-06-02T00:00:00.000Z",
          diffText: "diff --git a/file.js b/file.js\n+line",
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = await cache.syncPrDiffForEntry(
      {
        repo: "owner/repo",
        prNumber: "123",
        fingerprint: "new-fp",
      },
      { force: true },
    );

    expect(result.ok).toBe(true);
    expect(result.source).toBe("guarded-cache");
    expect(result.stale).toBe(true);
    expect(result.diffText).toContain("diff --git");

    const persisted = JSON.parse(fs.readFileSync(existingPath, "utf8"));
    expect(persisted.diffText).toContain("diff --git");
    expect(persisted.commitFingerprint).toBe("old-fp");
  });

  test("allows empty diff overwrite when destructive writes are explicitly enabled", async () => {
    const cache = createViewPrsPrDiffCache({
      fs,
      safeReadJsonFile,
      toTrimmedString,
      isRepoSlug,
      getPrDiffCommitFingerprint: (entry) => String(entry?.fingerprint || ""),
      extractRawDiffText: (stdout) => String(stdout || ""),
      buildPrDiffCacheFilePath: getPrDiffCacheFilePath,
      runViewPrsCommand: async () => ({ stdout: "" }),
      viewPrsPrDiffDir: tmpDir,
      viewPrsPrDiffTimeoutMs: 5000,
      viewPrsPrDiffConcurrency: 1,
      allowDestructiveWriteRaw: "true",
    });

    const existingPath = cache.getPrDiffCacheFilePath("owner/repo", "123");
    fs.mkdirSync(path.dirname(existingPath), { recursive: true });
    fs.writeFileSync(
      existingPath,
      JSON.stringify(
        {
          repo: "owner/repo",
          prNumber: "123",
          commitFingerprint: "old-fp",
          fetchedAt: "2026-06-02T00:00:00.000Z",
          diffText: "diff --git a/file.js b/file.js\n+line",
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = await cache.syncPrDiffForEntry(
      {
        repo: "owner/repo",
        prNumber: "123",
        fingerprint: "new-fp",
      },
      { force: true },
    );

    expect(result.ok).toBe(true);
    expect(result.source).toBe("fresh");
    expect(result.diffText).toBe("");

    const persisted = JSON.parse(fs.readFileSync(existingPath, "utf8"));
    expect(persisted.diffText).toBe("");
    expect(persisted.commitFingerprint).toBe("new-fp");
  });

  test("given the pr-diffs folder is missing, when syncPrDiffForEntry writes fresh diff content, then the folder is recreated", async () => {
    const cache = createViewPrsPrDiffCache({
      fs,
      safeReadJsonFile,
      toTrimmedString,
      isRepoSlug,
      getPrDiffCommitFingerprint: (entry) => String(entry?.fingerprint || ""),
      extractRawDiffText: (stdout) => String(stdout || ""),
      buildPrDiffCacheFilePath: getPrDiffCacheFilePath,
      runViewPrsCommand: async () => ({ stdout: "diff --git a/a.js b/a.js\n+line\n" }),
      viewPrsPrDiffDir: tmpDir,
      viewPrsPrDiffTimeoutMs: 5000,
      viewPrsPrDiffConcurrency: 1,
      allowDestructiveWriteRaw: "",
    });

    fs.rmSync(tmpDir, { recursive: true, force: true });

    const result = await cache.syncPrDiffForEntry(
      {
        repo: "owner/repo",
        prNumber: "456",
        fingerprint: "fp-456",
      },
      { force: true },
    );

    expect(result.ok).toBe(true);
    expect(result.source).toBe("fresh");
    expect(fs.existsSync(tmpDir)).toBe(true);

    const writtenPath = cache.getPrDiffCacheFilePath("owner/repo", "456");
    expect(fs.existsSync(writtenPath)).toBe(true);
  });
});
