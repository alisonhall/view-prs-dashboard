import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { sendJson } from '../../helpers/pr-http.helpers.ts';
import { NON_CREDENTIAL_INPUT_PROPS } from '../../helpers/form-parsing.helpers.ts';
import { useIsSettingsSectionVisible } from '../../state/SettingsDrawerContext';
import { Button } from '../ui/Button';
import { isCommitAuthorIdentity } from '../../helpers/actor-identity-kind.helpers.ts';

// A person as the server keeps them (GET/PUT /view-prs/actors).
export interface Person {
  id: string;
  name: string;
  logins: string[];
}

// A person as edited: their logins one each, as typed (a blank one while
// it's being added). `key` tells rows apart, a new one (no id yet) included.
// One field each, not one for all split on commas: a commit author's name
// ("Kandal, Vipul") has a comma in it, and splitting would break it apart.
interface PersonDraft {
  key: string;
  id?: string;
  name: string;
  logins: string[];
}

type Status = { tone: 'info' | 'success' | 'error'; text: string };

const toDraft = (person: Person): PersonDraft => ({ key: person.id, id: person.id, name: person.name, logins: [...person.logins] });
const cleanLogins = (logins: string[]) => logins.map((login) => login.trim()).filter(Boolean);
const sameDrafts = (a: PersonDraft[], b: PersonDraft[]) =>
  a.length === b.length &&
  a.every(
    (draft, index) =>
      draft.id === b[index]?.id &&
      draft.name === b[index]?.name &&
      draft.logins.length === b[index]?.logins.length &&
      draft.logins.every((login, at) => login === b[index]?.logins[at]),
  );

const countOf = (count: number) => `${count} ${count === 1 ? 'person' : 'people'}`;

/**
 * Settings › People: everyone the app knows, one row each - the name to
 * show, and every GitHub login that's them (data/actors.json, through
 * /view-prs/actors). A login seen in the data that no one has is added
 * as a person of their own, named as GitHub names them; a name set here is
 * kept. Giving someone another login makes its activity theirs (the first
 * login is their main one).
 *
 * Edits stay on the page until Save, which sends everyone; the server
 * refuses a login in two people, or a person with none. Find narrows the
 * rows (by name or login) without touching what's saved. Lazy-loaded the
 * first time the section opens; it loads again each time it comes back
 * into view, unless there are unsaved edits.
 */
