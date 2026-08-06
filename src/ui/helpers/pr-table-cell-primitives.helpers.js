(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsTableCellPrimitivesHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrTableCellPrimitivesHelpers = ({
    getTableColumnClass,
    documentRef,
  } = {}) => {
    const getTableColumnClassSafe =
      typeof getTableColumnClass === "function"
        ? getTableColumnClass
        : () => "";

    const getDocument = () =>
      documentRef || (typeof document !== "undefined" ? document : null);

    const createHeaderCell = (header, index, dateHeader) => {
      const doc = getDocument();
      if (!doc || typeof doc.createElement !== "function") {
        return null;
      }

      const th = doc.createElement("th");
      const columnClass = getTableColumnClassSafe(index);

      if (header && typeof header === "object" && header.compact) {
        th.className = [columnClass, "compact-hover-header"]
          .filter(Boolean)
          .join(" ");
        th.setAttribute("scope", "col");
        th.setAttribute("title", header.fullLabel);
        th.setAttribute("aria-label", header.fullLabel);

        const shortLabel = doc.createElement("span");
        shortLabel.className = "compact-header-abbrev";
        shortLabel.textContent = header.shortLabel;
        th.appendChild(shortLabel);

        const hoverLabel = doc.createElement("span");
        hoverLabel.className = "compact-header-hover";
        hoverLabel.textContent = header.fullLabel;
        th.appendChild(hoverLabel);

        return th;
      }

      th.className = columnClass;
      th.setAttribute("scope", "col");
      th.textContent = header === null ? dateHeader : header;
      return th;
    };

    const createTextCell = (value, className = "") => {
      const doc = getDocument();
      if (!doc || typeof doc.createElement !== "function") {
        return null;
      }

      const td = doc.createElement("td");
      td.className = className;
      td.textContent = value ?? "";
      return td;
    };

    return {
      createHeaderCell,
      createTextCell,
    };
  };

  return {
    createPrTableCellPrimitivesHelpers,
  };
});
