import type { PrData } from "../types/pr-data.ts";

// The "Viewed files" text in PrInsightsRow: the data file's own summary
// when present, otherwise "<viewed>/<changed> viewed".
export interface PrViewedFilesSummaryDeps {
  toCount?: (value: unknown) => number;
}

const createPrViewedFilesSummaryHelpers = ({ toCount }: PrViewedFilesSummaryDeps = {}) => {
  const toCountSafe =
    typeof toCount === "function"
      ? toCount
      : (value: unknown) => {
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : 0;
        };

  const getViewedFilesSummary = (row: PrData | null | undefined): string =>
    String(
      row?.viewedFilesSummary ||
        `${toCountSafe(row?.viewedFilesCount)}/${toCountSafe(row?.changedFilesCount)} viewed`,
    );

  return {
    getViewedFilesSummary,
  };
};

export { createPrViewedFilesSummaryHelpers };