export function PeopleSection() {
  const [saved, setSaved] = useState<PersonDraft[]>([]);
  const [drafts, setDrafts] = useState<PersonDraft[]>([]);
  const [status, setStatus] = useState<Status>({ tone: 'info', text: 'Loading…' });
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const newKeyRef = useRef(0);
  const idPrefix = useId();
  const isDirty = !sameDrafts(drafts, saved);
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  const show = (people: Person[]) => {
    const next = people.map(toDraft);
    setSaved(next);
    setDrafts(next);
  };

  const load = useCallback(async () => {
    setStatus({ tone: 'info', text: 'Loading…' });
    try {
      const response = await fetch('/view-prs/actors');
      const payload = await response.json();
      if (!response.ok || payload?.ok === false) throw new Error(payload?.error || `HTTP ${response.status}`);
      const people: Person[] = Array.isArray(payload.actors) ? payload.actors : [];
      show(people);
      setStatus(
        payload.unreadable
          ? {
              tone: 'error',
              text: "data/actors.json couldn't be read (it isn't valid JSON), so no one is listed and no one new is added. Fix it and reopen this section - or a Save here starts it again, keeping a copy of the old file beside it.",
            }
          : { tone: 'info', text: countOf(people.length) },
      );
    } catch (error) {
      setStatus({ tone: 'error', text: `Couldn't load the people: ${(error as Error).message || String(error)}` });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Back in view: load again (the data may have added people), unless that
  // would throw away edits. Not on the first run - the mount loads.
  const isVisible = useIsSettingsSectionVisible('people');
  const hasSkippedFirstRunRef = useRef(false);
  useEffect(() => {
    if (!hasSkippedFirstRunRef.current) {
      hasSkippedFirstRunRef.current = true;
      return;
    }
    if (isVisible && !isDirtyRef.current) load();
  }, [isVisible, load]);

  const update = (key: string, change: Partial<PersonDraft>) =>
    setDrafts((previous) => previous.map((draft) => (draft.key === key ? { ...draft, ...change } : draft)));
  const remove = (key: string) => setDrafts((previous) => previous.filter((draft) => draft.key !== key));
  const add = () => {
    newKeyRef.current += 1;
    setQuery('');
    setDrafts((previous) => [{ key: `new-${newKeyRef.current}`, name: '', logins: [''] }, ...previous]);
  };
  // One person's logins, changed by `change`.
  const updateLogins = (key: string, change: (logins: string[]) => string[]) =>
    setDrafts((previous) => previous.map((draft) => (draft.key === key ? { ...draft, logins: change(draft.logins) } : draft)));
  // The login field to focus once it renders: one just added.
  const focusLoginRef = useRef<string | null>(null);

  const save = async () => {
    setSaving(true);
    try {
      // A new row left empty isn't anyone.
      const actors = drafts
        .filter((draft) => draft.id || draft.name.trim() || cleanLogins(draft.logins).length > 0)
        .map((draft) => ({ ...(draft.id ? { id: draft.id } : {}), name: draft.name.trim(), logins: cleanLogins(draft.logins) }));
      const { response, result } = await sendJson<{ ok?: boolean; error?: string; actors?: Person[] }>('PUT', '/view-prs/actors', { actors });
      if (!response.ok || result.ok === false) throw new Error(result.error || `HTTP ${response.status}`);
      const people = Array.isArray(result.actors) ? result.actors : [];
      show(people);
      setStatus({ tone: 'success', text: `Saved ${countOf(people.length)}.` });
    } catch (error) {
      setStatus({ tone: 'error', text: `Not saved: ${(error as Error).message || String(error)}` });
    } finally {
      setSaving(false);
    }
  };

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return drafts;
    return drafts.filter((draft) => !draft.id || [draft.name, ...draft.logins].join(' ').toLowerCase().includes(needle));
  }, [drafts, query]);

  return (
    <div className="settings-section">
      <div className="settings-group">
        <p className="settings-hint">
          Everyone the app knows: the name shown for them in the table, the filters, Review stats and Authors, and every GitHub
          login that&apos;s them. Someone new is added as soon as they appear in a PR, named as GitHub names them. To make two
          logins one person, add the other to their row (the first is their main login) and remove the other row - what was
          picked or noted for the removed one (filters, rules, Authors comments) becomes the other&apos;s.
        </p>
        <p className="settings-hint">
          A <strong>commit author</strong> is a name or email that commits are listed under because GitHub didn&apos;t link
          them to an account (they were made with an email it doesn&apos;t know). One whose name is exactly someone&apos;s
          here joins them by itself; otherwise add it to the person it is, so those commits are theirs.
        </p>
        <div className="settings-actions">
          <label className="ui-visually-hidden" htmlFor={`${idPrefix}-find`}>
            Find a person
          </label>
          <input
            id={`${idPrefix}-find`}
            type="search"
            className="settings-control"
            placeholder="Find by name or login"
            {...NON_CREDENTIAL_INPUT_PROPS}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button icon="plus" onClick={add}>
            Add person
          </Button>
          <Button variant="primary" disabled={saving || !isDirty} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button disabled={saving || !isDirty} onClick={() => setDrafts(saved)}>
            Undo changes
          </Button>
        </div>
        <p className="people-status" data-tone={status.tone} role={status.tone === 'error' ? 'alert' : 'status'}>
          {isDirty && status.tone !== 'error' ? 'Unsaved changes' : status.text}
          {query.trim() && ` · showing ${shown.length} of ${drafts.length}`}
        </p>
        <ul className="people-list" aria-label="People">
          {shown.map((draft, index) => {
            const label = draft.name.trim() || cleanLogins(draft.logins)[0] || 'New person';
            return (
              <li key={draft.key} className="people-row">
                <input
                  type="text"
                  className="settings-control"
                  placeholder="Name to show"
                  aria-label={`Name for ${label}`}
                  {...NON_CREDENTIAL_INPUT_PROPS}
                  value={draft.name}
                  autoFocus={!draft.id && index === 0}
                  onChange={(event) => update(draft.key, { name: event.target.value })}
                />
                <div className="people-logins" role="group" aria-label={`Logins for ${label}`}>
                  {draft.logins.map((login, at) => {
                    const fieldKey = `${draft.key}:${at}`;
                    // By position, not the person's id: an id made from a
                    // commit author ("actor:kandal, vipul") has a space, which
                    // would split aria-describedby's id list.
                    const kindId = `${idPrefix}-commit-author-${index}-${at}`;
                    const isCommitAuthor = isCommitAuthorIdentity(login);
                    const loginLabel = login.trim() || 'new login';
                    return (
                      <div key={at} className="people-login">
                        <input
                          type="text"
                          className="settings-control"
                          placeholder={at === 0 ? 'GitHub login' : 'Another login'}
                          aria-label={at === 0 ? `Main login for ${label}` : `Login ${at + 1} for ${label}`}
                          aria-describedby={isCommitAuthor ? kindId : undefined}
                          {...NON_CREDENTIAL_INPUT_PROPS}
                          value={login}
                          ref={(node) => {
                            if (node && focusLoginRef.current === fieldKey) {
                              focusLoginRef.current = null;
                              node.focus();
                            }
                          }}
                          onChange={(event) =>
                            updateLogins(draft.key, (logins) => logins.map((value, i) => (i === at ? event.target.value : value)))
                          }
                        />
                        <button
                          type="button"
                          className="people-login-remove"
                          aria-label={`Remove ${loginLabel} from ${label}`}
                          title="Remove this login"
                          onClick={() => updateLogins(draft.key, (logins) => logins.filter((_value, i) => i !== at))}
                        >
                          ×
                        </button>
                        {isCommitAuthor && (
                          <span
                            id={kindId}
                            className="people-login-kind"
                            title="Commits listed under this name or email: GitHub didn't link them to an account (made with an email it doesn't know). Keep it with the person it is, so those commits are theirs."
                          >
                            Commit author (no GitHub account)
                          </span>
                        )}
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    className="people-login-add"
                    onClick={() => {
                      focusLoginRef.current = `${draft.key}:${draft.logins.length}`;
                      updateLogins(draft.key, (logins) => [...logins, '']);
                    }}
                  >
                    + Add login
                  </button>
                </div>
                <Button aria-label={`Remove ${label}`} onClick={() => remove(draft.key)}>
                  Remove
                </Button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
