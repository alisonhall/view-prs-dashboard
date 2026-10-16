// Phase 7 (see REACT_MIGRATION_PLAN.md): extracted out of index.page.js
// (where they were plain inline functions, not in a helper module) so
// PrTableApp.jsx can import them directly instead of reading them off
// window - genuinely pure, no state/DOM dependency (matching
// pr-sortable-time.helpers.js's own precedent: bare exports, no
// createXHelpers() factory wrapper, since there's nothing to inject).
import { parseSortableTime } from "./pr-sortable-time.helpers.js";

export const normalizeRows = (rows) =>
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

export const sortRowsByDateFieldDesc = (rows, fieldName) =>
  rows.sort((a, b) => {
    const dateA = parseSortableTime(a?.data?.[fieldName]);
    const dateB = parseSortableTime(b?.data?.[fieldName]);
    if (dateA !== dateB) return dateB - dateA;
    return Number(b?.prNumber || 0) - Number(a?.prNumber || 0);
  });

export const sortRowsByPrNumberDesc = (rows) =>
  rows.sort((a, b) => {
    const prA = Number(a?.data?.number || a?.prNumber || 0);
    const prB = Number(b?.data?.number || b?.prNumber || 0);
    return prB - prA;
  });
