import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useOptionalPrData } from './PrDataContext';

// A clone named in Settings › Local clones, as the server found it.
export interface LocalRepoStatus {
  path: string;
  ok: boolean;
  error?: string;
  branchCount?: number;
  worktreeCount?: number;
  // How Check out makes a PR's worktree; plain git without.
  checkout?: LocalRepoCheckout;
}

// The user's own checkout command instead of git (forks: for forks' PRs
// too), a command run in a worktree git made, the folder pattern for git's
// worktrees, and variables given to the commands. cleanupList and
// cleanupRemove: the repo's own commands for Clean up, else plain git.
export interface LocalRepoCheckout {
  command?: string;
  forks?: boolean;
  after?: string;
  folder?: string;
  env?: Record<string, string>;
  cleanupList?: string;
  cleanupRemove?: string;
}

// This computer's commands for the pane's Open in editor and Terminal;
// VS Code's code and the system's terminal without.
export interface OpenWithSettings {
  editor?: string;
  terminal?: string;
}

// What this computer has of a PR's branch (GET /view-prs/local-branches):
// ahead/behind compared with the PR's newest commit as last fetched -
// exact false when counted from the PR's commits (its newest isn't in the
// clone yet), diverged when neither can say.
export interface LocalBranchInfo {
  branch: string;
  oid: string;
  worktreePath?: string;
  // Its worktree is mid-rebase (stopped on a conflict, or at an edit).
  rebasing?: boolean;
  ahead?: number;
  behind?: number;
  exact?: boolean;
  diverged?: boolean;
  // Found by the PR's branch's name alone, tracking nothing: perhaps not
  // the PR's code.
  nameOnly?: boolean;
  // Its commits on neither the PR (as last fetched) nor the clone's copy of
  // the remote branch it tracks; absent when the clone can't tell, or for
  // a branch found by its name alone.
  unpushed?: number;
}

// How Check out would make an open PR's worktree, as the server decides
// it: with the repo's checkout command or with git; fork: a fork's PR.
export interface CheckoutPlan {
  how: 'command' | 'git';
  fork: boolean;
}

export interface LocalBranchesValue {
  repos: Record<string, LocalRepoStatus>;
  prs: Record<string, LocalBranchInfo>;
  plans: Record<string, CheckoutPlan>;
  // The server's platform (win32, darwin, linux), '' until known: Explorer
  // or Finder by it.
  platform: string;
  openWith: OpenWithSettings;
  // Whether the server has answered yet: until then no repo has a clone.
  loaded: boolean;
  // Asks again now (after a clone is saved or removed).
  refresh: () => void;
  // Settings' answers, until the next check.
  setRepos: (repos: Record<string, LocalRepoStatus>) => void;
}

export const EMPTY_LOCAL_BRANCHES: LocalBranchesValue = {
  repos: {},
  prs: {},
  plans: {},
  platform: '',
  openWith: {},
  loaded: false,
  refresh: () => {},
  setRepos: () => {},
};
const EMPTY = EMPTY_LOCAL_BRANCHES;
// Exported for tests, which give it a value of their own.
export const LocalBranchesContext = createContext<LocalBranchesValue>(EMPTY);

// How often it looks again while the page is open: branches change as
// you work, not with the PR data - not while the page is hidden. Also when
// the window is focused again (back from the editor), and when the PRs'
// data changes (a new commit).
const POLL_MS = 60 * 1000;

interface LocalBranchesResult {
  ok?: boolean;
  repos?: Record<string, LocalRepoStatus>;
  prs?: Record<string, LocalBranchInfo>;
  plans?: Record<string, CheckoutPlan>;
  platform?: string;
  openWith?: OpenWithSettings;
}

/**
 * Each PR's local branch, for the rows' "Local" chip and the pane. Fetched
 * on load, every minute, on focus and when the data changes; nothing kept
 * when nothing changed, so the rows don't re-render.
 */
export function LocalBranchesProvider({ children, pollMs = POLL_MS }: { children: ReactNode; pollMs?: number }) {
  const dataVersion = useOptionalPrData()?.payload?.dataMeta?.dataVersion || '';
  const [state, setState] = useState<{
    repos: Record<string, LocalRepoStatus>;
    prs: Record<string, LocalBranchInfo>;
    plans: Record<string, CheckoutPlan>;
    platform: string;
    openWith: OpenWithSettings;
    loaded: boolean;
  }>({
    repos: {},
    prs: {},
    plans: {},
    platform: '',
    openWith: {},
    loaded: false,
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
      const next = {
        repos: result.repos || {},
        prs: result.prs || {},
        plans: result.plans || {},
        platform: result.platform || '',
        openWith: result.openWith || {},
        loaded: true,
      };
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

export const useCheckoutPlan = (repo: string, prNumber: string | number | undefined): CheckoutPlan | null =>
  useContext(LocalBranchesContext).plans[`${repo}#${prNumber}`] || null;

// Your own PR's local commits GitHub doesn't have (as far as the clone can
// tell): the count, else 0.
export const unpushedOf = (info: LocalBranchInfo, mine: boolean): number => (mine ? info.unpushed || 0 : 0);

// "Up to date", "2 behind", "1 ahead, 3 behind", "Differs from GitHub" -
// for your own PR, what isn't pushed in place of ahead: "2 not pushed, 1
// behind", "Differs from GitHub, 2 not pushed".
export const describeLocalBranch = (info: LocalBranchInfo, { mine = false }: { mine?: boolean } = {}): string => {
  const unpushed = unpushedOf(info, mine);
  const notPushed = unpushed ? `${unpushed} not pushed` : '';
  if (info.diverged) return ['Differs from GitHub', notPushed].filter(Boolean).join(', ');
  const ahead = info.ahead || 0;
  const behind = info.behind || 0;
  if (!ahead && !behind) return 'Up to date';
  const parts = [notPushed || (ahead ? `${ahead} ahead` : ''), behind ? `${behind}${info.exact === false ? '+' : ''} behind` : ''].filter(Boolean);
  return parts.join(', ');
};
