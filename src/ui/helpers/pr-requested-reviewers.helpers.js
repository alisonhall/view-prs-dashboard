(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsRequestedReviewersHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrRequestedReviewersHelpers = ({
    asArray,
    resolveActorDisplayName,
  } = {}) => {
    const asArraySafe = typeof asArray === "function" ? asArray : (value) => (Array.isArray(value) ? value : []);
    const resolveActorDisplayNameSafe =
      typeof resolveActorDisplayName === "function"
        ? resolveActorDisplayName
        : (login, _actorsMap, fallbackName) => String(fallbackName || login || "").trim();

    const collectRequestedReviewers = (row = {}) => {
      const ordered = [];
      const seen = new Set();

      const addReviewer = (login, name = "") => {
        const normalizedLogin = String(login || "").trim();
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
          addReviewer(value, "");
          return;
        }
        if (typeof value !== "object") return;

        const nestedReviewer = value.requestedReviewer || value.reviewer || value.user || null;
        if (nestedReviewer && typeof nestedReviewer === "object") {
          addFromValue(nestedReviewer);
        }

        const login = value.login || value.userLogin || value.reviewerLogin || value.username;
        const name = value.name || value.userName || value.reviewerName || "";
        if (typeof login === "string") {
          addReviewer(login, name);
        }
      };

      [row.requestedReviewers, row.reviewRequests, row.reviewers].forEach(addFromValue);

      if (ordered.length === 0) {
        asArraySafe(row.reviews).forEach((review) =>
          addFromValue({
            login: review?.authorLogin,
            name: review?.authorName || review?.author?.name,
          }),
        );
        asArraySafe(row?.metrics?.reviewsByActor).forEach((reviewer) =>
          addFromValue({ login: reviewer?.login, name: reviewer?.name }),
        );
      }

      return ordered;
    };

    const formatRequestedReviewersDisplay = (row, actorsMap = {}) => {
      const reviewers = collectRequestedReviewers(row);
      if (!reviewers.length) return "-";

      return reviewers
        .map((reviewer) => {
          const login = String(reviewer?.login || "").trim();
          const name = resolveActorDisplayNameSafe(login, actorsMap, reviewer?.name);
          return `${name}${login && login !== name ? ` (${login})` : ""}`;
        })
        .join("; ");
    };

    return {
      collectRequestedReviewers,
      formatRequestedReviewersDisplay,
    };
  };

  return {
    createPrRequestedReviewersHelpers,
  };
});
