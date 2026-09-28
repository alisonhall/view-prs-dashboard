// Phase 7, sub-phase 7.0 (see REACT_MIGRATION_PLAN.md): extracted out of
// index.page.js (where it was a plain inline function, not in a helper
// module) so React can import it directly instead of reading it off
// window - it's genuinely pure, no DOM/state dependency beyond the plain
// array-or-empty-array coercion every other helper in this codebase calls
// asArray.
const asArray = (value) => (Array.isArray(value) ? value : []);

export const countPendingThreadComments = (row) =>
  asArray(row?.reviewThreads).reduce(
    (total, thread) =>
      total +
      asArray(thread?.comments).filter(
        (comment) => String(comment?.state || "").toUpperCase() === "PENDING",
      ).length,
    0,
  );
