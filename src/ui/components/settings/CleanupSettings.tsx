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
  // Kept whatever's asked (the clone's own folder, a locked worktree).
  blocked?: boolean;
}

interface CleanupList {
  ok?: boolean;
  error?: string;
  output?: string;
  // The list command's stdout, as it printed it.
  printed?: string;
  by?: 'git' | 'command';
  items?: CleanupItem[];
  // The rest of the clone's local branches and worktrees.
  others?: CleanupItem[];
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
  return `Remove ${what.join(' and ')}?`;
};

// What's lost by removing one that isn't safe, said before Remove anyway.
export const describeRisk = (item: CleanupItem) => {
  const lost = [
    item.reasons.some((reason) => reason.startsWith('Uncommitted:')) && 'its uncommitted changes',
    item.reasons.some((reason) => /not on GitHub|Can't tell whether its commits/.test(reason)) && "its commits that aren't on GitHub",
  ].filter(Boolean);
  return lost.length ? `This deletes ${lost.join(' and ')}, for good.` : '';
};

/**
 * Settings › Local clones' Clean up for a repo: the local branches and
 * worktrees of its merged and closed PRs (or what its list command prints),
 * each safe to remove or not and why, then the rest of the clone's local
 * branches and worktrees, checked the same way. Remove, confirmed in the
 * row, for a safe one; Remove anyway, confirmed the same way, for one that
 * isn't (but not the clone's own folder or a locked worktree). Looked for
 * when asked: it reads every worktree's changes.
 */
export function CleanupSettings({ repo, hasListCommand, hasRemoveCommand }: { repo: string; hasListCommand: boolean; hasRemoveCommand: boolean }) {
  const { refresh } = useLocalBranches();
  const [list, setList] = useState<CleanupList | null>(null);
  const [looking, setLooking] = useState(false);
  const [removing, setRemoving] = useState('');
  // The item whose Remove is waiting to be confirmed.
  const [confirming, setConfirming] = useState('');
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
    const key = keyOf(item);
    setConfirming('');
    setRemoving(key);
    setRemoveError(null);
    try {
      const { response, result } = await postJson<{ ok?: boolean; error?: string; output?: string }>('/view-prs/local-repos/cleanup/remove', {
        repo,
        branch: item.branch || '',
        worktreePath: item.worktreePath || '',
        // Remove anyway: with the reasons shown, so one that has changed
        // since isn't removed.
        ...(item.safe ? {} : { force: true, reasons: item.reasons }),
      });
      if (!response.ok || result.ok === false) {
        setRemoveError({ key, message: [result.error || `HTTP ${response.status}`, result.output].filter(Boolean).join('\n') });
        return;
      }
      const without = (list?: CleanupItem[]) => (list || []).filter((other) => keyOf(other) !== key);
      setList((previous) => (previous ? { ...previous, items: without(previous.items), others: without(previous.others) } : previous));
      refresh();
    } catch (caught) {
      setRemoveError({ key, message: caught instanceof Error ? caught.message : String(caught) });
    } finally {
      setRemoving('');
    }
  };

  const items = list?.ok ? list.items || [] : [];
  const others = list?.ok ? list.others || [] : [];
  const safeCount = items.filter((item) => item.safe).length;

  const renderItem = (item: CleanupItem) => {
    const key = keyOf(item);
    const prs = describePrs(item);
    const name = item.branch || item.worktreePath;
    const isConfirming = confirming === key;
    const risk = item.safe ? '' : describeRisk(item);
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
          {!item.blocked &&
            (isConfirming ? (
              <Button aria-label={`Cancel removing ${name}`} onClick={() => setConfirming('')}>
                Cancel
              </Button>
            ) : (
              <Button
                disabled={Boolean(removing)}
                aria-label={`${item.safe ? 'Remove' : 'Remove anyway'} ${name}`}
                onClick={() => {
                  setRemoveError(null);
                  setConfirming(key);
                }}
              >
                {removing === key ? 'Removing…' : item.safe ? 'Remove' : 'Remove anyway…'}
              </Button>
            ))}
        </div>
        {item.reasons.length > 0 && <p className="settings-hint local-clone-cleanup-why">Kept: {item.reasons.join('; ')}</p>}
        {item.notes.length > 0 && <p className="settings-hint">{item.notes.join('; ')}</p>}
        {isConfirming && (
          <div className="local-clone-cleanup-confirm" data-risky={String(!item.safe)} role="group" aria-label={`Confirm removing ${name}`}>
            <p className="settings-hint">
              {describeRemoval(item, hasRemoveCommand)}
              {risk && <strong> {risk}</strong>}
            </p>
            <Button variant={item.safe ? 'primary' : 'danger'} onClick={() => void remove(item)}>
              {item.safe ? 'Yes, remove' : 'Yes, remove anyway'}
            </Button>
          </div>
        )}
        {removeError?.key === key && (
          <p className="settings-error" role="alert">
            {removeError.message}
          </p>
        )}
      </li>
    );
  };
  return (
    <details className="local-clone-checkout local-clone-cleanup">
      <summary>Clean up after merged and closed PRs</summary>
      <div className="settings-group">
        <p className="settings-hint">
          {(list?.by ? list.by === 'command' : hasListCommand)
            ? 'The worktrees your list command printed'
            : 'The local branches of merged and closed PRs on the page, with their worktrees'}
          . Safe to remove: no open PR has the branch, no uncommitted changes, nothing that isn&apos;t on GitHub. Each is asked about first, and one
          that isn&apos;t safe can still be removed with Remove anyway.
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
            {items.map(renderItem)}
          </ul>
        )}
        {others.length > 0 && (
          <details className="local-clone-command-help local-clone-cleanup-others" open>
            <summary>
              Everything else in the clone ({others.length} {others.length === 1 ? 'branch or worktree' : 'branches and worktrees'})
            </summary>
            <p className="settings-hint">
              The clone&apos;s other local branches and worktrees, checked the same way. One that isn&apos;t safe can still be removed with Remove anyway,
              which asks you to confirm.
            </p>
            <ul className="local-clone-cleanup-list" aria-label={`Everything else in ${repo}'s clone`}>
              {others.map(renderItem)}
            </ul>
          </details>
        )}
        {list?.ok && list.ignored && list.ignored.length > 0 && (
          <p className="settings-hint">
            Not worktrees of the clone, so left out: {list.ignored.map((line) => `"${line}"`).join(', ')}
          </p>
        )}
        {list?.ok && list.output && <pre className="local-clone-cleanup-output">{list.output}</pre>}
        {list?.ok && list.by === 'command' && (
          <details className="local-clone-command-help">
            <summary>What your list command printed</summary>
            {list.printed ? (
              <pre className="local-clone-cleanup-output" aria-label="What your list command printed">
                {list.printed}
              </pre>
            ) : (
              <p className="settings-hint">Nothing on stdout.</p>
            )}
          </details>
        )}
      </div>
    </details>
  );
}
