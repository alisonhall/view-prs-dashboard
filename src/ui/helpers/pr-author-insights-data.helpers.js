/**
 * Author Insights Data and API Helpers
 * 
 * Provides helpers for loading, saving, and managing author manual comments data.
 * UMD pattern for browser + Jest compatibility.
 */

(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsAuthorInsightsDataHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const AUTHOR_COMMENT_SENTIMENT_OPTIONS = [
    { value: "positive", label: "Positive" },
    { value: "negative", label: "Negative" },
    { value: "neutral", label: "Neutral" },
  ];

  const createPrAuthorInsightsDataHelpers = ({
    normalizeActorLogin,
    fetchFn = (...args) => fetch(...args),
  } = {}) => {
    /**
     * Gets manual comments for a given author login.
     * 
     * @param {string} authorLogin - Author login ID
     * @param {Object} authorInsightsState - Author insights state object
     * @returns {Array} Array of comment objects
     */
    const getAuthorManualCommentsForLogin = (authorLogin, authorInsightsState) => {
      const normalizedAuthorLogin = normalizeActorLogin(authorLogin);
      if (!normalizedAuthorLogin) {
        return [];
      }

      const comments =
        authorInsightsState.manualCommentsByAuthorLogin?.[normalizedAuthorLogin];
      return Array.isArray(comments) ? comments : [];
    };

    /**
     * Loads author manual comments from the server.
     * Updates the authorInsightsState with loading status, comments, and errors.
     * 
     * @param {string} authorLogin - Author login ID
     * @param {Object} authorInsightsState - Author insights state object
     * @param {Function} onComplete - Optional callback after load completes
     * @returns {Promise<void>}
     */
    const loadAuthorManualComments = async (
      authorLogin,
      authorInsightsState,
      onComplete,
    ) => {
      const normalizedAuthorLogin = normalizeActorLogin(authorLogin);
      if (!normalizedAuthorLogin) {
        return;
      }

      if (
        authorInsightsState.manualCommentsLoadingByAuthorLogin[normalizedAuthorLogin]
      ) {
        return;
      }
      if (
        Array.isArray(
          authorInsightsState.manualCommentsByAuthorLogin[normalizedAuthorLogin],
        )
      ) {
        return;
      }

      authorInsightsState.manualCommentsLoadingByAuthorLogin[normalizedAuthorLogin] =
        true;
      authorInsightsState.manualCommentsErrorByAuthorLogin[normalizedAuthorLogin] = "";

      try {
        const response = await fetchFn(
          `/view-prs/author-comments?authorLogin=${encodeURIComponent(normalizedAuthorLogin)}`,
        );
        const result = await response.json();
        if (!response.ok || result.ok === false) {
          throw new Error(result.error || "Failed to load author comments");
        }

        authorInsightsState.manualCommentsByAuthorLogin[normalizedAuthorLogin] =
          Array.isArray(result.comments) ? result.comments : [];
      } catch (error) {
        authorInsightsState.manualCommentsErrorByAuthorLogin[normalizedAuthorLogin] =
          error?.message || "Failed to load author comments";
        authorInsightsState.manualCommentsByAuthorLogin[normalizedAuthorLogin] = [];
      } finally {
        authorInsightsState.manualCommentsLoadingByAuthorLogin[normalizedAuthorLogin] =
          false;
        if (typeof onComplete === "function") {
          onComplete();
        }
      }
    };

    /**
     * Saves a new author manual comment.
     * 
     * @param {Object} params - Save parameters
     * @param {string} params.authorLogin - Author login ID
     * @param {string} params.note - Comment note text
     * @param {string} params.sentiment - Comment sentiment (positive/negative/neutral)
     * @param {Function} params.postJson - postJson function for API call
     * @returns {Promise<{response: Response, result: Object}>}
     */
    const saveAuthorManualComment = async ({ authorLogin, note, sentiment, postJson }) => {
      const { response, result } = await postJson("/view-prs/author-comments", {
        authorLogin,
        note,
        sentiment,
      });
      return { response, result };
    };

    /**
     * Updates an existing author manual comment.
     * 
     * @param {Object} params - Update parameters
     * @param {string} params.authorLogin - Author login ID
     * @param {string} params.id - Comment ID
     * @param {string} params.note - Updated note text
     * @param {string} params.sentiment - Updated sentiment
     * @returns {Promise<{response: Response, result: Object}>}
     */
    const updateAuthorManualComment = async ({
      authorLogin,
      id,
      note,
      sentiment,
    }) => {
      const response = await fetchFn("/view-prs/author-comments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorLogin,
          id: String(id || ""),
          note,
          sentiment,
        }),
      });
      const result = await response.json();
      return { response, result };
    };

    return {
      AUTHOR_COMMENT_SENTIMENT_OPTIONS,
      getAuthorManualCommentsForLogin,
      loadAuthorManualComments,
      saveAuthorManualComment,
      updateAuthorManualComment,
    };
  };

  return {
    createPrAuthorInsightsDataHelpers,
  };
});
