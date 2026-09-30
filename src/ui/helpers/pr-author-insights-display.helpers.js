/**
 * Author Insights Display and Formatting Helpers
 * 
 * Provides helpers for formatting author insights data, building author
 * options, and sorting/matching entries. The DOM-building badge/meta helpers
 * that used to live here were ported to AuthorInsightsPrDataMeta.jsx.
 * UMD pattern for browser + Jest compatibility.
 */

// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsAuthorInsightsDisplayHelpers fallback.
export const { createPrAuthorInsightsDisplayHelpers } = (() => {
  const createPrAuthorInsightsDisplayHelpers = ({
    resolveActorDisplayName,
    getPreferredActorKey,
    normalizeActorLogin,
    normalizeAuthorInsightsSentiment,
    isChangedStatus,
    asArray,
    parseSortableTime,
    formatIsoDatetime,
  } = {}) => {
    /**
     * Builds a list of author options from rows and actorsMap.
     * 
     * @param {Array} rows - PR row entries
     * @param {Object} actorsMap - Actor ID to name mapping
     * @returns {Array} Sorted array of {login, name} objects
     */
    const buildAuthorInsightsEntries = (rows, actorsMap = {}) => {
      const authors = new Map();
      const addAuthorOption = (login, fallbackName = "") => {
        const authorLogin = String(login || "").trim();
        if (!authorLogin) return;
        if (authors.has(authorLogin)) return;
        authors.set(
          authorLogin,
          resolveActorDisplayName(authorLogin, actorsMap, fallbackName),
        );
      };

      rows.forEach((entry) => {
        const row = entry?.data || {};
        addAuthorOption(getPreferredActorKey(row.authorLogin, row.author), row.author);
      });

      Object.entries(actorsMap || {}).forEach(([login, name]) => {
        addAuthorOption(login, name);
      });

      return Array.from(authors.entries())
        .map(([login, name]) => ({ login, name }))
        .sort((a, b) =>
          String(a.name || a.login).localeCompare(String(b.name || b.login)),
        );
    };

    /**
     * Checks if a note author matches the selected author.
     * 
     * @param {string} noteAuthorValue - Author value from note
     * @param {Object} selectedAuthor - Selected author {login, name}
     * @param {Object} actorsMap - Actor ID to name mapping
     * @returns {boolean} True if note author matches selected author
     */
    const noteAuthorMatchesSelection = (
      noteAuthorValue,
      selectedAuthor,
      actorsMap,
    ) => {
      const rawAuthor = String(noteAuthorValue || "").trim();
      if (!rawAuthor || !selectedAuthor) return false;

      const canonicalRawAuthor = normalizeActorLogin(rawAuthor);
      const selectedLogin = String(selectedAuthor.login || "").trim();
      const selectedName = String(selectedAuthor.name || "").trim();
      const resolvedAuthor = resolveActorDisplayName(
        rawAuthor,
        actorsMap,
        rawAuthor,
      );

      return (
        rawAuthor === selectedLogin ||
        canonicalRawAuthor === selectedLogin ||
        rawAuthor === selectedName ||
        resolvedAuthor === selectedName
      );
    };

    /**
     * Gets the sentiment label for a sentiment value.
     * 
     * @param {string} value - Sentiment value (positive/negative/neutral)
     * @returns {string} Sentiment label
     */
    const getAuthorInsightsSentimentLabel = (value) => {
      const sentiment = normalizeAuthorInsightsSentiment(value);
      if (sentiment === "positive") return "Positive";
      if (sentiment === "negative") return "Negative";
      return "Neutral";
    };

    /**
     * Gets the badge CSS class for a sentiment value.
     * 
     * @param {string} value - Sentiment value
     * @returns {string} Badge CSS class
     */
    const getAuthorInsightsSentimentBadgeClassName = (value) => {
      const sentiment = normalizeAuthorInsightsSentiment(value);
      return `author-insights-badge-sentiment-${sentiment}`;
    };

    /**
     * Gets the badge CSS class for a PR status.
     * 
     * @param {string} value - PR status value
     * @returns {string} Badge CSS class
     */
    const getAuthorInsightsStatusBadgeClassName = (value) => {
      const status = String(value || "").trim().toUpperCase();
      if (status === "MERGED") {
        return "author-insights-badge-status-merged";
      }
      if (status === "CLOSED") {
        return "author-insights-badge-status-closed";
      }
      if (isChangedStatus(status)) {
        return "author-insights-badge-status-changed";
      }
      if (status === "NO_CHANGE") {
        return "author-insights-badge-status-no-change";
      }
      if (status === "NO_ACTIVITY") {
        return "author-insights-badge-status-no-activity";
      }
      return "author-insights-badge-status-default";
    };

    /**
     * Determines the PR status for an author insights entry.
     * 
     * @param {Object} entry - PR entry
     * @returns {string} PR status (MERGED/CLOSED/status)
     */
    const getAuthorInsightsCreatedPrStatus = (entry) => {
      if (String(entry?.data?.mergedAt || "").trim()) {
        return "MERGED";
      }
      if (
        String(entry?.data?.closedAt || "").trim() ||
        String(entry?.section || "").trim().toLowerCase() === "closed"
      ) {
        return "CLOSED";
      }
      return String(entry?.data?.status || "-").trim().toUpperCase() || "-";
    };

    /**
     * Sorts manual comments in descending order by date.
     * 
     * @param {Array} comments - Array of comment objects
     * @returns {Array} Sorted comments
     */
    const sortAuthorInsightsManualCommentsDesc = (comments) =>
      (Array.isArray(comments) ? comments.slice() : []).sort((a, b) => {
        const dateA = parseSortableTime(a?.createdAt || a?.updatedAt || "");
        const dateB = parseSortableTime(b?.createdAt || b?.updatedAt || "");
        if (dateA !== dateB) {
          return dateB - dateA;
        }
        return String(b?.id || "").localeCompare(String(a?.id || ""));
      });

    /**
     * Sorts note matches in descending order by date.
     * 
     * @param {Array} matches - Array of {entry, comment} objects
     * @returns {Array} Sorted matches
     */
    const sortAuthorInsightsNoteMatchesDesc = (matches) =>
      (Array.isArray(matches) ? matches.slice() : []).sort((a, b) => {
        const dateA = parseSortableTime(
          a?.comment?.createdAt || a?.comment?.updatedAt || a?.entry?.updatedAt || "",
        );
        const dateB = parseSortableTime(
          b?.comment?.createdAt || b?.comment?.updatedAt || b?.entry?.updatedAt || "",
        );
        if (dateA !== dateB) {
          return dateB - dateA;
        }
        return Number(b?.entry?.prNumber || 0) - Number(a?.entry?.prNumber || 0);
      });

    /**
     * Gets the display timestamp for a note.
     * 
     * @param {Object} comment - Comment object
     * @param {Object} entry - PR entry
     * @returns {string} Formatted timestamp
     */
    const getAuthorInsightsNoteDisplayTimestamp = (comment, entry) => {
      const candidates = [
        comment?.createdAt,
        comment?.updatedAt,
        entry?.updatedAt,
        entry?.data?.updatedAt,
        entry?.data?.sourceUpdatedAt,
      ];
      const valid = candidates.find((value) =>
        Number.isFinite(Date.parse(String(value || "").trim())),
      );
      return formatIsoDatetime(valid || "-");
    };

    /**
     * Sorts created PRs in descending order by date.
     * 
     * @param {Array} rows - Array of PR entries
     * @returns {Array} Sorted rows
     */
    const sortAuthorInsightsCreatedPrsDesc = (rows) =>
      (Array.isArray(rows) ? rows.slice() : []).sort((a, b) => {
        const dateA = parseSortableTime(
          a?.data?.mergedAt ||
            a?.data?.closedAt ||
            a?.data?.sourceUpdatedAt ||
            a?.updatedAt ||
            "",
        );
        const dateB = parseSortableTime(
          b?.data?.mergedAt ||
            b?.data?.closedAt ||
            b?.data?.sourceUpdatedAt ||
            b?.updatedAt ||
            "",
        );
        if (dateA !== dateB) {
          return dateB - dateA;
        }
        return Number(b?.prNumber || 0) - Number(a?.prNumber || 0);
      });

    return {
      buildAuthorInsightsEntries,
      noteAuthorMatchesSelection,
      getAuthorInsightsSentimentLabel,
      getAuthorInsightsSentimentBadgeClassName,
      getAuthorInsightsStatusBadgeClassName,
      getAuthorInsightsCreatedPrStatus,
      sortAuthorInsightsManualCommentsDesc,
      sortAuthorInsightsNoteMatchesDesc,
      getAuthorInsightsNoteDisplayTimestamp,
      sortAuthorInsightsCreatedPrsDesc,
      // Pass-through dependencies
      resolveActorDisplayName,
      getPreferredActorKey,
      formatIsoDatetime,
      asArray,
    };
  };

  return {
    createPrAuthorInsightsDisplayHelpers,
  };
})();
