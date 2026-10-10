// Phase 7 (see REACT_MIGRATION_PLAN.md): pure extraction of index.page.js's
// former getUserInitials/normalizeNameForInitials bodies into a DI-factory
// module, so PrApprovedCell.jsx can import it directly instead of reading
// window.getUserInitials. Byte-for-byte-logic-preserving move - genuinely
// zero-dependency (pure string manipulation), so there's nothing to inject.
export const { createPrUserInitialsHelpers } = (() => {
  const createPrUserInitialsHelpers = () => {
    const normalizeNameForInitials = (value) => {
      const raw = String(value || "")
        .replace(/\([^)]*\)/g, " ")
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (!raw) return "";

      if (raw.includes(",")) {
        const [lastNameRaw, firstNameRaw] = raw.split(",", 2);
        const firstName = String(firstNameRaw || "").trim();
        const lastName = String(lastNameRaw || "").trim();
        if (firstName && lastName) {
          return `${firstName} ${lastName}`.trim();
        }
      }

      return raw;
    };

    const getUserInitials = (displayName, fallbackLogin = "") => {
      const cleanedName = normalizeNameForInitials(displayName);
      const words = cleanedName.split(/\s+/).filter(Boolean);
      if (words.length >= 2) {
        return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
      }
      if (words.length === 1 && words[0].length >= 2) {
        return words[0].slice(0, 2).toUpperCase();
      }

      const login = String(fallbackLogin || "")
        .replace(/[_-]+/g, " ")
        .trim();
      const loginWords = login.split(/\s+/).filter(Boolean);
      if (loginWords.length >= 2) {
        return `${loginWords[0][0] || ""}${loginWords[1][0] || ""}`.toUpperCase();
      }
      return login.slice(0, 2).toUpperCase() || "--";
    };

    return {
      getUserInitials,
    };
  };

  return {
    createPrUserInitialsHelpers,
  };
})();
