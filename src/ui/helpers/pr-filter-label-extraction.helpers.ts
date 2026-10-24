import type { PrData, PrLabel } from "../types/pr-data.ts";

// Label-name extraction and filter-token normalization shared by
// FilterOptionsProvider (the label dropdown options) and row filtering.
export const getLabelName = (label: PrLabel | null | undefined): string => {
  if (typeof label === "string") {
    return String(label || "").trim();
  }
  if (label && typeof label === "object") {
    return String(label.name || "").trim();
  }
  return "";
};

export const extractRowLabelNames = (row: PrData | null | undefined = {}): string[] =>
  (Array.isArray(row?.labels) ? row.labels : [])
    .map((label) => getLabelName(label))
    .filter(Boolean);

export const normalizeFilterToken = (value: unknown): string =>
  String(value || "")
    .trim()
    .replace(/[‘’]/g, "'")
    .toLowerCase();
