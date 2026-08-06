(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsReviewStatsTimelineHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrReviewStatsTimelineHelpers = ({
    asArray,
    getPreferredActorKey,
    normalizeActorLogin,
    isWithinStatsDateRange,
    resolveActorDisplayName,
    getTimelineDateKeys,
  } = {}) => {
    const asArraySafe =
      typeof asArray === "function"
        ? asArray
        : (value) => (Array.isArray(value) ? value : []);
    const getPreferredActorKeySafe =
      typeof getPreferredActorKey === "function"
        ? getPreferredActorKey
        : (login, fallback) => String(login || fallback || "").trim();
    const normalizeActorLoginSafe =
      typeof normalizeActorLogin === "function"
        ? normalizeActorLogin
        : (value) => String(value || "").trim();
    const isWithinStatsDateRangeSafe =
      typeof isWithinStatsDateRange === "function"
        ? isWithinStatsDateRange
        : () => true;
    const resolveActorDisplayNameSafe =
      typeof resolveActorDisplayName === "function"
        ? resolveActorDisplayName
        : (login, _actorsMap, fallback) =>
            String(fallback || login || "").trim();
    const getTimelineDateKeysSafe =
      typeof getTimelineDateKeys === "function"
        ? getTimelineDateKeys
        : (dates) =>
            asArraySafe(dates)
              .map((value) => String(value || "").trim())
              .filter(Boolean)
              .sort();

    const isCopilotName = (value) => /copilot/i.test(String(value || ""));

    const aggregateReviewerActivityTimeline = (rows, actorsMap = {}, range = {}) => {
      const timelineByReviewer = new Map();
      const allDates = new Set();

      asArraySafe(rows).forEach((entry) => {
        const row = entry?.data || {};
        const prAuthorLogin = getPreferredActorKeySafe(row.authorLogin, row.author);
        asArraySafe(row.commentEvents).forEach((event) => {
          const date = String(event?.date || "").trim();
          const actorLogin = normalizeActorLoginSafe(event?.actor);
          if (!date || !actorLogin) return;
          if (prAuthorLogin && actorLogin === prAuthorLogin) return;
          const eventIso =
            String(event?.occurredAt || "").trim() || `${date}T12:00:00Z`;
          if (!isWithinStatsDateRangeSafe(eventIso, range)) return;
          const actorName = resolveActorDisplayNameSafe(
            actorLogin,
            actorsMap,
            actorLogin,
          );
          if (isCopilotName(actorLogin) || isCopilotName(actorName)) return;
          if (event?.channel === "thread" || event?.channel === "top-level") {
            allDates.add(date);
            if (!timelineByReviewer.has(actorLogin)) {
              timelineByReviewer.set(actorLogin, {
                login: actorLogin,
                actor: actorName,
                dateMap: new Map(),
              });
            }
            const actorTimeline = timelineByReviewer.get(actorLogin).dateMap;
            actorTimeline.set(date, (actorTimeline.get(date) || 0) + 1);
          }
        });

        asArraySafe(row.reviews).forEach((review) => {
          const reviewIso = String(review?.submittedAt || "").trim();
          const date = reviewIso.split("T")[0].trim();
          const actorLogin = normalizeActorLoginSafe(review?.authorLogin);
          if (!date || !actorLogin) return;
          if (prAuthorLogin && actorLogin === prAuthorLogin) return;
          if (!isWithinStatsDateRangeSafe(reviewIso, range)) return;
          const actorName = resolveActorDisplayNameSafe(
            actorLogin,
            actorsMap,
            actorLogin,
          );
          if (isCopilotName(actorLogin) || isCopilotName(actorName)) return;
          allDates.add(date);
          if (!timelineByReviewer.has(actorLogin)) {
            timelineByReviewer.set(actorLogin, {
              login: actorLogin,
              actor: actorName,
              dateMap: new Map(),
            });
          }
          const actorTimeline = timelineByReviewer.get(actorLogin).dateMap;
          actorTimeline.set(date, (actorTimeline.get(date) || 0) + 1);
        });
      });

      const sortedDates = getTimelineDateKeysSafe(Array.from(allDates), range);

      const seriesByReviewer = Array.from(timelineByReviewer.entries())
        .map(([login, item]) => ({
          login,
          actor: item.actor,
          points: sortedDates.map((date) => ({
            date,
            value: item.dateMap.get(date) || 0,
          })),
        }))
        .filter((series) => series.points.some((point) => point.value > 0))
        .sort(
          (a, b) =>
            b.points.reduce((sum, point) => sum + point.value, 0) -
            a.points.reduce((sum, point) => sum + point.value, 0),
        )
        .slice(0, 12);

      return { dates: sortedDates, series: seriesByReviewer };
    };

    const aggregateReviewerCommentsTimeline = (rows, actorsMap = {}, range = {}) => {
      const timelineByReviewer = new Map();
      const allDates = new Set();

      asArraySafe(rows).forEach((entry) => {
        const row = entry?.data || {};
        const prAuthorLogin = getPreferredActorKeySafe(row.authorLogin, row.author);
        asArraySafe(row.commentEvents).forEach((event) => {
          const date = String(event?.date || "").trim();
          const actorLogin = normalizeActorLoginSafe(event?.actor);
          if (!date || !actorLogin) return;
          if (prAuthorLogin && actorLogin === prAuthorLogin) return;
          const eventIso =
            String(event?.occurredAt || "").trim() || `${date}T12:00:00Z`;
          if (!isWithinStatsDateRangeSafe(eventIso, range)) return;
          const actorName = resolveActorDisplayNameSafe(
            actorLogin,
            actorsMap,
            actorLogin,
          );
          if (isCopilotName(actorLogin) || isCopilotName(actorName)) return;
          if (event?.channel === "thread" || event?.channel === "top-level") {
            allDates.add(date);
            if (!timelineByReviewer.has(actorLogin)) {
              timelineByReviewer.set(actorLogin, {
                login: actorLogin,
                actor: actorName,
                dateMap: new Map(),
              });
            }
            const actorTimeline = timelineByReviewer.get(actorLogin).dateMap;
            actorTimeline.set(date, (actorTimeline.get(date) || 0) + 1);
          }
        });

        asArraySafe(row.reviews).forEach((review) => {
          const reviewState = String(review?.state || "").trim();
          if (reviewState === "APPROVED") return;
          const reviewIso = String(review?.submittedAt || "").trim();
          const date = reviewIso.split("T")[0].trim();
          const actorLogin = normalizeActorLoginSafe(review?.authorLogin);
          if (!date || !actorLogin) return;
          if (prAuthorLogin && actorLogin === prAuthorLogin) return;
          if (!isWithinStatsDateRangeSafe(reviewIso, range)) return;
          const actorName = resolveActorDisplayNameSafe(
            actorLogin,
            actorsMap,
            actorLogin,
          );
          if (isCopilotName(actorLogin) || isCopilotName(actorName)) return;
          allDates.add(date);
          if (!timelineByReviewer.has(actorLogin)) {
            timelineByReviewer.set(actorLogin, {
              login: actorLogin,
              actor: actorName,
              dateMap: new Map(),
            });
          }
          const actorTimeline = timelineByReviewer.get(actorLogin).dateMap;
          actorTimeline.set(date, (actorTimeline.get(date) || 0) + 1);
        });
      });

      const sortedDates = getTimelineDateKeysSafe(Array.from(allDates), range);

      const seriesByReviewer = Array.from(timelineByReviewer.entries())
        .map(([login, item]) => ({
          login,
          actor: item.actor,
          points: sortedDates.map((date) => ({
            date,
            value: item.dateMap.get(date) || 0,
          })),
        }))
        .filter((series) => series.points.some((point) => point.value > 0))
        .sort(
          (a, b) =>
            b.points.reduce((sum, point) => sum + point.value, 0) -
            a.points.reduce((sum, point) => sum + point.value, 0),
        )
        .slice(0, 12);

      return { dates: sortedDates, series: seriesByReviewer };
    };

    const aggregateReviewerApprovalsTimeline = (
      rows,
      actorsMap = {},
      range = {},
    ) => {
      const timelineByReviewer = new Map();
      const allDates = new Set();

      asArraySafe(rows).forEach((entry) => {
        const row = entry?.data || {};
        const prAuthorLogin = getPreferredActorKeySafe(row.authorLogin, row.author);
        asArraySafe(row.reviews).forEach((review) => {
          const reviewState = String(review?.state || "").trim();
          if (reviewState !== "APPROVED") return;
          const reviewIso = String(review?.submittedAt || "").trim();
          const date = reviewIso.split("T")[0].trim();
          const actorLogin = normalizeActorLoginSafe(review?.authorLogin);
          if (!date || !actorLogin) return;
          if (prAuthorLogin && actorLogin === prAuthorLogin) return;
          if (!isWithinStatsDateRangeSafe(reviewIso, range)) return;
          const actorName = resolveActorDisplayNameSafe(
            actorLogin,
            actorsMap,
            actorLogin,
          );
          if (isCopilotName(actorLogin) || isCopilotName(actorName)) return;
          allDates.add(date);
          if (!timelineByReviewer.has(actorLogin)) {
            timelineByReviewer.set(actorLogin, {
              login: actorLogin,
              actor: actorName,
              dateMap: new Map(),
            });
          }
          const actorTimeline = timelineByReviewer.get(actorLogin).dateMap;
          actorTimeline.set(date, (actorTimeline.get(date) || 0) + 1);
        });
      });

      const sortedDates = getTimelineDateKeysSafe(Array.from(allDates), range);

      const seriesByReviewer = Array.from(timelineByReviewer.entries())
        .map(([login, item]) => ({
          login,
          actor: item.actor,
          points: sortedDates.map((date) => ({
            date,
            value: item.dateMap.get(date) || 0,
          })),
        }))
        .filter((series) => series.points.some((point) => point.value > 0))
        .sort(
          (a, b) =>
            b.points.reduce((sum, point) => sum + point.value, 0) -
            a.points.reduce((sum, point) => sum + point.value, 0),
        )
        .slice(0, 12);

      return { dates: sortedDates, series: seriesByReviewer };
    };

    return {
      aggregateReviewerActivityTimeline,
      aggregateReviewerCommentsTimeline,
      aggregateReviewerApprovalsTimeline,
    };
  };

  return {
    createPrReviewStatsTimelineHelpers,
  };
});
