// Phase 7 (see REACT_MIGRATION_PLAN.md): extracted out of index.page.js
// (where it was a plain inline function, not in any helper module) so
// PrJsonModal.jsx can import it directly instead of reading it off
// window.getPerPrUserStateFromPayload - genuinely zero-dependency (plain
// payload/entry/prNumber/repo arguments, no DOM/DI), matching
// pr-row-sorting.helpers.js's own precedent (bare export, no
// createXHelpers() wrapper). index.page.js's own internal consumer
// (prExportHelperFactory.createPrExportHelpers's DI param) now imports
// this same function instead of defining it inline.
export const getPerPrUserStateFromPayload = (payload, entry, prNumber, repo) => {
  const byPrNumber = payload?.byPrNumber || {};
  const payloadEntry = byPrNumber?.[prNumber];
  const notes =
    payloadEntry?.notes ||
    entry?.notes ||
    null;

  const readRepoPrValue = (repoMap) => {
    if (!repo || !repoMap || typeof repoMap !== "object") return null;
    const perRepo = repoMap[repo];
    if (!perRepo || typeof perRepo !== "object") return null;
    const value = perRepo[prNumber];
    return value === undefined ? null : value;
  };

  return {
    notesByPrNumber: notes,
    ackByRepo: readRepoPrValue(payload?.ackByRepo),
    reverifyByRepo: readRepoPrValue(payload?.reverifyByRepo),
    inReviewByRepo: readRepoPrValue(payload?.inReviewByRepo),
  };
};
