import type { PrData, PrDataPayload, PrEntry } from "../types/pr-data.ts";

// The In Review and Flagged checkboxes' server calls
// (useRowCheckboxActions, used by PrTableApp): POST /view-prs/ack, then
// update the stored payload from the response. On failure the checkbox is
// set back and a snackbar shown.
//
// The two functions are structurally near-identical but deliberately not
// merged: their status/notification wording differs in small ways
// ("Enabling in-review for #X" vs "Flagging #X" - the flagged variant
// never says "for"), so a shared template risks a subtle wording bug.

// The checkbox the action updates. PrTableApp passes a plain { checked }
// stand-in rather than the DOM element; the real checkbox is a controlled
// React input that re-derives from the payload.
export interface CheckboxLike {
  checked?: boolean;
  disabled?: boolean;
}

// What a successful toggle hands back: the payload it stored, so the
// caller can push it into React without reading Context back the same tick.
export interface CheckboxToggleResult {
  payload: PrDataPayload | null | undefined;
  selectedRepo: string;
}

type ToggleRow = Pick<PrData, "number">;
type ToggleEntry = Pick<PrEntry, "prNumber" | "repo">;

interface AckToggleResult {
  ok?: boolean;
  flaggedByRepo?: unknown;
  inReviewByRepo?: unknown;
  prData?: PrDataPayload;
}

export interface PrRowCheckboxActionsDeps {
  fetchFn?: (input: string, init?: RequestInit) => Promise<Response>;
  setStatusTextOnly?: (message: string) => void;
  notifyFailureSnackbar?: (title: string, errorSource: unknown, fallbackMessage?: string) => void;
  getLatestStoredPayload?: () => PrDataPayload | null | undefined;
  getLatestSelectedRepo?: () => string;
  applyLatestPrData?: (update: { payload: PrDataPayload | null | undefined; selectedRepo: string }) => void;
  loadStoredData?: (repo: string) => Promise<unknown>;
  // Tracks the toggle in the activity drawer, so a request that takes
  // unusually long becomes visible under "In-flight user actions".
  beginRequestActivity?: (kind: string) => () => void;
}

const createPrRowCheckboxActionsHelpers = ({
  fetchFn,
  setStatusTextOnly,
  notifyFailureSnackbar,
  getLatestStoredPayload,
  getLatestSelectedRepo,
  applyLatestPrData,
  loadStoredData,
  beginRequestActivity,
}: PrRowCheckboxActionsDeps = {}) => {
  const fetchFnSafe =
    typeof fetchFn === "function"
      ? fetchFn
      : async (): Promise<Response> => {
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
  const beginRequestActivitySafe =
    typeof beginRequestActivity === "function" ? beginRequestActivity : () => () => {};

  // Every exit returns null (failure) or { payload, selectedRepo }
  // (success), so the caller pushes the just-computed value into React
  // directly instead of reading the stored payload back right after this
  // writes it (a setState-backed Context can't satisfy a same-tick read).
  const toggleInReviewForRow = async (
    entry: ToggleEntry,
    row: ToggleRow,
    nextValue: boolean,
    checkbox: CheckboxLike,
  ): Promise<CheckboxToggleResult | null> => {
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
    const finishActivity = beginRequestActivitySafe("checkboxToggle");

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
      const result: AckToggleResult = await response.json();

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
      finishActivity();
    }
  };

  const toggleFlaggedForRow = async (
    entry: ToggleEntry,
    row: ToggleRow,
    nextValue: boolean,
    checkbox: CheckboxLike,
  ): Promise<CheckboxToggleResult | null> => {
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
    const finishActivity = beginRequestActivitySafe("checkboxToggle");

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
      const result: AckToggleResult = await response.json();

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
      finishActivity();
    }
  };

  return {
    toggleInReviewForRow,
    toggleFlaggedForRow,
  };
};

export { createPrRowCheckboxActionsHelpers };
