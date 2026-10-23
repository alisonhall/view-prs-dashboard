import type { PrData, PrEntry, PrNotes } from "../types/pr-data.ts";
import { asArray } from "./pr-as-array.helpers.ts";

// What a PR's own notes contain, for the notes indicators in PrAuthorCell
// and PrDateCell. Notes are read from the entry, falling back to the row
// (older data).

const readNotes = (
  entry: PrEntry | null | undefined,
  row: PrData | null | undefined,
): PrNotes => entry?.notes || row?.notes || {};

const nonEmptyComments = (notes: PrNotes) =>
  asArray(notes?.comments).filter((comment) => {
    const noteText = String(comment?.note || "").trim();
    const authorText = String(comment?.author || "").trim();
    return Boolean(noteText || authorText);
  });

export interface ManualNotesSummary {
  hasNotes: boolean;
  commentsCount: number;
  hasOtherNotes: boolean;
}

export const getManualNotesSummary = (
  entry: PrEntry | null | undefined = {},
  row: PrData | null | undefined = {},
): ManualNotesSummary => {
  const notes = readNotes(entry, row);
  const comments = nonEmptyComments(notes);
  const otherNotes = String(notes?.otherNotes || "").trim();

  return {
    hasNotes: comments.length > 0 || Boolean(otherNotes),
    commentsCount: comments.length,
    hasOtherNotes: Boolean(otherNotes),
  };
};

const getNotesDifficultyLevelText = (difficultyValue: unknown): string => {
  const text = String(difficultyValue || "").trim();
  if (!text) return "";

  const matchedDigits = text.match(/\d+/);
  return matchedDigits ? matchedDigits[0] : "";
};

export interface ManualNotesFieldSummary {
  hasCustomComments: boolean;
  hasOtherNotes: boolean;
  hasDifficulty: boolean;
  difficultyLevelText: string;
  hasRallyStories: boolean;
  hasRallyLinks: boolean;
  hasAnalysisOfPr: boolean;
}

export const getManualNotesFieldSummary = (
  entry: PrEntry | null | undefined = {},
  row: PrData | null | undefined = {},
): ManualNotesFieldSummary => {
  const notes = readNotes(entry, row);
  const comments = nonEmptyComments(notes);
  const otherNotes = String(notes?.otherNotes || "").trim();
  const difficultyRaw = String(notes?.prDifficulty || "").trim();
  const rallyStories = asArray(notes?.rallyStories).filter((story) =>
    Boolean(String(story || "").trim()),
  );
  const rallyLinks = asArray(notes?.rallyLinks).filter((link) =>
    Boolean(String(link || "").trim()),
  );
  const analysisOfPr = String(notes?.analysisOfPr || "").trim();

  return {
    hasCustomComments: comments.length > 0,
    hasOtherNotes: Boolean(otherNotes),
    hasDifficulty: Boolean(difficultyRaw),
    difficultyLevelText: getNotesDifficultyLevelText(difficultyRaw),
    hasRallyStories: rallyStories.length > 0,
    hasRallyLinks: rallyLinks.length > 0,
    hasAnalysisOfPr: Boolean(analysisOfPr),
  };
};
