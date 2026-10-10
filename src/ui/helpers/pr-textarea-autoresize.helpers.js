// Phase 7 (see REACT_MIGRATION_PLAN.md): extracted out of index.page.js
// (where it was a plain inline function, not in any helper module) so
// NotesSection.jsx can import it directly instead of reading it off
// window.autoResizeTextarea - genuinely zero-dependency (a DOM element in,
// no return value), matching pr-row-sorting.helpers.js's own precedent
// (bare export, no createXHelpers() wrapper).
export const autoResizeTextarea = (el) => {
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
};
