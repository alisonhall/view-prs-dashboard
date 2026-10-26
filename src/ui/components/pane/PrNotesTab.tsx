import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PrData, PrDataPayload, PrEntry } from '../../types/pr-data.ts';
import type { ActorsMap } from '../../helpers/pr-actor-identity.helpers.ts';
import { ActorIdentity } from '../ActorIdentity';
import { Button, IconButton } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Tooltip } from '../ui/Tooltip';
import { NotesStoriesField } from './NotesStoriesField';
import { useActorIdentity } from '../../state/ActorIdentityContext';
import { useNotesDirty } from '../../state/NotesDirtyContext';
import { usePrInsightsDisplay } from '../../state/PrInsightsDisplayContext';
import { useRequestActivity } from '../../state/RequestActivityContext';
import { createPrAuthorInsightsIdentityHelpers } from '../../helpers/pr-author-insights-identity.helpers.ts';
import { autoResizeTextarea } from '../../helpers/pr-textarea-autoresize.helpers.ts';
import { postJson } from '../../helpers/pr-http.helpers.ts';
import {
  DIFFICULTY_OPTIONS,
  NOTES_FIELDS,
  TONE_OPTIONS,
  cleanComments,
  cleanStories,
  difficultyLabel,
  emptyComment,
  hasUnsavedDrafts,
  isFieldChanged,
  isFieldEmpty,
  notesWithField,
  storedNotesKey,
  storyHref,
  toNotesValues,
  type NoteComment,
  type NoteTone,
  type NotesDrafts,
  type NotesField,
  type NotesValues,
} from '../../helpers/pr-notes-fields.helpers.ts';

/**
 * The detail pane's Notes tab (UI_REDESIGN_PLAN.md, phase 7): the user's
 * own notes on the PR - comments (author, tone, note), other notes, PR
 * difficulty, stories and an analysis.
 *
 * Each field shows read-only with an Edit button (Add when it's empty),
 * which turns it into inputs with their own Save and Cancel. Saving a field
 * POSTs the notes with that field changed and the others as saved, so
 * another field's unsaved edit stays a draft. Stories show their names,
 * each with a button opening its link.
 *
 * Unsaved edits (a draft that differs from what's saved) mark the PR dirty
 * in NotesDirtyContext: the pane's "unsaved" badge, asking before switching
 * PRs, and holding back data refreshes. The "Auto update paused" chip
 * focuses the first enabled `.pr-notes-save`, so only a changed field's
 * Save is enabled.
 */
export interface PrNotesTabProps {
  entry: PrEntry;
  pr: PrData;
  actorsMap?: ActorsMap;
  onDataRefresh?: (payload: PrDataPayload) => void;
}

type FieldMessage = { text: string; tone: 'pending' | 'success' | 'error' };

// POST /view-prs/notes's reply: the refreshed data on success.
type NotesRouteResult = { ok?: boolean; error?: string; prData?: PrDataPayload };

