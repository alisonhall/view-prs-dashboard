/**
 * PR Author Insights Component (Refactored)
 *
 * Now just orchestrates renderAuthorInsights (selector + header + the
 * created-PRs/notes/comments React sections) - the created-PRs/notes/
 * manual-comments DOM builders this used to own were converted to real
 * JSX (AuthorCreatedPrsSection.jsx/AuthorInsightsNotesSection.jsx/
 * AuthorInsightsCommentsSection.jsx - Track B, REACT_MIGRATION_PLAN.md),
 * which is why postJson/DEFAULT_AUTHOR_INSIGHTS_SENTIMENT are no longer
 * accepted here even though index.page.js's factory call may still pass
 * them - dataHelpers/draftHelpers/prLinkHelpers remain required
 * (validated below) for contract stability, but are no longer
 * destructured since their only consumers moved to those components.
 *
 * Dependency Contract:
 * - prLinkHelpers/dataHelpers/draftHelpers: required but unused, see above
 * - displayHelpers: Display/formatting helpers (buildAuthorInsightsEntries)
 * - authorInsightsState: Component state object
 * - recomputeDirtyPrSectionsFields: Side effect for dirty field tracking
 * - documentRef: Document reference (optional, defaults to global document)
 */

(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsAuthorInsightsComponent = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrAuthorInsightsComponent = ({
    // Helper modules (focused contracts)
    prLinkHelpers,
    displayHelpers,
    dataHelpers,
    draftHelpers,
    // State and API
    authorInsightsState,
    // Side effects
    recomputeDirtyPrSectionsFields,
    // Optional overrides
    documentRef = typeof document !== "undefined" ? document : null,
    // React migration hooks (see REACT_MIGRATION_PLAN.md): each renders one
    // section into its own dedicated root container (mounted by
    // react-app.jsx) - the vanilla DOM-building fallback these used to have
    // was removed once every conversion was complete (React is now assumed
    // always available); the `Safe` wrappers below just guard against a
    // hook not being passed at all (e.g. an older unit test fixture),
    // rather than against React being unavailable.
    updateReactAuthorInsightsSelector,
    updateReactAuthorInsightsCreatedPrs,
    updateReactAuthorInsightsHeader,
    updateReactAuthorInsightsNotes,
    updateReactAuthorInsightsComments,
  } = {}) => {
    const updateReactAuthorInsightsSelectorSafe =
      typeof updateReactAuthorInsightsSelector === "function"
        ? updateReactAuthorInsightsSelector
        : () => false;
    const updateReactAuthorInsightsCreatedPrsSafe =
      typeof updateReactAuthorInsightsCreatedPrs === "function"
        ? updateReactAuthorInsightsCreatedPrs
        : () => false;
    const updateReactAuthorInsightsHeaderSafe =
      typeof updateReactAuthorInsightsHeader === "function"
        ? updateReactAuthorInsightsHeader
        : () => false;
    const updateReactAuthorInsightsNotesSafe =
      typeof updateReactAuthorInsightsNotes === "function"
        ? updateReactAuthorInsightsNotes
        : () => false;
    const updateReactAuthorInsightsCommentsSafe =
      typeof updateReactAuthorInsightsComments === "function"
        ? updateReactAuthorInsightsComments
        : () => false;
    // Validate required dependencies
    if (!prLinkHelpers || !displayHelpers || !dataHelpers || !draftHelpers) {
      throw new Error(
        "Author Insights Component requires prLinkHelpers, displayHelpers, dataHelpers, and draftHelpers",
      );
    }
    if (!authorInsightsState) {
      throw new Error("Author Insights Component requires authorInsightsState");
    }

    // Extract helpers for readability. Note: prLinkHelpers/dataHelpers/
    // draftHelpers are still required dependencies (validated below) but
    // no longer destructured here - their only consumers were the DOM
    // builders for the created-PRs/PR-linked-notes/manual-comments
    // sections, all now real JSX (AuthorInsightsPrLink.jsx,
    // AuthorInsightsPrDataMeta.jsx, AuthorInsightsCommentsSection.jsx -
    // Track B, REACT_MIGRATION_PLAN.md), reading the same underlying
    // authorInsightsState-backed helpers via window bridges instead.
    const { buildAuthorInsightsEntries } = displayHelpers;

    /**
     * Main render function for author insights.
     * 
     * @param {Array} rows - PR row entries
     * @param {Object} actorsMap - Actor ID to name mapping
     */
    const renderAuthorInsights = (rows, actorsMap = {}) => {
      const host = documentRef?.getElementById("author-insights");
      if (!host) return;

      authorInsightsState.latestRows = rows;
      authorInsightsState.latestActorsMap = actorsMap;

      // The selector lives in its own static sibling container
      // (#author-insights-selector-root, see index.html) that React mounts
      // into once and owns from then on - this function must never rebuild
      // it (the old vanilla behavior always did, via a single
      // `host.innerHTML = ""` that covered the selector and every section
      // alike), or it would silently tear the mounted React root's DOM out
      // from under it on every author-insights render, exactly the class
      // of bug Phase 1's #pr-sections handling guards against. The same is
      // now true of #author-insights-content-root (the manual comments
      // section's container, once its own dedicated React root - see
      // renderManualCommentsSection below) and every other sibling
      // container: none of them get unconditionally reset here anymore.
      // The empty-state message below is appended directly into `host`
      // instead, since content-root is no longer a generic "whatever's
      // currently showing" scratch container.

      // Empty rows guard
      if (!rows.length) {
        updateReactAuthorInsightsSelectorSafe([], "");
        // #author-insights-created-prs-root, #author-insights-header-root,
        // #author-insights-notes-root, and #author-insights-content-root
        // (manual comments) are separate sibling containers too (same
        // reasoning as the selector above) - they must be explicitly
        // cleared here as well, or a React-owned section from a previous
        // successful render would keep showing stale content once rows
        // becomes empty, since this early return never reaches the render
        // calls below.
        updateReactAuthorInsightsCreatedPrsSafe([]);
        updateReactAuthorInsightsHeaderSafe("");
        updateReactAuthorInsightsNotesSafe([], null, {});
        updateReactAuthorInsightsCommentsSafe([], null, {});
        const empty = documentRef.createElement("p");
        empty.className = "stats-empty";
        empty.textContent = "No local rows available for author insights.";
        host.appendChild(empty);
        recomputeDirtyPrSectionsFields?.();
        return;
      }

      // Build author options
      const authorOptions = buildAuthorInsightsEntries(rows, actorsMap);
      if (!authorOptions.length) {
        updateReactAuthorInsightsSelectorSafe([], "");
        updateReactAuthorInsightsCreatedPrsSafe([]);
        updateReactAuthorInsightsHeaderSafe("");
        updateReactAuthorInsightsNotesSafe([], null, {});
        updateReactAuthorInsightsCommentsSafe([], null, {});
        const empty = documentRef.createElement("p");
        empty.className = "stats-empty";
        empty.textContent = "No authors found in the current local data scope.";
        host.appendChild(empty);
        recomputeDirtyPrSectionsFields?.();
        return;
      }

      // Ensure selected author is valid
      if (
        !authorOptions.some(
          (author) => author.login === authorInsightsState.selectedAuthorLogin,
        )
      ) {
        authorInsightsState.selectedAuthorLogin = authorOptions[0].login;
      }

      // Render author selector
      renderAuthorSelector(authorOptions);

      const selectedAuthor =
        authorOptions.find(
          (author) => author.login === authorInsightsState.selectedAuthorLogin,
        ) || authorOptions[0];

      // Render sections
      renderSelectedHeader(selectedAuthor);
      renderManualCommentsSection(selectedAuthor, rows, actorsMap);
      renderPrLinkedNotesSection(selectedAuthor, rows, actorsMap);
      renderCreatedPrsSection(rows);

      recomputeDirtyPrSectionsFields?.();
    };

    /**
     * Renders the author selector dropdown - React-owned
     * (#author-insights-selector-root, via updateReactAuthorInsightsSelectorSafe).
     */
    const renderAuthorSelector = (authorOptions) => {
      updateReactAuthorInsightsSelectorSafe(
        authorOptions.map((author) => ({
          login: author.login,
          name: author.name || author.login,
        })),
        authorInsightsState.selectedAuthorLogin,
      );
    };

    /**
     * Renders the selected author header - React-owned
     * (#author-insights-header-root, via updateReactAuthorInsightsHeaderSafe).
     */
    const renderSelectedHeader = (selectedAuthor) => {
      updateReactAuthorInsightsHeaderSafe(selectedAuthor.name);
    };

    /**
     * Renders the manual comments section - real JSX
     * (AuthorInsightsCommentsSection.jsx, #author-insights-content-root, via
     * updateReactAuthorInsightsCommentsSafe). Composer/edit draft state and
     * save/edit POST side effects moved into that component, still writing
     * through the same authorInsightsState-backed draft/data helpers
     * (exposed as window bridges in index.page.js) rather than local-only
     * React state, since pr-auto-render-blocking.helpers.js reads that
     * shared state directly (Track B batch 2, REACT_MIGRATION_PLAN.md).
     */
    const renderManualCommentsSection = (selectedAuthor, rows, actorsMap) => {
      updateReactAuthorInsightsCommentsSafe(rows, selectedAuthor, actorsMap);
    };

    /**
     * Renders the PR-linked notes section - real JSX
     * (AuthorInsightsNotesSection.jsx, #author-insights-notes-root, via
     * updateReactAuthorInsightsNotesSafe). Filtering/sorting/DOM-building
     * for this section moved into that component when it was converted
     * from a ref-wrapped vanilla builder (Track B, REACT_MIGRATION_PLAN.md).
     */
    const renderPrLinkedNotesSection = (selectedAuthor, rows, actorsMap) => {
      updateReactAuthorInsightsNotesSafe(rows, selectedAuthor, actorsMap);
    };

    /**
     * Renders the created PRs section - real JSX
     * (AuthorCreatedPrsSection.jsx, #author-insights-created-prs-root, via
     * updateReactAuthorInsightsCreatedPrsSafe). Passes
     * authorInsightsState.selectedAuthorLogin explicitly now, since the
     * component filters by it directly instead of reading it from a
     * closure (Track B, REACT_MIGRATION_PLAN.md) - this also removed the
     * need for react-app.jsx's previous incrementing-`key` remount hack.
     */
    const renderCreatedPrsSection = (rows) => {
      updateReactAuthorInsightsCreatedPrsSafe(
        rows,
        authorInsightsState.selectedAuthorLogin,
      );
    };

    return {
      renderAuthorInsights,
    };
  };

  return {
    createPrAuthorInsightsComponent,
  };
});
