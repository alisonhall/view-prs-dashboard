(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsLabelsCellHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrLabelsCellHelpers = ({
    getLabelName,
    documentRef,
  } = {}) => {
    const getLabelNameSafe =
      typeof getLabelName === "function"
        ? getLabelName
        : (label) => String(label?.name || label || "").trim();

    const getDocument = () =>
      documentRef || (typeof document !== "undefined" ? document : null);

    const createLabelsCell = (labelsRaw) => {
      const doc = getDocument();
      if (!doc || typeof doc.createElement !== "function") {
        return null;
      }

      const td = doc.createElement("td");
      td.className = "labels-cell";

      const labels = (Array.isArray(labelsRaw) ? labelsRaw : [])
        .map((label) => getLabelNameSafe(label))
        .filter(Boolean);

      if (!labels.length) {
        td.textContent = "-";
        return td;
      }

      for (const label of labels) {
        const chip = doc.createElement("span");
        const hash = [...label].reduce((acc, char) => acc + char.charCodeAt(0), 0);
        chip.className = `label-chip label-chip-${hash % 5}`;
        chip.textContent = label;
        td.appendChild(chip);
      }

      return td;
    };

    return {
      createLabelsCell,
    };
  };

  return {
    createPrLabelsCellHelpers,
  };
});
