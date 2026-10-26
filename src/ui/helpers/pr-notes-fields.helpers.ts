import type { PrNotes } from "../types/pr-data.ts";
import type { StoryRow } from "./pr-notes.helpers.ts";

// The detail pane's Notes tab (UI_REDESIGN_PLAN.md, phase 7): each field
// shows read-only until its Edit, and saves on its own. Saving one field
// sends it with the other fields' saved values, so another field's
// unsaved edit stays a draft.

export type NoteTone = "Positive" | "Negative" | "Neutral";

export interface NoteComment {
  id: string;
  // A login (or, in older notes, a display name).
  author: string;
  tone: NoteTone;
  note: string;
}

export interface NotesValues {
  comments: NoteComment[];
  otherNotes: string;
  prDifficulty: string;
  stories: StoryRow[];
  analysisOfPr: string;
}

export type NotesField = keyof NotesValues;

// In the order the tab shows them: the heading, and the name its buttons
// use ("Edit other notes").
export const NOTES_FIELDS: ReadonlyArray<{ field: NotesField; label: string; name: string }> = [
  { field: "comments", label: "Comments", name: "comments" },
  { field: "otherNotes", label: "Other notes", name: "other notes" },
  { field: "prDifficulty", label: "PR difficulty", name: "PR difficulty" },
  { field: "stories", label: "Stories", name: "stories" },
  { field: "analysisOfPr", label: "Analysis of PR", name: "analysis of PR" },
];

export const TONE_OPTIONS: ReadonlyArray<{ value: NoteTone; label: string; icon: string }> = [
  { value: "Positive", label: "Positive", icon: "👍" },
  { value: "Negative", label: "Negative", icon: "👎" },
  { value: "Neutral", label: "Neutral", icon: "◽" },
];

export const DIFFICULTY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "1", label: "1 - Simple" },
  { value: "2", label: "2 - Easy" },
  { value: "3", label: "3 - Moderate" },
  { value: "4", label: "4 - Hard" },
  { value: "5", label: "5 - Very difficult" },
];

export const difficultyLabel = (value: string): string =>
  DIFFICULTY_OPTIONS.find((option) => option.value === value)?.label ?? value;

const toTone = (value: unknown): NoteTone =>
  TONE_OPTIONS.some((option) => option.value === value) ? (value as NoteTone) : "Neutral";

export const newCommentId = (): string => `comment-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export const emptyComment = (): NoteComment => ({ id: newCommentId(), author: "", tone: "Neutral", note: "" });

// The stored notes as the tab holds them. `resolveAuthor` maps a stored
// author to the people list's login where one matches.
export const toNotesValues = (
  notes: PrNotes | null | undefined,
  normalizeStories: (stories: PrNotes["stories"]) => StoryRow[],
  resolveAuthor: (author: string) => string = (author) => author,
): NotesValues => ({
  comments: (Array.isArray(notes?.comments) ? notes.comments : []).map((comment) => ({
    id: String(comment?.id || "").trim() || newCommentId(),
    author: resolveAuthor(String(comment?.author || "")),
    tone: toTone(comment?.tone),
    note: String(comment?.note || ""),
  })),
  otherNotes: String(notes?.otherNotes || ""),
  prDifficulty: String(notes?.prDifficulty || ""),
  stories: normalizeStories(notes?.stories),
  analysisOfPr: String(notes?.analysisOfPr || ""),
});

// The stories that will be saved: trimmed, rows with neither a name nor a
// URL dropped.
export const cleanStories = (stories: readonly StoryRow[]): StoryRow[] =>
  stories.map((story) => ({ name: story.name.trim(), url: story.url.trim() })).filter((story) => story.name || story.url);

// The comments that will be saved: rows with neither an author nor a note
// dropped (a blank row added and left empty isn't a change).
export const cleanComments = (comments: readonly NoteComment[]): NoteComment[] =>
  comments.filter((comment) => comment.author.trim() || comment.note.trim());

// Whether a field's draft differs from its saved value (stories and
// comments compared as they'd be saved; comments by author, tone and note).
export const isFieldChanged = <F extends NotesField>(field: F, saved: NotesValues[F], draft: NotesValues[F]): boolean => {
  if (field === "comments") {
    const a = cleanComments(saved as NoteComment[]);
    const b = cleanComments(draft as NoteComment[]);
    return a.length !== b.length || a.some((comment, index) => {
      const other = b[index];
      return !other || comment.author !== other.author || comment.tone !== other.tone || comment.note !== other.note;
    });
  }
  if (field === "stories") {
    const a = cleanStories(saved as StoryRow[]);
    const b = cleanStories(draft as StoryRow[]);
    return a.length !== b.length || a.some((story, index) => story.name !== b[index]?.name || story.url !== b[index]?.url);
  }
  return saved !== draft;
};

export const isFieldEmpty = (field: NotesField, values: NotesValues): boolean => {
  if (field === "comments") return cleanComments(values.comments).length === 0;
  if (field === "stories") return cleanStories(values.stories).length === 0;
  return !String(values[field]).trim();
};

export type NotesDrafts = Partial<NotesValues>;

export const hasUnsavedDrafts = (saved: NotesValues, drafts: NotesDrafts): boolean =>
  NOTES_FIELDS.some(({ field }) => {
    const draft = drafts[field];
    return draft !== undefined && isFieldChanged(field, saved[field], draft);
  });

// What saving `field` sends: the saved notes with that field's draft in
// place, comments and stories cleaned as they're stored.
export const notesWithField = <F extends NotesField>(saved: NotesValues, field: F, draft: NotesValues[F]): NotesValues => {
  const next = { ...saved, [field]: draft };
  return { ...next, comments: cleanComments(next.comments), stories: cleanStories(next.stories) };
};

// A key for the stored notes, to notice when they change under the tab
// (another window, or the backfill) - not when only the object does.
export const storedNotesKey = (notes: PrNotes | null | undefined): string => JSON.stringify(notes ?? null);

// A story's link, only when it's a web address (a typed "javascript:" URL
// must not become a clickable link).
export const storyHref = (url: string): string => (/^https?:\/\/\S+$/i.test(url.trim()) ? url.trim() : "");
