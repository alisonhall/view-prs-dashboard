(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsRowToggleControlsHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrRowToggleControlsHelpers = ({
    isInReviewEnabled,
    isFlaggedEnabled,
    toggleInReviewForRow,
    toggleFlaggedForRow,
    documentRef,
  } = {}) => {
    const isInReviewEnabledSafe =
      typeof isInReviewEnabled === "function" ? isInReviewEnabled : () => false;
    const isFlaggedEnabledSafe =
      typeof isFlaggedEnabled === "function" ? isFlaggedEnabled : () => false;
    const toggleInReviewForRowSafe =
      typeof toggleInReviewForRow === "function"
        ? toggleInReviewForRow
        : async () => {};
    const toggleFlaggedForRowSafe =
      typeof toggleFlaggedForRow === "function" ? toggleFlaggedForRow : async () => {};

    const getDocument = () =>
      documentRef || (typeof document !== "undefined" ? document : null);

    const createInReviewControl = (entry, row) => {
      const doc = getDocument();
      if (!doc || typeof doc.createElement !== "function") {
        return null;
      }

      const wrapper = doc.createElement("label");
      wrapper.className = "in-review-control";
      const checkbox = doc.createElement("input");
      const label = doc.createElement("span");

      checkbox.type = "checkbox";
      checkbox.className = "in-review-toggle";
      checkbox.checked = isInReviewEnabledSafe(row);
      checkbox.setAttribute(
        "aria-label",
        `In Review for PR #${String(row?.number || entry?.prNumber || "").trim()}`,
      );
      checkbox.title = checkbox.checked
        ? "In review is ON for this PR"
        : "In review is OFF for this PR";
      label.className = "in-review-label";
      label.textContent = "In Review";

      checkbox.onchange = () => {
        const nextValue = checkbox.checked;
        checkbox.title = nextValue
          ? "In review is ON for this PR"
          : "In review is OFF for this PR";
        void toggleInReviewForRowSafe(entry, row, nextValue, checkbox);
      };

      wrapper.appendChild(checkbox);
      wrapper.appendChild(label);
      return wrapper;
    };

    const createFlaggedControl = (entry, row) => {
      const doc = getDocument();
      if (!doc || typeof doc.createElement !== "function") {
        return null;
      }

      const wrapper = doc.createElement("label");
      wrapper.className = "in-review-control flagged-control";
      const checkbox = doc.createElement("input");
      const label = doc.createElement("span");

      checkbox.type = "checkbox";
      checkbox.className = "in-review-toggle flagged-toggle";
      checkbox.checked = isFlaggedEnabledSafe(entry, row);
      checkbox.setAttribute(
        "aria-label",
        `Flagged for PR #${String(row?.number || entry?.prNumber || "").trim()}`,
      );
      checkbox.title = checkbox.checked
        ? "Flagged is ON for this PR"
        : "Flagged is OFF for this PR";
      label.className = "in-review-label flagged-label";
      label.textContent = "Flagged";

      checkbox.onchange = () => {
        const nextValue = checkbox.checked;
        checkbox.title = nextValue
          ? "Flagged is ON for this PR"
          : "Flagged is OFF for this PR";
        void toggleFlaggedForRowSafe(entry, row, nextValue, checkbox);
      };

      wrapper.appendChild(checkbox);
      wrapper.appendChild(label);
      return wrapper;
    };

    return {
      createInReviewControl,
      createFlaggedControl,
    };
  };

  return {
    createPrRowToggleControlsHelpers,
  };
});
