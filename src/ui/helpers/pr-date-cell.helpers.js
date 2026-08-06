(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsDateCellHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrDateCellHelpers = ({
    formatIsoDatetime,
    getManualNotesFieldSummary,
    createAuthorFieldIndicator,
    documentRef,
  } = {}) => {
    const formatIsoDatetimeSafe =
      typeof formatIsoDatetime === "function"
        ? formatIsoDatetime
        : (value) => String(value || "-");
    const getManualNotesFieldSummarySafe =
      typeof getManualNotesFieldSummary === "function"
        ? getManualNotesFieldSummary
        : () => ({
            hasCustomComments: false,
            hasOtherNotes: false,
            hasDifficulty: false,
            difficultyLevelText: "",
            hasRallyStories: false,
            hasRallyLinks: false,
            hasAnalysisOfPr: false,
          });
    const createAuthorFieldIndicatorSafe =
      typeof createAuthorFieldIndicator === "function"
        ? createAuthorFieldIndicator
        : () => null;

    const getDocument = () =>
      documentRef || (typeof document !== "undefined" ? document : null);

    const createDateCell = (entry, row, rawDateValue) => {
      const doc = getDocument();
      if (!doc || typeof doc.createElement !== "function") {
        return null;
      }

      const td = doc.createElement("td");
      td.className = "date-cell date-cell-with-notes-indicators";

      const dateContent = doc.createElement("div");
      dateContent.className = "date-cell-content";
      dateContent.textContent = formatIsoDatetimeSafe(rawDateValue);
      td.appendChild(dateContent);

      const fieldSummary = getManualNotesFieldSummarySafe(entry, row);
      const fieldIndicators = doc.createElement("div");
      fieldIndicators.className = "date-notes-indicator-row";

      fieldIndicators.appendChild(
        createAuthorFieldIndicatorSafe({
          hasData: fieldSummary.hasCustomComments,
          title: "Custom comments",
        }),
      );
      fieldIndicators.appendChild(
        createAuthorFieldIndicatorSafe({
          hasData: fieldSummary.hasOtherNotes,
          title: "Other notes",
        }),
      );
      fieldIndicators.appendChild(
        createAuthorFieldIndicatorSafe({
          hasData: fieldSummary.hasDifficulty,
          title: fieldSummary.hasDifficulty
            ? `PR difficulty${fieldSummary.difficultyLevelText ? `: ${fieldSummary.difficultyLevelText}` : ""}`
            : "PR difficulty",
          text: fieldSummary.hasDifficulty ? fieldSummary.difficultyLevelText : "",
          extraClass: "author-notes-field-indicator-difficulty",
        }),
      );
      fieldIndicators.appendChild(
        createAuthorFieldIndicatorSafe({
          hasData: fieldSummary.hasRallyStories,
          title: "Rally stories",
        }),
      );
      fieldIndicators.appendChild(
        createAuthorFieldIndicatorSafe({
          hasData: fieldSummary.hasRallyLinks,
          title: "Rally links",
        }),
      );
      fieldIndicators.appendChild(
        createAuthorFieldIndicatorSafe({
          hasData: fieldSummary.hasAnalysisOfPr,
          title: "Analysis of PR",
        }),
      );

      td.appendChild(fieldIndicators);
      return td;
    };

    return {
      createDateCell,
    };
  };

  return {
    createPrDateCellHelpers,
  };
});
