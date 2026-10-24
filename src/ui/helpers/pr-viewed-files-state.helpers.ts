import type { PrData } from "../types/pr-data.ts";
import { createPrFormattingHelpers } from "./pr-formatting.helpers.ts";

// Viewed vs changed file counts for PrStatusCell's "viewed files" marker.
const { toCount } = createPrFormattingHelpers();

export interface ViewedFilesState {
  viewedFilesCount: number;
  changedFilesCount: number;
  isComplete: boolean;
  hasUnviewedFiles: boolean;
}

export const getViewedFilesState = (row: PrData | null | undefined): ViewedFilesState => {
  const viewedFilesCount = toCount(row?.viewedFilesCount);
  const changedFilesCount = toCount(row?.changedFilesCount);

  return {
    viewedFilesCount,
    changedFilesCount,
    isComplete: viewedFilesCount === changedFilesCount,
    hasUnviewedFiles: viewedFilesCount < changedFilesCount,
  };
};
