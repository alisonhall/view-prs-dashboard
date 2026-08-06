(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsAutoRenderNavigationHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrAutoRenderNavigationHelpers = ({
    normalizePrNumber,
    normalizeActorLogin,
    activateDataTab,
    collectNodesByTag,
    expandAncestorDetailsElements,
    ensureInsightsRowVisibleForElement,
    getFirstUnsavedElementForPrNumber,
    getOptionalElementById,
    getAuthorInsightsComposerDraft,
    isAuthorInsightsComposerDraftDirty,
    getAuthorInsightsEditDraftMap,
    getAuthorManualCommentsForLogin,
    isAuthorInsightsEditDraftDirty,
    authorInsightsState,
    renderAuthorInsights,
    documentRef,
    setTimeoutFn,
  } = {}) => {
    const normalizePrNumberSafe =
      typeof normalizePrNumber === "function"
        ? normalizePrNumber
        : (value) => {
            const normalized = String(value || "").trim();
            return /^\d+$/.test(normalized) ? normalized : "";
          };
    const normalizeActorLoginSafe =
      typeof normalizeActorLogin === "function"
        ? normalizeActorLogin
        : (value) => String(value || "").trim().toLowerCase();
    const activateDataTabSafe =
      typeof activateDataTab === "function" ? activateDataTab : () => {};
    const collectNodesByTagSafe =
      typeof collectNodesByTag === "function"
        ? collectNodesByTag
        : () => [];
    const expandAncestorDetailsElementsSafe =
      typeof expandAncestorDetailsElements === "function"
        ? expandAncestorDetailsElements
        : () => {};
    const ensureInsightsRowVisibleForElementSafe =
      typeof ensureInsightsRowVisibleForElement === "function"
        ? ensureInsightsRowVisibleForElement
        : () => {};
    const getFirstUnsavedElementForPrNumberSafe =
      typeof getFirstUnsavedElementForPrNumber === "function"
        ? getFirstUnsavedElementForPrNumber
        : () => null;
    const getOptionalElementByIdSafe =
      typeof getOptionalElementById === "function"
        ? getOptionalElementById
        : () => null;
    const getAuthorInsightsComposerDraftSafe =
      typeof getAuthorInsightsComposerDraft === "function"
        ? getAuthorInsightsComposerDraft
        : () => ({ note: "", sentiment: "neutral" });
    const isAuthorInsightsComposerDraftDirtySafe =
      typeof isAuthorInsightsComposerDraftDirty === "function"
        ? isAuthorInsightsComposerDraftDirty
        : () => false;
    const getAuthorInsightsEditDraftMapSafe =
      typeof getAuthorInsightsEditDraftMap === "function"
        ? getAuthorInsightsEditDraftMap
        : () => ({});
    const getAuthorManualCommentsForLoginSafe =
      typeof getAuthorManualCommentsForLogin === "function"
        ? getAuthorManualCommentsForLogin
        : () => [];
    const isAuthorInsightsEditDraftDirtySafe =
      typeof isAuthorInsightsEditDraftDirty === "function"
        ? isAuthorInsightsEditDraftDirty
        : () => false;
    const authorInsightsStateSafe =
      authorInsightsState && typeof authorInsightsState === "object"
        ? authorInsightsState
        : {
            selectedAuthorLogin: "",
            latestRows: null,
            latestActorsMap: null,
          };
    const renderAuthorInsightsSafe =
      typeof renderAuthorInsights === "function" ? renderAuthorInsights : () => {};
    const doc = documentRef || (typeof document !== "undefined" ? document : null);
    const schedule =
      typeof setTimeoutFn === "function"
        ? setTimeoutFn
        : (fn, ms) => setTimeout(fn, ms);

    const navigateToPrInTable = (prNumber, { focusUnsaved = false } = {}) => {
      const normalizedPrNumber = normalizePrNumberSafe(prNumber);
      if (!normalizedPrNumber) {
        return false;
      }

      activateDataTabSafe("pr-data");
      schedule(() => {
        const prLinks = collectNodesByTagSafe(doc?.body, "a")
          .filter((link) => link.className === "pr-link")
          .filter((link) => link.textContent.trim() === `#${normalizedPrNumber}`);

        if (prLinks.length === 0) {
          return;
        }

        const prLink = prLinks[0];
        const prRow = prLink.closest("tr");
        if (prRow) {
          const nextRow = prRow.nextElementSibling;
          if (nextRow && nextRow.querySelector(".insights-row-cell")) {
            nextRow.hidden = false;
            const toggleButton = prRow.querySelector(".row-insights-toggle");
            if (toggleButton) {
              toggleButton.textContent = "Hide insights";
              toggleButton.setAttribute("aria-expanded", "true");
            }
          }
        }

        const unsavedTarget = focusUnsaved
          ? getFirstUnsavedElementForPrNumberSafe(normalizedPrNumber)
          : null;
        const focusTarget = unsavedTarget || prLink;
        expandAncestorDetailsElementsSafe(focusTarget);
        ensureInsightsRowVisibleForElementSafe(focusTarget);

        if (typeof focusTarget.scrollIntoView === "function") {
          focusTarget.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        if (typeof focusTarget.focus === "function") {
          focusTarget.focus();
        }
      }, 30);

      return true;
    };

    const getFirstDirtyAuthorInsightsElement = (authorLogin) => {
      const normalizedAuthorLogin = normalizeActorLoginSafe(authorLogin);
      if (!normalizedAuthorLogin) {
        return null;
      }

      const host = getOptionalElementByIdSafe("author-insights");
      if (!host || typeof host.querySelector !== "function") {
        return null;
      }

      const composerDraft = getAuthorInsightsComposerDraftSafe(normalizedAuthorLogin);
      if (isAuthorInsightsComposerDraftDirtySafe(composerDraft)) {
        const composerTextarea = host.querySelector(
          `.author-insights-comment-textarea[data-author-login="${normalizedAuthorLogin}"][data-draft-kind="composer"]`,
        );
        if (composerTextarea && String(composerDraft.note || "").trim()) {
          return composerTextarea;
        }
        const composerSentiment = host.querySelector(
          `.author-insights-comment-sentiment[data-author-login="${normalizedAuthorLogin}"][data-draft-kind="composer"]`,
        );
        if (composerSentiment) {
          return composerSentiment;
        }
        if (composerTextarea) {
          return composerTextarea;
        }
      }

      const editDraftMap = getAuthorInsightsEditDraftMapSafe(normalizedAuthorLogin);
      for (const [commentId, draft] of Object.entries(editDraftMap)) {
        const savedComment = getAuthorManualCommentsForLoginSafe(
          normalizedAuthorLogin,
        ).find(
          (comment) =>
            String(comment?.id || "").trim() === String(commentId || "").trim(),
        );
        if (
          draft?.isEditing === true &&
          savedComment &&
          isAuthorInsightsEditDraftDirtySafe(savedComment, draft)
        ) {
          const commentKey = String(commentId || "").trim();
          const editTextarea = host.querySelector(
            `.author-insights-comment-textarea[data-author-login="${normalizedAuthorLogin}"][data-comment-id="${commentKey}"]`,
          );
          if (
            editTextarea &&
            String(draft.note || "") !== String(savedComment?.note || "")
          ) {
            return editTextarea;
          }
          const editSentiment = host.querySelector(
            `.author-insights-comment-sentiment[data-author-login="${normalizedAuthorLogin}"][data-comment-id="${commentKey}"]`,
          );
          if (editSentiment) {
            return editSentiment;
          }
          if (editTextarea) {
            return editTextarea;
          }
        }
      }

      return host.querySelector("#author-insights-select");
    };

    const navigateToAuthorInsights = (
      authorLogin,
      { focusUnsaved = false } = {},
    ) => {
      const normalizedAuthorLogin = normalizeActorLoginSafe(authorLogin);
      if (!normalizedAuthorLogin) {
        return false;
      }

      activateDataTabSafe("author-insights");
      authorInsightsStateSafe.selectedAuthorLogin = normalizedAuthorLogin;
      if (authorInsightsStateSafe.latestRows && authorInsightsStateSafe.latestActorsMap) {
        renderAuthorInsightsSafe(
          authorInsightsStateSafe.latestRows,
          authorInsightsStateSafe.latestActorsMap,
        );
      }

      schedule(() => {
        const focusTarget = focusUnsaved
          ? getFirstDirtyAuthorInsightsElement(normalizedAuthorLogin)
          : getOptionalElementByIdSafe("author-insights-select");
        if (!focusTarget) {
          return;
        }
        if (typeof focusTarget.scrollIntoView === "function") {
          focusTarget.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        if (typeof focusTarget.focus === "function") {
          focusTarget.focus();
        }
      }, 30);

      return true;
    };

    return {
      navigateToPrInTable,
      getFirstDirtyAuthorInsightsElement,
      navigateToAuthorInsights,
    };
  };

  return {
    createPrAutoRenderNavigationHelpers,
  };
});
