// Phase 7, sub-phase 7.4 (see REACT_MIGRATION_PLAN.md): extracted out of
// index.page.js (where these were plain inline functions, not in a helper
// module) so both index.page.js and FilterOptionsProvider.jsx can import
// the same label-name extraction/normalization logic directly instead of
// duplicating it - genuinely pure, no DOM/state dependency.
export const getLabelName = (label) => {
  if (typeof label === "string") {
    return String(label || "").trim();
  }
  if (label && typeof label === "object") {
    return String(label.name || "").trim();
  }
  return "";
};

export const extractRowLabelNames = (row = {}) =>
  (Array.isArray(row?.labels) ? row.labels : [])
    .map((label) => getLabelName(label))
    .filter(Boolean);

export const normalizeFilterToken = (value) =>
  String(value || "")
    .trim()
    .replace(/[‘’]/g, "'")
    .toLowerCase();
