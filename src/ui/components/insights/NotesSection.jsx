/**
 * NotesSection - editable manual notes (comments with author/tone, other
 * notes, PR difficulty, Rally stories/links, analysis) that persist to
 * POST /view-prs/notes. Matches vanilla's createNotesSection (index.page.js).
 *
 * @module components/insights/NotesSection
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NotesMultiEntryField } from './NotesMultiEntryField';

const TONE_OPTIONS = [
  { value: 'Positive', label: '👍 Positive' },
  { value: 'Negative', label: '👎 Negative' },
  { value: 'Neutral', label: '◽ Neutral' },
];

const DIFFICULTY_OPTIONS = [
  { value: '', label: '- Select difficulty -' },
  { value: '1', label: '1 - Simple' },
  { value: '2', label: '2 - Easy' },
  { value: '3', label: '3 - Moderate' },
  { value: '4', label: '4 - Hard' },
  { value: '5', label: '5 - Very difficult' },
];

function generateCommentId() {
  return `comment-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function AutoResizeTextarea({ className, rows, placeholder, value, onChange }) {
  const ref = useRef(null);
  const autoResizeTextarea = window.autoResizeTextarea || ((el) => {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  });

  return (
    <textarea
      ref={ref}
      className={className}
      rows={rows}
      placeholder={placeholder}
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
        if (ref.current) autoResizeTextarea(ref.current);
      }}
    />
  );
}

function areStringListsEqual(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  return left.every((value, index) => String(value) === String(right[index]));
}

function buildOriginalSnapshot({ comments, otherNotes, prDifficulty, rallyStories, rallyLinks, analysisOfPr }) {
  return {
    comments: comments.map((c) => ({ author: c.author, tone: c.tone, note: c.note })),
    otherNotes,
    prDifficulty,
    rallyStories,
    rallyLinks,
    analysisOfPr,
  };
}

export function NotesSection({ entry, pr, actorsMap, onDataRefresh }) {
  const asArray = window.asArray || ((value) => (Array.isArray(value) ? value : []));
  const resolveActorDisplayName =
    window.resolveActorDisplayName || ((login, _actorsMap, fallback) => String(fallback || login || '').trim());
  const buildPrPeopleOptions = window.buildPrPeopleOptions || (() => []);
  const noteAuthorMatchesSelection = window.noteAuthorMatchesSelection || (() => false);
  const normalizeNotesListForUi = window.normalizeNotesListForUi || ((value) => (Array.isArray(value) && value.length ? value : ['']));
  const postJson = window.postJson || (() => Promise.reject(new Error('postJson unavailable')));
  const recomputeDirtyPrSectionsFields = window.recomputeDirtyPrSectionsFields || (() => {});

  const prNumber = String(pr?.number || entry?.prNumber || '').trim();
  const repo = entry?.repo || '';
  const existingNotes = entry?.notes || {};

  const peopleOptions = useMemo(() => {
    const options = buildPrPeopleOptions(pr, actorsMap);
    asArray(existingNotes.comments).forEach((comment) => {
      const authorLogin = String(comment?.author || '').trim();
      if (!authorLogin) return;
      if (options.some((person) => person.login === authorLogin)) return;
      options.push({ login: authorLogin, name: resolveActorDisplayName(authorLogin, actorsMap, authorLogin) });
    });
    return options;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pr, actorsMap]);

  const resolveInitialAuthorValue = (existingAuthor) => {
    const match = peopleOptions.find((option) => noteAuthorMatchesSelection(existingAuthor, option, actorsMap));
    return match ? match.login : String(existingAuthor || '');
  };

  const [comments, setComments] = useState(() =>
    asArray(existingNotes.comments).map((c) => ({
      id: String(c?.id || '').trim() || generateCommentId(),
      author: resolveInitialAuthorValue(c?.author),
      tone: c?.tone || 'Neutral',
      note: String(c?.note || ''),
    })),
  );
  const [otherNotes, setOtherNotes] = useState(String(existingNotes.otherNotes || ''));
  const [prDifficulty, setPrDifficulty] = useState(String(existingNotes.prDifficulty || ''));
  const [rallyStories, setRallyStories] = useState(() => normalizeNotesListForUi(existingNotes.rallyStories));
  const [rallyLinks, setRallyLinks] = useState(() => normalizeNotesListForUi(existingNotes.rallyLinks));
  const [analysisOfPr, setAnalysisOfPr] = useState(String(existingNotes.analysisOfPr || ''));
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  const originalRef = useRef(buildOriginalSnapshot({ comments, otherNotes, prDifficulty, rallyStories, rallyLinks, analysisOfPr }));

  const hasChanges = (() => {
    const original = originalRef.current;
    if (comments.length !== original.comments.length) return true;
    if (otherNotes !== original.otherNotes) return true;
    if (prDifficulty !== original.prDifficulty) return true;
    if (!areStringListsEqual(rallyStories.filter(Boolean), original.rallyStories.filter(Boolean))) return true;
    if (!areStringListsEqual(rallyLinks.filter(Boolean), original.rallyLinks.filter(Boolean))) return true;
    if (analysisOfPr !== original.analysisOfPr) return true;
    return comments.some((comment, index) => {
      const originalComment = original.comments[index];
      if (!originalComment) return true;
      return comment.author !== originalComment.author || comment.tone !== originalComment.tone || comment.note !== originalComment.note;
    });
  })();

  useEffect(() => {
    recomputeDirtyPrSectionsFields();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasChanges]);

  useEffect(() => {
    // If this section unmounts (row collapsed/filtered away) while still
    // dirty, its data-has-unsaved-notes="true" node leaves the DOM without
    // ever notifying the blocker — rescan so a stale block doesn't linger.
    return () => recomputeDirtyPrSectionsFields();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateComment = (id, patch) => {
    setComments((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };
  const removeComment = (id) => {
    setComments((prev) => prev.filter((c) => c.id !== id));
  };
  const addComment = () => {
    setComments((prev) => [...prev, { id: generateCommentId(), author: '', tone: 'Neutral', note: '' }]);
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus('Saving...');
    try {
      const cleanedRallyStories = rallyStories.map((v) => v.trim()).filter(Boolean);
      const cleanedRallyLinks = rallyLinks.map((v) => v.trim()).filter(Boolean);
      const notesPayload = {
        comments: comments.map(({ id, author, tone, note }) => ({ id, author, tone, note })),
        otherNotes,
        prDifficulty,
        rallyStories: cleanedRallyStories,
        rallyLinks: cleanedRallyLinks,
        analysisOfPr,
      };
      const { response, result } = await postJson('/view-prs/notes', { prNumber, repo, ...notesPayload });
      if (!response.ok || result.ok === false) {
        setStatus(`Save failed: ${result.error || 'unknown error'}`);
        return;
      }
      if (entry) {
        entry.notes = notesPayload;
      }
      originalRef.current = buildOriginalSnapshot({
        comments,
        otherNotes,
        prDifficulty,
        rallyStories: cleanedRallyStories,
        rallyLinks: cleanedRallyLinks,
        analysisOfPr,
      });
      setRallyStories(cleanedRallyStories.length ? cleanedRallyStories : ['']);
      setRallyLinks(cleanedRallyLinks.length ? cleanedRallyLinks : ['']);
      if (result.prData && onDataRefresh) {
        onDataRefresh(result.prData);
      }
      setStatus('Saved.');
      setTimeout(() => setStatus(''), 3000);
    } catch (_error) {
      setStatus('Save failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pr-notes-section" data-pr-number={prNumber} data-has-unsaved-notes={hasChanges ? 'true' : 'false'}>
      <div className="pr-notes-title">Notes</div>

      <div className="pr-notes-subtitle">Comments</div>
      <div className="pr-notes-comments-list">
        {comments.map((comment) => (
          <div key={comment.id} className="pr-notes-comment-row">
            <select className="pr-notes-comment-author" value={comment.author} onChange={(e) => updateComment(comment.id, { author: e.target.value })}>
              <option value="">— Author —</option>
              {peopleOptions.map(({ login, name }) => (
                <option key={login} value={login}>
                  {name || login}
                </option>
              ))}
            </select>
            <select className="pr-notes-comment-tone" value={comment.tone} onChange={(e) => updateComment(comment.id, { tone: e.target.value })}>
              {TONE_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <AutoResizeTextarea
              className="pr-notes-textarea pr-notes-comment-note"
              rows={2}
              placeholder="Note..."
              value={comment.note}
              onChange={(value) => updateComment(comment.id, { note: value })}
            />
            <button type="button" className="pr-notes-comment-remove" onClick={() => removeComment(comment.id)}>
              ✕ Remove
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="pr-notes-add-comment" onClick={addComment}>
        + Add comment
      </button>

      <label className="pr-notes-label">
        Other Notes
        <AutoResizeTextarea className="pr-notes-textarea" rows={3} placeholder="Other notes..." value={otherNotes} onChange={setOtherNotes} />
      </label>

      <label className="pr-notes-label">
        PR difficulty
        <select className="pr-notes-input" value={prDifficulty} onChange={(e) => setPrDifficulty(e.target.value)}>
          {DIFFICULTY_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <NotesMultiEntryField title="Rally stories" placeholder="US12345" values={rallyStories} inputClassName="pr-notes-rally-story-input" onChange={setRallyStories} />
      <NotesMultiEntryField title="Rally links" placeholder="https://rally.example/US12345" values={rallyLinks} inputClassName="pr-notes-rally-link-input" onChange={setRallyLinks} />

      <label className="pr-notes-label">
        Analysis of PR
        <AutoResizeTextarea className="pr-notes-textarea" rows={4} placeholder="PR analysis..." value={analysisOfPr} onChange={setAnalysisOfPr} />
      </label>

      <button type="button" className="pr-notes-save" disabled={!hasChanges || saving} onClick={handleSave}>
        Save notes
      </button>
      <span className="pr-notes-status">{status}</span>
    </div>
  );
}
