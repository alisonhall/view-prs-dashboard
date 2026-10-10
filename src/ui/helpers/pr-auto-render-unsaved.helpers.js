// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsAutoRenderUnsavedHelpers fallback.
export const { createPrAutoRenderUnsavedHelpers } = (() => {
  const createPrAutoRenderUnsavedHelpers = ({
    getOptionalElementById,
    readElementAttribute,
    // Phase 7, sub-phase 7.5 (see REACT_MIGRATION_PLAN.md): PR Notes'
    // dirty-section tracking moved from a DOM data-attribute scan
    // (data-has-unsaved-notes) to NotesDirtyProvider.jsx's own React state,
    // read here via a dedicated window bridge
    // (pr-pending-multi-select-selections.helpers.js-style - a narrow,
    // single-purpose channel, not FilterStateProvider's generic one).
    // Optional and defaults to "nothing dirty" so every existing call site/
    // unit test keeps working unmodified before the provider has mounted.
    getDirtyNotesPrNumbers,
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

    const normalizePrNumber = (value) => {
      const normalized = String(value || "").trim();
      return /^\d+$/.test(normalized) ? normalized : "";
    };

    const getDirtyNotesPrNumbersSafe =
      typeof getDirtyNotesPrNumbers === "function" ? getDirtyNotesPrNumbers : () => [];

    const getDirtyTrackedFields = () => {
      const sectionsHost = getOptionalElementByIdSafe("pr-sections");
      if (!sectionsHost || typeof sectionsHost.querySelectorAll !== "function") {
        return [];
      }
      return Array.from(
        sectionsHost.querySelectorAll("[data-original-value]"),
      ).filter((element) => element.value !== element.dataset.originalValue);
    };

    const getUnsavedNotesPrNumbers = () => {
      const raw = getDirtyNotesPrNumbersSafe();
      if (!Array.isArray(raw)) return [];
      return raw.map(normalizePrNumber).filter(Boolean);
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

      getUnsavedNotesPrNumbers().forEach((prNumber) => {
        collected.add(prNumber);
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

      const sectionsHost = getOptionalElementByIdSafe("pr-sections");
      const notesSection =
        sectionsHost && typeof sectionsHost.querySelector === "function"
          ? sectionsHost.querySelector(
              `.pr-notes-section[data-pr-number="${normalizedPrNumber}"]`,
            )
          : null;
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
      getUnsavedNotesPrNumbers,
      normalizePrNumber,
      getBlockingPrNumbers,
      getFirstUnsavedElementForPrNumber,
    };
  };

  return {
    createPrAutoRenderUnsavedHelpers,
  };
})();
