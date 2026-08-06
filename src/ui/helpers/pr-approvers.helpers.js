(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsApproversHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrApproversHelpers = ({
    asArray,
    getPreferredActorKey,
    resolveActorDisplayName,
    formatIsoDatetime,
  } = {}) => {
    const asArraySafe = typeof asArray === "function" ? asArray : (value) => (Array.isArray(value) ? value : []);
    const getPreferredActorKeySafe =
      typeof getPreferredActorKey === "function"
        ? getPreferredActorKey
        : (login, name) => String(login || name || "").trim();
    const resolveActorDisplayNameSafe =
      typeof resolveActorDisplayName === "function"
        ? resolveActorDisplayName
        : (login, _actorsMap, fallbackName) => String(fallbackName || login || "").trim();
    const formatIsoDatetimeSafe =
      typeof formatIsoDatetime === "function"
        ? formatIsoDatetime
        : (value) => String(value || "-");

    const collectApproversFromRow = (row = {}) => {
      const ordered = [];
      const seen = new Set();

      const addApprover = (login, name = "") => {
        const preferredKey = getPreferredActorKeySafe(login, name);
        if (!preferredKey || seen.has(preferredKey)) return;
        seen.add(preferredKey);
        ordered.push({ login: preferredKey, name: String(name || "").trim() });
      };

      asArraySafe(row?.metrics?.approvals).forEach((approval) => {
        addApprover(approval?.login, approval?.name);
      });

      asArraySafe(row?.approvers).forEach((approver) => {
        addApprover(approver?.login, approver?.name);
      });

      asArraySafe(row?.reviews).forEach((review) => {
        if (String(review?.state || "").trim() !== "APPROVED") {
          return;
        }
        addApprover(review?.authorLogin, review?.authorName || review?.author?.name);
      });

      return ordered;
    };

    const formatApproversDisplay = (row = {}, actorsMap = {}) => {
      const approvers = asArraySafe(row?.approvers);
      if (!approvers.length) {
        return "-";
      }

      return approvers
        .map((approver) => {
          const login = String(approver?.login || "").trim();
          const name = resolveActorDisplayNameSafe(login, actorsMap, approver?.name);
          const approvedAt = formatIsoDatetimeSafe(approver?.approvedAt || "-");
          return `${name}${login && login !== name ? ` (${login})` : ""} at ${approvedAt}`;
        })
        .join("; ");
    };

    return {
      collectApproversFromRow,
      formatApproversDisplay,
    };
  };

  return {
    createPrApproversHelpers,
  };
});
