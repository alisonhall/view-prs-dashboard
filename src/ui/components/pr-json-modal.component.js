(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsJsonModalComponent = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const prJsonModalHelperFactory =
    typeof module !== "undefined" && module.exports
      ? require("../helpers/pr-json-modal.helpers.js")
      : globalThis.ViewPrsPrJsonModalHelpers;
  const prDiffRenderHelperFactory =
    typeof module !== "undefined" && module.exports
      ? require("../helpers/pr-diff-render.helpers.js")
      : globalThis.ViewPrsDiffRenderHelpers;

  const createPrJsonModalComponent = ({
    getPerPrUserStateFromPayload,
    getLatestStoredPayload,
    getLatestSelectedRepo,
    defaultRepo,
    safeJsonStringify,
    formatDiffSummaryLine,
    buildPrJsonModalAiClipboardText,
    renderDiffText,
    setClassToken,
    fetchFn,
    documentRef,
    navigatorRef,
    setTimeoutFn,
  } = {}) => {
    const summarizeDiffText = (diffText) => {
      const lines = String(diffText || "").split(/\r?\n/);
      const summary = {
        filesChanged: 0,
        hunks: 0,
        additions: 0,
        deletions: 0,
        lines: lines.length,
      };

      lines.forEach((line) => {
        if (line.startsWith("diff --git ")) summary.filesChanged += 1;
        if (line.startsWith("@@")) summary.hunks += 1;
        if (line.startsWith("+") && !line.startsWith("+++")) summary.additions += 1;
        if (line.startsWith("-") && !line.startsWith("---")) summary.deletions += 1;
      });

      return summary;
    };

    const prJsonModalHelpers =
      prJsonModalHelperFactory.createPrJsonModalHelpers({
        summarizeDiffText,
        safeJsonStringify,
      });

    const clearElementChildren = (element) => {
      if (!element) return;
      if (typeof element.replaceChildren === "function") {
        element.replaceChildren();
        return;
      }
      if (Array.isArray(element.children)) {
        element.children.length = 0;
      }
      if (typeof element.innerHTML === "string") {
        element.innerHTML = "";
      }
    };

    const prDiffRenderHelpers =
      prDiffRenderHelperFactory.createPrDiffRenderHelpers({
        clearElementChildren,
        documentRef,
      });

    const getPerPrUserStateFromPayloadSafe =
      typeof getPerPrUserStateFromPayload === "function"
        ? getPerPrUserStateFromPayload
        : () => ({
            notesByPrNumber: null,
            ackByRepo: null,
            reverifyByRepo: null,
            inReviewByRepo: null,
          });
    const getLatestStoredPayloadSafe =
      typeof getLatestStoredPayload === "function" ? getLatestStoredPayload : () => ({});
    const getLatestSelectedRepoSafe =
      typeof getLatestSelectedRepo === "function" ? getLatestSelectedRepo : () => "";
    const safeJsonStringifySafe =
      typeof safeJsonStringify === "function" ? safeJsonStringify : (value) => String(value);
    const formatDiffSummaryLineSafe =
      typeof formatDiffSummaryLine === "function"
        ? formatDiffSummaryLine
        : (...args) => prJsonModalHelpers.formatDiffSummaryLine(...args);
    const buildPrJsonModalAiClipboardTextSafe =
      typeof buildPrJsonModalAiClipboardText === "function"
        ? buildPrJsonModalAiClipboardText
        : (...args) => prJsonModalHelpers.buildPrJsonModalAiClipboardText(...args);
    const renderDiffTextSafe =
      typeof renderDiffText === "function"
        ? renderDiffText
        : (...args) => prDiffRenderHelpers.renderDiffText(...args);
    const setClassTokenSafe =
      typeof setClassToken === "function" ? setClassToken : () => {};
    const fetchFnSafe =
      typeof fetchFn === "function"
        ? fetchFn
        : async () => ({ ok: false, json: async () => ({ ok: false, error: "fetch unavailable" }) });
    const setTimeoutSafe =
      typeof setTimeoutFn === "function" ? setTimeoutFn : (cb) => setTimeout(cb, 0);

    const getDocument = () =>
      documentRef || (typeof document !== "undefined" ? document : null);
    const getNavigator = () =>
      navigatorRef || (typeof navigator !== "undefined" ? navigator : null);

    let modalElements = null;
    let lastActiveElement = null;
    let bodyOverflow = "";

    const getModalFocusableElements = (root) => {
      if (!root || typeof root.querySelectorAll !== "function") {
        return modalElements?.closeButton ? [modalElements.closeButton] : [];
      }

      const candidates = Array.from(
        root.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      );
      return candidates.filter((node) => {
        if (!node || node.disabled) return false;
        const ariaHidden =
          typeof node.getAttribute === "function"
            ? node.getAttribute("aria-hidden")
            : null;
        return ariaHidden !== "true";
      });
    };

    const buildPrJsonModalPayload = (entry, row) => {
      const prNumber = String(row?.number || entry?.prNumber || "").trim();
      const payload = getLatestStoredPayloadSafe() || {};
      const byPrNumber = payload?.byPrNumber || {};
      const payloadEntry = byPrNumber?.[prNumber];
      const dataSourceEntry = payloadEntry || entry || {};
      const dataFileEntry =
        dataSourceEntry && typeof dataSourceEntry === "object"
          ? { ...dataSourceEntry }
          : dataSourceEntry;

      if (
        dataFileEntry &&
        typeof dataFileEntry === "object" &&
        !Array.isArray(dataFileEntry)
      ) {
        delete dataFileEntry.notes;
      }

      const splitPrDetailFields = [
        "activityTimeline",
        "activityEvents",
        "reviewThreads",
        "commentEvents",
      ];
      const dataRow =
        dataFileEntry &&
        typeof dataFileEntry === "object" &&
        !Array.isArray(dataFileEntry) &&
        dataFileEntry.data &&
        typeof dataFileEntry.data === "object" &&
        !Array.isArray(dataFileEntry.data)
          ? dataFileEntry.data
          : null;
      const detailRef =
        dataRow && typeof dataRow.detailRef === "object" ? dataRow.detailRef : null;
      const prDetailEntry = {};

      splitPrDetailFields.forEach((fieldName) => {
        if (!dataRow) return;
        if (!Object.prototype.hasOwnProperty.call(dataRow, fieldName)) return;
        prDetailEntry[fieldName] = Array.isArray(dataRow[fieldName])
          ? [...dataRow[fieldName]]
          : [];
        delete dataRow[fieldName];
      });

      const repo = String(
        row?.repo ||
          entry?.repo ||
          payloadEntry?.repo ||
          getLatestSelectedRepoSafe() ||
          payload?.lastRun?.repo ||
          defaultRepo ||
          "",
      ).trim();

      return {
        prNumber,
        repo,
        dataFile: {
          file: "check-open-pr-updates.data.json",
          entry: dataFileEntry,
        },
        prDetailFile: {
          file:
            String(detailRef?.file || "").trim() ||
            "data/pr-details/<repo>__pr-<number>.json",
          entry: prDetailEntry,
        },
        userStateFile: {
          file: "check-open-pr-updates.user-state.json",
          entry: getPerPrUserStateFromPayloadSafe(payload, entry, prNumber, repo),
        },
      };
    };

    const fetchPrDiffForModal = async ({ repo, prNumber }) => {
      const safeRepo = encodeURIComponent(String(repo || "").trim());
      const safePr = encodeURIComponent(String(prNumber || "").trim());
      if (!safeRepo || !safePr) {
        return {
          ok: false,
          error: "Missing repo or PR number for diff lookup",
        };
      }

      try {
        const response = await fetchFnSafe(
          `/view-prs/diff?repo=${safeRepo}&prNumber=${safePr}`,
        );
        const result = await response.json();
        if (!response.ok || result?.ok === false) {
          return {
            ok: false,
            error: result?.error || `Failed to load diff (HTTP ${response.status})`,
          };
        }

        return {
          ok: true,
          file: "data/pr-diffs/<repo>__pr-<number>.json",
          source: result.source || "",
          stale: Boolean(result.stale),
          warning: String(result.warning || ""),
          commitFingerprint: String(result.commitFingerprint || ""),
          fetchedAt: result.fetchedAt || null,
          filePath: String(result.filePath || ""),
          diffText: String(result.diffText || ""),
        };
      } catch (error) {
        return {
          ok: false,
          error: String(error?.message || error || "Failed to load diff"),
        };
      }
    };

    const closePrJsonModal = () => {
      const doc = getDocument();
      if (!modalElements?.root || !doc) return;

      modalElements.root.hidden = true;

      if (doc?.body?.style) {
        doc.body.style.overflow = bodyOverflow;
      }

      if (typeof doc?.removeEventListener === "function") {
        doc.removeEventListener("keydown", handlePrJsonModalKeydown);
      }

      if (typeof lastActiveElement?.focus === "function") {
        lastActiveElement.focus();
      }
      lastActiveElement = null;
    };

    const handlePrJsonModalKeydown = (event) => {
      const doc = getDocument();
      if (!modalElements?.root || modalElements.root.hidden) {
        return;
      }

      const key = String(event?.key || "");
      if (key === "Escape") {
        if (typeof event?.preventDefault === "function") {
          event.preventDefault();
        }
        closePrJsonModal();
        return;
      }

      if (key !== "Tab") {
        return;
      }

      const focusable = getModalFocusableElements(modalElements.root);
      if (!focusable.length) {
        if (typeof event?.preventDefault === "function") {
          event.preventDefault();
        }
        if (typeof modalElements.root.focus === "function") {
          modalElements.root.focus();
        }
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = doc?.activeElement;
      const isShift = Boolean(event?.shiftKey);

      if (!isShift && active === last) {
        if (typeof event?.preventDefault === "function") {
          event.preventDefault();
        }
        if (typeof first.focus === "function") {
          first.focus();
        }
        return;
      }

      if (isShift && active === first) {
        if (typeof event?.preventDefault === "function") {
          event.preventDefault();
        }
        if (typeof last.focus === "function") {
          last.focus();
        }
      }
    };

    const ensurePrJsonModal = () => {
      const doc = getDocument();
      const nav = getNavigator();
      if (modalElements?.root) {
        return modalElements;
      }
      if (!doc?.createElement || !doc?.body?.appendChild) {
        return null;
      }

      const root = doc.createElement("div");
      root.id = "pr-json-modal";
      root.className = "pr-json-modal";
      root.hidden = true;
      root.setAttribute("role", "dialog");
      root.setAttribute("aria-modal", "true");
      root.setAttribute("aria-labelledby", "pr-json-modal-title");
      root.setAttribute("aria-describedby", "pr-json-modal-subtitle");
      root.tabIndex = -1;

      const card = doc.createElement("div");
      card.className = "pr-json-modal-card";

      const header = doc.createElement("div");
      header.className = "pr-json-modal-header";

      const title = doc.createElement("h3");
      title.id = "pr-json-modal-title";
      title.textContent = "PR JSON Details";

      const closeButton = doc.createElement("button");
      closeButton.type = "button";
      closeButton.className = "pr-json-modal-close";
      closeButton.setAttribute("aria-label", "Close PR JSON details");
      closeButton.textContent = "x";
      closeButton.onclick = closePrJsonModal;

      const copyAllButton = doc.createElement("button");
      copyAllButton.type = "button";
      copyAllButton.className = "pr-json-modal-copy-btn";
      copyAllButton.setAttribute("aria-label", "Copy all PR JSON details for AI chat");
      copyAllButton.textContent = "Copy all";
      copyAllButton.disabled = true;
      copyAllButton.onclick = async () => {
        const value = String(modalElements?.copyAllText || "");
        if (!value) {
          copyAllButton.textContent = "Unavailable";
          setTimeoutSafe(() => {
            copyAllButton.textContent = "Copy all";
          }, 1200);
          return;
        }

        try {
          if (nav?.clipboard?.writeText) {
            await nav.clipboard.writeText(value);
            copyAllButton.textContent = "Copied";
          } else {
            copyAllButton.textContent = "Unavailable";
          }
        } catch (_error) {
          copyAllButton.textContent = "Copy failed";
        }

        setTimeoutSafe(() => {
          copyAllButton.textContent = "Copy all";
        }, 1200);
      };

      header.appendChild(title);
      header.appendChild(copyAllButton);
      header.appendChild(closeButton);

      const subtitle = doc.createElement("p");
      subtitle.id = "pr-json-modal-subtitle";
      subtitle.className = "pr-json-modal-subtitle";

      const content = doc.createElement("div");
      content.id = "pr-json-modal-content";
      content.className = "pr-json-modal-content";

      const dataSection = doc.createElement("details");
      dataSection.className = "pr-json-section";
      dataSection.open = true;
      const dataSummary = doc.createElement("summary");
      dataSummary.textContent = "Data File Entry";
      const dataContent = doc.createElement("pre");
      dataContent.className = "pr-json-block";
      dataSection.appendChild(dataSummary);
      dataSection.appendChild(dataContent);

      const userStateSection = doc.createElement("details");
      userStateSection.className = "pr-json-section";
      userStateSection.open = true;
      const userStateSummary = doc.createElement("summary");
      userStateSummary.textContent = "User State Entry";
      const userStateContent = doc.createElement("pre");
      userStateContent.className = "pr-json-block";
      userStateSection.appendChild(userStateSummary);
      userStateSection.appendChild(userStateContent);

      const prDetailSection = doc.createElement("details");
      prDetailSection.className = "pr-json-section";
      prDetailSection.open = true;
      const prDetailSummary = doc.createElement("summary");
      prDetailSummary.textContent = "PR Detail File";
      const prDetailContent = doc.createElement("pre");
      prDetailContent.className = "pr-json-block";
      prDetailSection.appendChild(prDetailSummary);
      prDetailSection.appendChild(prDetailContent);

      const diffSection = doc.createElement("details");
      diffSection.className = "pr-json-section pr-json-section-diff";
      diffSection.open = true;
      const diffSummary = doc.createElement("summary");
      diffSummary.textContent = "PR Diff";
      const diffHeader = doc.createElement("div");
      diffHeader.className = "pr-json-diff-header";
      const diffActions = doc.createElement("div");
      diffActions.className = "pr-json-diff-actions";
      const wrapDiffButton = doc.createElement("button");
      wrapDiffButton.type = "button";
      wrapDiffButton.className = "pr-json-diff-btn";
      wrapDiffButton.textContent = "Wrap lines";
      const copyDiffButton = doc.createElement("button");
      copyDiffButton.type = "button";
      copyDiffButton.className = "pr-json-diff-btn";
      copyDiffButton.textContent = "Copy diff";
      diffActions.appendChild(wrapDiffButton);
      diffActions.appendChild(copyDiffButton);
      diffHeader.appendChild(diffActions);

      const diffMeta = doc.createElement("p");
      diffMeta.className = "pr-json-diff-meta";

      const diffContent = doc.createElement("div");
      diffContent.className = "pr-json-diff";

      wrapDiffButton.onclick = () => {
        const wrapped = String(diffContent.dataset.wrapped || "false") === "true";
        const nextWrapped = !wrapped;
        diffContent.dataset.wrapped = nextWrapped ? "true" : "false";
        setClassTokenSafe(diffContent, "is-wrapped", nextWrapped);
        wrapDiffButton.textContent = nextWrapped ? "Unwrap lines" : "Wrap lines";
      };

      copyDiffButton.onclick = async () => {
        const value = String(diffContent.dataset.rawDiff || diffContent.textContent || "");
        if (!value) return;

        try {
          if (nav?.clipboard?.writeText) {
            await nav.clipboard.writeText(value);
            copyDiffButton.textContent = "Copied";
          } else {
            copyDiffButton.textContent = "Unavailable";
          }
        } catch (_error) {
          copyDiffButton.textContent = "Copy failed";
        }

        setTimeoutSafe(() => {
          copyDiffButton.textContent = "Copy diff";
        }, 1200);
      };

      diffSection.appendChild(diffSummary);
      diffSection.appendChild(diffHeader);
      diffSection.appendChild(diffMeta);
      diffSection.appendChild(diffContent);

      content.appendChild(dataSection);
      content.appendChild(prDetailSection);
      content.appendChild(userStateSection);
      content.appendChild(diffSection);

      card.appendChild(header);
      card.appendChild(subtitle);
      card.appendChild(content);
      root.appendChild(card);

      root.onclick = (event) => {
        if (event?.target === root) {
          closePrJsonModal();
        }
      };

      doc.body.appendChild(root);

      modalElements = {
        root,
        card,
        subtitle,
        content,
        dataContent,
        prDetailContent,
        userStateContent,
        diffMeta,
        diffContent,
        wrapDiffButton,
        copyDiffButton,
        copyAllButton,
        closeButton,
        copyAllText: "",
      };
      return modalElements;
    };

    const openPrJsonModal = async (entry, row) => {
      const doc = getDocument();
      const modal = ensurePrJsonModal();
      if (!modal || !doc) return;

      const detailsPayload = buildPrJsonModalPayload(entry, row);
      modal.subtitle.textContent = `PR #${detailsPayload.prNumber || "-"} (${detailsPayload.repo || "repo unknown"})`;
      modal.dataContent.textContent = "Loading data file entry...";
      modal.prDetailContent.textContent = "Loading pr-detail file entry...";
      modal.userStateContent.textContent = "Loading user-state entry...";
      modal.diffMeta.textContent = "Loading diff details...";
      modal.diffContent.textContent = "Loading diff...";
      modal.diffContent.dataset.wrapped = "false";
      setClassTokenSafe(modal.diffContent, "is-wrapped", false);
      modal.wrapDiffButton.textContent = "Wrap lines";
      modal.copyDiffButton.textContent = "Copy diff";
      modal.copyAllText = "";
      modal.copyAllButton.textContent = "Copy all";
      modal.copyAllButton.disabled = true;

      lastActiveElement = doc?.activeElement || null;
      if (doc?.body?.style) {
        bodyOverflow = String(doc.body.style.overflow || "");
        doc.body.style.overflow = "hidden";
      }

      modal.root.hidden = false;

      if (typeof doc?.addEventListener === "function") {
        doc.addEventListener("keydown", handlePrJsonModalKeydown);
      }

      if (typeof modal.closeButton?.focus === "function") {
        modal.closeButton.focus();
      } else if (typeof modal.root?.focus === "function") {
        modal.root.focus();
      }

      const diffData = await fetchPrDiffForModal({
        repo: detailsPayload.repo,
        prNumber: detailsPayload.prNumber,
      });
      modal.dataContent.textContent = safeJsonStringifySafe(detailsPayload.dataFile);
      modal.prDetailContent.textContent = safeJsonStringifySafe(detailsPayload.prDetailFile);
      modal.userStateContent.textContent = safeJsonStringifySafe(detailsPayload.userStateFile);
      modal.diffMeta.textContent = formatDiffSummaryLineSafe(diffData);
      renderDiffTextSafe(
        modal.diffContent,
        diffData?.ok === false
          ? `Unable to load diff\n${String(diffData.error || "Unknown error")}`
          : String(diffData?.diffText || ""),
      );
      modal.copyAllText = buildPrJsonModalAiClipboardTextSafe(detailsPayload, diffData);
      modal.copyAllButton.disabled = false;
    };

    return {
      openPrJsonModal,
      closePrJsonModal,
      ensurePrJsonModal,
    };
  };

  return {
    createPrJsonModalComponent,
  };
});
