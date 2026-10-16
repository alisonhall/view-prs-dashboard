// Phase 7 (see REACT_MIGRATION_PLAN.md): extracted out of index.page.js
// (where these were plain inline functions, not in any helper module) so
// PrAuthorCell.jsx/PrDateCell.jsx can import them directly instead of
// reading them off window.getManualNotesSummary/getManualNotesFieldSummary -
// genuinely zero-dependency (asArray is itself a zero-dependency import,
// not viewer/payload state), matching pr-row-sorting.helpers.js's own
// precedent (bare exports, no createXHelpers() wrapper).
import { asArray } from "./pr-as-array.helpers.js";

export const getManualNotesSummary = (entry = {}, row = {}) => {
  const notes = entry?.notes || row?.notes || {};
  const comments = asArray(notes?.comments).filter((comment) => {
    const noteText = String(comment?.note || "").trim();
    const authorText = String(comment?.author || "").trim();
    return Boolean(noteText || authorText);
  });
  const otherNotes = String(notes?.otherNotes || "").trim();

  return {
    hasNotes: comments.length > 0 || Boolean(otherNotes),
    commentsCount: comments.length,
    hasOtherNotes: Boolean(otherNotes),
  };
};

const getNotesDifficultyLevelText = (difficultyValue) => {
  const text = String(difficultyValue || "").trim();
  if (!text) return "";

  const matchedDigits = text.match(/\d+/);
  return matchedDigits ? matchedDigits[0] : "";
};

export const getManualNotesFieldSummary = (entry = {}, row = {}) => {
  const notes = entry?.notes || row?.notes || {};
  const comments = asArray(notes?.comments).filter((comment) => {
    const noteText = String(comment?.note || "").trim();
    const authorText = String(comment?.author || "").trim();
    return Boolean(noteText || authorText);
  });
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
