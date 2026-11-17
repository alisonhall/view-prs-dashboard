import { useId, useRef, useState, type FormEvent } from 'react';
import { Button, IconButton } from '../ui/Button';
import { postJson } from '../../helpers/pr-http.helpers.ts';
import { NON_CREDENTIAL_INPUT_PROPS } from '../../helpers/form-parsing.helpers.ts';
import { useHeaderPopover } from './useHeaderPopover';

// What POST /view-prs/tracked-prs returns.
// fetched: whether its fetch worked, or null while it's still going.
interface TrackedPrResult {
  ok?: boolean;
  key?: string;
  added?: boolean;
  fetched?: boolean | null;
  error?: string;
}

type Outcome = { tone: 'done' | 'error'; text: string } | null;

const describeAdded = ({ key, added, fetched, error }: TrackedPrResult): Outcome => {
  const what = added ? `Added ${key}` : `${key} was already added`;
  if (fetched === false) return { tone: 'error', text: `${what}, but couldn't fetch it: ${error || 'unknown error'}` };
  if (fetched === null || fetched === undefined) return { tone: 'done', text: `${what}: still fetching it. Its row appears once it's done.` };
  return { tone: 'done', text: added ? `${what}.` : `${what}; refreshed it.` };
};

/**
 * The app header's "Add PR" button and its popover: a PR added by its URL,
 * from any repo (a GitHub Enterprise one included), without subscribing to
 * the rest of that repo's PRs (POST /view-prs/tracked-prs). The server
 * checks gh finds it, then fetches it, answering with whether that worked
 * (or that it's still going, past a while); its row arrives with the
 * data's next change. The background updates keep it up to date while it's
 * open, or merged or closed within the last 30 days.
 *
 * A header popover (useHeaderPopover); opening focuses the URL field.
 */
export function AddPrPopover() {
  const titleId = useId();
  const panelId = useId();
  const inputId = useId();
  const outcomeId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const { isOpen, open, close, buttonRef, panelRef, panelStyle } = useHeaderPopover(() => inputRef.current);
  const [url, setUrl] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const value = url.trim();
    if (!value || isAdding) return;
    setIsAdding(true);
    setOutcome(null);
    try {
      const { response, result } = await postJson<TrackedPrResult>('/view-prs/tracked-prs', { url: value });
      if (!response.ok || result.ok === false) {
        setOutcome({ tone: 'error', text: result.error || `Couldn't add the PR (HTTP ${response.status})` });
        return;
      }
      setUrl('');
      setOutcome(describeAdded(result));
    } catch (error) {
      setOutcome({ tone: 'error', text: `Couldn't add the PR: ${error instanceof Error ? error.message : String(error)}` });
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <>
      <Button
        ref={buttonRef}
        icon="plus"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        onClick={() => {
          if (isOpen) {
            close(false);
            return;
          }
          // Each opening starts afresh, not with the last one's message.
          setOutcome(null);
          open();
        }}
      >
        Add PR
      </Button>

      {isOpen && (
        <div
          ref={panelRef}
          id={panelId}
          className="activity-popover add-pr-popover"
          role="dialog"
          aria-labelledby={titleId}
          tabIndex={-1}
          style={panelStyle}
        >
          <div className="activity-popover-header">
            <h2 id={titleId} className="activity-popover-title">
              Add a PR
            </h2>
            <IconButton icon="close" label="Close" tooltipPlacement="bottom" onClick={() => close(true)} />
          </div>
          <form className="activity-popover-content add-pr-form" onSubmit={handleSubmit}>
            <label htmlFor={inputId}>PR URL, from any repo</label>
            <div className="add-pr-row">
              <input
                ref={inputRef}
                id={inputId}
                type="text"
                name="prUrl"
                placeholder="https://github.com/owner/repo/pull/123"
                {...NON_CREDENTIAL_INPUT_PROPS}
                value={url}
                aria-invalid={outcome?.tone === 'error' || undefined}
                aria-describedby={outcome ? outcomeId : undefined}
                onChange={(event) => setUrl(event.target.value)}
              />
              <Button type="submit" variant="primary" disabled={isAdding || !url.trim()}>
                {isAdding ? 'Adding…' : 'Add'}
              </Button>
            </div>
            <p className="add-pr-hint">Just this PR - not the rest of its repo. Kept up to date while open, or for 30 days once merged or closed.</p>
            {outcome && (
              <p
                id={outcomeId}
                className="add-pr-outcome"
                data-tone={outcome.tone}
                role={outcome.tone === 'error' ? 'alert' : 'status'}
              >
                {outcome.text}
              </p>
            )}
          </form>
        </div>
      )}
    </>
  );
}
