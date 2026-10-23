// The "Auto update paused" indicator's status text and its links'
// accessible name (AutoRenderBlockedLinks).
export interface PrAutoRenderIndicatorDeps {
  getAuthorInsightsDisplayName?: (authorLogin: string) => string;
}

export interface BlockedStatusCounts {
  dirtyFieldCount?: number;
  unsavedNotesCount?: number;
  blockingAuthorInsightsCount?: number;
}

export interface BlockedLinksLabelInput {
  blockingPrLabel?: string;
  blockingAuthorInsightsLogins?: string[];
}

const createPrAutoRenderIndicatorHelpers = ({
  getAuthorInsightsDisplayName,
}: PrAutoRenderIndicatorDeps = {}) => {
  const getAuthorInsightsDisplayNameSafe =
    typeof getAuthorInsightsDisplayName === "function"
      ? getAuthorInsightsDisplayName
      : (authorLogin: string) => String(authorLogin || "").trim();

  const buildAutoRenderBlockedStatusText = ({
    dirtyFieldCount = 0,
    unsavedNotesCount = 0,
    blockingAuthorInsightsCount = 0,
  }: BlockedStatusCounts = {}): string => {
    const parts: string[] = [];
    if (Number(dirtyFieldCount) > 0) {
      parts.push(
        `${dirtyFieldCount} unsaved field${dirtyFieldCount === 1 ? "" : "s"}`,
      );
    }
    if (Number(unsavedNotesCount) > 0) {
      parts.push(
        `${unsavedNotesCount} note section${unsavedNotesCount === 1 ? "" : "s"} unsaved`,
      );
    }
    if (Number(blockingAuthorInsightsCount) > 0) {
      parts.push(
        `${blockingAuthorInsightsCount} author insight draft${blockingAuthorInsightsCount === 1 ? "" : "s"} unsaved`,
      );
    }
    return parts.length > 0
      ? `Auto updates are paused until changes are saved. ${parts.join(" | ")}`
      : "Auto updates are paused until changes are saved.";
  };

  const buildAutoRenderBlockedLinksAriaLabel = ({
    blockingPrLabel = "",
    blockingAuthorInsightsLogins = [],
  }: BlockedLinksLabelInput = {}): string => {
    const prLabel = String(blockingPrLabel || "").trim();
    if (prLabel) {
      return prLabel;
    }

    const logins = Array.isArray(blockingAuthorInsightsLogins)
      ? blockingAuthorInsightsLogins
      : [];
    if (logins.length === 0) {
      return "";
    }

    const displayNames = logins.map((authorLogin) =>
      getAuthorInsightsDisplayNameSafe(authorLogin),
    );
    return `Blocking author drafts: ${displayNames.join(", ")}`;
  };

  return {
    buildAutoRenderBlockedStatusText,
    buildAutoRenderBlockedLinksAriaLabel,
  };
};

export { createPrAutoRenderIndicatorHelpers };
