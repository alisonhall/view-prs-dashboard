import { useCallback } from 'react';
import { postJson } from '../helpers/pr-http.helpers.ts';
import { useNotifyFailureSnackbar } from './useNotifyFailureSnackbar';

// What the dispatcher-bump and circuit-breaker-reset routes return.
interface ActionRouteResult {
  ok?: boolean;
  error?: string;
}

export interface ActivityDrawerActions {
  // Moves a queued dispatcher task to the front. Resolves false on failure.
  handleDispatcherBump: (repo: string, taskType: string) => Promise<boolean>;
  // Resets the GitHub circuit breaker. Resolves false on failure.
  handleResetCircuitBreaker: () => Promise<boolean>;
}

/**
 * The activity drawer's dispatcher "Reprioritize" and circuit-breaker
 * "Reset" actions (ActivityDrawerDispatcherSection.jsx/
 * ActivityDrawerCircuitBreakerSection.jsx, via react-app.jsx). Each POSTs
 * and shows a failure snackbar on error; neither applies a result itself -
 * the drawer's sections re-render from the next SSE frame.
 */
export function useActivityDrawerActions(): ActivityDrawerActions {
  const notifyFailureSnackbar = useNotifyFailureSnackbar();

  const handleDispatcherBump = useCallback(
    async (repo: string, taskType: string) => {
      try {
        const { response, result } = await postJson<ActionRouteResult>('/view-prs/dispatcher/bump', {
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
    },
    [notifyFailureSnackbar],
  );

  const handleResetCircuitBreaker = useCallback(async () => {
    try {
      const { response, result } = await postJson<ActionRouteResult>('/view-prs/circuit-breaker/reset', {});
      if (!response.ok || result.ok === false) {
        notifyFailureSnackbar('Reset failed', result, 'Unable to reset the circuit breaker');
        return false;
      }
      return true;
    } catch (error) {
      notifyFailureSnackbar('Reset failed', error, 'Unable to reach the server');
      return false;
    }
  }, [notifyFailureSnackbar]);

  return { handleDispatcherBump, handleResetCircuitBreaker };
}
