import { useCallback } from 'react';
import { postJson } from '../helpers/pr-http.helpers.js';
import { buildFailureSnackbarNotification } from '../helpers/pr-failure-snackbar.helpers.js';

const notifyFailureSnackbar = (title, errorSource, fallbackMessage) => {
  const { title: finalTitle, detail } = buildFailureSnackbarNotification(
    title,
    errorSource,
    fallbackMessage,
  );
  window.showErrorNotification?.(finalTitle, detail, 0);
};

/**
 * Phase H.9 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
 * replaces window.handleDispatcherBump/handleResetCircuitBreaker -
 * ActivityDrawerDispatcherSection.jsx/ActivityDrawerCircuitBreakerSection.jsx's
 * own instances (react-app.jsx) now call this hook's returned functions
 * directly. Neither ever had its own DI-factory (unlike backfill/ack-label/
 * quick-check) - both were always plain top-level functions in
 * index.page.js, so (matching useRunScript.jsx's own precedent for pieces
 * with no separate factory) their logic is inlined here rather than
 * inventing a factory that wouldn't otherwise exist. Both only ever need
 * postJson (bare import) and notifyFailureSnackbar (same
 * buildFailureSnackbarNotification + window.showErrorNotification
 * composition every other hook in this file uses) - no busy/queued/status
 * state at all, since neither applies a result to the UI itself (the
 * drawer's own queue/circuit-breaker sections re-render from the next SSE
 * frame instead).
 */
export function useActivityDrawerActions() {
  const handleDispatcherBump = useCallback(async (repo, taskType) => {
    try {
      const { response, result } = await postJson('/view-prs/dispatcher/bump', {
        repo,
        taskType,
      });
      if (!response.ok || result.ok === false) {
        notifyFailureSnackbar('Reprioritize failed', result, 'Unable to reprioritize this task');
        return false;
      }
      return true;
    } catch (error) {
      notifyFailureSnackbar('Reprioritize failed', error, 'Unable to reach the server');
      return false;
    }
  }, []);

  const handleResetCircuitBreaker = useCallback(async () => {
    try {
      const { response, result } = await postJson('/view-prs/circuit-breaker/reset', {});
      if (!response.ok || result.ok === false) {
        notifyFailureSnackbar('Reset failed', result, 'Unable to reset the circuit breaker');
        return false;
      }
      return true;
    } catch (error) {
      notifyFailureSnackbar('Reset failed', error, 'Unable to reach the server');
      return false;
    }
  }, []);

  return { handleDispatcherBump, handleResetCircuitBreaker };
}
