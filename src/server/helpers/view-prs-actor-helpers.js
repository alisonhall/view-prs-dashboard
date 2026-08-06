const createViewPrsActorHelpers = ({ toTrimmedString } = {}) => {
  const toTrimmedStringSafe =
    typeof toTrimmedString === "function"
      ? toTrimmedString
      : (value) => String(value ?? "").trim();

  const addActorName = (actorsMap, login, name) => {
    const normalizedLogin = toTrimmedStringSafe(login);
    const normalizedName = toTrimmedStringSafe(name);
    if (!normalizedLogin || !normalizedName) {
      return;
    }
    if (normalizedName === normalizedLogin) {
      return;
    }
    if (!actorsMap[normalizedLogin]) {
      actorsMap[normalizedLogin] = normalizedName;
    }
  };

  const normalizeDisplayName = (value) => {
    const raw = toTrimmedStringSafe(value);
    if (!raw) {
      return "";
    }
    if (raw.includes(",")) {
      const [lastName, ...rest] = raw.split(",");
      const firstName = rest.join(",").trim();
      const normalizedLastName = lastName.trim();
      if (firstName && normalizedLastName) {
        return `${firstName} ${normalizedLastName}`.trim();
      }
    }
    return raw.replace(/\s+/g, " ").trim();
  };

  const normalizeActorLoginAliases = (value = {}) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }

    const normalized = {};
    Object.entries(value).forEach(([aliasLogin, canonicalLogin]) => {
      const alias = toTrimmedStringSafe(aliasLogin);
      const canonical = toTrimmedStringSafe(canonicalLogin);
      if (!alias || !canonical || alias === canonical) {
        return;
      }
      normalized[alias] = canonical;
    });

    return normalized;
  };

  const normalizeActorNameCacheEntries = (value = {}) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }

    const normalized = {};
    Object.entries(value).forEach(([actorId, displayName]) => {
      const id = toTrimmedStringSafe(actorId);
      const name = normalizeDisplayName(displayName);
      if (!id || !name) {
        return;
      }
      normalized[id] = name;
    });

    return normalized;
  };

  const resolveCanonicalActorLogin = (login, actorLoginAliases = {}) => {
    const normalizedLogin = toTrimmedStringSafe(login);
    if (!normalizedLogin) {
      return "";
    }

    let currentLogin = normalizedLogin;
    const seen = new Set([currentLogin]);
    while (true) {
      const nextLogin = toTrimmedStringSafe(actorLoginAliases?.[currentLogin]);
      if (!nextLogin || seen.has(nextLogin)) {
        return currentLogin;
      }
      currentLogin = nextLogin;
      seen.add(currentLogin);
    }
  };

  return {
    addActorName,
    normalizeDisplayName,
    normalizeActorLoginAliases,
    normalizeActorNameCacheEntries,
    resolveCanonicalActorLogin,
  };
};

module.exports = {
  createViewPrsActorHelpers,
};
