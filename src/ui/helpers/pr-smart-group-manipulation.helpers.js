(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsSmartGroupManipulationHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  /**
   * Factory for creating smart group manipulation helpers.
   * These helpers enable moving PR rows between smart group sections
   * without full table re-renders (optimistic UI updates).
   *
   * @param {Object} deps - Dependencies
   * @param {Function} deps.getSmartGroupSection - Get smart group section element by key
   * @param {Function} deps.getPrRowElement - Get PR row element by number
   * @param {Function} deps.updateSectionCount - Update smart group PR count
   * @param {Function} deps.entryNeedsAttention - Check if entry needs attention
   * @param {Function} deps.hasUserInteraction - Check if user has interacted
   * @returns {Object} Helper functions for smart group manipulation
   */
  const createPrSmartGroupManipulationHelpers = ({
    getSmartGroupSection = () => null,
    getPrRowElement = () => null,
    updateSectionCount = () => {},
    entryNeedsAttention = () => false,
    hasUserInteraction: _hasUserInteraction = () => false,
  } = {}) => {
    /**
     * Move a PR row into a smart group section.
     *
     * @param {string} prNumber - PR number
     * @param {string} groupKey - Smart group key (flagged, in-review, needs-attention, interacted)
     * @returns {boolean} True if successfully added
     */
    const addPrToSmartGroup = (prNumber, groupKey) => {
      const prRow = getPrRowElement(prNumber);
      const groupSection = getSmartGroupSection(groupKey);

      if (!prRow || !groupSection) {
        return false;
      }

      // Check if PR is already in this smart group
      const prRowsContainer = groupSection.querySelector('tbody');
      if (!prRowsContainer) {
        return false;
      }

      const existingRow = prRowsContainer.querySelector(
        `tr[data-pr-number="${prNumber}"]`
      );
      if (existingRow) {
        return false; // Already in group
      }

      // Clone the PR row (PR can appear in multiple smart groups)
      const clonedRow = prRow.cloneNode(true);

      // Append to smart group
      prRowsContainer.appendChild(clonedRow);

      // Update count
      updateSectionCount(groupKey, +1);

      return true;
    };

    /**
     * Remove a PR row from a smart group section.
     *
     * @param {string} prNumber - PR number
     * @param {string} groupKey - Smart group key
     * @returns {boolean} True if successfully removed
     */
    const removePrFromSmartGroup = (prNumber, groupKey) => {
      const groupSection = getSmartGroupSection(groupKey);

      if (!groupSection) {
        return false;
      }

      const prRowsContainer = groupSection.querySelector('tbody');
      if (!prRowsContainer) {
        return false;
      }

      const existingRow = prRowsContainer.querySelector(
        `tr[data-pr-number="${prNumber}"]`
      );

      if (!existingRow) {
        return false; // Not in group
      }

      // Remove the row
      existingRow.remove();

      // Update count
      updateSectionCount(groupKey, -1);

      return true;
    };

    /**
     * Check if PR needs attention for reasons OTHER than in-review status.
     * Used to determine if PR should stay in "Needs Attention" when unchecking in-review.
     *
     * @param {Object} entry - PR entry
     * @param {Object} config - Attention configuration
     * @returns {boolean} True if has other attention reasons
     */
    const hasOtherAttentionReasons = (entry, config) => {
      // Create a temporary entry with in-review disabled
      const tempEntry = {
        ...entry,
        data: {
          ...entry.data,
          // Temporarily clear in-review to check other reasons
        },
      };

      // Check attention without in-review flag
      return entryNeedsAttention(tempEntry, config);
    };

    /**
     * Update smart groups after toggling in-review checkbox.
     * In-review PRs appear in both "In Review" and "Needs Attention" groups.
     *
     * @param {string} prNumber - PR number
     * @param {boolean} newInReviewState - New in-review state
     * @param {Object} entry - PR entry
     * @param {Object} config - Attention configuration
     * @returns {Object} Object with added/removed arrays
     */
    const updateSmartGroupsForInReview = (
      prNumber,
      newInReviewState,
      entry,
      config
    ) => {
      const changes = {
        added: [],
        removed: [],
      };

      if (newInReviewState) {
        // Adding in-review
        if (addPrToSmartGroup(prNumber, 'in-review')) {
          changes.added.push('in-review');
        }
        // In-review PRs always need attention
        if (addPrToSmartGroup(prNumber, 'needs-attention')) {
          changes.added.push('needs-attention');
        }
      } else {
        // Removing in-review
        if (removePrFromSmartGroup(prNumber, 'in-review')) {
          changes.removed.push('in-review');
        }
        // Only remove from needs-attention if no other reasons
        if (!hasOtherAttentionReasons(entry, config)) {
          if (removePrFromSmartGroup(prNumber, 'needs-attention')) {
            changes.removed.push('needs-attention');
          }
        }
      }

      return changes;
    };

    /**
     * Update smart groups after toggling flagged checkbox.
     *
     * @param {string} prNumber - PR number
     * @param {boolean} newFlaggedState - New flagged state
     * @returns {Object} Object with added/removed arrays
     */
    const updateSmartGroupsForFlagged = (prNumber, newFlaggedState) => {
      const changes = {
        added: [],
        removed: [],
      };

      if (newFlaggedState) {
        // Adding flagged
        if (addPrToSmartGroup(prNumber, 'flagged')) {
          changes.added.push('flagged');
        }
      } else {
        // Removing flagged
        if (removePrFromSmartGroup(prNumber, 'flagged')) {
          changes.removed.push('flagged');
        }
      }

      return changes;
    };

    /**
     * Revert smart group changes (used on error).
     *
     * @param {string} prNumber - PR number
     * @param {Object} changes - Changes object from update function
     * @returns {void}
     */
    const revertSmartGroupChanges = (prNumber, changes) => {
      // Undo added groups (remove them)
      changes.added.forEach((groupKey) => {
        removePrFromSmartGroup(prNumber, groupKey);
      });

      // Undo removed groups (add them back)
      changes.removed.forEach((groupKey) => {
        addPrToSmartGroup(prNumber, groupKey);
      });
    };

    return {
      addPrToSmartGroup,
      removePrFromSmartGroup,
      hasOtherAttentionReasons,
      updateSmartGroupsForInReview,
      updateSmartGroupsForFlagged,
      revertSmartGroupChanges,
    };
  };

  return {
    createPrSmartGroupManipulationHelpers,
  };
});
