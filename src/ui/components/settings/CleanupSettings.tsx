import { useState } from 'react';
import { postJson } from '../../helpers/pr-http.helpers.ts';
import { formatShortAge } from '../../helpers/pr-row-signals.helpers.ts';
import { formatCommitAge } from '../../helpers/tracked-branches.helpers.ts';
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
  // Its newest commit.
  committedAt?: string;
  subject?: string;
  // Its remote branch is gone: deleted on GitHub and pruned.
  upstreamGone?: boolean;
}

// What Remove gives back to put a removed branch back.
interface Restorable {
  branch: string;
  oid: string;
  remote?: string;
  merge?: string;
}

// One removal this session, for Restore.
interface Removal {
  key: string;
  branch?: string;
  worktreePath?: string;
  restore?: Restorable;
  state?: 'restoring' | 'restored';
  error?: string;
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

// Remove selected's key in confirming.
const SELECTED = '\u0000selected';

// What Remove selected asks: how many, and what's lost by those that aren't safe.
export const describeBulkRemoval = (chosen: CleanupItem[]) => {
  const risky = chosen.filter((item) => !item.safe);
  const what = `Remove ${chosen.length} ${chosen.length === 1 ? 'branch or worktree' : 'branches and worktrees'}?`;
  if (risky.length === 0) return `${what} All are safe to remove.`;
  const lost = [...new Set(risky.map(describeRisk).filter(Boolean))];
  return `${what} ${risky.length} ${risky.length === 1 ? "isn't" : "aren't"} safe (${risky.map((item) => item.branch || item.worktreePath).join(', ')}).${
    lost.length ? ` ${lost.join(' ')}` : ''
  }`;
};

/**
 * Settings › Local clones' Clean up for a repo: the local branches and
 * worktrees of its merged and closed PRs (or what its list command prints),
 * each safe to remove or not and why, then the rest of the clone's local
 * branches and worktrees, checked the same way. Remove, confirmed in the
 * row, for a safe one; Remove anyway, confirmed the same way, for one that
 * isn't (but not the clone's own folder or a locked worktree), or several
 * at once by selecting them. Each shows its newest commit (oldest first)
 * and whether its GitHub branch is gone. A removed branch can be put back
 * with Restore. Looked for when asked: it reads every worktree's changes.
 */
export function CleanupSettings({ repo, hasListCommand, hasRemoveCommand }: { repo: string; hasListCommand: boolean; hasRemoveCommand: boolean }) {
  const { refresh } = useLocalBranches();
  const [list, setList] = useState<CleanupList | null>(null);
  const [looking, setLooking] = useState(false);
  // The items being removed now (one, or a selection one at a time).
  const [removing, setRemoving] = useState('');
  // The item whose Remove is waiting to be confirmed, or SELECTED for
  // Remove selected.
  const [confirming, setConfirming] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [removals, setRemovals] = useState<Removal[]>([]);
  const now = Date.now();

  const look = async () => {
    setLooking(true);
    setSelected(new Set());
    setConfirming('');
    setErrors({});
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

  const items = list?.ok ? list.items || [] : [];
  const others = list?.ok ? list.others || [] : [];
  const safeCount = items.filter((item) => item.safe).length;
  const listedKeys = new Set(items.map(keyOf));
  const removable = [...items, ...others].filter((item) => !item.blocked);
  const chosen = removable.filter((item) => selected.has(keyOf(item)));

  // Removes one item; true once it's gone. Its error is kept by its key.
  const removeOne = async (item: CleanupItem) => {
    const key = keyOf(item);
    setRemoving(key);
    setErrors(({ [key]: _dropped, ...rest }) => rest);
    try {
      const { response, result } = await postJson<{ ok?: boolean; error?: string; output?: string; restore?: Restorable }>(
        '/view-prs/local-repos/cleanup/remove',
        {
          repo,
          branch: item.branch || '',
          worktreePath: item.worktreePath || '',
          listed: listedKeys.has(key),
          // Remove anyway: with the reasons shown, so one that has changed
          // since isn't removed.
          ...(item.safe ? {} : { force: true, reasons: item.reasons }),
        },
      );
      if (!response.ok || result.ok === false) {
        setErrors((previous) => ({ ...previous, [key]: [result.error || `HTTP ${response.status}`, result.output].filter(Boolean).join('\n') }));
        return false;
      }
      const without = (from?: CleanupItem[]) => (from || []).filter((other) => keyOf(other) !== key);
      setList((previous) => (previous ? { ...previous, items: without(previous.items), others: without(previous.others) } : previous));
      setSelected((previous) => {
        const next = new Set(previous);
        next.delete(key);
        return next;
      });
      setRemovals((previous) => [
        { key: `${key}\n${Date.now()}`, branch: item.branch, worktreePath: item.worktreePath, ...(result.restore ? { restore: result.restore } : {}) },
        ...previous,
      ]);
      return true;
    } catch (caught) {
      setErrors((previous) => ({ ...previous, [key]: caught instanceof Error ? caught.message : String(caught) }));
      return false;
    } finally {
      setRemoving('');
    }
  };

  const remove = async (item: CleanupItem) => {
    setConfirming('');
    if (await removeOne(item)) refresh();
  };

  // One at a time: the server removes one at a time per clone anyway.
  const removeSelected = async () => {
    setConfirming('');
    let any = false;
    for (const item of chosen) {
      if (await removeOne(item)) any = true;
    }
    if (any) refresh();
  };

  const restore = async (removal: Removal) => {
    if (!removal.restore) return;
    const update = (change: Partial<Removal>) =>
      setRemovals((previous) => previous.map((other) => (other.key === removal.key ? { ...other, ...change } : other)));
    update({ state: 'restoring', error: undefined });
    try {
      const { response, result } = await postJson<{ ok?: boolean; error?: string }>('/view-prs/local-repos/cleanup/restore', { repo, ...removal.restore });
      if (!response.ok || result.ok === false) {
        update({ state: undefined, error: result.error || `HTTP ${response.status}` });
        return;
      }
      update({ state: 'restored' });
      refresh();
    } catch (caught) {
      update({ state: undefined, error: caught instanceof Error ? caught.message : String(caught) });
    }
  };

  const toggle = (key: string) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const renderItem = (item: CleanupItem) => {
    const key = keyOf(item);
    const prs = describePrs(item);
    const name = item.branch || item.worktreePath;
    const isConfirming = confirming === key;
    const risk = item.safe ? '' : describeRisk(item);
    const age = formatCommitAge(formatShortAge(item.committedAt, now));
    return (
      <li key={key} data-safe={String(item.safe)}>
        <div className="local-clone-cleanup-item">
          {!item.blocked && (
            <input
              type="checkbox"
              className="local-clone-cleanup-select"
              aria-label={`Select ${name}`}
              checked={selected.has(key)}
              disabled={Boolean(removing)}
              onChange={() => toggle(key)}
            />
          )}
          <span className="local-clone-cleanup-name">
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
                onClick={() => setConfirming(key)}
              >
                {removing === key ? 'Removing…' : item.safe ? 'Remove' : 'Remove anyway…'}
              </Button>
            ))}
        </div>
        {(age || item.subject || item.upstreamGone) && (
          <p className="settings-hint local-clone-cleanup-commit">
            {item.upstreamGone && <span className="local-clone-cleanup-chip">Deleted on GitHub</span>}
            {[age && `Last commit ${age}`, item.subject].filter(Boolean).join(': ')}
          </p>
        )}
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
        {errors[key] && (
          <p className="settings-error" role="alert">
            {errors[key]}
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
        {removals.length > 0 && (
          <div className="local-clone-cleanup-removed">
            <p className="settings-hint">
              Removed this time. Restore puts a branch back at the commit it was at, with its tracking settings, but not a worktree&apos;s folder or
              uncommitted changes.
            </p>
            <ul aria-label="Removed">
              {removals.map((removal) => (
                <li key={removal.key}>
                  <span>
                    {removal.state === 'restored' ? 'Put back ' : 'Removed '}
                    {removal.branch && <code>{removal.branch}</code>}
                    {removal.state === 'restored' ? (
                      <span className="sources-item-meta"> (Look again to see it in the list)</span>
                    ) : (
                      <>
                        {removal.worktreePath && (
                          <>
                            {removal.branch ? ' and its worktree ' : 'the worktree '}
                            <code className="sources-item-meta">{removal.worktreePath}</code>
                          </>
                        )}
                        {removal.restore && <span className="sources-item-meta"> (was at {removal.restore.oid.slice(0, 7)})</span>}
                      </>
                    )}
                  </span>
                  {removal.restore && removal.state !== 'restored' && (
                    <Button
                      disabled={removal.state === 'restoring'}
                      aria-label={`Restore ${removal.restore.branch}`}
                      onClick={() => void restore(removal)}
                    >
                      {removal.state === 'restoring' ? 'Restoring…' : 'Restore'}
                    </Button>
                  )}
                  {removal.error && (
                    <p className="settings-error" role="alert">
                      {removal.error}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {removable.length > 0 && (
          <div className="local-clone-cleanup-bulk" role="group" aria-label="Remove several">
            <Button
              disabled={Boolean(removing)}
              onClick={() => setSelected(new Set(removable.filter((item) => item.safe).map(keyOf)))}
            >
              Select all safe
            </Button>
            {chosen.length > 0 && (
              <>
                <Button disabled={Boolean(removing)} onClick={() => setSelected(new Set())}>
                  Clear
                </Button>
                {confirming === SELECTED ? (
                  <Button onClick={() => setConfirming('')}>Cancel</Button>
                ) : (
                  <Button disabled={Boolean(removing)} onClick={() => setConfirming(SELECTED)}>
                    {removing ? 'Removing…' : `Remove selected (${chosen.length})`}
                  </Button>
                )}
              </>
            )}
          </div>
        )}
        {confirming === SELECTED && chosen.length > 0 && (
          <div
            className="local-clone-cleanup-confirm"
            data-risky={String(chosen.some((item) => !item.safe))}
            role="group"
            aria-label="Confirm removing the selected"
          >
            <p className="settings-hint">{describeBulkRemoval(chosen)}</p>
            <Button variant={chosen.some((item) => !item.safe) ? 'danger' : 'primary'} onClick={() => void removeSelected()}>
              Yes, remove {chosen.length}
            </Button>
          </div>
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
