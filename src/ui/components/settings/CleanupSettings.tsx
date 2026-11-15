import { useState } from 'react';
import { postJson } from '../../helpers/pr-http.helpers.ts';
import { useLocalBranches } from '../../state/LocalBranchesContext';
import { Button } from '../ui/Button';

// One of the list's items (GET /view-prs/local-repos/cleanup): a local
// branch and its worktree, or a worktree the repo's list command printed.
export interface CleanupItem {
  branch?: string;
  oid?: string;
  worktreePath?: string;
  prs: Array<{ number: string; done: boolean }>;
  safe: boolean;
  reasons: string[];
  notes: string[];
}

interface CleanupList {
  ok?: boolean;
  error?: string;
  output?: string;
  by?: 'git' | 'command';
  items?: CleanupItem[];
  ignored?: string[];
}

const keyOf = (item: CleanupItem) => `${item.branch || ''}\n${item.worktreePath || ''}`;

// "#12, #14 (merged or closed)".
const describePrs = (item: CleanupItem) =>
  item.prs.length === 0 ? '' : item.prs.map((pr) => `#${pr.number}${pr.done ? '' : ' (open)'}`).join(', ');

// What Remove asks before removing an item.
export const describeRemoval = (item: CleanupItem, byCommand: boolean) => {
  const what = [
    item.worktreePath && `the worktree ${item.worktreePath}${byCommand ? ' (by your remove command)' : ''}`,
    item.branch && !(item.worktreePath && byCommand) && `the branch ${item.branch}`,
  ].filter(Boolean);
  return `Remove ${what.join(' and ')}?${item.notes.length ? `\n\n${item.notes.join('\n')}` : ''}`;
};

/**
 * Settings › Local clones' Clean up for a repo: the local branches and
 * worktrees of its merged and closed PRs (or what its list command prints),
 * each safe to remove or not and why - Remove, after asking, for a safe one.
 * Looked for when asked: it reads every worktree's changes.
 */
export function CleanupSettings({ repo, hasListCommand, hasRemoveCommand }: { repo: string; hasListCommand: boolean; hasRemoveCommand: boolean }) {
  const { refresh } = useLocalBranches();
  const [list, setList] = useState<CleanupList | null>(null);
  const [looking, setLooking] = useState(false);
  const [removing, setRemoving] = useState('');
  const [removeError, setRemoveError] = useState<{ key: string; message: string } | null>(null);

  const look = async () => {
    setLooking(true);
    try {
      const response = await fetch(`/view-prs/local-repos/cleanup?repo=${encodeURIComponent(repo)}`, { cache: 'no-store' });
      const result = (await response.json()) as CleanupList;
      setList(!response.ok && !result.error ? { ok: false, error: `HTTP ${response.status}` } : result);
    } catch (caught) {
      setList({ ok: false, error: caught instanceof Error ? caught.message : String(caught) });
    } finally {
      setLooking(false);
    }
  };

  const remove = async (item: CleanupItem) => {
    if (!window.confirm(describeRemoval(item, hasRemoveCommand))) return;
    const key = keyOf(item);
    setRemoving(key);
    setRemoveError(null);
    try {
      const { response, result } = await postJson<{ ok?: boolean; error?: string; output?: string }>('/view-prs/local-repos/cleanup/remove', {
        repo,
        branch: item.branch || '',
        worktreePath: item.worktreePath || '',
      });
      if (!response.ok || result.ok === false) {
        setRemoveError({ key, message: [result.error || `HTTP ${response.status}`, result.output].filter(Boolean).join('\n') });
        return;
      }
      setList((previous) => (previous ? { ...previous, items: (previous.items || []).filter((other) => keyOf(other) !== key) } : previous));
      refresh();
    } catch (caught) {
      setRemoveError({ key, message: caught instanceof Error ? caught.message : String(caught) });
    } finally {
      setRemoving('');
    }
  };

  const items = list?.ok ? list.items || [] : [];
  const safeCount = items.filter((item) => item.safe).length;
  return (
    <details className="local-clone-checkout local-clone-cleanup">
      <summary>Clean up after merged and closed PRs</summary>
      <div className="settings-group">
        <p className="settings-hint">
          {(list?.by ? list.by === 'command' : hasListCommand)
            ? 'The worktrees your list command printed'
            : 'The local branches of merged and closed PRs on the page, with their worktrees'}
          . Safe to remove: no open PR has the branch, no uncommitted changes, nothing that isn&apos;t on GitHub. Each is asked about first.
        </p>
        <div className="local-clone-checkout-actions">
          <Button disabled={looking} onClick={() => void look()}>
            {looking ? 'Looking…' : list ? 'Look again' : 'Look'}
          </Button>
        </div>
        {list && !list.ok && (
          <p className="settings-error" role="alert">
            {list.error}
          </p>
        )}
        {list?.ok && (
          <p className="settings-hint" role="status">
            {items.length === 0 ? 'Nothing to clean up.' : `${safeCount} of ${items.length} safe to remove.`}
          </p>
        )}
        {items.length > 0 && (
          <ul className="local-clone-cleanup-list" aria-label={`What can be cleaned up in ${repo}'s clone`}>
            {items.map((item) => {
              const key = keyOf(item);
              const prs = describePrs(item);
              return (
                <li key={key} data-safe={String(item.safe)}>
                  <div className="local-clone-cleanup-item">
                    <span>
                      {item.branch ? <code>{item.branch}</code> : <em>detached</em>}
                      {prs && <span className="sources-item-meta"> {prs}</span>}
                      {item.worktreePath && (
                        <>
                          {' '}
                          <code className="sources-item-meta">{item.worktreePath}</code>
                        </>
                      )}
                    </span>
                    {item.safe && (
                      <Button
                        disabled={Boolean(removing)}
                        aria-label={`Remove ${item.branch || item.worktreePath}`}
                        onClick={() => void remove(item)}
                      >
                        {removing === key ? 'Removing…' : 'Remove'}
                      </Button>
                    )}
                  </div>
                  {item.reasons.length > 0 && <p className="settings-hint local-clone-cleanup-why">Kept: {item.reasons.join('; ')}</p>}
                  {item.notes.length > 0 && <p className="settings-hint">{item.notes.join('; ')}</p>}
                  {removeError?.key === key && (
                    <p className="settings-error" role="alert">
                      {removeError.message}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {list?.ok && list.ignored && list.ignored.length > 0 && (
          <p className="settings-hint">
            Not worktrees of the clone, so left out: {list.ignored.map((line) => `"${line}"`).join(', ')}
          </p>
        )}
        {list?.ok && list.output && <pre className="local-clone-cleanup-output">{list.output}</pre>}
      </div>
    </details>
  );
}
