const path = require("path");

const createViewPrsActorCacheHelpers = ({
  fs,
  readJsonFileIfExists,
  viewPrsActorNameCacheFile,
  viewPrsActorLoginAliasesFile,
} = {}) => {
  const fsSafe = fs || require("fs");
  const readJsonFileIfExistsSafe =
    typeof readJsonFileIfExists === "function"
      ? readJsonFileIfExists
      : (_filePath, fallbackValue) => fallbackValue;

  const normalizeActorNameCacheEntries = (value = {}) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }

    const normalized = {};
    Object.entries(value).forEach(([actorId, displayName]) => {
      const id = String(actorId || "").trim();
      const name = String(displayName || "").trim();
      if (!id || !name) {
        return;
      }
      normalized[id] = name;
    });

    return normalized;
  };

  const normalizeActorLoginAliasEntries = (value = {}) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }

    const normalized = {};
    Object.entries(value).forEach(([actorId, canonicalId]) => {
      const id = String(actorId || "").trim();
      const canonical = String(canonicalId || "").trim();
      if (!id || !canonical || id === canonical) {
        return;
      }
      normalized[id] = canonical;
    });

    return normalized;
  };

  const ensureActorNameCacheFile = () => {
    const cacheFilePath = String(viewPrsActorNameCacheFile || "").trim();
    if (!cacheFilePath) {
      throw new Error("Actor name cache file path is not configured");
    }

    fsSafe.mkdirSync(path.dirname(cacheFilePath), { recursive: true });
    if (!fsSafe.existsSync(cacheFilePath)) {
      fsSafe.writeFileSync(cacheFilePath, "{}\n", "utf8");
    }
    return cacheFilePath;
  };

  const readActorNameCacheEntries = () => {
    const cacheFilePath = ensureActorNameCacheFile();
    const raw = readJsonFileIfExistsSafe(cacheFilePath, {});
    return normalizeActorNameCacheEntries(raw);
  };

  const writeActorNameCacheEntries = (entries = {}) => {
    const cacheFilePath = ensureActorNameCacheFile();
    fsSafe.writeFileSync(cacheFilePath, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
    return entries;
  };

  const ensureActorLoginAliasesFile = () => {
    const aliasesFilePath = String(viewPrsActorLoginAliasesFile || "").trim();
    if (!aliasesFilePath) {
      throw new Error("Actor login aliases file path is not configured");
    }

    fsSafe.mkdirSync(path.dirname(aliasesFilePath), { recursive: true });
    if (!fsSafe.existsSync(aliasesFilePath)) {
      fsSafe.writeFileSync(aliasesFilePath, "{}\n", "utf8");
    }
    return aliasesFilePath;
  };

  const readActorLoginAliasEntries = () => {
    const aliasesFilePath = ensureActorLoginAliasesFile();
    const raw = readJsonFileIfExistsSafe(aliasesFilePath, {});
    return normalizeActorLoginAliasEntries(raw);
  };

  const writeActorLoginAliasEntries = (entries = {}) => {
    const aliasesFilePath = ensureActorLoginAliasesFile();
    fsSafe.writeFileSync(aliasesFilePath, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
    return entries;
  };

  return {
    normalizeActorNameCacheEntries,
    normalizeActorLoginAliasEntries,
    ensureActorNameCacheFile,
    readActorNameCacheEntries,
    writeActorNameCacheEntries,
    ensureActorLoginAliasesFile,
    readActorLoginAliasEntries,
    writeActorLoginAliasEntries,
  };
};

module.exports = {
  createViewPrsActorCacheHelpers,
};
