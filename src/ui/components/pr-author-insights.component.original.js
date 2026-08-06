(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsAuthorInsightsComponent = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrAuthorInsightsComponent = ({
    DEFAULT_REPO = "",
    DEFAULT_AUTHOR_INSIGHTS_SENTIMENT = "neutral",
    fetchFn = (...args) => fetch(...args),
    activateDataTab,
    collectNodesByTag,
    resolveActorDisplayName,
    getPreferredActorKey,
    normalizeActorLogin,
    normalizeAuthorInsightsSentiment,
    isChangedStatus,
    toCount,
    parseMarkerState,
    formatChkDisplay,
    getOpenConversationCount,
    getViewedFilesSummary,
    asArray,
    parseSortableTime,
    formatIsoDatetime,
    getAuthorInsightsComposerDraft,
    updateAuthorInsightsComposerDraft,
    resetAuthorInsightsComposerDraft,
    updateAuthorInsightsEditDraft,
    resetAuthorInsightsEditDraft,
    getAuthorInsightsEditDraft,
    recomputeDirtyPrSectionsFields,
    postJson,
    authorInsightsState,
  } = {}) => {
    const createAuthorInsightsPrLink = (entry) => {
      const row = entry?.data || {};
      const prNumber = String(row.number || entry?.prNumber || "").trim();

      const container = document.createElement("div");
      container.style.display = "flex";
      container.style.gap = "8px";
      container.style.alignItems = "center";

      const externalLink = document.createElement("a");
      externalLink.className = "author-insights-link";
      externalLink.href =
        row.url ||
        `https://github.com/${entry?.repo || DEFAULT_REPO}/pull/${prNumber}`;
      externalLink.target = "_blank";
      externalLink.rel = "noopener noreferrer";
      externalLink.textContent = `#${prNumber} ${String(row.title || row.titleDisplay || "").trim()}`;
      externalLink.title = "Open PR on GitHub";
      container.appendChild(externalLink);

      const tableLink = document.createElement("button");
      tableLink.textContent = "View in table";
      tableLink.className = "author-insights-table-link";
      tableLink.title = "Navigate to PR data tab and scroll to this PR";
      tableLink.onclick = () => {
        activateDataTab("pr-data");
        setTimeout(() => {
          const prLinks = collectNodesByTag(document.body, "a")
            .filter((link) => link.className === "pr-link")
            .filter((link) => link.textContent.trim() === `#${prNumber}`);
          if (prLinks.length > 0) {
            const prLink = prLinks[0];
            prLink.scrollIntoView({ behavior: "smooth", block: "center" });
            prLink.focus();

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
          }
        }, 0);
      };
      container.appendChild(tableLink);

      return container;
    };

    const buildAuthorInsightsEntries = (rows, actorsMap = {}) => {
      const authors = new Map();
      const addAuthorOption = (login, fallbackName = "") => {
        const authorLogin = String(login || "").trim();
        if (!authorLogin) return;
        if (authors.has(authorLogin)) return;
        authors.set(
          authorLogin,
          resolveActorDisplayName(authorLogin, actorsMap, fallbackName),
        );
      };

      rows.forEach((entry) => {
        const row = entry?.data || {};
        addAuthorOption(getPreferredActorKey(row.authorLogin, row.author), row.author);
      });

      Object.entries(actorsMap || {}).forEach(([login, name]) => {
        addAuthorOption(login, name);
      });

      return Array.from(authors.entries())
        .map(([login, name]) => ({ login, name }))
        .sort((a, b) =>
          String(a.name || a.login).localeCompare(String(b.name || b.login)),
        );
    };

    const noteAuthorMatchesSelection = (
      noteAuthorValue,
      selectedAuthor,
      actorsMap,
    ) => {
      const rawAuthor = String(noteAuthorValue || "").trim();
      if (!rawAuthor || !selectedAuthor) return false;

      const canonicalRawAuthor = normalizeActorLogin(rawAuthor);
      const selectedLogin = String(selectedAuthor.login || "").trim();
      const selectedName = String(selectedAuthor.name || "").trim();
      const resolvedAuthor = resolveActorDisplayName(
        rawAuthor,
        actorsMap,
        rawAuthor,
      );

      return (
        rawAuthor === selectedLogin ||
        canonicalRawAuthor === selectedLogin ||
        rawAuthor === selectedName ||
        resolvedAuthor === selectedName
      );
    };

    const AUTHOR_COMMENT_SENTIMENT_OPTIONS = [
      { value: "positive", label: "Positive" },
      { value: "negative", label: "Negative" },
      { value: "neutral", label: "Neutral" },
    ];

    const getAuthorManualCommentsForLogin = (authorLogin) => {
      const normalizedAuthorLogin = normalizeActorLogin(authorLogin);
      if (!normalizedAuthorLogin) {
        return [];
      }

      const comments = authorInsightsState.manualCommentsByAuthorLogin?.[
        normalizedAuthorLogin
      ];
      return Array.isArray(comments) ? comments : [];
    };

    const getAuthorInsightsSentimentLabel = (value) => {
      const sentiment = normalizeAuthorInsightsSentiment(value);
      if (sentiment === "positive") return "Positive";
      if (sentiment === "negative") return "Negative";
      return "Neutral";
    };

    const getAuthorInsightsSentimentBadgeClassName = (value) => {
      const sentiment = normalizeAuthorInsightsSentiment(value);
      return `author-insights-badge-sentiment-${sentiment}`;
    };

    const getAuthorInsightsStatusBadgeClassName = (value) => {
      const status = String(value || "").trim().toUpperCase();
      if (status === "MERGED") {
        return "author-insights-badge-status-merged";
      }
      if (status === "CLOSED") {
        return "author-insights-badge-status-closed";
      }
      if (isChangedStatus(status)) {
        return "author-insights-badge-status-changed";
      }
      if (status === "NO_CHANGE") {
        return "author-insights-badge-status-no-change";
      }
      if (status === "NO_ACTIVITY") {
        return "author-insights-badge-status-no-activity";
      }
      return "author-insights-badge-status-default";
    };

    const getAuthorInsightsCreatedPrStatus = (entry) => {
      if (String(entry?.data?.mergedAt || "").trim()) {
        return "MERGED";
      }
      if (
        String(entry?.data?.closedAt || "").trim() ||
        String(entry?.section || "").trim().toLowerCase() === "closed"
      ) {
        return "CLOSED";
      }
      return String(entry?.data?.status || "-").trim().toUpperCase() || "-";
    };

    const appendAuthorInsightsMetaDetail = (meta, text) => {
      const detail = document.createElement("span");
      detail.className = "author-insights-meta-detail";
      detail.textContent = text;
      meta.appendChild(detail);
    };

    const sortAuthorInsightsManualCommentsDesc = (comments) =>
      (Array.isArray(comments) ? comments.slice() : []).sort((a, b) => {
        const dateA = parseSortableTime(a?.createdAt || a?.updatedAt || "");
        const dateB = parseSortableTime(b?.createdAt || b?.updatedAt || "");
        if (dateA !== dateB) {
          return dateB - dateA;
        }
        return String(b?.id || "").localeCompare(String(a?.id || ""));
      });

    const sortAuthorInsightsNoteMatchesDesc = (matches) =>
      (Array.isArray(matches) ? matches.slice() : []).sort((a, b) => {
        const dateA = parseSortableTime(
          a?.comment?.createdAt || a?.comment?.updatedAt || a?.entry?.updatedAt || "",
        );
        const dateB = parseSortableTime(
          b?.comment?.createdAt || b?.comment?.updatedAt || b?.entry?.updatedAt || "",
        );
        if (dateA !== dateB) {
          return dateB - dateA;
        }
        return Number(b?.entry?.prNumber || 0) - Number(a?.entry?.prNumber || 0);
      });

    const getAuthorInsightsNoteDisplayTimestamp = (comment, entry) => {
      const candidates = [
        comment?.createdAt,
        comment?.updatedAt,
        entry?.updatedAt,
        entry?.data?.updatedAt,
        entry?.data?.sourceUpdatedAt,
      ];
      const valid = candidates.find((value) => Number.isFinite(Date.parse(String(value || "").trim())));
      return formatIsoDatetime(valid || "-");
    };

    const sortAuthorInsightsCreatedPrsDesc = (rows) =>
      (Array.isArray(rows) ? rows.slice() : []).sort((a, b) => {
        const dateA = parseSortableTime(
          a?.data?.mergedAt || a?.data?.closedAt || a?.data?.sourceUpdatedAt || a?.updatedAt || "",
        );
        const dateB = parseSortableTime(
          b?.data?.mergedAt || b?.data?.closedAt || b?.data?.sourceUpdatedAt || b?.updatedAt || "",
        );
        if (dateA !== dateB) {
          return dateB - dateA;
        }
        return Number(b?.prNumber || 0) - Number(a?.prNumber || 0);
      });

    const appendAuthorInsightsBadge = (meta, text, className) => {
      const badge = document.createElement("span");
      badge.className = `author-insights-badge ${className}`.trim();
      badge.textContent = text;
      meta.appendChild(badge);
    };

    const createAuthorInsightsPrDataMeta = (entry) => {
      const row = entry?.data || {};
      const meta = document.createElement("div");
      meta.className = "author-insights-meta";

      const status = getAuthorInsightsCreatedPrStatus(entry);
      appendAuthorInsightsBadge(
        meta,
        `Status: ${status}`,
        getAuthorInsightsStatusBadgeClassName(status),
      );

      const approvedLabel = `${String(row?.approved || "-").trim() || "-"} (${toCount(row?.approvalCount)})`;
      appendAuthorInsightsMetaDetail(meta, `Approved: ${approvedLabel}`);

      const chkState = parseMarkerState(row?.titleDisplay, "CHK") || "-";
      appendAuthorInsightsMetaDetail(
        meta,
        `CHK: ${formatChkDisplay(chkState, row?.failureCount)}`,
      );

      appendAuthorInsightsMetaDetail(
        meta,
        `Conversations: ${getOpenConversationCount(row)}`,
      );

      appendAuthorInsightsMetaDetail(meta, getViewedFilesSummary(row));

      const labelsCount = asArray(row?.labels).filter(Boolean).length;
      if (labelsCount > 0) {
        appendAuthorInsightsMetaDetail(meta, `Labels: ${labelsCount}`);
      }

      return meta;
    };

    const renderAuthorInsights = (rows, actorsMap = {}) => {
      const host = document.getElementById("author-insights");
      if (!host) return;

      authorInsightsState.latestRows = rows;
      authorInsightsState.latestActorsMap = actorsMap;

      host.innerHTML = "";

      if (!rows.length) {
        const empty = document.createElement("p");
        empty.className = "stats-empty";
        empty.textContent = "No local rows available for author insights.";
        host.appendChild(empty);
        recomputeDirtyPrSectionsFields();
        return;
      }

      const authorOptions = buildAuthorInsightsEntries(rows, actorsMap);
      if (!authorOptions.length) {
        const empty = document.createElement("p");
        empty.className = "stats-empty";
        empty.textContent = "No authors found in the current local data scope.";
        host.appendChild(empty);
        recomputeDirtyPrSectionsFields();
        return;
      }

      if (
        !authorOptions.some(
          (author) => author.login === authorInsightsState.selectedAuthorLogin,
        )
      ) {
        authorInsightsState.selectedAuthorLogin = authorOptions[0].login;
      }

      const controls = document.createElement("div");
      controls.className = "author-insights-controls";
      const label = document.createElement("label");
      label.className = "author-insights-label";
      label.textContent = "Author";
      const select = document.createElement("select");
      select.id = "author-insights-select";
      select.className = "author-insights-select";
      authorOptions.forEach((author) => {
        const option = document.createElement("option");
        option.value = author.login;
        option.textContent = author.name || author.login;
        option.selected = author.login === authorInsightsState.selectedAuthorLogin;
        select.appendChild(option);
      });
      select.onchange = () => {
        authorInsightsState.selectedAuthorLogin = normalizeActorLogin(select.value);
        renderAuthorInsights(rows, actorsMap);
      };
      label.appendChild(select);
      controls.appendChild(label);
      host.appendChild(controls);

      const selectedAuthorLogin = authorInsightsState.selectedAuthorLogin;
      const selectedAuthor =
        authorOptions.find((author) => author.login === selectedAuthorLogin) ||
        authorOptions[0];
      const composerDraft = getAuthorInsightsComposerDraft(selectedAuthor.login);

      void loadAuthorManualComments(selectedAuthor.login);

      const selectedHeader = document.createElement("div");
      selectedHeader.className = "author-insights-selected";
      selectedHeader.textContent = `Showing insights for ${selectedAuthor.name}`;
      host.appendChild(selectedHeader);

      const manualCommentsSection = document.createElement("section");
      manualCommentsSection.className = "author-insights-section";
      const manualCommentsTitle = document.createElement("h3");
      manualCommentsTitle.textContent = "Manual author comments";
      manualCommentsSection.appendChild(manualCommentsTitle);

      const commentForm = document.createElement("div");
      commentForm.className = "author-insights-comment-form";
      const commentInput = document.createElement("textarea");
      commentInput.className = "author-insights-comment-textarea";
      commentInput.rows = 3;
      commentInput.placeholder = "Add a manual comment about this author...";
      commentInput.value = String(composerDraft.note || "");
      commentInput.setAttribute("data-author-login", selectedAuthor.login);
      commentInput.setAttribute("data-draft-kind", "composer");
      commentInput.addEventListener("input", () => {
        updateAuthorInsightsComposerDraft(selectedAuthor.login, {
          note: commentInput.value,
          sentiment: sentimentSelect.value,
        });
        recomputeDirtyPrSectionsFields();
      });
      commentForm.appendChild(commentInput);

      const formControls = document.createElement("div");
      formControls.className = "author-insights-comment-controls";
      const sentimentSelect = document.createElement("select");
      sentimentSelect.className = "author-insights-comment-sentiment";
      sentimentSelect.setAttribute("data-author-login", selectedAuthor.login);
      sentimentSelect.setAttribute("data-draft-kind", "composer");
      AUTHOR_COMMENT_SENTIMENT_OPTIONS.forEach(({ value, label }) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        option.selected = normalizeAuthorInsightsSentiment(composerDraft.sentiment) === value;
        sentimentSelect.appendChild(option);
      });
      sentimentSelect.value = normalizeAuthorInsightsSentiment(composerDraft.sentiment);
      sentimentSelect.addEventListener("change", () => {
        updateAuthorInsightsComposerDraft(selectedAuthor.login, {
          note: commentInput.value,
          sentiment: sentimentSelect.value,
        });
        recomputeDirtyPrSectionsFields();
      });
      formControls.appendChild(sentimentSelect);

      const saveCommentBtn = document.createElement("button");
      saveCommentBtn.type = "button";
      saveCommentBtn.className = "author-insights-comment-save";
      saveCommentBtn.textContent = "Save comment";
      formControls.appendChild(saveCommentBtn);

      const saveStatus = document.createElement("span");
      saveStatus.className = "author-insights-comment-status";
      formControls.appendChild(saveStatus);
      commentForm.appendChild(formControls);
      manualCommentsSection.appendChild(commentForm);

      const commentList = document.createElement("div");
      commentList.className = "author-insights-list";

      const isLoadingComments =
        authorInsightsState.manualCommentsLoadingByAuthorLogin[selectedAuthor.login] ===
        true;
      const commentsError =
        authorInsightsState.manualCommentsErrorByAuthorLogin[selectedAuthor.login] ||
        "";
      const savedAuthorComments = sortAuthorInsightsManualCommentsDesc(
        getAuthorManualCommentsForLogin(selectedAuthor.login),
      );

      if (isLoadingComments) {
        const loading = document.createElement("p");
        loading.className = "stats-empty";
        loading.textContent = "Loading author comments...";
        commentList.appendChild(loading);
      } else if (commentsError) {
        const error = document.createElement("p");
        error.className = "stats-empty";
        error.textContent = commentsError;
        commentList.appendChild(error);
      } else if (!savedAuthorComments.length) {
        const empty = document.createElement("p");
        empty.className = "stats-empty";
        empty.textContent =
          "No manual comments saved for this author.";
        commentList.appendChild(empty);
      } else {
        savedAuthorComments.forEach((comment) => {
          const item = document.createElement("div");
          item.className = "author-insights-item";

          const meta = document.createElement("div");
          meta.className = "author-insights-meta";
          appendAuthorInsightsBadge(
            meta,
            `Sentiment: ${getAuthorInsightsSentimentLabel(comment?.sentiment)}`,
            getAuthorInsightsSentimentBadgeClassName(comment?.sentiment),
          );
          appendAuthorInsightsMetaDetail(
            meta,
            `Added: ${formatIsoDatetime(comment?.createdAt || "-")}`,
          );
          item.appendChild(meta);

          const body = document.createElement("div");
          body.className = "author-insights-body";
          body.textContent =
            String(comment?.note || "").trim() || "(No manual comment text)";
          item.appendChild(body);

          const actions = document.createElement("div");
          actions.className = "author-insights-comment-actions";
          const editBtn = document.createElement("button");
          editBtn.type = "button";
          editBtn.className = "author-insights-comment-edit";
          editBtn.textContent = "Edit";
          actions.appendChild(editBtn);
          item.appendChild(actions);

          const openEditForm = () => {
            if (item.dataset.editing === "true") {
              return;
            }

            const draft = updateAuthorInsightsEditDraft(
              selectedAuthor.login,
              String(comment?.id || ""),
              {
                isEditing: true,
              },
            );

            item.dataset.editing = "true";
            body.hidden = true;
            actions.innerHTML = "";

            const editForm = document.createElement("div");
            editForm.className = "author-insights-comment-form";
            editForm.setAttribute("data-author-login", selectedAuthor.login);
            editForm.setAttribute("data-comment-id", String(comment?.id || ""));
            const editTextarea = document.createElement("textarea");
            editTextarea.className = "author-insights-comment-textarea";
            editTextarea.rows = 3;
            editTextarea.value = String(draft?.note || "");
            editTextarea.setAttribute("data-author-login", selectedAuthor.login);
            editTextarea.setAttribute("data-comment-id", String(comment?.id || ""));
            editTextarea.addEventListener("input", () => {
              updateAuthorInsightsEditDraft(
                selectedAuthor.login,
                String(comment?.id || ""),
                {
                  note: editTextarea.value,
                  sentiment: editSentiment.value,
                  isEditing: true,
                },
              );
              recomputeDirtyPrSectionsFields();
            });
            editForm.appendChild(editTextarea);

            const editControls = document.createElement("div");
            editControls.className = "author-insights-comment-controls";
            const editSentiment = document.createElement("select");
            editSentiment.className = "author-insights-comment-sentiment";
            editSentiment.setAttribute("data-author-login", selectedAuthor.login);
            editSentiment.setAttribute("data-comment-id", String(comment?.id || ""));
            AUTHOR_COMMENT_SENTIMENT_OPTIONS.forEach(({ value, label }) => {
              const option = document.createElement("option");
              option.value = value;
              option.textContent = label;
              option.selected =
                normalizeAuthorInsightsSentiment(draft?.sentiment) === value;
              editSentiment.appendChild(option);
            });
            editSentiment.value = normalizeAuthorInsightsSentiment(draft?.sentiment);
            editSentiment.addEventListener("change", () => {
              updateAuthorInsightsEditDraft(
                selectedAuthor.login,
                String(comment?.id || ""),
                {
                  note: editTextarea.value,
                  sentiment: editSentiment.value,
                  isEditing: true,
                },
              );
              recomputeDirtyPrSectionsFields();
            });
            editControls.appendChild(editSentiment);

            const saveEditBtn = document.createElement("button");
            saveEditBtn.type = "button";
            saveEditBtn.className = "author-insights-comment-save";
            saveEditBtn.textContent = "Save changes";
            editControls.appendChild(saveEditBtn);

            const cancelEditBtn = document.createElement("button");
            cancelEditBtn.type = "button";
            cancelEditBtn.className = "author-insights-comment-cancel";
            cancelEditBtn.textContent = "Cancel";
            editControls.appendChild(cancelEditBtn);

            const editStatus = document.createElement("span");
            editStatus.className = "author-insights-comment-status";
            editControls.appendChild(editStatus);
            editForm.appendChild(editControls);
            item.appendChild(editForm);

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
              resetAuthorInsightsEditDraft(
                selectedAuthor.login,
                String(comment?.id || ""),
              );
              recomputeDirtyPrSectionsFields();
              restoreReadOnlyView();
            };

            saveEditBtn.onclick = async () => {
              saveEditBtn.disabled = true;
              editStatus.textContent = "Saving...";
              try {
                const response = await fetchFn("/view-prs/author-comments", {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    authorLogin: selectedAuthor.login,
                    id: String(comment?.id || ""),
                    note: editTextarea.value,
                    sentiment: editSentiment.value,
                  }),
                });
                const result = await response.json();
                if (!response.ok || result.ok === false) {
                  editStatus.textContent =
                    result.error || "Failed to save comment edits";
                  return;
                }

                resetAuthorInsightsEditDraft(
                  selectedAuthor.login,
                  String(comment?.id || ""),
                );
                authorInsightsState.manualCommentsByAuthorLogin[selectedAuthor.login] =
                  Array.isArray(result.comments) ? result.comments : [];
                recomputeDirtyPrSectionsFields();
                renderAuthorInsights(rows, actorsMap);
              } catch (_error) {
                editStatus.textContent = "Failed to save comment edits";
              } finally {
                saveEditBtn.disabled = false;
              }
            };
          };

          editBtn.onclick = () => {
            openEditForm();
          };

          if (
            getAuthorInsightsEditDraft(selectedAuthor.login, comment).isEditing === true
          ) {
            openEditForm();
          }

          commentList.appendChild(item);
        });
      }

      saveCommentBtn.onclick = async () => {
        const note = String(commentInput.value || "");
        if (!note.trim()) {
          saveStatus.textContent = "Comment note is required";
          return;
        }

        saveCommentBtn.disabled = true;
        saveStatus.textContent = "Saving...";
        try {
          const { response, result } = await postJson("/view-prs/author-comments", {
            authorLogin: selectedAuthor.login,
            note,
            sentiment: sentimentSelect.value,
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
          recomputeDirtyPrSectionsFields();
          renderAuthorInsights(rows, actorsMap);
        } catch (_error) {
          saveStatus.textContent = "Save failed";
        } finally {
          saveCommentBtn.disabled = false;
        }
      };

      manualCommentsSection.appendChild(commentList);
      host.appendChild(manualCommentsSection);

      const noteMatches = rows
        .flatMap((entry) =>
          asArray(entry?.notes?.comments)
            .filter((comment) =>
              noteAuthorMatchesSelection(
                comment?.author,
                selectedAuthor,
                actorsMap,
              ),
            )
            .map((comment) => ({ entry, comment })),
        );
      const sortedNoteMatches = sortAuthorInsightsNoteMatchesDesc(noteMatches);

      const notesSection = document.createElement("section");
      notesSection.className = "author-insights-section";
      const notesTitle = document.createElement("h3");
      notesTitle.textContent = "PR-linked custom comments and sentiment";
      notesSection.appendChild(notesTitle);
      if (!sortedNoteMatches.length) {
        const empty = document.createElement("p");
        empty.className = "stats-empty";
        empty.textContent =
          "No saved custom comments or sentiment for this author.";
        notesSection.appendChild(empty);
      } else {
        const notesList = document.createElement("div");
        notesList.className = "author-insights-list";
        sortedNoteMatches.forEach(({ entry, comment }) => {
          const item = document.createElement("div");
          item.className = "author-insights-item";

          const prLink = createAuthorInsightsPrLink(entry);
          item.appendChild(prLink);

          item.appendChild(createAuthorInsightsPrDataMeta(entry));

          const tone = document.createElement("div");
          tone.className = "author-insights-meta";
          const noteAuthorLabel = resolveActorDisplayName(
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

          const body = document.createElement("div");
          body.className = "author-insights-body";
          body.textContent =
            String(comment?.note || "").trim() || "(No custom comment text)";
          item.appendChild(body);

          notesList.appendChild(item);
        });
        notesSection.appendChild(notesList);
      }
      host.appendChild(notesSection);

      const createdPrs = sortAuthorInsightsCreatedPrsDesc(
        rows.filter(
          (entry) =>
            getPreferredActorKey(
              entry?.data?.authorLogin,
              entry?.data?.author,
            ) === selectedAuthorLogin,
        ),
      );

      const createdSection = document.createElement("section");
      createdSection.className = "author-insights-section";
      const createdTitle = document.createElement("h3");
      createdTitle.textContent = "PRs created by this author";
      createdSection.appendChild(createdTitle);
      if (!createdPrs.length) {
        const empty = document.createElement("p");
        empty.className = "stats-empty";
        empty.textContent =
          "No PRs by this author in the current local data scope.";
        createdSection.appendChild(empty);
      } else {
        const prList = document.createElement("div");
        prList.className = "author-insights-list";
        createdPrs.forEach((entry) => {
          const item = document.createElement("div");
          item.className = "author-insights-item";
          item.appendChild(createAuthorInsightsPrLink(entry));

          const meta = createAuthorInsightsPrDataMeta(entry);
          appendAuthorInsightsMetaDetail(
            meta,
            formatIsoDatetime(entry?.data?.mergedAt || entry?.data?.sourceUpdatedAt || "-"),
          );
          item.appendChild(meta);

          prList.appendChild(item);
        });
        createdSection.appendChild(prList);
      }
      host.appendChild(createdSection);
      recomputeDirtyPrSectionsFields();
    };

    const loadAuthorManualComments = async (authorLogin) => {
      const normalizedAuthorLogin = normalizeActorLogin(authorLogin);
      if (!normalizedAuthorLogin) {
        return;
      }

      if (authorInsightsState.manualCommentsLoadingByAuthorLogin[normalizedAuthorLogin]) {
        return;
      }
      if (
        Array.isArray(
          authorInsightsState.manualCommentsByAuthorLogin[normalizedAuthorLogin],
        )
      ) {
        return;
      }

      authorInsightsState.manualCommentsLoadingByAuthorLogin[normalizedAuthorLogin] = true;
      authorInsightsState.manualCommentsErrorByAuthorLogin[normalizedAuthorLogin] = "";

      try {
        const response = await fetchFn(
          `/view-prs/author-comments?authorLogin=${encodeURIComponent(normalizedAuthorLogin)}`,
        );
        const result = await response.json();
        if (!response.ok || result.ok === false) {
          throw new Error(result.error || "Failed to load author comments");
        }

        authorInsightsState.manualCommentsByAuthorLogin[normalizedAuthorLogin] =
          Array.isArray(result.comments) ? result.comments : [];
      } catch (error) {
        authorInsightsState.manualCommentsErrorByAuthorLogin[normalizedAuthorLogin] =
          error?.message || "Failed to load author comments";
        authorInsightsState.manualCommentsByAuthorLogin[normalizedAuthorLogin] = [];
      } finally {
        authorInsightsState.manualCommentsLoadingByAuthorLogin[normalizedAuthorLogin] = false;
        if (authorInsightsState.latestRows && authorInsightsState.latestActorsMap) {
          renderAuthorInsights(
            authorInsightsState.latestRows,
            authorInsightsState.latestActorsMap,
          );
        }
      }
    };

    return {
      renderAuthorInsights,
      loadAuthorManualComments,
    };
  };

  return {
    createPrAuthorInsightsComponent,
  };
});
