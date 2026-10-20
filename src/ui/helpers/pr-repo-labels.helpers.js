// Cleanup pass (prompted by a direct question about why
// window.refreshAvailableRepoLabels stayed vanilla instead of being fully
// migrated, see REACT_MIGRATION_PLAN.md): extracted out of index.page.js
// so RepoLabelsProvider.jsx (components/) can import this pure resolution
// rule directly, instead of the vanilla refreshAvailableRepoLabels()
// function (now deleted, its real fetch logic moved into that Provider)
// computing it inline.
//
// Deliberately does NOT fall back to DEFAULT_REPO: that constant is only
// ever a placeholder/example value (see the "repo" field's `placeholder`
// in react-app.jsx) - it isn't guaranteed to be a repo this GitHub account
// can actually see, and eagerly querying `gh label list` against it on
// every page load produced a real 500 (repo not found) before the actual
// selected repo was even known yet. Pure so it's directly unit-testable
// with no DOM/fetch harness.
export const resolveRepoForLabelsFetch = ({ repoOverride, currentRepo, repoInputValue } = {}) =>
  String(repoOverride || currentRepo || repoInputValue || "").trim();
