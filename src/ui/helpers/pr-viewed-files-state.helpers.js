// Phase 7 (see REACT_MIGRATION_PLAN.md): extracted out of index.page.js
// (where it was a plain inline function, not in any helper module) so
// PrStatusCell.jsx can import it directly instead of reading it off
// window.getViewedFilesState - genuinely zero-dependency (toCount is
// itself a zero-dependency import, not viewer/payload state), matching
// pr-last-checked-indicator.helpers.js's own precedent (bare export, no
// createXHelpers() wrapper).
import { createPrFormattingHelpers } from "./pr-formatting.helpers.js";

const { toCount } = createPrFormattingHelpers();

export const getViewedFilesState = (row) => {
  const viewedFilesCount = toCount(row?.viewedFilesCount);
  const changedFilesCount = toCount(row?.changedFilesCount);

  return {
    viewedFilesCount,
    changedFilesCount,
    isComplete: viewedFilesCount === changedFilesCount,
    hasUnviewedFiles: viewedFilesCount < changedFilesCount,
  };
};
