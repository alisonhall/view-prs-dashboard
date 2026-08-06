(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsAssignedUsersHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrAssignedUsersHelpers = ({
    asArray,
    normalizeActorLogin,
    resolveActorDisplayName,
  } = {}) => {
    const asArraySafe = typeof asArray === "function" ? asArray : (value) => (Array.isArray(value) ? value : []);
    const normalizeActorLoginSafe =
      typeof normalizeActorLogin === "function"
        ? normalizeActorLogin
        : (value) => String(value || "").trim();
    const resolveActorDisplayNameSafe =
      typeof resolveActorDisplayName === "function"
        ? resolveActorDisplayName
        : (login, _actorsMap, fallbackName) => String(fallbackName || login || "").trim();

    const collectAssignedUsers = (row = {}) => {
      const ordered = [];
      const seen = new Set();

      const addAssigned = (login, name = "") => {
        const normalizedLogin = normalizeActorLoginSafe(login);
        if (!normalizedLogin || seen.has(normalizedLogin)) return;
        seen.add(normalizedLogin);
        ordered.push({ login: normalizedLogin, name: String(name || "").trim() });
      };

      const addFromValue = (value) => {
        if (!value) return;
        if (Array.isArray(value)) {
          value.forEach(addFromValue);
          return;
        }
        if (typeof value === "string") {
          addAssigned(value, "");
          return;
        }
        if (typeof value !== "object") return;

        const login =
          value.login ||
          value.userLogin ||
          value.assigneeLogin ||
          value.username ||
          value.user;
        const name = value.name || value.userName || value.assigneeName || "";
        if (typeof login === "string") {
          addAssigned(login, name);
        } else if (String(name || "").trim()) {
          addAssigned(name, name);
        }
        if (value.user && typeof value.user === "object") {
          addFromValue(value.user);
        }
      };

      [
        row.assignees,
        row.assigned,
        row.assignedUsers,
        row.assignedTo,
        row.assignedUser,
      ].forEach(addFromValue);

      const addFromAssignmentEvent = (event) => {
        const type = String(event?.type || "")
          .trim()
          .toLowerCase();
        if (!type.includes("assign")) return;

        const beforeCount = ordered.length;
        addFromValue(event?.assignee);
        addFromValue(event?.assignees);
        addFromValue({
          login: event?.assigneeLogin,
          name: event?.assigneeName,
        });

        if (ordered.length === beforeCount) {
          addFromValue({
            login: event?.actor,
            name: event?.author?.name || event?.author || event?.actorName,
          });
        }
      };

      asArraySafe(row.activityTimeline).forEach((bucket) => {
        asArraySafe(bucket?.events).forEach(addFromAssignmentEvent);
      });
      asArraySafe(row.activityEvents).forEach(addFromAssignmentEvent);

      return ordered;
    };

    const formatAssignedUsersDisplay = (row, actorsMap = {}) => {
      const assignees = collectAssignedUsers(row);
      if (!assignees.length) return "-";
      return assignees
        .map((assignee) => {
          const login = String(assignee?.login || "").trim();
          const name = resolveActorDisplayNameSafe(login, actorsMap, assignee?.name);
          return `${name}${login && login !== name ? ` (${login})` : ""}`;
        })
        .join("; ");
    };

    return {
      collectAssignedUsers,
      formatAssignedUsersDisplay,
    };
  };

  return {
    createPrAssignedUsersHelpers,
  };
});
