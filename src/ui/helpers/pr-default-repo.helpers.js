// Phase 7 (see REACT_MIGRATION_PLAN.md): extracted out of index.page.js
// so PrJsonModal.jsx/AuthorInsightsPrLink.jsx can import it directly
// instead of reading it off window.DEFAULT_REPO.
//
// Deliberately empty - not a real repo any other user of this tool would
// have access to (see src/server/config/app-config.js's own
// defaultViewPrsRepo, which dropped the same hardcoded value for the same
// reason). Every consumer already treats a missing repo as "nothing to do
// yet" rather than crashing (see each call site's own guard).
export const DEFAULT_REPO = "";
