// Phase 7, sub-phase 7.3 (revised scope - see REACT_MIGRATION_PLAN.md): pure
// extraction of index.page.js's former runAckAction/runAckOnlyWorkflow/
// runClearOnlyWorkflow/runApplyLabelAction/runApplyLabelWorkflow function
// bodies into a DI-factory module, matching the pattern every other complex
// index.page.js function already uses (e.g. pr-single-pr-update.helpers.js,
// pr-data-polling-orchestration.helpers.js, pr-row-checkbox-actions.helpers.js).
// This is a byte-for-byte-logic-preserving move, not a rewrite.
//
// runAckOnlyWorkflow/runClearOnlyWorkflow/runApplyLabelWorkflow have two
// callers each, both kept working unchanged by this extraction:
// react-callbacks.helpers.js's handleAckAction/handleApplyLabel (the React
// checkbox/apply-label-select path), and index.page.js's own
// handleAckOnly/handleClearOnly/handleApplyLabelClick (the vanilla "Run &
// Filter" tab's form buttons) - both still call these same-named,
// now-thin-wrapper functions in index.page.js exactly as before.
export const { createPrAckLabelActionsHelpers } = (() => {
  const createPrAckLabelActionsHelpers = ({
    postJson,
    setStatusMessage,
    setOutputMessage,
    beginRequestActivity,
    getGithubAuthFailureHint,
    formatCommandOutput,
    formatCommandOutputWithAuthHint,
    showErrorNotification,
    showWarningNotification,
    summarizeAckRefreshWarnings,
    renderPrData,
    loadStoredData,
    getFormBody,
    defaultRepo,
  } = {}) => {
    const postJsonSafe = typeof postJson === "function" ? postJson : async () => ({
      response: { ok: false },
      result: { ok: false, error: "postJson is not available" },
    });
    const setStatusMessageSafe = typeof setStatusMessage === "function" ? setStatusMessage : () => {};
    const setOutputMessageSafe = typeof setOutputMessage === "function" ? setOutputMessage : () => {};
    const beginRequestActivitySafe =
      typeof beginRequestActivity === "function" ? beginRequestActivity : () => () => {};
    const getGithubAuthFailureHintSafe =
      typeof getGithubAuthFailureHint === "function" ? getGithubAuthFailureHint : () => "";
    const formatCommandOutputSafe =
      typeof formatCommandOutput === "function" ? formatCommandOutput : () => "";
    const formatCommandOutputWithAuthHintSafe =
      typeof formatCommandOutputWithAuthHint === "function" ? formatCommandOutputWithAuthHint : () => "";
    const showErrorNotificationSafe =
      typeof showErrorNotification === "function" ? showErrorNotification : () => {};
    const showWarningNotificationSafe =
      typeof showWarningNotification === "function" ? showWarningNotification : () => {};
    const summarizeAckRefreshWarningsSafe =
      typeof summarizeAckRefreshWarnings === "function" ? summarizeAckRefreshWarnings : () => null;
    const renderPrDataSafe = typeof renderPrData === "function" ? renderPrData : () => {};
    const loadStoredDataSafe = typeof loadStoredData === "function" ? loadStoredData : async () => {};
    const getFormBodySafe = typeof getFormBody === "function" ? getFormBody : () => ({});
    const defaultRepoSafe = typeof defaultRepo === "string" ? defaultRepo : "";

    const runAckAction = async (payload, actionLabel) => {
      setStatusMessageSafe(`${actionLabel}...`);
      setOutputMessageSafe("");
      const finishActivity = beginRequestActivitySafe("ackClear");

      try {
        const { response, result } = await postJsonSafe("/view-prs/ack", payload);

        if (!response.ok || result.ok === false) {
          const authHint = getGithubAuthFailureHintSafe(result);
          setStatusMessageSafe(
            authHint
              ? `Failed (${response.status}) - GitHub auth required`
              : `Failed (${response.status})`,
          );
          setOutputMessageSafe(formatCommandOutputWithAuthHintSafe(result));
          showErrorNotificationSafe(
            `${actionLabel} failed`,
            authHint
              ? "GitHub authentication or SSO required. Check the output below for authorization link."
              : `HTTP ${response.status}: Check the output below for details.`,
            0,
          );
          return;
        }

        setStatusMessageSafe(`${actionLabel} completed`);
        setOutputMessageSafe(
          formatCommandOutputSafe(result, { includeError: false }) ||
            `${actionLabel} completed.`,
        );

        const warningSummary = summarizeAckRefreshWarningsSafe(result?.refreshErrors);
        if (warningSummary) {
          showWarningNotificationSafe(
            `${actionLabel} completed with warnings (${warningSummary.summaryText})`,
            warningSummary.sample,
          );
        }

        if (result.prData) {
          renderPrDataSafe(result.prData, payload.repo || defaultRepoSafe);
        } else {
          await loadStoredDataSafe(payload.repo || defaultRepoSafe);
        }
      } catch (error) {
        setStatusMessageSafe("Failed (network/error)");
        setOutputMessageSafe(String(error));
        showErrorNotificationSafe(
          `${actionLabel} failed`,
          String(error || "An unknown error occurred"),
          0,
        );
      } finally {
        finishActivity();
      }
    };

    const runAckOnlyWorkflow = async (ackValue = "", repoOverride = "") => {
      const body = getFormBodySafe();

      const ack = String(ackValue || body.prNumbers || "").trim();
      if (!ack) {
        setStatusMessageSafe('Ack only requires numeric value(s) in "PR number(s)"');
        return;
      }

      const repo = String(repoOverride || body.repo || "").trim();
      await runAckAction({ repo, ack }, "Ack only");
    };

    const runClearOnlyWorkflow = async (ackClearValue = "", repoOverride = "") => {
      const body = getFormBodySafe();

      const ackClear = String(ackClearValue || body.prNumbers || "").trim();
      if (!ackClear) {
        setStatusMessageSafe('Clear only requires numeric value(s) in "PR number(s)"');
        return;
      }

      const repo = String(repoOverride || body.repo || "").trim();
      await runAckAction({ repo, ackClear }, "Clear only");
    };

    const runApplyLabelAction = async ({ repo, label, prNumbers }, actionLabel) => {
      setStatusMessageSafe(`${actionLabel}...`);
      setOutputMessageSafe("");
      const finishActivity = beginRequestActivitySafe("labelApply");

      try {
        const { response, result } = await postJsonSafe("/view-prs/labels/apply", {
          repo,
          label,
          prNumbers,
        });

        if (!response.ok || result.ok === false) {
          const authHint = getGithubAuthFailureHintSafe(result);
          setStatusMessageSafe(
            authHint
              ? `Failed (${response.status}) - GitHub auth required`
              : `Failed (${response.status})`,
          );
          setOutputMessageSafe(formatCommandOutputWithAuthHintSafe(result));
          showErrorNotificationSafe(
            `${actionLabel} failed`,
            authHint
              ? "GitHub authentication or SSO required. Check the output below for authorization link."
              : String(result?.error || `HTTP ${response.status}: Check the output below for details.`),
            0,
          );
          return;
        }

        setStatusMessageSafe(result.summary || `${actionLabel} completed`);

        const combinedErrors = [
          ...(Array.isArray(result.applyErrors) ? result.applyErrors : []),
          ...(Array.isArray(result.refreshErrors) ? result.refreshErrors : []),
        ];
        if (combinedErrors.length) {
          showWarningNotificationSafe(
            `${actionLabel} completed with ${combinedErrors.length} error(s)`,
            combinedErrors
              .map((entry) => `#${entry.prNumber}: ${entry.error}`)
              .join("\n"),
          );
        }

        if (result.prData) {
          renderPrDataSafe(result.prData, repo || defaultRepoSafe);
        } else {
          await loadStoredDataSafe(repo || defaultRepoSafe);
        }
      } catch (error) {
        setStatusMessageSafe("Failed (network/error)");
        setOutputMessageSafe(String(error));
        showErrorNotificationSafe(
          `${actionLabel} failed`,
          String(error || "An unknown error occurred"),
          0,
        );
      } finally {
        finishActivity();
      }
    };

    const runApplyLabelWorkflow = async (prNumbersValue = "", labelValue = "", repoOverride = "") => {
      const body = getFormBodySafe();

      const prNumbers = String(prNumbersValue || body.prNumbers || "").trim();
      if (!prNumbers) {
        setStatusMessageSafe('Apply label requires numeric value(s) in "PR number(s)"');
        return;
      }

      const label = String(labelValue || "").trim();
      if (!label) {
        setStatusMessageSafe("Choose a label to apply");
        return;
      }

      const repo = String(repoOverride || body.repo || "").trim();
      await runApplyLabelAction({ repo, label, prNumbers }, "Apply label");
    };

    return {
      runAckAction,
      runAckOnlyWorkflow,
      runClearOnlyWorkflow,
      runApplyLabelAction,
      runApplyLabelWorkflow,
    };
  };

  return {
    createPrAckLabelActionsHelpers,
  };
})();
