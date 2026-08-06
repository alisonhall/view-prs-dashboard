(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsAutoRenderUnsavedHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrAutoRenderUnsavedHelpers = ({
    getOptionalElementById,
    readElementAttribute,
  } = {}) => {
    const getOptionalElementByIdSafe =
      typeof getOptionalElementById === "function"
        ? getOptionalElementById
        : () => null;
    const readElementAttributeSafe =
      typeof readElementAttribute === "function"
        ? readElementAttribute
        : (element, attributeName) =>
            element && typeof element.getAttribute === "function"
              ? String(element.getAttribute(attributeName) || "").trim()
              : "";

    const getDirtyTrackedFields = () => {
      const sectionsHost = getOptionalElementByIdSafe("pr-sections");
      if (!sectionsHost || typeof sectionsHost.querySelectorAll !== "function") {
        return [];
      }
      return Array.from(
        sectionsHost.querySelectorAll("[data-original-value]"),
      ).filter((element) => element.value !== element.dataset.originalValue);
    };

    const getUnsavedNotesSections = () => {
      const sectionsHost = getOptionalElementByIdSafe("pr-sections");
      if (!sectionsHost || typeof sectionsHost.querySelectorAll !== "function") {
        return [];
      }
      return Array.from(sectionsHost.querySelectorAll(".pr-notes-section")).filter(
        (section) => String(section?.dataset?.hasUnsavedNotes || "") === "true",
      );
    };

    const normalizePrNumber = (value) => {
      const normalized = String(value || "").trim();
      return /^\d+$/.test(normalized) ? normalized : "";
    };

    const getBlockingPrNumberForElement = (element) => {
      const fromSelf = normalizePrNumber(
        readElementAttributeSafe(element, "data-pr-number"),
      );
      if (fromSelf) {
        return fromSelf;
      }

      if (typeof element?.closest === "function") {
        const notesSection = element.closest(".pr-notes-section");
        const notesPr = normalizePrNumber(
          readElementAttributeSafe(notesSection, "data-pr-number"),
        );
        if (notesPr) {
          return notesPr;
        }

        const insightsContent = element.closest(".row-insights-content");
        const insightsPr = normalizePrNumber(
          readElementAttributeSafe(insightsContent, "data-pr-number"),
        );
        if (insightsPr) {
          return insightsPr;
        }

        const prCell = element.closest("td.pr-number-cell");
        const prCellNumber = normalizePrNumber(
          readElementAttributeSafe(prCell, "data-pr-number"),
        );
        if (prCellNumber) {
          return prCellNumber;
        }
      }

      return "";
    };

    const getBlockingPrNumbers = () => {
      const collected = new Set();

      getDirtyTrackedFields().forEach((element) => {
        const prNumber = getBlockingPrNumberForElement(element);
        if (prNumber) {
          collected.add(prNumber);
        }
      });

      getUnsavedNotesSections().forEach((section) => {
        const prNumber = getBlockingPrNumberForElement(section);
        if (prNumber) {
          collected.add(prNumber);
        }
      });

      return Array.from(collected).sort((a, b) => Number(a) - Number(b));
    };

    const getFirstUnsavedElementForPrNumber = (prNumber) => {
      const normalizedPrNumber = normalizePrNumber(prNumber);
      if (!normalizedPrNumber) {
        return null;
      }

      const dirtyTrackedField = getDirtyTrackedFields().find(
        (element) => getBlockingPrNumberForElement(element) === normalizedPrNumber,
      );
      if (dirtyTrackedField) {
        return dirtyTrackedField;
      }

      const notesSection = getUnsavedNotesSections().find(
        (section) => getBlockingPrNumberForElement(section) === normalizedPrNumber,
      );
      if (!notesSection) {
        return null;
      }

      if (typeof notesSection.querySelector === "function") {
        const saveButton = notesSection.querySelector(
          ".pr-notes-save:not([disabled])",
        );
        if (saveButton) {
          return saveButton;
        }
        const preferredField = notesSection.querySelector(
          "textarea, input, select, button",
        );
        if (preferredField) {
          return preferredField;
        }
      }

      return notesSection;
    };

    return {
      getDirtyTrackedFields,
      getUnsavedNotesSections,
      normalizePrNumber,
      getBlockingPrNumberForElement,
      getBlockingPrNumbers,
      getFirstUnsavedElementForPrNumber,
    };
  };

  return {
    createPrAutoRenderUnsavedHelpers,
  };
});
