// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsAuthorCellHelpers fallback.
export const { createPrAuthorCellHelpers } = (() => {
  // A commit whose headline starts with "Merge" (merging a branch/PR into
  // another) - same definition pr-needs-attention.helpers.js's
  // isMergeCommitHeadline uses for "ignore merge-only commits", duplicated
  // here (rather than threaded through as a dependency) since it's a pure
  // one-liner with no state of its own.
  const isMergeCommitHeadline = (messageHeadline = "") =>
    /^Merge\b/i.test(String(messageHeadline || "").trim());

  const createPrAuthorCellHelpers = ({
    getPreferredActorKey,
  } = {}) => {
    const getPreferredActorKeySafe =
      typeof getPreferredActorKey === "function"
        ? getPreferredActorKey
        : (login, name) => String(login || name || "").trim();

    // Returns the official PR author (always first, marked isPrimary) plus
    // every distinct person with a non-merge commit on the branch, in the
    // order their commits appear, deduped by the same login/name key
    // ActorIdentity rendering uses everywhere else - so a commit author who
    // is also the PR author (the common case) only appears once.
    const collectPrAuthors = (row = {}) => {
      const authors = [];
      const seenKeys = new Set();

      const addAuthor = (loginValue, nameValue, isPrimary) => {
        const key = getPreferredActorKeySafe(loginValue, nameValue);
        if (!key || seenKeys.has(key)) {
          return;
        }
        seenKeys.add(key);
        authors.push({ key, name: String(nameValue || "").trim(), isPrimary });
      };

      addAuthor(row?.authorLogin, row?.author, true);

      (Array.isArray(row?.commits) ? row.commits : []).forEach((commit) => {
        if (isMergeCommitHeadline(commit?.messageHeadline)) {
          return;
        }
        (Array.isArray(commit?.authors) ? commit.authors : []).forEach((author) => {
          addAuthor(author?.login, author?.name, false);
        });
      });

      return authors;
    };

    return {
      collectPrAuthors,
    };
  };

  return {
    createPrAuthorCellHelpers,
  };
})();
