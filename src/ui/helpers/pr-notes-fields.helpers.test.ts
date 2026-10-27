import { createPrNotesHelpers } from './pr-notes.helpers.ts';
import {
  cleanStories,
  difficultyLabel,
  hasUnsavedDrafts,
  isFieldChanged,
  isFieldEmpty,
  notesWithField,
  storedNotesKey,
  storyHref,
  toNotesValues,
  type NotesValues,
} from './pr-notes-fields.helpers.ts';

const { normalizeStoriesForUi } = createPrNotesHelpers();

const saved: NotesValues = {
  comments: [{ id: 'c1', author: 'alice', tone: 'Positive', note: 'Nice' }],
  otherNotes: 'Other',
  prDifficulty: '3',
  stories: [{ name: 'US1', url: 'https://x/US1' }],
  analysisOfPr: '',
};

describe('toNotesValues', () => {
  test('fills in what the stored notes leave out, and maps authors through resolveAuthor', () => {
    const values = toNotesValues(
      { comments: [{ id: 'c1', author: 'Alice Smith', tone: '', note: 'Hi' }, { author: 'bob' }], prDifficulty: '2' },
      normalizeStoriesForUi,
      (author) => (author === 'Alice Smith' ? 'alice' : author),
    );
    expect(values.comments.map(({ author, tone, note }) => [author, tone, note])).toEqual([
      ['alice', 'Neutral', 'Hi'],
      ['bob', 'Neutral', ''],
    ]);
    // A comment without an id gets one.
    expect(values.comments[1]?.id).toMatch(/^comment-/);
    expect(values).toMatchObject({ otherNotes: '', prDifficulty: '2', analysisOfPr: '', stories: [{ name: '', url: '' }] });
  });

  test('no notes at all', () => {
    expect(toNotesValues(undefined, normalizeStoriesForUi)).toMatchObject({ comments: [], otherNotes: '', prDifficulty: '' });
  });
});

describe('isFieldChanged', () => {
  test('comments: by author, tone and note, or a row added or removed (not the id)', () => {
    const same = [{ ...saved.comments[0]!, id: 'other-id' }];
    expect(isFieldChanged('comments', saved.comments, same)).toBe(false);
    expect(isFieldChanged('comments', saved.comments, [{ ...saved.comments[0]!, tone: 'Negative' }])).toBe(true);
    expect(isFieldChanged('comments', saved.comments, [])).toBe(true);
  });

  test('stories: as they would be saved, so blank rows and spaces do not count', () => {
    expect(isFieldChanged('stories', saved.stories, [{ name: ' US1 ', url: 'https://x/US1' }, { name: '', url: '' }])).toBe(false);
    expect(isFieldChanged('stories', saved.stories, [{ name: 'US2', url: 'https://x/US1' }])).toBe(true);
  });

  test('text fields: exactly', () => {
    expect(isFieldChanged('otherNotes', 'Other', 'Other')).toBe(false);
    expect(isFieldChanged('otherNotes', 'Other', 'Other ')).toBe(true);
  });
});

test('isFieldEmpty: no comments, no story with a name or URL, blank text', () => {
  expect(isFieldEmpty('comments', saved)).toBe(false);
  expect(isFieldEmpty('analysisOfPr', saved)).toBe(true);
  expect(isFieldEmpty('otherNotes', { ...saved, otherNotes: '  ' })).toBe(true);
  expect(isFieldEmpty('stories', { ...saved, stories: [{ name: '', url: '' }] })).toBe(true);
});

test('hasUnsavedDrafts: only a draft that differs from what is saved', () => {
  expect(hasUnsavedDrafts(saved, {})).toBe(false);
  expect(hasUnsavedDrafts(saved, { otherNotes: 'Other' })).toBe(false);
  expect(hasUnsavedDrafts(saved, { otherNotes: 'Other', prDifficulty: '4' })).toBe(true);
});

test('notesWithField: the saved notes with one field replaced, stories cleaned', () => {
  const notes = notesWithField({ ...saved, otherNotes: 'saved' }, 'stories', [{ name: ' US9 ', url: '' }, { name: '', url: '' }]);
  expect(notes.stories).toEqual([{ name: 'US9', url: '' }]);
  expect(notes.otherNotes).toBe('saved');
  expect(notes.comments).toEqual(saved.comments);
});

test('blank comment rows (no author, no note) are not a change, not content, and not saved', () => {
  const blank = { id: 'b', author: ' ', tone: 'Negative' as const, note: '' };
  expect(isFieldChanged('comments', saved.comments, [...saved.comments, blank])).toBe(false);
  expect(isFieldChanged('comments', [], [blank])).toBe(false);
  expect(isFieldEmpty('comments', { ...saved, comments: [blank] })).toBe(true);
  expect(notesWithField(saved, 'comments', [blank, ...saved.comments]).comments).toEqual(saved.comments);
  // A row with only a note (or only an author) is kept.
  expect(isFieldChanged('comments', [], [{ ...blank, note: 'x' }])).toBe(true);
});

test('storedNotesKey changes with the stored notes, not with a copy of them', () => {
  const stored = { otherNotes: 'a', comments: [{ id: 'c', note: 'n' }] };
  expect(storedNotesKey({ ...stored })).toBe(storedNotesKey(stored));
  expect(storedNotesKey({ ...stored, otherNotes: 'b' })).not.toBe(storedNotesKey(stored));
  expect(storedNotesKey(undefined)).toBe(storedNotesKey(null));
});

test('cleanStories trims and drops empty rows', () => {
  expect(cleanStories([{ name: ' a ', url: '' }, { name: ' ', url: ' ' }])).toEqual([{ name: 'a', url: '' }]);
});

test('difficultyLabel names a known value and passes through others', () => {
  expect(difficultyLabel('4')).toBe('4 - Hard');
  expect(difficultyLabel('7')).toBe('7');
});

test('storyHref: only web addresses become links', () => {
  expect(storyHref(' https://x/US1 ')).toBe('https://x/US1');
  expect(storyHref('http://x')).toBe('http://x');
  expect(storyHref('javascript:alert(1)')).toBe('');
  expect(storyHref('x/US1')).toBe('');
});
