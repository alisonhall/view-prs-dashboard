// Phase 7, sub-phase 7.0 (see REACT_MIGRATION_PLAN.md): extracted out of
// index.page.js (where it was a plain inline function, not in a helper
// module) so React can import it directly instead of reading it off
// window - genuinely pure, no state/DOM dependency.
export const parseSortableTime = (value) => {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
};