function AutoResizeTextarea({ label, placeholder, rows, value, onChange }: { label: string; placeholder: string; rows: number; value: string; onChange: (value: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // Fits the text it opens with too, not only what's typed.
  useLayoutEffect(() => {
    if (ref.current) autoResizeTextarea(ref.current);
  }, [value]);
  return (
    <textarea
      ref={ref}
      className="pr-notes-textarea"
      aria-label={label}
      placeholder={placeholder}
      rows={rows}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function CommentsEditor({
  comments,
  people,
  onChange,
}: {
  comments: NoteComment[];
  people: Array<{ login: string; name: string }>;
  onChange: (comments: NoteComment[]) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  // The comment just added, to focus its author once it renders.
  const [focusId, setFocusId] = useState<string | null>(null);
  useEffect(() => {
    if (!focusId) return;
    listRef.current?.querySelector<HTMLElement>(`[data-comment-id="${CSS.escape(focusId)}"] select`)?.focus();
    setFocusId(null);
  }, [focusId]);

  const update = (id: string, patch: Partial<NoteComment>) => onChange(comments.map((comment) => (comment.id === id ? { ...comment, ...patch } : comment)));
  const add = () => {
    const comment = emptyComment();
    onChange([...comments, comment]);
    setFocusId(comment.id);
  };
  const remove = (id: string) => {
    onChange(comments.filter((comment) => comment.id !== id));
    addRef.current?.focus();
  };

  return (
    <div className="pr-notes-comments-editor" ref={listRef}>
      {comments.map((comment, index) => (
        <div key={comment.id} className="pr-notes-comment-row" data-comment-id={comment.id}>
          <select
            className="pr-notes-input"
            aria-label={`Comment ${index + 1} author`}
            value={comment.author}
            onChange={(event) => update(comment.id, { author: event.target.value })}
          >
            <option value="">— Author —</option>
            {people.map(({ login, name }) => (
              <option key={login} value={login}>
                {name || login}
              </option>
            ))}
          </select>
          <select
            className="pr-notes-input"
            aria-label={`Comment ${index + 1} tone`}
            value={comment.tone}
            onChange={(event) => update(comment.id, { tone: event.target.value as NoteTone })}
          >
            {TONE_OPTIONS.map(({ value, label, icon }) => (
              <option key={value} value={value}>
                {icon} {label}
              </option>
            ))}
          </select>
          <IconButton icon="close" label={`Remove comment ${index + 1}`} onClick={() => remove(comment.id)} />
          <div className="pr-notes-comment-note">
            <AutoResizeTextarea
              label={`Comment ${index + 1} note`}
              placeholder="Note..."
              rows={2}
              value={comment.note}
              onChange={(note) => update(comment.id, { note })}
            />
          </div>
        </div>
      ))}
      <Button ref={addRef} icon="plus" className="pr-notes-add" onClick={add}>
        Add comment
      </Button>
    </div>
  );
}

const None = ({ children = 'None' }: { children?: ReactNode }) => <p className="pr-notes-none">{children}</p>;

export function PrNotesTab({ entry, pr, actorsMap = {}, onDataRefresh }: PrNotesTabProps) {
  const { normalizeActorLogin, resolveActorDisplayName } = useActorIdentity();
  const { setNotesDirty } = useNotesDirty();
  const { buildPrPeopleOptions, normalizeStoriesForUi } = usePrInsightsDisplay();
  const { beginRequestActivity } = useRequestActivity();
  const { noteAuthorMatchesSelection } = useMemo(
    () => createPrAuthorInsightsIdentityHelpers({ normalizeActorLogin, resolveActorDisplayName }),
    [normalizeActorLogin, resolveActorDisplayName],
  );

  const prNumber = String(pr?.number || entry?.prNumber || '').trim();
  const repo = entry?.repo || '';
  const idPrefix = useId();

  // The PR's people, and anyone the notes name who isn't one of them.
  const people = useMemo(() => {
    const options = buildPrPeopleOptions(pr, actorsMap);
    (entry?.notes?.comments || []).forEach((comment) => {
      const login = String(comment?.author || '').trim();
      if (login && !options.some((person) => person.login === login)) {
        options.push({ login, name: resolveActorDisplayName(login, actorsMap, login) });
      }
    });
    return options;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pr, actorsMap]);

  // A stored author as the people list's login, where one matches.
  const resolveAuthor = (author: string) => {
    const match = people.find((option) => noteAuthorMatchesSelection(author, option, actorsMap));
    return match ? match.login : author;
  };
  const [saved, setSaved] = useState<NotesValues>(() => toNotesValues(entry?.notes, normalizeStoriesForUi, resolveAuthor));

  // The tab stays mounted while the PR is selected, so it takes in notes
  // that change under it (another window, the backfill): otherwise saving
  // one field would write the others back as they were. A field being
  // edited keeps its draft. (Its own saves come back here too, as the
  // values it already holds.)
  const storedKey = storedNotesKey(entry?.notes);
  const storedKeyRef = useRef(storedKey);
  useEffect(() => {
    if (storedKey === storedKeyRef.current) return;
    storedKeyRef.current = storedKey;
    setSaved(toNotesValues(entry?.notes, normalizeStoriesForUi, resolveAuthor));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedKey]);
  const [drafts, setDrafts] = useState<NotesDrafts>({});
  const [savingField, setSavingField] = useState<NotesField | null>(null);
  const [messages, setMessages] = useState<Partial<Record<NotesField, FieldMessage>>>({});
  // Where focus goes once the next render lands: a field's first input
  // (Edit), or its Edit button (Save, Cancel).
  const [focusRequest, setFocusRequest] = useState<{ field: NotesField; target: 'editor' | 'button' } | null>(null);
  const fieldRefs = useRef(new Map<NotesField, HTMLDivElement>());

  const dirty = hasUnsavedDrafts(saved, drafts);
  useEffect(() => {
    setNotesDirty(prNumber, dirty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, prNumber]);
  // Unmounting while dirty must not leave the PR marked (the effect above
  // doesn't run on unmount).
  useEffect(
    () => () => setNotesDirty(prNumber, false),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prNumber],
  );

  useEffect(() => {
    if (!focusRequest) return;
    const field = fieldRefs.current.get(focusRequest.field);
    const target =
      focusRequest.target === 'editor'
        ? field?.querySelector<HTMLElement>('.pr-notes-editor :is(textarea, select, input)')
        : field?.querySelector<HTMLElement>('.pr-notes-edit');
    target?.focus();
    setFocusRequest(null);
  }, [focusRequest]);

  // "Saved." goes away after a few seconds; errors stay until the next try.
  useEffect(() => {
    if (!Object.values(messages).some((message) => message?.tone === 'success')) return;
    const timer = setTimeout(() => {
      setMessages((current) =>
        Object.fromEntries(Object.entries(current).filter(([, message]) => message?.tone !== 'success')) as typeof current,
      );
    }, 3000);
    return () => clearTimeout(timer);
  }, [messages]);

  const setMessage = (field: NotesField, message: FieldMessage | null) =>
    setMessages((current) => {
      const next = { ...current };
      if (message) next[field] = message;
      else delete next[field];
      return next;
    });

  const setDraft = <F extends NotesField>(field: F, value: NotesValues[F]) => setDrafts((current) => ({ ...current, [field]: value }));

  const startEdit = (field: NotesField) => {
    const value =
      field === 'comments'
        ? cleanComments(saved.comments).length
          ? cleanComments(saved.comments)
          : [emptyComment()]
        : field === 'stories'
          ? normalizeStoriesForUi(saved.stories)
          : saved[field];
    setDraft(field, value);
    setMessage(field, null);
    setFocusRequest({ field, target: 'editor' });
  };

  const stopEdit = (field: NotesField) => {
    setDrafts((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
    setFocusRequest({ field, target: 'button' });
  };

  const cancel = (field: NotesField) => {
    setMessage(field, null);
    stopEdit(field);
  };

  const save = async (field: NotesField) => {
    const draft = drafts[field];
    if (draft === undefined) return;
    const notes = notesWithField(saved, field, draft);
    setSavingField(field);
    setMessage(field, { text: 'Saving…', tone: 'pending' });
    const finishActivity = beginRequestActivity('notesSave');
    try {
      const payload = {
        comments: notes.comments.map(({ id, author, tone, note }) => ({ id, author, tone, note })),
        otherNotes: notes.otherNotes,
        prDifficulty: notes.prDifficulty,
        stories: notes.stories,
        analysisOfPr: notes.analysisOfPr,
      };
      const { response, result } = await postJson<NotesRouteResult>('/view-prs/notes', { prNumber, repo, ...payload });
      if (!response.ok || result.ok === false) {
        setMessage(field, { text: `Save failed: ${result.error || 'unknown error'}`, tone: 'error' });
        return;
      }
      // The row's notes icon reads the entry until the refreshed data lands.
      entry.notes = payload;
      setSaved({ ...notes, stories: normalizeStoriesForUi(notes.stories) });
      stopEdit(field);
      setMessage(field, { text: 'Saved.', tone: 'success' });
      if (result.prData && onDataRefresh) onDataRefresh(result.prData);
    } catch {
      setMessage(field, { text: 'Save failed.', tone: 'error' });
    } finally {
      setSavingField(null);
      finishActivity();
    }
  };

  const readView = (field: NotesField): ReactNode => {
    if (isFieldEmpty(field, saved)) return <None>{field === 'prDifficulty' ? 'Not set' : 'None'}</None>;
    switch (field) {
      case 'comments':
        return (
          <ul className="pr-notes-comments">
            {cleanComments(saved.comments).map((comment) => {
              const tone = TONE_OPTIONS.find((option) => option.value === comment.tone);
              return (
                <li key={comment.id} className="pr-notes-comment">
                  <p className="pr-notes-comment-meta">
                    {comment.author ? (
                      <ActorIdentity row={pr} login={comment.author} actorsMap={actorsMap} fallbackName={comment.author} />
                    ) : (
                      <span className="pr-notes-none">No author</span>
                    )}
                    {tone && (
                      <span className="pr-notes-tone" data-tone={tone.value.toLowerCase()}>
                        <span aria-hidden="true">{tone.icon}</span> {tone.label}
                      </span>
                    )}
                  </p>
                  {comment.note && <p className="pr-notes-text">{comment.note}</p>}
                </li>
              );
            })}
          </ul>
        );
      case 'stories':
        return (
          <ul className="pr-notes-stories-list">
            {cleanStories(saved.stories).map((story, index) => {
              const href = storyHref(story.url);
              const name = story.name || story.url;
              return (
                <li key={index} className="pr-notes-story">
                  <span className="pr-notes-story-name">{name}</span>
                  {href && (
                    <Tooltip content={`Open ${name}`} describe={false}>
                      <a className="ui-icon-button" href={href} target="_blank" rel="noopener noreferrer" aria-label={`Open ${name}`}>
                        <Icon name="externalLink" />
                      </a>
                    </Tooltip>
                  )}
                </li>
              );
            })}
          </ul>
        );
      case 'prDifficulty':
        return <p className="pr-notes-text">{difficultyLabel(saved.prDifficulty)}</p>;
      default:
        return <p className="pr-notes-text">{saved[field]}</p>;
    }
  };

  const editor = (field: NotesField, label: string): ReactNode => {
    switch (field) {
      case 'comments':
        return <CommentsEditor comments={drafts.comments ?? []} people={people} onChange={(value) => setDraft('comments', value)} />;
      case 'stories':
        return <NotesStoriesField stories={drafts.stories ?? []} onChange={(value) => setDraft('stories', value)} />;
      case 'prDifficulty':
        return (
          <select className="pr-notes-input" aria-label={label} value={drafts.prDifficulty ?? ''} onChange={(event) => setDraft('prDifficulty', event.target.value)}>
            <option value="">- Select difficulty -</option>
            {DIFFICULTY_OPTIONS.map(({ value, label: optionLabel }) => (
              <option key={value} value={value}>
                {optionLabel}
              </option>
            ))}
          </select>
        );
      default:
        return (
          <AutoResizeTextarea
            label={label}
            placeholder={field === 'otherNotes' ? 'Other notes...' : 'PR analysis...'}
            rows={field === 'otherNotes' ? 3 : 4}
            value={drafts[field] ?? ''}
            onChange={(value) => setDraft(field, value)}
          />
        );
    }
  };

  return (
    // A group named by its PR (the Notes tab of the PR shown, and the
    // "Auto update paused" chip finds it by data-pr-number).
    <div className="pr-notes-section" data-pr-number={prNumber} role="group" aria-label={`Notes for PR #${prNumber}`}>
      {NOTES_FIELDS.map(({ field, label, name }) => {
        const draft = drafts[field];
        const editing = draft !== undefined;
        const changed = editing && isFieldChanged(field, saved[field], draft);
        const empty = isFieldEmpty(field, saved);
        const headingId = `${idPrefix}-${field}`;
        const message = messages[field];
        return (
          <div
            key={field}
            ref={(node) => {
              if (node) fieldRefs.current.set(field, node);
              else fieldRefs.current.delete(field);
            }}
            className="pr-notes-field"
            data-field={field}
            data-editing={editing ? 'true' : undefined}
            role="group"
            aria-labelledby={headingId}
          >
            <div className="pr-notes-field-header">
              <h3 id={headingId} className="pr-notes-field-label">
                {label}
              </h3>
              {!editing && (
                <Button icon={empty ? 'plus' : 'pencil'} className="pr-notes-edit" aria-label={`${empty ? 'Add' : 'Edit'} ${name}`} onClick={() => startEdit(field)}>
                  {empty ? 'Add' : 'Edit'}
                </Button>
              )}
            </div>
            {editing ? (
              <div className="pr-notes-editor">
                {editor(field, label)}
                <div className="pr-notes-actions">
                  <Button
                    variant="primary"
                    className="pr-notes-save"
                    aria-label={`Save ${name}`}
                    disabled={!changed || savingField !== null}
                    onClick={() => save(field)}
                  >
                    Save
                  </Button>
                  <Button disabled={savingField === field} onClick={() => cancel(field)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              readView(field)
            )}
            <p className="pr-notes-status" role="status" data-tone={message?.tone}>
              {message?.text}
            </p>
          </div>
        );
      })}
    </div>
  );
}
