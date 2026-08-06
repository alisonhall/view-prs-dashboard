/**
 * PR Author Insights Component (Refactored)
 * 
 * Provides author-centric insights including manual comments, PR-linked sentiment,
 * and created PRs summary. Now uses focused helper modules for reduced coupling.
 * 
 * Dependency Contract (Narrowed from 33 to 11):
 * - prLinkHelpers: PR link and navigation helpers
 * - displayHelpers: Display/formatting helpers
 * - dataHelpers: API/data loading helpers
 * - draftHelpers: Draft state management helpers
 * - authorInsightsState: Component state object
 * - postJson: API POST helper
 * - recomputeDirtyPrSectionsFields: Side effect for dirty field tracking
 * - DEFAULT_REPO: Default repository name
 * - DEFAULT_AUTHOR_INSIGHTS_SENTIMENT: Default sentiment value
 * - fetchFn: Fetch function (optional, defaults to global fetch)
 * - documentRef: Document reference (optional, defaults to global document)
 */

(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsAuthorInsightsComponent = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrAuthorInsightsComponent = ({
    // Helper modules (focused contracts)
    prLinkHelpers,
    displayHelpers,
    dataHelpers,
    draftHelpers,
    // State and API
    authorInsightsState,
    postJson,
    // Side effects
    recomputeDirtyPrSectionsFields,
    // Configuration
    DEFAULT_AUTHOR_INSIGHTS_SENTIMENT = "neutral",
    // Optional overrides
    documentRef = typeof document !== "undefined" ? document : null,
  } = {}) => {
    // Validate required dependencies
    if (!prLinkHelpers || !displayHelpers || !dataHelpers || !draftHelpers) {
      throw new Error(
        "Author Insights Component requires prLinkHelpers, displayHelpers, dataHelpers, and draftHelpers",
      );
    }
    if (!authorInsightsState) {
      throw new Error("Author Insights Component requires authorInsightsState");
    }

    // Extract helpers for readability
    const { createAuthorInsightsPrLink } = prLinkHelpers;
    const {
      buildAuthorInsightsEntries,
      noteAuthorMatchesSelection,
      getAuthorInsightsSentimentLabel,
      getAuthorInsightsSentimentBadgeClassName,
      appendAuthorInsightsMetaDetail,
      appendAuthorInsightsBadge,
      sortAuthorInsightsManualCommentsDesc,
      sortAuthorInsightsNoteMatchesDesc,
      createAuthorInsightsPrDataMeta,
      sortAuthorInsightsCreatedPrsDesc,
      getAuthorInsightsNoteDisplayTimestamp,
    } = displayHelpers;
    const {
      AUTHOR_COMMENT_SENTIMENT_OPTIONS,
      getAuthorManualCommentsForLogin,
      loadAuthorManualComments,
      saveAuthorManualComment,
      updateAuthorManualComment,
    } = dataHelpers;
    const {
      getAuthorInsightsComposerDraft,
      updateAuthorInsightsComposerDraft,
      resetAuthorInsightsComposerDraft,
      updateAuthorInsightsEditDraft,
      resetAuthorInsightsEditDraft,
      getAuthorInsightsEditDraft,
    } = draftHelpers;

    /**
     * Main render function for author insights.
     * 
     * @param {Array} rows - PR row entries
     * @param {Object} actorsMap - Actor ID to name mapping
     */
    const renderAuthorInsights = (rows, actorsMap = {}) => {
      const host = documentRef?.getElementById("author-insights");
      if (!host) return;

      authorInsightsState.latestRows = rows;
      authorInsightsState.latestActorsMap = actorsMap;

      host.innerHTML = "";

      // Empty rows guard
      if (!rows.length) {
        const empty = documentRef.createElement("p");
        empty.className = "stats-empty";
        empty.textContent = "No local rows available for author insights.";
        host.appendChild(empty);
        recomputeDirtyPrSectionsFields?.();
        return;
      }

      // Build author options
      const authorOptions = buildAuthorInsightsEntries(rows, actorsMap);
      if (!authorOptions.length) {
        const empty = documentRef.createElement("p");
        empty.className = "stats-empty";
        empty.textContent = "No authors found in the current local data scope.";
        host.appendChild(empty);
        recomputeDirtyPrSectionsFields?.();
        return;
      }

      // Ensure selected author is valid
      if (
        !authorOptions.some(
          (author) => author.login === authorInsightsState.selectedAuthorLogin,
        )
      ) {
        authorInsightsState.selectedAuthorLogin = authorOptions[0].login;
      }

      // Render author selector
      renderAuthorSelector(host, authorOptions, rows, actorsMap);

      const selectedAuthor =
        authorOptions.find(
          (author) => author.login === authorInsightsState.selectedAuthorLogin,
        ) || authorOptions[0];

      // Render sections
      renderSelectedHeader(host, selectedAuthor);
      renderManualCommentsSection(host, selectedAuthor, rows, actorsMap);
      renderPrLinkedNotesSection(host, selectedAuthor, rows, actorsMap);
      renderCreatedPrsSection(host, selectedAuthor, rows);

      recomputeDirtyPrSectionsFields?.();
    };

    /**
     * Renders the author selector dropdown.
     */
    const renderAuthorSelector = (host, authorOptions, rows, actorsMap) => {
      const controls = documentRef.createElement("div");
      controls.className = "author-insights-controls";
      const label = documentRef.createElement("label");
      label.className = "author-insights-label";
      label.textContent = "Author";
      const select = documentRef.createElement("select");
      select.id = "author-insights-select";
      select.className = "author-insights-select";
      authorOptions.forEach((author) => {
        const option = documentRef.createElement("option");
        option.value = author.login;
        option.textContent = author.name || author.login;
        option.selected = author.login === authorInsightsState.selectedAuthorLogin;
        select.appendChild(option);
      });
      select.onchange = () => {
        authorInsightsState.selectedAuthorLogin = select.value;
        renderAuthorInsights(rows, actorsMap);
      };
      label.appendChild(select);
      controls.appendChild(label);
      host.appendChild(controls);
    };

    /**
     * Renders the selected author header.
     */
    const renderSelectedHeader = (host, selectedAuthor) => {
      const selectedHeader = documentRef.createElement("div");
      selectedHeader.className = "author-insights-selected";
      selectedHeader.textContent = `Showing insights for ${selectedAuthor.name}`;
      host.appendChild(selectedHeader);
    };

    /**
     * Renders the manual comments section with composer and comment list.
     */
    const renderManualCommentsSection = (host, selectedAuthor, rows, actorsMap) => {
      const manualCommentsSection = documentRef.createElement("section");
      manualCommentsSection.className = "author-insights-section";
      const manualCommentsTitle = documentRef.createElement("h3");
      manualCommentsTitle.textContent = "Manual author comments";
      manualCommentsSection.appendChild(manualCommentsTitle);

      const composerDraft = getAuthorInsightsComposerDraft(selectedAuthor.login);

      // Load comments
      void loadAuthorManualComments(selectedAuthor.login, authorInsightsState, () => {
        if (authorInsightsState.latestRows && authorInsightsState.latestActorsMap) {
          renderAuthorInsights(
            authorInsightsState.latestRows,
            authorInsightsState.latestActorsMap,
          );
        }
      });

      // Render composer form
      const { commentForm } = renderComposerForm(
        selectedAuthor,
        composerDraft,
        rows,
        actorsMap,
      );
      manualCommentsSection.appendChild(commentForm);

      // Render comment list
      const commentList = renderManualCommentList(
        selectedAuthor,
        rows,
        actorsMap,
      );
      manualCommentsSection.appendChild(commentList);

      host.appendChild(manualCommentsSection);
    };

    /**
     * Renders the composer form for creating new manual comments.
     */
    const renderComposerForm = (selectedAuthor, composerDraft, rows, actorsMap) => {
      const commentForm = documentRef.createElement("div");
      commentForm.className = "author-insights-comment-form";

      const commentInput = documentRef.createElement("textarea");
      commentInput.className = "author-insights-comment-textarea";
      commentInput.rows = 3;
      commentInput.placeholder = "Add a manual comment about this author...";
      commentInput.value = String(composerDraft.note || "");
      commentInput.setAttribute("data-author-login", selectedAuthor.login);
      commentInput.setAttribute("data-draft-kind", "composer");

      const formControls = documentRef.createElement("div");
      formControls.className = "author-insights-comment-controls";

      const sentimentSelect = documentRef.createElement("select");
      sentimentSelect.className = "author-insights-comment-sentiment";
      sentimentSelect.setAttribute("data-author-login", selectedAuthor.login);
      sentimentSelect.setAttribute("data-draft-kind", "composer");
      AUTHOR_COMMENT_SENTIMENT_OPTIONS.forEach(({ value, label }) => {
        const option = documentRef.createElement("option");
        option.value = value;
        option.textContent = label;
        option.selected = composerDraft.sentiment === value;
        sentimentSelect.appendChild(option);
      });
      sentimentSelect.value = composerDraft.sentiment || DEFAULT_AUTHOR_INSIGHTS_SENTIMENT;

      // Event listeners for draft updates
      commentInput.addEventListener("input", () => {
        updateAuthorInsightsComposerDraft(selectedAuthor.login, {
          note: commentInput.value,
          sentiment: sentimentSelect.value,
        });
        recomputeDirtyPrSectionsFields?.();
      });

      sentimentSelect.addEventListener("change", () => {
        updateAuthorInsightsComposerDraft(selectedAuthor.login, {
          note: commentInput.value,
          sentiment: sentimentSelect.value,
        });
        recomputeDirtyPrSectionsFields?.();
      });

      const saveCommentBtn = documentRef.createElement("button");
      saveCommentBtn.type = "button";
      saveCommentBtn.className = "author-insights-comment-save";
      saveCommentBtn.textContent = "Save comment";

      const saveStatus = documentRef.createElement("span");
      saveStatus.className = "author-insights-comment-status";

      // Save button handler
      saveCommentBtn.onclick = async () => {
        const note = String(commentInput.value || "");
        if (!note.trim()) {
          saveStatus.textContent = "Comment note is required";
          return;
        }

        saveCommentBtn.disabled = true;
        saveStatus.textContent = "Saving...";
        try {
          const { response, result } = await saveAuthorManualComment({
            authorLogin: selectedAuthor.login,
            note,
            sentiment: sentimentSelect.value,
            postJson,
          });
          if (!response.ok || result.ok === false) {
            saveStatus.textContent = result.error || "Save failed";
            return;
          }

          authorInsightsState.manualCommentsByAuthorLogin[selectedAuthor.login] =
            Array.isArray(result.comments) ? result.comments : [];
          resetAuthorInsightsComposerDraft(selectedAuthor.login);
          commentInput.value = "";
          sentimentSelect.value = DEFAULT_AUTHOR_INSIGHTS_SENTIMENT;
          saveStatus.textContent = "Saved.";
          setTimeout(() => {
            saveStatus.textContent = "";
          }, 2500);
          recomputeDirtyPrSectionsFields?.();
          renderAuthorInsights(rows, actorsMap);
        } catch (_error) {
          saveStatus.textContent = "Save failed";
        } finally {
          saveCommentBtn.disabled = false;
        }
      };

      commentForm.appendChild(commentInput);
      formControls.appendChild(sentimentSelect);
      formControls.appendChild(saveCommentBtn);
      formControls.appendChild(saveStatus);
      commentForm.appendChild(formControls);

      return { commentForm, saveStatus };
    };

    /**
     * Renders the list of manual comments for the selected author.
     */
    const renderManualCommentList = (selectedAuthor, rows, actorsMap) => {
      const commentList = documentRef.createElement("div");
      commentList.className = "author-insights-list";

      const isLoadingComments =
        authorInsightsState.manualCommentsLoadingByAuthorLogin[selectedAuthor.login] ===
        true;
      const commentsError =
        authorInsightsState.manualCommentsErrorByAuthorLogin[selectedAuthor.login] || "";
      const savedAuthorComments = sortAuthorInsightsManualCommentsDesc(
        getAuthorManualCommentsForLogin(selectedAuthor.login, authorInsightsState),
      );

      if (isLoadingComments) {
        const loading = documentRef.createElement("p");
        loading.className = "stats-empty";
        loading.textContent = "Loading author comments...";
        commentList.appendChild(loading);
      } else if (commentsError) {
        const error = documentRef.createElement("p");
        error.className = "stats-empty";
        error.textContent = commentsError;
        commentList.appendChild(error);
      } else if (!savedAuthorComments.length) {
        const empty = documentRef.createElement("p");
        empty.className = "stats-empty";
        empty.textContent = "No manual comments saved for this author.";
        commentList.appendChild(empty);
      } else {
        savedAuthorComments.forEach((comment) => {
          const item = renderManualCommentItem(
            comment,
            selectedAuthor,
            rows,
            actorsMap,
          );
          commentList.appendChild(item);
        });
      }

      return commentList;
    };

    /**
     * Renders a single manual comment item with edit functionality.
     */
    const renderManualCommentItem = (comment, selectedAuthor, rows, actorsMap) => {
      const item = documentRef.createElement("div");
      item.className = "author-insights-item";

      const meta = documentRef.createElement("div");
      meta.className = "author-insights-meta";
      appendAuthorInsightsBadge(
        meta,
        `Sentiment: ${getAuthorInsightsSentimentLabel(comment?.sentiment)}`,
        getAuthorInsightsSentimentBadgeClassName(comment?.sentiment),
      );
      appendAuthorInsightsMetaDetail(
        meta,
        `Added: ${displayHelpers.formatIsoDatetime(comment?.createdAt || "-")}`,
      );
      item.appendChild(meta);

      const body = documentRef.createElement("div");
      body.className = "author-insights-body";
      body.textContent =
        String(comment?.note || "").trim() || "(No manual comment text)";
      item.appendChild(body);

      const actions = documentRef.createElement("div");
      actions.className = "author-insights-comment-actions";
      const editBtn = documentRef.createElement("button");
      editBtn.type = "button";
      editBtn.className = "author-insights-comment-edit";
      editBtn.textContent = "Edit";
      actions.appendChild(editBtn);
      item.appendChild(actions);

      // Edit form logic
      const openEditForm = () => {
        if (item.dataset.editing === "true") return;

        const draft = updateAuthorInsightsEditDraft(
          selectedAuthor.login,
          String(comment?.id || ""),
          { isEditing: true },
        );

        item.dataset.editing = "true";
        body.hidden = true;
        actions.innerHTML = "";

        const editForm = renderEditForm(
          comment,
          selectedAuthor,
          draft,
          rows,
          actorsMap,
          item,
          body,
          actions,
          editBtn,
        );
        item.appendChild(editForm);
      };

      editBtn.onclick = () => {
        openEditForm();
      };

      if (
        getAuthorInsightsEditDraft(selectedAuthor.login, comment).isEditing === true
      ) {
        openEditForm();
      }

      return item;
    };

    /**
     * Renders the edit form for a manual comment.
     */
    const renderEditForm = (
      comment,
      selectedAuthor,
      draft,
      rows,
      actorsMap,
      item,
      body,
      actions,
      editBtn,
    ) => {
      const editForm = documentRef.createElement("div");
      editForm.className = "author-insights-comment-form";
      editForm.setAttribute("data-author-login", selectedAuthor.login);
      editForm.setAttribute("data-comment-id", String(comment?.id || ""));

      const editTextarea = documentRef.createElement("textarea");
      editTextarea.className = "author-insights-comment-textarea";
      editTextarea.rows = 3;
      editTextarea.value = String(draft?.note || "");
      editTextarea.setAttribute("data-author-login", selectedAuthor.login);
      editTextarea.setAttribute("data-comment-id", String(comment?.id || ""));

      const editControls = documentRef.createElement("div");
      editControls.className = "author-insights-comment-controls";

      const editSentiment = documentRef.createElement("select");
      editSentiment.className = "author-insights-comment-sentiment";
      editSentiment.setAttribute("data-author-login", selectedAuthor.login);
      editSentiment.setAttribute("data-comment-id", String(comment?.id || ""));
      AUTHOR_COMMENT_SENTIMENT_OPTIONS.forEach(({ value, label }) => {
        const option = documentRef.createElement("option");
        option.value = value;
        option.textContent = label;
        option.selected = draft?.sentiment === value;
        editSentiment.appendChild(option);
      });
      editSentiment.value = draft?.sentiment || DEFAULT_AUTHOR_INSIGHTS_SENTIMENT;

      // Event listeners
      editTextarea.addEventListener("input", () => {
        updateAuthorInsightsEditDraft(selectedAuthor.login, String(comment?.id || ""), {
          note: editTextarea.value,
          sentiment: editSentiment.value,
          isEditing: true,
        });
        recomputeDirtyPrSectionsFields?.();
      });

      editSentiment.addEventListener("change", () => {
        updateAuthorInsightsEditDraft(selectedAuthor.login, String(comment?.id || ""), {
          note: editTextarea.value,
          sentiment: editSentiment.value,
          isEditing: true,
        });
        recomputeDirtyPrSectionsFields?.();
      });

      const saveEditBtn = documentRef.createElement("button");
      saveEditBtn.type = "button";
      saveEditBtn.className = "author-insights-comment-save";
      saveEditBtn.textContent = "Save changes";

      const cancelEditBtn = documentRef.createElement("button");
      cancelEditBtn.type = "button";
      cancelEditBtn.className = "author-insights-comment-cancel";
      cancelEditBtn.textContent = "Cancel";

      const editStatus = documentRef.createElement("span");
      editStatus.className = "author-insights-comment-status";

      const restoreReadOnlyView = () => {
        item.dataset.editing = "false";
        if (editForm.parentNode) {
          editForm.parentNode.removeChild(editForm);
        }
        body.hidden = false;
        actions.innerHTML = "";
        actions.appendChild(editBtn);
      };

      cancelEditBtn.onclick = () => {
        resetAuthorInsightsEditDraft(selectedAuthor.login, String(comment?.id || ""));
        recomputeDirtyPrSectionsFields?.();
        restoreReadOnlyView();
      };

      saveEditBtn.onclick = async () => {
        saveEditBtn.disabled = true;
        editStatus.textContent = "Saving...";
        try {
          const { response, result } = await updateAuthorManualComment({
            authorLogin: selectedAuthor.login,
            id: String(comment?.id || ""),
            note: editTextarea.value,
            sentiment: editSentiment.value,
          });
          if (!response.ok || result.ok === false) {
            editStatus.textContent = result.error || "Failed to save comment edits";
            return;
          }

          resetAuthorInsightsEditDraft(selectedAuthor.login, String(comment?.id || ""));
          authorInsightsState.manualCommentsByAuthorLogin[selectedAuthor.login] =
            Array.isArray(result.comments) ? result.comments : [];
          recomputeDirtyPrSectionsFields?.();
          renderAuthorInsights(rows, actorsMap);
        } catch (_error) {
          editStatus.textContent = "Failed to save comment edits";
        } finally {
          saveEditBtn.disabled = false;
        }
      };

      editForm.appendChild(editTextarea);
      editControls.appendChild(editSentiment);
      editControls.appendChild(saveEditBtn);
      editControls.appendChild(cancelEditBtn);
      editControls.appendChild(editStatus);
      editForm.appendChild(editControls);

      return editForm;
    };

    /**
     * Renders the PR-linked notes section.
     */
    const renderPrLinkedNotesSection = (host, selectedAuthor, rows, actorsMap) => {
      const noteMatches = rows
        .flatMap((entry) =>
          displayHelpers.asArray(entry?.notes?.comments)
            .filter((comment) =>
              noteAuthorMatchesSelection(comment?.author, selectedAuthor, actorsMap),
            )
            .map((comment) => ({ entry, comment })),
        );
      const sortedNoteMatches = sortAuthorInsightsNoteMatchesDesc(noteMatches);

      const notesSection = documentRef.createElement("section");
      notesSection.className = "author-insights-section";
      const notesTitle = documentRef.createElement("h3");
      notesTitle.textContent = "PR-linked custom comments and sentiment";
      notesSection.appendChild(notesTitle);

      if (!sortedNoteMatches.length) {
        const empty = documentRef.createElement("p");
        empty.className = "stats-empty";
        empty.textContent = "No saved custom comments or sentiment for this author.";
        notesSection.appendChild(empty);
      } else {
        const notesList = documentRef.createElement("div");
        notesList.className = "author-insights-list";
        sortedNoteMatches.forEach(({ entry, comment }) => {
          const item = documentRef.createElement("div");
          item.className = "author-insights-item";

          const prLink = createAuthorInsightsPrLink(entry);
          item.appendChild(prLink);

          item.appendChild(createAuthorInsightsPrDataMeta(entry));

          const tone = documentRef.createElement("div");
          tone.className = "author-insights-meta";
          const noteAuthorLabel = displayHelpers.resolveActorDisplayName(
            comment?.author,
            actorsMap,
            comment?.author,
          );
          appendAuthorInsightsMetaDetail(tone, `Author: ${noteAuthorLabel}`);
          appendAuthorInsightsMetaDetail(
            tone,
            `Added: ${getAuthorInsightsNoteDisplayTimestamp(comment, entry)}`,
          );
          appendAuthorInsightsBadge(
            tone,
            `Sentiment: ${getAuthorInsightsSentimentLabel(comment?.tone)}`,
            getAuthorInsightsSentimentBadgeClassName(comment?.tone),
          );
          item.appendChild(tone);

          const noteBody = documentRef.createElement("div");
          noteBody.className = "author-insights-body";
          noteBody.textContent =
            String(comment?.note || "").trim() || "(No custom comment text)";
          item.appendChild(noteBody);

          notesList.appendChild(item);
        });
        notesSection.appendChild(notesList);
      }
      host.appendChild(notesSection);
    };

    /**
     * Renders the created PRs section.
     */
    const renderCreatedPrsSection = (host, _selectedAuthor, rows) => {
      const createdPrs = sortAuthorInsightsCreatedPrsDesc(
        rows.filter(
          (entry) =>
            displayHelpers.getPreferredActorKey(
              entry?.data?.authorLogin,
              entry?.data?.author,
            ) === authorInsightsState.selectedAuthorLogin,
        ),
      );

      const createdSection = documentRef.createElement("section");
      createdSection.className = "author-insights-section";
      const createdTitle = documentRef.createElement("h3");
      createdTitle.textContent = "PRs created by this author";
      createdSection.appendChild(createdTitle);

      if (!createdPrs.length) {
        const empty = documentRef.createElement("p");
        empty.className = "stats-empty";
        empty.textContent = "No PRs by this author in the current local data scope.";
        createdSection.appendChild(empty);
      } else {
        const prList = documentRef.createElement("div");
        prList.className = "author-insights-list";
        createdPrs.forEach((entry) => {
          const item = documentRef.createElement("div");
          item.className = "author-insights-item";
          item.appendChild(createAuthorInsightsPrLink(entry));

          const meta = createAuthorInsightsPrDataMeta(entry);
          appendAuthorInsightsMetaDetail(
            meta,
            displayHelpers.formatIsoDatetime(
              entry?.data?.mergedAt || entry?.data?.sourceUpdatedAt || "-",
            ),
          );
          item.appendChild(meta);

          prList.appendChild(item);
        });
        createdSection.appendChild(prList);
      }
      host.appendChild(createdSection);
    };

    return {
      renderAuthorInsights,
      loadAuthorManualComments: (authorLogin) =>
        loadAuthorManualComments(authorLogin, authorInsightsState, () => {
          if (authorInsightsState.latestRows && authorInsightsState.latestActorsMap) {
            renderAuthorInsights(
              authorInsightsState.latestRows,
              authorInsightsState.latestActorsMap,
            );
          }
        }),
    };
  };

  return {
    createPrAuthorInsightsComponent,
  };
});
