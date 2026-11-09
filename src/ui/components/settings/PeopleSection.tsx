import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { sendJson } from '../../helpers/pr-http.helpers.ts';
import { NON_CREDENTIAL_INPUT_PROPS } from '../../helpers/form-parsing.helpers.ts';
import { useIsSettingsSectionVisible } from '../../state/SettingsDrawerContext';
import { Button } from '../ui/Button';

// A person as the server keeps them (GET/PUT /view-prs/actors).
export interface Person {
  id: string;
  name: string;
  logins: string[];
}

// A person as edited: their logins as typed. `key` tells rows apart, a new
// one (no id yet) included.
interface PersonDraft {
  key: string;
  id?: string;
  name: string;
  logins: string;
}

type Status = { tone: 'info' | 'success' | 'error'; text: string };

const toDraft = (person: Person): PersonDraft => ({ key: person.id, id: person.id, name: person.name, logins: person.logins.join(', ') });
const parseLogins = (text: string) => text.split(/[\s,]+/).filter(Boolean);
const sameDrafts = (a: PersonDraft[], b: PersonDraft[]) =>
  a.length === b.length && a.every((draft, index) => draft.id === b[index]?.id && draft.name === b[index]?.name && draft.logins === b[index]?.logins);

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
    setDrafts((previous) => [{ key: `new-${newKeyRef.current}`, name: '', logins: '' }, ...previous]);
  };

  const save = async () => {
    setSaving(true);
    try {
      // A new row left empty isn't anyone.
      const actors = drafts
        .filter((draft) => draft.id || draft.name.trim() || draft.logins.trim())
        .map((draft) => ({ ...(draft.id ? { id: draft.id } : {}), name: draft.name.trim(), logins: parseLogins(draft.logins) }));
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
    return drafts.filter((draft) => !draft.id || `${draft.name} ${draft.logins}`.toLowerCase().includes(needle));
  }, [drafts, query]);

  return (
    <div className="settings-section">
      <div className="settings-group">
        <p className="settings-hint">
          Everyone the app knows: the name shown for them in the table, the filters, Review stats and Authors, and every GitHub
          login that&apos;s them. Someone new is added as soon as they appear in a PR, named as GitHub names them. To make two
          logins one person, put both in one row (the first is their main login) and remove the other row - what was picked
          or noted for the removed one (filters, rules, Authors comments) becomes the other&apos;s.
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
            const label = draft.name.trim() || parseLogins(draft.logins)[0] || 'New person';
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
                <input
                  type="text"
                  className="settings-control"
                  placeholder="login, other-login"
                  aria-label={`Logins for ${label}`}
                  {...NON_CREDENTIAL_INPUT_PROPS}
                  value={draft.logins}
                  onChange={(event) => update(draft.key, { logins: event.target.value })}
                />
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
