import type { PrData, PrEntry, PrNotes } from "../types/pr-data.ts";
import { asArray } from "./pr-as-array.helpers.ts";

// The filter bar's search box: which rows a search matches, and where.
// Every word has to be found somewhere in the row (any order, any case):
// its title, author, branch names, or the notes you typed yourself.

export type SearchFieldKey =
  | "title"
  | "author"
  | "branch"
  | "comments"
  | "otherNotes"
  | "difficulty"
  | "stories"
  | "analysis";

// What the row's "Matches in" note calls each field the row doesn't show.
export const SEARCH_FIELD_LABELS: Record<SearchFieldKey, string> = {
  title: "title",
  author: "author",
  branch: "branch",
  comments: "comments",
  otherNotes: "other notes",
  difficulty: "difficulty",
  stories: "stories",
  analysis: "analysis",
};

// Shown in the row itself, so a match there needs no note.
const SHOWN_IN_ROW = new Set<SearchFieldKey>(["title", "author"]);

export const parseSearchTerms = (query: unknown): string[] => [
  ...new Set(
    String(query || "")
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean),
  ),
];

const text = (value: unknown) => String(value ?? "").trim();

// Notes are read from the entry, falling back to the row (older data), as
// pr-manual-notes-summary.helpers.ts does.
const readNotes = (entry: PrEntry | null | undefined, row: PrData): PrNotes => entry?.notes || row?.notes || {};

export const collectSearchTexts = (
  entry: PrEntry | null | undefined,
  authorNames: string[] = [],
): Record<SearchFieldKey, string> => {
  const row: PrData = entry?.data || {};
  const notes = readNotes(entry, row);
  const join = (values: unknown[]) => values.map(text).filter(Boolean).join("\n").toLowerCase();
  return {
    title: join([row.title]),
    author: join([row.author, row.authorLogin, ...authorNames]),
    branch: join([row.sourceBranch, row.targetBranch]),
    comments: join(asArray(notes?.comments).flatMap((comment) => [comment?.note, comment?.author])),
    otherNotes: join([notes?.otherNotes]),
    difficulty: join([notes?.prDifficulty]),
    stories: join(asArray(notes?.stories).flatMap((story) => [story?.name, story?.url])),
    analysis: join([notes?.analysisOfPr]),
  };
};

export interface RowSearchMatch {
  matches: boolean;
  // The fields the row doesn't show that a word was only found in - what
  // its "Matches in" note lists, so it's clear why the row is there. Kept
  // when another word wasn't found: the row's note isn't given the
  // author's shown name, which a word the table matched may be in.
  hiddenFields: SearchFieldKey[];
}

export const matchRowSearch = (
  entry: PrEntry | null | undefined,
  terms: string[],
  authorNames: string[] = [],
): RowSearchMatch => {
  if (terms.length === 0) return { matches: true, hiddenFields: [] };
  const texts = collectSearchTexts(entry, authorNames);
  const fields = Object.keys(texts) as SearchFieldKey[];
  const hidden = new Set<SearchFieldKey>();
  let matches = true;
  for (const term of terms) {
    const found = fields.filter((field) => texts[field].includes(term));
    if (found.length === 0) matches = false;
    else if (!found.some((field) => SHOWN_IN_ROW.has(field))) found.forEach((field) => hidden.add(field));
  }
  return { matches, hiddenFields: fields.filter((field) => hidden.has(field)) };
};
