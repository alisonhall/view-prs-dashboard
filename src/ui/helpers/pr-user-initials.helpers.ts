// Two-letter initials for a person's avatar badge (PrApprovedCell and the
// insights display), from their display name or, failing that, their login.
// Pure string manipulation, so the factory takes no dependencies.

export type GetUserInitials = (
  displayName: string | null | undefined,
  fallbackLogin?: string | null,
) => string;

export interface PrUserInitialsHelpers {
  getUserInitials: GetUserInitials;
}

const createPrUserInitialsHelpers = (): PrUserInitialsHelpers => {
  const normalizeNameForInitials = (value: string | null | undefined): string => {
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

  const getUserInitials: GetUserInitials = (displayName, fallbackLogin = "") => {
    const cleanedName = normalizeNameForInitials(displayName);
    const [firstWord = "", secondWord] = cleanedName.split(/\s+/).filter(Boolean);
    if (secondWord !== undefined) {
      return `${firstWord[0] || ""}${secondWord[0] || ""}`.toUpperCase();
    }
    if (firstWord.length >= 2) {
      return firstWord.slice(0, 2).toUpperCase();
    }

    const login = String(fallbackLogin || "")
      .replace(/[_-]+/g, " ")
      .trim();
    const [firstLoginWord = "", secondLoginWord] = login.split(/\s+/).filter(Boolean);
    if (secondLoginWord !== undefined) {
      return `${firstLoginWord[0] || ""}${secondLoginWord[0] || ""}`.toUpperCase();
    }
    return login.slice(0, 2).toUpperCase() || "--";
  };

  return {
    getUserInitials,
  };
};

export { createPrUserInitialsHelpers };
