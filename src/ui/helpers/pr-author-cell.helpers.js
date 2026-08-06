(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsAuthorCellHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
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

    const createAuthorCell = (entry, row, actorsMapFromPayload = {}) => {
      const doc = getDocument();
      if (!doc || typeof doc.createElement !== "function") {
        return null;
      }

      const td = doc.createElement("td");
      td.className = "author-cell";

      const authorLogin = getPreferredActorKeySafe(row?.authorLogin, row?.author);
      if (authorLogin) {
        const identityNode = createActorIdentityElementSafe({
          row,
          login: authorLogin,
          actorsMap: actorsMapFromPayload,
          fallbackName: row?.author,
          tagName: "div",
          className: "author-cell-name",
        });
        if (identityNode) {
          td.appendChild(identityNode);
        }
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
    };
  };

  return {
    createPrAuthorCellHelpers,
  };
});
