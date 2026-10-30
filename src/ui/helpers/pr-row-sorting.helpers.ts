import type { PrData, PrEntry } from "../types/pr-data.ts";
import { parseSortableTime } from "./pr-sortable-time.helpers.ts";

// In-place sorts for PrTableApp's section rows (they return the same
// array). Ties fall back to the higher PR number first.

export const normalizeRows = <E extends PrEntry>(rows: E[]): E[] =>
  rows.sort((a, b) => {
    const orderA = Number.isFinite(Number(a?.rowOrder))
      ? Number(a.rowOrder)
      : Number.MAX_SAFE_INTEGER;
    const orderB = Number.isFinite(Number(b?.rowOrder))
      ? Number(b.rowOrder)
      : Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return Number(b?.prNumber || 0) - Number(a?.prNumber || 0);
  });

export const sortRowsByDateFieldDesc = <E extends PrEntry>(rows: E[], fieldName: keyof PrData | string): E[] =>
  rows.sort((a, b) => {
    const dateA = parseSortableTime((a?.data as Record<string, unknown> | undefined)?.[fieldName]);
    const dateB = parseSortableTime((b?.data as Record<string, unknown> | undefined)?.[fieldName]);
    if (dateA !== dateB) return dateB - dateA;
    return Number(b?.prNumber || 0) - Number(a?.prNumber || 0);
  });

export const sortRowsByPrNumberDesc = <E extends PrEntry>(rows: E[]): E[] =>
  rows.sort((a, b) => {
    const prA = Number(a?.data?.number || a?.prNumber || 0);
    const prB = Number(b?.data?.number || b?.prNumber || 0);
    return prB - prA;
  });
