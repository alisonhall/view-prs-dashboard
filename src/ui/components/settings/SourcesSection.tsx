import { useEffect, useId, useState, type FormEvent } from 'react';
import { useOptionalPrData } from '../../state/PrDataContext';
import { sendJson } from '../../helpers/pr-http.helpers.ts';
import { NON_CREDENTIAL_INPUT_PROPS } from '../../helpers/form-parsing.helpers.ts';
import type { PrSources, PrSubscription } from '../../types/pr-data.ts';
import { Button } from '../ui/Button';
import { KnownReposDatalist } from './KnownReposDatalist';

// What the sources routes return.
interface SourcesResult {
  ok?: boolean;
  error?: string;
  sources?: PrSources;
}

type Mode = PrSubscription['mode'];

const parseNumbers = (value: string) => value.split(/[\s,]+/).filter(Boolean);

const formatSince = (iso: string | undefined) => {
  const ms = Date.parse(String(iso || ''));
  return Number.isFinite(ms) ? new Date(ms).toLocaleString() : '';
};

/**
 * The Settings drawer's "Sources": which repos and PRs are in view (the
 * server's sources file).
 * - Subscriptions: a repo's recent PRs, or only the PR numbers listed.
 *   Unsubscribing hides its rows - kept, notes and all, and shown again if
 *   it's subscribed again; PRs added from it stay.
 * - PRs added one by one (the header's Add PR, or a run of chosen PRs in a
 *   repo not subscribed): each can be removed, which hides its row unless
 *   its repo is subscribed. One its last run couldn't fetch (deleted, or no
 *   longer visible) says so.
 * Shows the data's sources (dataMeta.sources), or a change's own answer
 * until the data catches up.
 */
