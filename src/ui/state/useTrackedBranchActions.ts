import { useEffect, useState } from 'react';
import type { PrTrackedBranch } from '../types/pr-data.ts';
import { postJson } from '../helpers/pr-http.helpers.ts';
import { trackedBranchKey } from '../helpers/tracked-branches.helpers.ts';
import { useLocalBranches } from './LocalBranchesContext';
import { useSnackbar } from './SnackbarContext';

// How long what a Pull, Fetch or New branch did is shown.
export const NOTICE_MS = 12 * 1000;

export interface TrackedBranchNotice {
  text: string;
  repo?: string;
  // A new branch's folder, with Editor and Terminal beside the words.
  folder?: string;
}

/**
 * A tracked branch's Pull and Fetch, for its row (TrackedBranchesSection)
 * and its pane (BranchDetailPane): which one each is running for (by
 * repo:branch key), and what the last one did (notice, for a while -
 * longer when it has a folder to open; New branch sets one too).
 */
export function useTrackedBranchActions() {
  const { branches: statuses, refresh } = useLocalBranches();
  const { showError } = useSnackbar();
  const [pullingKey, setPullingKey] = useState('');
  const [fetchingKey, setFetchingKey] = useState('');
  const [notice, setNotice] = useState<TrackedBranchNotice | null>(null);
  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(null), notice.folder ? NOTICE_MS * 3 : NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // Pull: the remote branch it tracks fetched, then the branch
  // fast-forwarded to it - after asking, as the PR pane's Pull does.
  const pull = async (entry: PrTrackedBranch) => {
    const key = trackedBranchKey(entry.repo, entry.branch);
    const status = statuses[key];
    const upstream = status?.upstream;
    if (!upstream) return;
    const behind = upstream.behind || 0;
    const where = status?.worktreePath ? ` (checked out in ${status.worktreePath})` : '';
    if (
      !window.confirm(
        `Pull ${upstream.remote}/${upstream.branch} into ${entry.branch}${where}?\n\n${
          behind > 0 ? `${behind} new commit${behind === 1 ? '' : 's'} as of the last fetch - maybe more. ` : ''
        }Fast-forward only: it's fetched, then ${entry.branch} is moved up to it. Nothing changes if ${entry.branch} has commits of its own or uncommitted changes.`,
      )
    ) {
      return;
    }
    setPullingKey(key);
    try {
      const { response, result } = await postJson<{ ok?: boolean; error?: string; output?: string; commits?: number; already?: boolean }>(
        '/view-prs/tracked-branches/pull',
        { repo: entry.repo, branch: entry.branch },
      );
      if (!response.ok || result.ok === false) {
        showError("Couldn't pull", [result.error || `HTTP ${response.status}`, result.output ? result.output.split('\n').slice(-4).join('\n') : ''].filter(Boolean).join('\n'));
        return;
      }
      setNotice({
        text: result.already
          ? `${entry.branch} is up to date with ${upstream.remote}/${upstream.branch}.`
          : `Pulled ${result.commits} commit${result.commits === 1 ? '' : 's'} into ${entry.branch}.`,
      });
      refresh();
    } catch (error) {
      showError("Couldn't pull", error instanceof Error ? error.message : String(error));
    } finally {
      setPullingKey('');
    }
  };

  // Fetch: the remote branch it tracks fetched, so how far behind it is
  // is current; the branch itself is left as it is.
  const fetchBranch = async (entry: PrTrackedBranch) => {
    const key = trackedBranchKey(entry.repo, entry.branch);
    const upstream = statuses[key]?.upstream;
    if (!upstream) return;
    setFetchingKey(key);
    try {
      const { response, result } = await postJson<{ ok?: boolean; error?: string; output?: string; behind?: number; ahead?: number }>(
        '/view-prs/tracked-branches/fetch',
        { repo: entry.repo, branch: entry.branch },
      );
      if (!response.ok || result.ok === false) {
        showError("Couldn't fetch", result.error || `HTTP ${response.status}`);
        return;
      }
      const behind = result.behind || 0;
      setNotice({
        text:
          typeof result.behind !== 'number'
            ? `Fetched ${upstream.remote}/${upstream.branch}.`
            : behind > 0
              ? `Fetched ${upstream.remote}/${upstream.branch}: ${entry.branch} is ${behind} commit${behind === 1 ? '' : 's'} behind it - Pull brings ${behind === 1 ? 'it' : 'them'} in.`
              : `Fetched ${upstream.remote}/${upstream.branch}: ${entry.branch} is up to date with it.`,
      });
      refresh();
    } catch (error) {
      showError("Couldn't fetch", error instanceof Error ? error.message : String(error));
    } finally {
      setFetchingKey('');
    }
  };

  return { pull, fetchBranch, pullingKey, fetchingKey, notice, setNotice };
}
