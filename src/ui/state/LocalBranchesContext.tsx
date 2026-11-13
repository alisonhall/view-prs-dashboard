import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useOptionalPrData } from './PrDataContext';

// A clone named in Settings › Local clones, as the server found it.
export interface LocalRepoStatus {
  path: string;
  ok: boolean;
  error?: string;
  branchCount?: number;
  worktreeCount?: number;
}

// What this computer has of a PR's branch (GET /view-prs/local-branches):
// ahead/behind compared with the PR's newest commit as last fetched -
// exact false when counted from the PR's commits (its newest isn't in the
// clone yet), diverged when neither can say.
export interface LocalBranchInfo {
  branch: string;
  oid: string;
  worktreePath?: string;
  ahead?: number;
  behind?: number;
  exact?: boolean;
  diverged?: boolean;
}

export interface LocalBranchesValue {
  repos: Record<string, LocalRepoStatus>;
  prs: Record<string, LocalBranchInfo>;
  // Asks again now (after a clone is saved or removed).
  refresh: () => void;
  // Settings' answers, until the next check.
  setRepos: (repos: Record<string, LocalRepoStatus>) => void;
}

const EMPTY: LocalBranchesValue = { repos: {}, prs: {}, refresh: () => {}, setRepos: () => {} };
const LocalBranchesContext = createContext<LocalBranchesValue>(EMPTY);

// How often it looks again while the page is open: branches change as
// you work, not with the PR data - not while the page is hidden. Also when
// the window is focused again (back from the editor), and when the PRs'
// data changes (a new commit).
const POLL_MS = 60 * 1000;

interface LocalBranchesResult {
  ok?: boolean;
  repos?: Record<string, LocalRepoStatus>;
  prs?: Record<string, LocalBranchInfo>;
}

/**
 * Each PR's local branch, for the rows' "Local" chip and the pane. Fetched
 * on load, every minute, on focus and when the data changes; nothing kept
 * when nothing changed, so the rows don't re-render.
 */
export function LocalBranchesProvider({ children, pollMs = POLL_MS }: { children: ReactNode; pollMs?: number }) {
  const dataVersion = useOptionalPrData()?.payload?.dataMeta?.dataVersion || '';
  const [state, setState] = useState<{ repos: Record<string, LocalRepoStatus>; prs: Record<string, LocalBranchInfo> }>({
    repos: {},
    prs: {},
  });
  const lastText = useRef('');
  const inFlight = useRef(false);
  // Asked for while a check was running (a clone just saved): once more after it.
  const again = useRef(false);

  const load = useCallback(async (): Promise<void> => {
    if (inFlight.current) {
      again.current = true;
      return;
    }
    inFlight.current = true;
    try {
      const response = await fetch('/view-prs/local-branches', { cache: 'no-store' });
      if (!response.ok) return;
      const result = (await response.json()) as LocalBranchesResult;
      const next = { repos: result.repos || {}, prs: result.prs || {} };
      const text = JSON.stringify(next);
      if (text === lastText.current) return;
      lastText.current = text;
      setState(next);
    } catch (_error) {
      // Next time.
    } finally {
      inFlight.current = false;
      if (again.current) {
        again.current = false;
        void load();
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, dataVersion]);

  useEffect(() => {
    // Not while the page is hidden (another tab): coming back checks.
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') void load();
    }, pollMs);
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [load, pollMs]);

  const setRepos = useCallback((repos: Record<string, LocalRepoStatus>) => {
    setState((previous) => ({ ...previous, repos }));
    lastText.current = '';
  }, []);

  const value = useMemo<LocalBranchesValue>(
    () => ({ ...state, refresh: () => void load(), setRepos }),
    [state, load, setRepos],
  );
  return <LocalBranchesContext.Provider value={value}>{children}</LocalBranchesContext.Provider>;
}

export const useLocalBranches = () => useContext(LocalBranchesContext);

export const useLocalBranch = (repo: string, prNumber: string | number | undefined): LocalBranchInfo | null =>
  useContext(LocalBranchesContext).prs[`${repo}#${prNumber}`] || null;

// "Up to date", "2 behind", "1 ahead, 3 behind", "Differs from GitHub".
export const describeLocalBranch = (info: LocalBranchInfo): string => {
  if (info.diverged) return 'Differs from GitHub';
  const ahead = info.ahead || 0;
  const behind = info.behind || 0;
  if (!ahead && !behind) return 'Up to date';
  const parts = [ahead ? `${ahead} ahead` : '', behind ? `${behind}${info.exact === false ? '+' : ''} behind` : ''].filter(Boolean);
  return parts.join(', ');
};
