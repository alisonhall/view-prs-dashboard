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
    collectRequestedReviewers,
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
    const collectRequestedReviewersSafe =
      typeof collectRequestedReviewers === "function" ? collectRequestedReviewers : () => [];
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
      const reviewers = collectRequestedReviewersSafe(row);
      const assigneeLogins = new Set(
        assignees
          .map((assignee) => String(assignee?.login || "").trim().toLowerCase())
          .filter(Boolean),
      );
      const currentViewerLogin = String(getCurrentViewerLoginSafe() || "")
        .trim()
        .toLowerCase();
      const reviewerLogins = new Set(
        reviewers
          .map((reviewer) => String(reviewer?.login || "").trim().toLowerCase())
          .filter(Boolean),
      );
      // Only assignees get a badge - a badge per requested reviewer took up
      // too much space on PRs with a lot of reviewers. The one exception: if
      // the viewer themselves is a requested reviewer but not an assignee,
      // still show a single badge for just them, so there's still a way to
      // tell "I'm reviewing this" from this column without listing every
      // reviewer.
      const viewerReviewerOnly =
        currentViewerLogin && reviewerLogins.has(currentViewerLogin) && !assigneeLogins.has(currentViewerLogin)
          ? reviewers.find(
              (reviewer) => String(reviewer?.login || "").trim().toLowerCase() === currentViewerLogin,
            )
          : null;
      const badgeUsers = viewerReviewerOnly ? [...assignees, viewerReviewerOnly] : assignees;

      if (badgeUsers.length > 0) {
        const badges = doc.createElement("div");
        badges.className = "approved-assigned-badges";
        badges.title = "Assigned users";

        badgeUsers.forEach((badgeUser) => {
          const login = String(badgeUser?.login || "").trim();
          if (!login) return;

          const badge = doc.createElement("span");
          const isAssignedToViewer =
            !!currentViewerLogin && login.toLowerCase() === currentViewerLogin;
          const isReviewer = reviewerLogins.has(login.toLowerCase());
          const isAssigned = assigneeLogins.has(login.toLowerCase());
          badge.className = [
            "approved-assigned-badge",
            isAssignedToViewer ? "approved-assigned-badge-me" : "",
            isReviewer ? "approved-assigned-badge-reviewer" : "",
            isReviewer && !isAssigned ? "approved-assigned-badge-reviewer-only" : "",
          ]
            .filter(Boolean)
            .join(" ");
          const displayName = resolveActorDisplayNameSafe(
            login,
            actorsMap,
            badgeUser?.name,
          );
          badge.textContent = getUserInitialsSafe(displayName, login);
          badge.title = `${displayName}${isAssignedToViewer ? " (you)" : ""}${isReviewer ? " (reviewer)" : ""}${!isAssigned ? " (not assigned)" : ""}`;
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
