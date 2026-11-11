const createViewPrsActorHelpers = ({ toTrimmedString } = {}) => {
  const toTrimmedStringSafe =
    typeof toTrimmedString === "function"
      ? toTrimmedString
      : (value) => String(value ?? "").trim();

  // A display name as GitHub gives it, tidied: "Last, First" becomes
  // "First Last", and runs of spaces one.
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

  return {
    normalizeDisplayName,
  };
};

module.exports = {
  createViewPrsActorHelpers,
};