export function SourcesSection() {
  const payload = useOptionalPrData()?.payload;
  const payloadSources = payload?.dataMeta?.sources ?? null;
  const [answered, setAnswered] = useState<PrSources | null>(null);
  // The data's next sources supersede a change's answer.
  useEffect(() => setAnswered(null), [payloadSources]);
  const sources = answered || payloadSources;

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [newRepo, setNewRepo] = useState('');
  const [newMode, setNewMode] = useState<Mode>('recent');
  const [newNumbers, setNewNumbers] = useState('');
  // Each subscription's numbers as typed, until saved.
  const [numberDrafts, setNumberDrafts] = useState<Record<string, string>>({});
  const idPrefix = useId();

  const change = async (method: string, url: string, body: unknown) => {
    setBusy(true);
    setError('');
    try {
      const { response, result } = await sendJson<SourcesResult>(method, url, body);
      if (!response.ok || result.ok === false) {
        setError(result.error || `HTTP ${response.status}`);
        return false;
      }
      if (result.sources) setAnswered(result.sources);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const subscribe = (subscription: { repo: string; mode: Mode; numbers?: string[] }) =>
    change('PUT', '/view-prs/subscriptions', subscription);

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault();
    const repo = newRepo.trim();
    if (!repo) return;
    if (await subscribe({ repo, mode: newMode, numbers: newMode === 'numbers' ? parseNumbers(newNumbers) : undefined })) {
      setNewRepo('');
      setNewNumbers('');
    }
  };

  // Before the file exists (nothing seeded it yet), empty lists - and the
  // form, whose first subscription creates it.
  const shown: PrSources = sources || { subscriptions: [], trackedPrs: [] };
  const unreachable = shown.unreachable || {};
  const envRepos = shown.envRepos || [];
  // An env-var repo is listed as fixed instead.
  const editableSubscriptions = shown.subscriptions.filter((subscription) => !envRepos.includes(subscription.repo));
  const dropDraft = (repo: string) => setNumberDrafts(({ [repo]: _dropped, ...rest }) => rest);

  return (
    <div className="settings-section sources-section">
      {!sources && (
        <p className="settings-hint">
          No sources file yet, so every stored row shows and the background updates follow every repo with rows. Subscribing
          to a repo, or the first run, creates it.
        </p>
      )}
      {shown.lost && (
        <p className="settings-error sources-lost" role="alert">
          The sources file was {shown.lost.asidePath ? 'unreadable' : 'missing'} on {formatSince(shown.lost.at)}, so it started
          empty: every repo&apos;s rows are hidden (still stored) and none is updated until it&apos;s subscribed again.
          {shown.lost.asidePath
            ? ` The unreadable file was kept as ${shown.lost.asidePath}: fix it and put it back to restore them.`
            : ' Restoring the file restores them.'}
        </p>
      )}
      <div className="settings-group">
        <h3 className="settings-heading">Subscribed repos</h3>
        {editableSubscriptions.length === 0 && envRepos.length === 0 ? (
          <p className="settings-hint">None.</p>
        ) : (
          <ul className="sources-list">
            {envRepos.map((repo) => (
              <li key={`env-${repo}`} className="sources-item">
                <span className="sources-item-name">{repo}</span>
                <span className="sources-item-meta">Its recent PRs - set by VIEW_PRS_AUTO_REPOS, so it can&apos;t be unsubscribed here</span>
              </li>
            ))}
            {editableSubscriptions.map((subscription) => {
              const isDraftingNumbers = numberDrafts[subscription.repo] !== undefined;
              const draftNumbers = numberDrafts[subscription.repo] ?? (subscription.numbers || []).join(', ');
              const numbersId = `${idPrefix}-numbers-${subscription.repo}`;
              return (
                <li key={subscription.repo} className="sources-item">
                  <span className="sources-item-name">{subscription.repo}</span>
                  <select
                    aria-label={`What to follow in ${subscription.repo}`}
                    // The mode picked: "listed" while its numbers are being
                    // typed, before they're saved.
                    value={isDraftingNumbers ? 'numbers' : subscription.mode}
                    disabled={busy}
                    onChange={(event) => {
                      const mode = event.target.value as Mode;
                      if (mode === 'numbers') {
                        setNumberDrafts((previous) => ({ ...previous, [subscription.repo]: draftNumbers }));
                      } else if (subscription.mode === 'recent') {
                        // Back to what's saved: nothing to save.
                        dropDraft(subscription.repo);
                      } else {
                        void subscribe({ repo: subscription.repo, mode }).then((saved) => saved && dropDraft(subscription.repo));
                      }
                    }}
                  >
                    <option value="recent">Its recent PRs</option>
                    <option value="numbers">Only listed PRs</option>
                  </select>
                  {(subscription.mode === 'numbers' || isDraftingNumbers) && (
                    <span className="sources-item-numbers">
                      <label className="ui-visually-hidden" htmlFor={numbersId}>
                        PR numbers to follow in {subscription.repo}
                      </label>
                      <input
                        id={numbersId}
                        type="text"
                        placeholder="12, 34"
                        {...NON_CREDENTIAL_INPUT_PROPS}
                        value={draftNumbers}
                        onChange={(event) => setNumberDrafts((previous) => ({ ...previous, [subscription.repo]: event.target.value }))}
                      />
                      <Button
                        disabled={busy}
                        onClick={async () => {
                          if (await subscribe({ repo: subscription.repo, mode: 'numbers', numbers: parseNumbers(draftNumbers) })) {
                            dropDraft(subscription.repo);
                          }
                        }}
                      >
                        Save
                      </Button>
                    </span>
                  )}
                  <Button
                    disabled={busy}
                    title="Hides its rows (kept, with their notes) and stops its background updates. PRs added from it stay."
                    onClick={() => void change('DELETE', '/view-prs/subscriptions', { repo: subscription.repo })}
                  >
                    Unsubscribe
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        <form className="sources-add" onSubmit={handleAdd}>
          <label htmlFor={`${idPrefix}-repo`}>Subscribe to a repo</label>
          <div className="sources-add-row">
            <input
              id={`${idPrefix}-repo`}
              type="text"
              placeholder="owner/repo"
              list={`${idPrefix}-known-repos`}
              {...NON_CREDENTIAL_INPUT_PROPS}
              value={newRepo}
              onChange={(event) => setNewRepo(event.target.value)}
            />
            <KnownReposDatalist id={`${idPrefix}-known-repos`} />
            <select aria-label="What to follow" value={newMode} onChange={(event) => setNewMode(event.target.value as Mode)}>
              <option value="recent">Its recent PRs</option>
              <option value="numbers">Only listed PRs</option>
            </select>
            {newMode === 'numbers' && (
              <input
                aria-label="PR numbers to follow"
                type="text"
                placeholder="12, 34"
                {...NON_CREDENTIAL_INPUT_PROPS}
                value={newNumbers}
                onChange={(event) => setNewNumbers(event.target.value)}
              />
            )}
            <Button type="submit" variant="primary" disabled={busy || !newRepo.trim()}>
              Subscribe
            </Button>
          </div>
        </form>
      </div>

      <div className="settings-group">
        <h3 className="settings-heading">PRs added one by one</h3>
        <p className="settings-hint">Add one with the header's Add PR. Kept up to date while open, or for 30 days once merged or closed.</p>
        {shown.trackedPrs.length === 0 ? (
          <p className="settings-hint">None.</p>
        ) : (
          <ul className="sources-list">
            {shown.trackedPrs.map((pr) => {
              const key = `${pr.repo}#${pr.number}`;
              const unreachableSince = unreachable[key];
              return (
                <li key={key} className="sources-item">
                  <a className="sources-item-name" href={pr.url || `https://github.com/${pr.repo}/pull/${pr.number}`} target="_blank" rel="noreferrer">
                    {key}
                  </a>
                  {pr.addedAt && <span className="sources-item-meta">added {formatSince(pr.addedAt)}</span>}
                  {unreachableSince && (
                    <span className="sources-item-warning" title={`Its last run couldn't fetch it (since ${formatSince(unreachableSince)}): deleted, or no longer visible to gh.`}>
                      Couldn&apos;t fetch
                    </span>
                  )}
                  <Button
                    disabled={busy}
                    title="Stops its updates, and hides its row unless its repo is subscribed."
                    onClick={() => void change('DELETE', '/view-prs/tracked-prs', { repo: pr.repo, number: pr.number })}
                  >
                    Remove
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {error && (
        <p className="settings-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
