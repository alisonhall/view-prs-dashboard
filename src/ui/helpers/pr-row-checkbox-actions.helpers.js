// Phase 7, sub-phase 7.3 (revised scope - see REACT_MIGRATION_PLAN.md): pure
// extraction of index.page.js's former toggleInReviewForRow/
// toggleFlaggedForRow function bodies into a DI-factory module, matching
// the pattern every other complex index.page.js function already uses
// (e.g. pr-single-pr-update.helpers.js, pr-data-polling-orchestration.helpers.js).
// This is a byte-for-byte-logic-preserving move, not a rewrite - every
// module-level read (`latestStoredPayload`/`latestSelectedRepo`) is now an
// injected getter, and the payload/repo write goes through
// index.page.js's existing centralized `applyLatestPrData` setter (Phase
// 7, sub-phase 7.2) the same way it already did before this extraction.
//
// These two functions are structurally near-identical but were NOT
// deduplicated here: their status/notification message wording has real
// grammatical differences (e.g. "Enabling in-review for #X" vs "Flagging
// #X" - the flagged variant never says "for"), so a naive shared template
// risks a subtle wording bug for a zero-risk pure extraction. Left as two
// separate functions; deduplicating them is a deliberate follow-up, not
// bundled into this pass.
export const { createPrRowCheckboxActionsHelpers } = (() => {
  const createPrRowCheckboxActionsHelpers = ({
    fetchFn,
    setStatusTextOnly,
    notifyFailureSnackbar,
    getLatestStoredPayload,
    getLatestSelectedRepo,
    applyLatestPrData,
    loadStoredData,
  } = {}) => {
    const fetchFnSafe = typeof fetchFn === "function" ? fetchFn : async () => {
      throw new Error("fetchFn is not available");
    };
    const setStatusTextOnlySafe =
      typeof setStatusTextOnly === "function" ? setStatusTextOnly : () => {};
    const notifyFailureSnackbarSafe =
      typeof notifyFailureSnackbar === "function" ? notifyFailureSnackbar : () => {};
    const getLatestStoredPayloadSafe =
      typeof getLatestStoredPayload === "function" ? getLatestStoredPayload : () => null;
    const getLatestSelectedRepoSafe =
      typeof getLatestSelectedRepo === "function" ? getLatestSelectedRepo : () => "";
    const applyLatestPrDataSafe =
      typeof applyLatestPrData === "function" ? applyLatestPrData : () => {};
    const loadStoredDataSafe =
      typeof loadStoredData === "function" ? loadStoredData : async () => {};

    // Phase 7, sub-phase 7.3 follow-up (see REACT_MIGRATION_PLAN.md): every
    // exit point returns either null (failure) or { payload, selectedRepo }
    // (success) instead of a bare return - this is what lets
    // react-callbacks.helpers.js push the just-computed value into React
    // directly, without reading latestStoredPayload back synchronously
    // right after this function writes it (the documented regression class
    // that deferred this - a setState-backed Context read can't satisfy a
    // same-tick readback, but using this function's own return value
    // doesn't go through Context at all).
    const toggleInReviewForRow = async (entry, row, nextValue, checkbox) => {
      const prNumber = String(row.number || entry.prNumber || "").trim();

      if (!prNumber) {
        checkbox.checked = !nextValue;
        setStatusTextOnlySafe("Unable to update in-review state: missing PR number");
        notifyFailureSnackbarSafe(
          "In-review update failed",
          "Missing PR number",
          "Unable to update in-review state",
        );
        return null;
      }

      checkbox.disabled = true;
      setStatusTextOnlySafe(`${nextValue ? "Enabling" : "Disabling"} in-review for #${prNumber}...`);

      try {
        const payload = {
          repo: entry.repo || getLatestSelectedRepoSafe() || "",
          ...(nextValue ? { inReview: prNumber } : { inReviewClear: prNumber }),
        };
        const response = await fetchFnSafe("/view-prs/ack", {
          method: "POST",
          body: JSON.stringify(payload),
          headers: { "Content-Type": "application/json" },
        });
        const result = await response.json();

        if (!response.ok || result.ok === false) {
          checkbox.checked = !nextValue;
          setStatusTextOnlySafe(`Failed to update in-review for #${prNumber}`);
          notifyFailureSnackbarSafe(
            `In-review update failed for #${prNumber}`,
            result,
            `Failed to update in-review for #${prNumber}`,
          );
          return null;
        }

        setStatusTextOnlySafe(`${nextValue ? "Enabled" : "Disabled"} in-review for #${prNumber}`);

        const selectedRepo = payload.repo || getLatestSelectedRepoSafe();

        // PERFORMANCE OPTIMIZATION: Update in-memory data without full re-render
        // Server now returns minimal delta (flaggedByRepo/inReviewByRepo) for checkbox operations
        if (result.flaggedByRepo && result.inReviewByRepo) {
          // Minimal response: only update flag data. Reassign (don't mutate)
          // latestStoredPayload so React's reference-equality checks (useState
          // bail-out, useEffect deps) actually detect the change and re-render.
          const currentPayload = getLatestStoredPayloadSafe();
          const updatedPayload = currentPayload
            ? {
                ...currentPayload,
                flaggedByRepo: result.flaggedByRepo,
                inReviewByRepo: result.inReviewByRepo,
              }
            : currentPayload;
          applyLatestPrDataSafe({ payload: updatedPayload, selectedRepo });
          // Don't call renderPrData() - checkbox already updated, UI is correct
          // Smart groups will update on next full refresh
          return { payload: updatedPayload, selectedRepo };
        } else if (result.prData) {
          // Full response (backward compatibility)
          applyLatestPrDataSafe({ payload: result.prData, selectedRepo });
          return { payload: result.prData, selectedRepo };
        } else {
          // Fallback to full reload only if no data returned
          await loadStoredDataSafe(selectedRepo || "");
          return { payload: getLatestStoredPayloadSafe(), selectedRepo };
        }
      } catch (_error) {
        checkbox.checked = !nextValue;
        setStatusTextOnlySafe(`Failed to update in-review for #${prNumber}`);
        notifyFailureSnackbarSafe(
          `In-review update failed for #${prNumber}`,
          _error,
          `Failed to update in-review for #${prNumber}`,
        );
        return null;
      } finally {
        checkbox.disabled = false;
      }
    };

    const toggleFlaggedForRow = async (entry, row, nextValue, checkbox) => {
      const prNumber = String(row.number || entry.prNumber || "").trim();

      if (!prNumber) {
        checkbox.checked = !nextValue;
        setStatusTextOnlySafe("Unable to update flagged state: missing PR number");
        notifyFailureSnackbarSafe(
          "Flagged update failed",
          "Missing PR number",
          "Unable to update flagged state",
        );
        return null;
      }

      checkbox.disabled = true;
      setStatusTextOnlySafe(`${nextValue ? "Flagging" : "Unflagging"} #${prNumber}...`);

      try {
        const payload = {
          repo: entry.repo || getLatestSelectedRepoSafe() || "",
          ...(nextValue ? { flagged: prNumber } : { flaggedClear: prNumber }),
        };
        const response = await fetchFnSafe("/view-prs/ack", {
          method: "POST",
          body: JSON.stringify(payload),
          headers: { "Content-Type": "application/json" },
        });
        const result = await response.json();

        if (!response.ok || result.ok === false) {
          checkbox.checked = !nextValue;
          setStatusTextOnlySafe(`Failed to update flagged state for #${prNumber}`);
          notifyFailureSnackbarSafe(
            `Flagged update failed for #${prNumber}`,
            result,
            `Failed to update flagged state for #${prNumber}`,
          );
          return null;
        }

        setStatusTextOnlySafe(`${nextValue ? "Flagged" : "Unflagged"} #${prNumber}`);

        const selectedRepo = payload.repo || getLatestSelectedRepoSafe();

        // PERFORMANCE OPTIMIZATION: Update in-memory data without full re-render
        // Server now returns minimal delta (flaggedByRepo/inReviewByRepo) for checkbox operations
        if (result.flaggedByRepo && result.inReviewByRepo) {
          // Minimal response: only update flag data. Reassign (don't mutate)
          // latestStoredPayload so React's reference-equality checks (useState
          // bail-out, useEffect deps) actually detect the change and re-render.
          const currentPayload = getLatestStoredPayloadSafe();
          const updatedPayload = currentPayload
            ? {
                ...currentPayload,
                flaggedByRepo: result.flaggedByRepo,
                inReviewByRepo: result.inReviewByRepo,
              }
            : currentPayload;
          applyLatestPrDataSafe({ payload: updatedPayload, selectedRepo });
          // Don't call renderPrData() - checkbox already updated, UI is correct
          // Smart groups will update on next full refresh
          return { payload: updatedPayload, selectedRepo };
        } else if (result.prData) {
          // Full response (backward compatibility)
          applyLatestPrDataSafe({ payload: result.prData, selectedRepo });
          return { payload: result.prData, selectedRepo };
        } else {
          // Fallback to full reload only if no data returned
          await loadStoredDataSafe(selectedRepo || "");
          return { payload: getLatestStoredPayloadSafe(), selectedRepo };
        }
      } catch (_error) {
        checkbox.checked = !nextValue;
        setStatusTextOnlySafe(`Failed to update flagged state for #${prNumber}`);
        notifyFailureSnackbarSafe(
          `Flagged update failed for #${prNumber}`,
          _error,
          `Failed to update flagged state for #${prNumber}`,
        );
        return null;
      } finally {
        checkbox.disabled = false;
      }
    };

    return {
      toggleInReviewForRow,
      toggleFlaggedForRow,
    };
  };

  return {
    createPrRowCheckboxActionsHelpers,
  };
})();
