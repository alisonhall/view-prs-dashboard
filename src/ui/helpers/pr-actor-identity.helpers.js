(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsPrActorIdentityHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrActorIdentityHelpers = ({
    asArray = (value) => (Array.isArray(value) ? value : []),
    getActorLoginAliases = () => ({}),
  } = {}) => {
    const normalizeResolvedPersonName = (login, name) => {
      const normalizedLogin = String(login || "").trim();
      const normalizedName = String(name || "").trim();
      if (!normalizedName || normalizedName === normalizedLogin) {
        return "";
      }
      if (normalizedName === "copilot-pull-request-reviewer") {
        return "Copilot";
      }
      return normalizedName;
    };

    const normalizeActorLoginAliases = (value = {}) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {};
      }

      const normalized = {};
      Object.entries(value).forEach(([aliasLogin, canonicalLogin]) => {
        const alias = String(aliasLogin || "").trim();
        const canonical = String(canonicalLogin || "").trim();
        if (!alias || !canonical || alias === canonical) {
          return;
        }
        normalized[alias] = canonical;
      });

      return normalized;
    };

    const normalizeActorLogin = (
      loginValue,
      actorLoginAliases = getActorLoginAliases(),
    ) => {
      const normalizedLogin = String(loginValue || "").trim();
      if (!normalizedLogin) {
        return "";
      }

      let currentLogin = normalizedLogin;
      const seen = new Set([currentLogin]);
      while (true) {
        const nextLogin = String(actorLoginAliases?.[currentLogin] || "").trim();
        if (!nextLogin || seen.has(nextLogin)) {
          return currentLogin;
        }
        currentLogin = nextLogin;
        seen.add(currentLogin);
      }
    };

    const getPreferredActorKey = (loginValue, fallbackValue = "") => {
      const normalizedLogin = normalizeActorLogin(loginValue);
      if (normalizedLogin) {
        return normalizedLogin;
      }
      return String(fallbackValue || "").trim();
    };

    const resolveActorDisplayName = (login, actorsMap = {}, fallbackName = "") => {
      const rawLogin = String(login || "").trim();
      const normalizedLogin = normalizeActorLogin(rawLogin);
      const mapped = normalizeResolvedPersonName(
        normalizedLogin,
        actorsMap?.[normalizedLogin],
      );
      if (mapped) {
        return mapped;
      }
      const rawMapped = normalizeResolvedPersonName(rawLogin, actorsMap?.[rawLogin]);
      if (rawMapped) {
        return rawMapped;
      }
      const normalizedFallback = normalizeResolvedPersonName(
        normalizedLogin,
        fallbackName,
      );
      if (normalizedFallback) {
        return normalizedFallback;
      }
      if (normalizedLogin === "copilot-pull-request-reviewer") {
        return "Copilot";
      }
      return (
        normalizedLogin || String(fallbackName || "unknown").trim() || "unknown"
      );
    };

    const buildRowActorsMap = (row = {}, seedActorsMap = {}) => {
      const actorsMap = { ...(seedActorsMap || {}) };
      const addActor = (login, name) => {
        const normalizedLogin = normalizeActorLogin(login);
        if (!normalizedLogin) return;
        const normalizedName = normalizeResolvedPersonName(normalizedLogin, name);
        if (normalizedName && !actorsMap[normalizedLogin]) {
          actorsMap[normalizedLogin] = normalizedName;
        }
      };

      addActor(row.authorLogin, row.author);
      asArray(row.approvers).forEach((approver) =>
        addActor(approver?.login, approver?.name),
      );
      asArray(row.requestedReviewers).forEach((reviewer) =>
        addActor(reviewer?.login, reviewer?.name),
      );
      asArray(row.comments).forEach((comment) =>
        addActor(
          comment?.authorLogin,
          comment?.author?.name || comment?.authorName,
        ),
      );
      asArray(row.commentEvents).forEach((event) =>
        addActor(
          event?.actor,
          event?.author?.name || event?.author || event?.actorName,
        ),
      );
      asArray(row.reviews).forEach((review) =>
        addActor(review?.authorLogin, review?.author?.name || review?.authorName),
      );
      asArray(row.reviewThreads).forEach((thread) => {
        asArray(thread?.comments).forEach((comment) =>
          addActor(
            comment?.authorLogin,
            comment?.author?.name || comment?.authorName,
          ),
        );
      });
      asArray(row.commits).forEach((commit) => {
        asArray(commit?.authors).forEach((author) =>
          addActor(author?.login, author?.name),
        );
      });
      asArray(row.activityTimeline).forEach((bucket) => {
        addActor(bucket?.actor, bucket?.author?.name || bucket?.author);
        asArray(bucket?.events).forEach((event) =>
          addActor(
            event?.actor,
            event?.author?.name || event?.author || event?.actorName,
          ),
        );
      });
      asArray(row.activityEvents).forEach((event) =>
        addActor(
          event?.actor,
          event?.author?.name || event?.author || event?.actorName,
        ),
      );
      asArray(row?.metrics?.commentsByActor).forEach((person) =>
        addActor(person?.login, person?.name),
      );
      asArray(row?.metrics?.reviewsByActor).forEach((person) =>
        addActor(person?.login, person?.name),
      );
      asArray(row?.metrics?.approvals).forEach((approval) =>
        addActor(approval?.login, approval?.name),
      );

      if (!actorsMap["copilot-pull-request-reviewer"]) {
        actorsMap["copilot-pull-request-reviewer"] = "Copilot";
      }

      return actorsMap;
    };

    return {
      normalizeResolvedPersonName,
      normalizeActorLoginAliases,
      normalizeActorLogin,
      getPreferredActorKey,
      resolveActorDisplayName,
      buildRowActorsMap,
    };
  };

  return {
    createPrActorIdentityHelpers,
  };
});
