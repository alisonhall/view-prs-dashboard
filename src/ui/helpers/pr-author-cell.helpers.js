(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsAuthorCellHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  // A commit whose headline starts with "Merge" (merging a branch/PR into
  // another) - same definition pr-needs-attention.helpers.js's
  // isMergeCommitHeadline uses for "ignore merge-only commits", duplicated
  // here (rather than threaded through as a dependency) since it's a pure
  // one-liner with no state of its own.
  const isMergeCommitHeadline = (messageHeadline = "") =>
    /^Merge\b/i.test(String(messageHeadline || "").trim());

  const createPrAuthorCellHelpers = ({
    getPreferredActorKey,
    createActorIdentityElement,
    getManualNotesSummary,
    documentRef,
  } = {}) => {
    const getPreferredActorKeySafe =
      typeof getPreferredActorKey === "function"
        ? getPreferredActorKey
        : (login, name) => String(login || name || "").trim();
    const createActorIdentityElementSafe =
      typeof createActorIdentityElement === "function"
        ? createActorIdentityElement
        : () => null;
    const getManualNotesSummarySafe =
      typeof getManualNotesSummary === "function"
        ? getManualNotesSummary
        : () => ({ hasNotes: false, commentsCount: 0, hasOtherNotes: false });

    const getDocument = () =>
      documentRef || (typeof document !== "undefined" ? document : null);

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

    const createAuthorCell = (entry, row, actorsMapFromPayload = {}) => {
      const doc = getDocument();
      if (!doc || typeof doc.createElement !== "function") {
        return null;
      }

      const td = doc.createElement("td");
      td.className = "author-cell";

      const authors = collectPrAuthors(row);
      if (authors.length > 0) {
        const namesContainer = doc.createElement("div");
        namesContainer.className = "author-cell-names";
        authors.forEach(({ key, name, isPrimary }) => {
          const identityNode = createActorIdentityElementSafe({
            row,
            login: key,
            actorsMap: actorsMapFromPayload,
            fallbackName: name,
            tagName: "span",
            className: isPrimary ? "author-cell-name" : "author-cell-name author-cell-co-author",
          });
          if (identityNode) {
            namesContainer.appendChild(identityNode);
          }
        });
        td.appendChild(namesContainer);
      } else {
        const authorName = doc.createElement("div");
        authorName.className = "author-cell-name";
        authorName.textContent = "-";
        td.appendChild(authorName);
      }

      const notesSummary = getManualNotesSummarySafe(entry, row);
      const notesIndicator = doc.createElement("div");
      notesIndicator.className = [
        "author-notes-indicator",
        notesSummary.hasNotes
          ? "author-notes-indicator-has"
          : "author-notes-indicator-none",
      ]
        .filter(Boolean)
        .join(" ");
      notesIndicator.textContent = notesSummary.hasNotes ? "📝 Notes" : "";
      notesIndicator.title = notesSummary.hasNotes
        ? `${notesSummary.commentsCount} manual comment${notesSummary.commentsCount === 1 ? "" : "s"}${notesSummary.hasOtherNotes ? " + other notes" : ""}`
        : "No manual comments or notes";
      td.appendChild(notesIndicator);

      return td;
    };

    return {
      createAuthorCell,
      collectPrAuthors,
    };
  };

  return {
    createPrAuthorCellHelpers,
  };
});
