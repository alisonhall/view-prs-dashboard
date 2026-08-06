(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsApprovedCellHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrApprovedCellHelpers = ({
    approvedClass,
    collectAssignedUsers,
    getCurrentViewerLogin,
    resolveActorDisplayName,
    getUserInitials,
    getOpenConversationCountWithMe,
    toCount,
    documentRef,
  } = {}) => {
    const approvedClassSafe =
      typeof approvedClass === "function" ? approvedClass : () => "";
    const collectAssignedUsersSafe =
      typeof collectAssignedUsers === "function" ? collectAssignedUsers : () => [];
    const getCurrentViewerLoginSafe =
      typeof getCurrentViewerLogin === "function"
        ? getCurrentViewerLogin
        : () => "";
    const resolveActorDisplayNameSafe =
      typeof resolveActorDisplayName === "function"
        ? resolveActorDisplayName
        : (login, _actorsMap, fallbackName) =>
            String(fallbackName || login || "").trim();
    const getUserInitialsSafe =
      typeof getUserInitials === "function"
        ? getUserInitials
        : (displayName, login) => String(displayName || login || "").slice(0, 2);
    const getOpenConversationCountWithMeSafe =
      typeof getOpenConversationCountWithMe === "function"
        ? getOpenConversationCountWithMe
        : () => ({ count: 0, isViewerSpecific: false });
    const toCountSafe =
      typeof toCount === "function"
        ? toCount
        : (value) => {
            const parsed = Number.parseInt(String(value ?? "").trim(), 10);
            return Number.isFinite(parsed) ? parsed : 0;
          };

    const getDocument = () =>
      documentRef || (typeof document !== "undefined" ? document : null);

    const createApprovedCell = (row, actorsMap = {}) => {
      const doc = getDocument();
      if (!doc || typeof doc.createElement !== "function") {
        return null;
      }

      const td = doc.createElement("td");
      td.className = ["approved-cell", approvedClassSafe(row?.approved)]
        .filter(Boolean)
        .join(" ");

      const summary = doc.createElement("div");
      summary.className = "approved-cell-summary";
      summary.textContent = `${row?.approved || "-"} (${row?.approvalCount || "0"})`;
      td.appendChild(summary);

      const assignees = collectAssignedUsersSafe(row);
      if (assignees.length > 0) {
        const badges = doc.createElement("div");
        badges.className = "approved-assigned-badges";
        badges.title = "Assigned users";

        const currentViewerLogin = String(getCurrentViewerLoginSafe() || "")
          .trim()
          .toLowerCase();

        assignees.forEach((assignee) => {
          const login = String(assignee?.login || "").trim();
          if (!login) return;

          const badge = doc.createElement("span");
          const isAssignedToViewer =
            !!currentViewerLogin && login.toLowerCase() === currentViewerLogin;
          badge.className = [
            "approved-assigned-badge",
            isAssignedToViewer ? "approved-assigned-badge-me" : "",
          ]
            .filter(Boolean)
            .join(" ");
          const displayName = resolveActorDisplayNameSafe(
            login,
            actorsMap,
            assignee?.name,
          );
          badge.textContent = getUserInitialsSafe(displayName, login);
          badge.title = `${displayName}${isAssignedToViewer ? " (you)" : ""}`;
          badges.appendChild(badge);
        });

        if (badges.children.length > 0) {
          td.appendChild(badges);
        }
      }

      const openConversationCountResult = getOpenConversationCountWithMeSafe(row);
      const openConversationCount = toCountSafe(openConversationCountResult?.count);
      if (openConversationCount > 0) {
        const conversations = doc.createElement("div");
        conversations.className =
          "approved-cell-detail approved-open-conversations";
        const suffix = openConversationCountResult?.isViewerSpecific
          ? " with me"
          : "";
        conversations.textContent = `${openConversationCount} open conversation${openConversationCount === 1 ? "" : "s"}${suffix}`;
        td.appendChild(conversations);
      }

      return td;
    };

    return {
      createApprovedCell,
    };
  };

  return {
    createPrApprovedCellHelpers,
  };
});
