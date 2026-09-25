/**
 * PR Author Insights Component (Refactored)
 *
 * Now just orchestrates renderAuthorInsights - all 5 Author Insights
 * sections (selector/header/created-PRs/notes/manual-comments) are real
 * JSX (AuthorInsightsSelector.jsx/AuthorInsightsHeader.jsx/
 * AuthorCreatedPrsSection.jsx/AuthorInsightsNotesSection.jsx/
 * AuthorInsightsCommentsSection.jsx) that read their data straight from
 * PrDataContext instead of being pushed props here (Track C,
 * REACT_MIGRATION_PLAN.md) - which is why postJson/
 * DEFAULT_AUTHOR_INSIGHTS_SENTIMENT are no longer accepted here even
 * though index.page.js's factory call may still pass them -
 * dataHelpers/draftHelpers/prLinkHelpers remain required (validated below)
 * for contract stability, but are no longer destructured since their only
 * consumers moved to those components.
 *
 * `renderAuthorInsights` still owns validating/normalizing which author is
 * selected (falling back to the first author whenever the previous
 * selection no longer exists in the current rows) and pushing that
 * canonical value into PrDataContext via updateReactSelectedAuthorLogin -
 * `authorInsightsState.selectedAuthorLogin` remains its own internal
 * bookkeeping for that validation, not read by anything else.
 *
 * Dependency Contract:
 * - prLinkHelpers/dataHelpers/draftHelpers: required but unused, see above
 * - displayHelpers: Display/formatting helpers (buildAuthorInsightsEntries)
 * - authorInsightsState: Component state object
 * - recomputeDirtyPrSectionsFields: Side effect for dirty field tracking
 * - documentRef: Document reference (optional, defaults to global document)
 */

// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsAuthorInsightsComponent fallback.
export const { createPrAuthorInsightsComponent } = (() => {
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
    // React migration hook (see REACT_MIGRATION_PLAN.md): pushes the
    // canonical selected-author login into PrDataContext, read by
    // AuthorInsightsSelector/AuthorInsightsHeader/AuthorCreatedPrsSection/
    // AuthorInsightsNotesSection/AuthorInsightsCommentsSection - the
    // `Safe` wrapper below just guards against the hook not being passed
    // at all (e.g. an older unit test fixture).
    updateReactSelectedAuthorLogin,
  } = {}) => {
    const updateReactSelectedAuthorLoginSafe =
      typeof updateReactSelectedAuthorLogin === "function"
        ? updateReactSelectedAuthorLogin
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

      // Every Author Insights section is its own static sibling container
      // (see index.html) that React mounts into once and owns from then
      // on - this function must never rebuild any of them (the old
      // vanilla behavior did, via a single `host.innerHTML = ""` that
      // covered every section alike), or it would silently tear the
      // mounted React roots' DOM out from under them on every
      // author-insights render, exactly the class of bug Phase 1's
      // #pr-sections handling guards against. The empty-state message
      // below is appended directly into `host` instead, since it's no
      // longer a generic "whatever's currently showing" scratch container.

      // Empty rows guard
      if (!rows.length) {
        // Every React-owned section reads selectedAuthorLogin/payload from
        // PrDataContext directly (Track C) and clears/hides itself once
        // that Context value (or the payload backing it) goes empty - this
        // is the one write site responsible for clearing it.
        updateReactSelectedAuthorLoginSafe("");
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
        updateReactSelectedAuthorLoginSafe("");
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

      const selectedAuthor =
        authorOptions.find(
          (author) => author.login === authorInsightsState.selectedAuthorLogin,
        ) || authorOptions[0];

      // Every React-owned section (selector/header/created-PRs/notes/
      // comments) reads payload/selectedAuthorLogin from PrDataContext
      // directly (Track C, REACT_MIGRATION_PLAN.md) instead of being
      // pushed data here - this is the one write site that keeps that
      // Context value in sync, covering both explicit selections
      // (window.selectAuthorInsightsAuthor calls this function right
      // after) and the auto-select-first-author fallback above, which
      // bypasses that handler entirely.
      updateReactSelectedAuthorLoginSafe(selectedAuthor.login);

      recomputeDirtyPrSectionsFields?.();
    };

    return {
      renderAuthorInsights,
    };
  };

  return {
    createPrAuthorInsightsComponent,
  };
})();
