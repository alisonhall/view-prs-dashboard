// Phase 7 (see REACT_MIGRATION_PLAN.md): extracted out of index.page.js
// (where it was a plain inline function, not in any helper module) so
// every component that read it off window.asArray can import it directly
// instead - genuinely zero-dependency, matching pr-sortable-time.helpers.js's
// own precedent (bare export, no createXHelpers() wrapper).
export const asArray = (value) => (Array.isArray(value) ? value : []);
