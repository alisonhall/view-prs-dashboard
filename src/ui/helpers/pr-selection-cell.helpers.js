(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsSelectionCellHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrSelectionCellHelpers = ({
    getSelectedPrNumbers,
    updateSelectedPrNumbers,
    documentRef,
  } = {}) => {
    const getSelectedPrNumbersSafe =
      typeof getSelectedPrNumbers === "function" ? getSelectedPrNumbers : () => [];
    const updateSelectedPrNumbersSafe =
      typeof updateSelectedPrNumbers === "function"
        ? updateSelectedPrNumbers
        : () => {};
    const getDocument = () =>
      documentRef || (typeof document !== "undefined" ? document : null);

    const createSelectionCell = (row) => {
      const doc = getDocument();
      if (!doc || typeof doc.createElement !== "function") {
        return null;
      }

      const td = doc.createElement("td");
      td.className = "row-select-cell";

      const prNumber = String(row?.number || "").trim();
      const checkbox = doc.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "row-select-checkbox";
      checkbox.checked = getSelectedPrNumbersSafe().includes(prNumber);
      checkbox.setAttribute("data-pr-number", prNumber);
      checkbox.title = prNumber ? `Select PR #${prNumber}` : "Select PR";
      checkbox.onchange = () => {
        updateSelectedPrNumbersSafe(prNumber, checkbox.checked);
      };

      td.appendChild(checkbox);
      return td;
    };

    return {
      createSelectionCell,
    };
  };

  return {
    createPrSelectionCellHelpers,
  };
});
