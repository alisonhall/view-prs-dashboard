(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsFilterPanelComponent = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrFilterPanelComponent = ({
    getPreferredActorKey,
    resolveActorDisplayName,
    collectAssignedUsers,
    collectApproversFromRow,
    extractRowLabelNames,
    normalizeFilterToken,
    getPendingAuthorFilterSelections,
    setPendingAuthorFilterSelections,
    getPendingAssignedFilterSelections,
    setPendingAssignedFilterSelections,
    getPendingApproverFilterSelections,
    setPendingApproverFilterSelections,
    getPendingLabelFilterSelections,
    setPendingLabelFilterSelections,
    getPendingExcludeLabelFilterSelections,
    setPendingExcludeLabelFilterSelections,
    documentRef,
  } = {}) => {
    const getPreferredActorKeySafe =
      typeof getPreferredActorKey === "function" ? getPreferredActorKey : () => "";
    const resolveActorDisplayNameSafe =
      typeof resolveActorDisplayName === "function"
        ? resolveActorDisplayName
        : (login) => String(login || "").trim();
    const collectAssignedUsersSafe =
      typeof collectAssignedUsers === "function" ? collectAssignedUsers : () => [];
    const collectApproversFromRowSafe =
      typeof collectApproversFromRow === "function" ? collectApproversFromRow : () => [];
    const extractRowLabelNamesSafe =
      typeof extractRowLabelNames === "function" ? extractRowLabelNames : () => [];
    const normalizeFilterTokenSafe =
      typeof normalizeFilterToken === "function"
        ? normalizeFilterToken
        : (value) => String(value || "").trim().toLowerCase();

    const getPendingAuthorFilterSelectionsSafe =
      typeof getPendingAuthorFilterSelections === "function"
        ? getPendingAuthorFilterSelections
        : () => null;
    const setPendingAuthorFilterSelectionsSafe =
      typeof setPendingAuthorFilterSelections === "function"
        ? setPendingAuthorFilterSelections
        : () => {};
    const getPendingAssignedFilterSelectionsSafe =
      typeof getPendingAssignedFilterSelections === "function"
        ? getPendingAssignedFilterSelections
        : () => null;
    const setPendingAssignedFilterSelectionsSafe =
      typeof setPendingAssignedFilterSelections === "function"
        ? setPendingAssignedFilterSelections
        : () => {};
    const getPendingApproverFilterSelectionsSafe =
      typeof getPendingApproverFilterSelections === "function"
        ? getPendingApproverFilterSelections
        : () => null;
    const setPendingApproverFilterSelectionsSafe =
      typeof setPendingApproverFilterSelections === "function"
        ? setPendingApproverFilterSelections
        : () => {};
    const getPendingLabelFilterSelectionsSafe =
      typeof getPendingLabelFilterSelections === "function"
        ? getPendingLabelFilterSelections
        : () => null;
    const setPendingLabelFilterSelectionsSafe =
      typeof setPendingLabelFilterSelections === "function"
        ? setPendingLabelFilterSelections
        : () => {};
    const getPendingExcludeLabelFilterSelectionsSafe =
      typeof getPendingExcludeLabelFilterSelections === "function"
        ? getPendingExcludeLabelFilterSelections
        : () => null;
    const setPendingExcludeLabelFilterSelectionsSafe =
      typeof setPendingExcludeLabelFilterSelections === "function"
        ? setPendingExcludeLabelFilterSelections
        : () => {};

    const getDocument = () =>
      documentRef || (typeof document !== "undefined" ? document : null);

    const getListElement = (listId) => {
      const doc = getDocument();
      if (!doc || typeof doc.getElementById !== "function") {
        return null;
      }
      return doc.getElementById(listId);
    };

    const getSelectedMultiSelectValues = (listId) => {
      const list = getListElement(listId);
      if (!list || typeof list.querySelectorAll !== "function") return [];

      const checkboxes = Array.from(
        list.querySelectorAll("input[type='checkbox']:checked"),
      );
      return checkboxes
        .map((checkbox) => String(checkbox.value || "").trim())
        .filter(Boolean);
    };

    const getSelectedAuthorLogins = () => getSelectedMultiSelectValues("author-list");
    const getSelectedAssignedLogins = () =>
      getSelectedMultiSelectValues("assigned-list");
    const getSelectedApproverLogins = () =>
      getSelectedMultiSelectValues("approver-list");
    const getSelectedIncludeLabelNames = () =>
      getSelectedMultiSelectValues("label-list");
    const getSelectedExcludeLabelNames = () =>
      getSelectedMultiSelectValues("exclude-label-list");

    const getMultiSelectCheckboxId = (prefix, value, index) => {
      const normalized = String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "");
      return `${prefix}-${normalized || "item"}-${index}`;
    };

    const updateMultiSelectSummary = (listId) => {
      const list = getListElement(listId);
      if (!list) return;

      const detailsElement = list.closest("details");
      if (!detailsElement || typeof detailsElement.querySelector !== "function") {
        return;
      }

      const checkedCount = list.querySelectorAll("input[type='checkbox']:checked").length;
      const summary = detailsElement.querySelector(".multi-select-summary");
      if (!summary) return;

      const baseText = String(summary.textContent || "").split("(")[0].trim();
      summary.textContent =
        checkedCount > 0 ? `${baseText} (${checkedCount} selected)` : baseText;
    };

    const collectSortedLabelOptions = (entries, repoFilter = "") => {
      const labelsByToken = new Map();

      entries.forEach((entry) => {
        if (repoFilter && entry?.repo !== repoFilter) return;
        extractRowLabelNamesSafe(entry?.data || {}).forEach((labelName) => {
          const normalizedToken = normalizeFilterTokenSafe(labelName);
          if (!normalizedToken || labelsByToken.has(normalizedToken)) return;
          labelsByToken.set(normalizedToken, labelName);
        });
      });

      return Array.from(labelsByToken.entries())
        .map(([normalizedToken, labelName]) => ({ normalizedToken, labelName }))
        .sort((a, b) =>
          String(a.labelName || "")
            .toLowerCase()
            .localeCompare(String(b.labelName || "").toLowerCase()),
        );
    };

    const populateIncludeLabelOptions = (entries, repoFilter = "") => {
      const labelList = getListElement("label-list");
      if (!labelList) return;

      const existingSelections = getSelectedIncludeLabelNames();
      const pendingSelections = getPendingLabelFilterSelectionsSafe();
      const seedSelections =
        existingSelections.length > 0
          ? existingSelections
          : Array.isArray(pendingSelections)
            ? pendingSelections
            : [];
      const selectedTokens = new Set(
        seedSelections.map((value) => normalizeFilterTokenSafe(value)),
      );

      const sortedLabels = collectSortedLabelOptions(entries, repoFilter);
      labelList.innerHTML = "";

      if (sortedLabels.length === 0) {
        labelList.classList.add("empty");
      } else {
        labelList.classList.remove("empty");
        sortedLabels.forEach(({ normalizedToken, labelName }, index) => {
          const itemDiv = getDocument().createElement("div");
          itemDiv.className = "multi-select-item";

          const checkbox = getDocument().createElement("input");
          checkbox.type = "checkbox";
          checkbox.id = getMultiSelectCheckboxId("label", labelName, index);
          checkbox.value = labelName;
          checkbox.checked = selectedTokens.has(normalizedToken);

          const label = getDocument().createElement("label");
          label.htmlFor = checkbox.id;
          label.textContent = labelName;

          itemDiv.appendChild(checkbox);
          itemDiv.appendChild(label);
          labelList.appendChild(itemDiv);
        });
      }

      if (Array.isArray(pendingSelections)) {
        const appliedCount = sortedLabels.filter(({ normalizedToken }) =>
          selectedTokens.has(normalizedToken),
        ).length;
        if (appliedCount > 0 || existingSelections.length > 0) {
          setPendingLabelFilterSelectionsSafe(null);
        }
      }

      updateMultiSelectSummary("label-list");
    };

    const populateExcludeLabelOptions = (entries, repoFilter = "") => {
      const excludeLabelList = getListElement("exclude-label-list");
      if (!excludeLabelList) return;

      const existingSelections = getSelectedExcludeLabelNames();
      const pendingSelections = getPendingExcludeLabelFilterSelectionsSafe();
      const seedSelections =
        existingSelections.length > 0
          ? existingSelections
          : Array.isArray(pendingSelections)
            ? pendingSelections
            : [];
      const selectedTokens = new Set(
        seedSelections.map((value) => normalizeFilterTokenSafe(value)),
      );

      const sortedLabels = collectSortedLabelOptions(entries, repoFilter);
      excludeLabelList.innerHTML = "";

      if (sortedLabels.length === 0) {
        excludeLabelList.classList.add("empty");
      } else {
        excludeLabelList.classList.remove("empty");
        sortedLabels.forEach(({ normalizedToken, labelName }, index) => {
          const itemDiv = getDocument().createElement("div");
          itemDiv.className = "multi-select-item";

          const checkbox = getDocument().createElement("input");
          checkbox.type = "checkbox";
          checkbox.id = getMultiSelectCheckboxId("exclude-label", labelName, index);
          checkbox.value = labelName;
          checkbox.checked = selectedTokens.has(normalizedToken);

          const label = getDocument().createElement("label");
          label.htmlFor = checkbox.id;
          label.textContent = labelName;

          itemDiv.appendChild(checkbox);
          itemDiv.appendChild(label);
          excludeLabelList.appendChild(itemDiv);
        });
      }

      if (Array.isArray(pendingSelections)) {
        const appliedCount = sortedLabels.filter(({ normalizedToken }) =>
          selectedTokens.has(normalizedToken),
        ).length;
        if (appliedCount > 0 || existingSelections.length > 0) {
          setPendingExcludeLabelFilterSelectionsSafe(null);
        }
      }

      updateMultiSelectSummary("exclude-label-list");
    };

    const populateAuthorOptions = (entries, repoFilter = "", actorsMap = {}) => {
      const authorList = getListElement("author-list");
      if (!authorList) return;

      const existingSelections = getSelectedAuthorLogins();
      const pendingSelections = getPendingAuthorFilterSelectionsSafe();
      const seedSelections =
        existingSelections.length > 0
          ? existingSelections
          : Array.isArray(pendingSelections)
            ? pendingSelections
            : [];
      const selectedLogins = new Set(seedSelections);
      const authors = new Map();

      for (const entry of entries) {
        if (repoFilter && entry?.repo !== repoFilter) continue;

        const row = entry?.data || {};
        const login = getPreferredActorKeySafe(row.authorLogin, row.author);
        const displayName = String(row.author || "").trim();
        if (!login) continue;
        if (!authors.has(login)) {
          authors.set(login, resolveActorDisplayNameSafe(login, actorsMap, displayName));
        }
      }

      authorList.innerHTML = "";
      const sortedAuthors = Array.from(authors.entries()).sort((a, b) => {
        const textA = String(a[1] || a[0]).toLowerCase();
        const textB = String(b[1] || b[0]).toLowerCase();
        return textA.localeCompare(textB);
      });

      if (sortedAuthors.length === 0) {
        authorList.classList.add("empty");
      } else {
        authorList.classList.remove("empty");
        sortedAuthors.forEach(([login, displayName]) => {
          const itemDiv = getDocument().createElement("div");
          itemDiv.className = "multi-select-item";

          const checkbox = getDocument().createElement("input");
          checkbox.type = "checkbox";
          checkbox.id = `author-${login}`;
          checkbox.value = login;
          checkbox.checked = selectedLogins.has(login);

          const label = getDocument().createElement("label");
          label.htmlFor = `author-${login}`;
          label.textContent = displayName;

          itemDiv.appendChild(checkbox);
          itemDiv.appendChild(label);
          authorList.appendChild(itemDiv);
        });
      }

      if (Array.isArray(pendingSelections)) {
        const appliedCount = sortedAuthors.filter(([login]) =>
          selectedLogins.has(login),
        ).length;
        if (appliedCount > 0 || existingSelections.length > 0) {
          setPendingAuthorFilterSelectionsSafe(null);
        }
      }

      updateMultiSelectSummary("author-list");
    };

    const populateAssignedOptions = (entries, repoFilter = "", actorsMap = {}) => {
      const assignedList = getListElement("assigned-list");
      if (!assignedList) return;

      const existingSelections = getSelectedAssignedLogins();
      const pendingSelections = getPendingAssignedFilterSelectionsSafe();
      const seedSelections =
        existingSelections.length > 0
          ? existingSelections
          : Array.isArray(pendingSelections)
            ? pendingSelections
            : [];
      const selectedLogins = new Set(seedSelections);
      const assignees = new Map();

      for (const entry of entries) {
        if (repoFilter && entry?.repo !== repoFilter) continue;

        const row = entry?.data || {};
        const rowAssignees = collectAssignedUsersSafe(row);
        rowAssignees.forEach((assignee) => {
          const login = String(assignee?.login || "").trim();
          if (!login) return;
          if (!assignees.has(login)) {
            assignees.set(
              login,
              resolveActorDisplayNameSafe(login, actorsMap, assignee?.name),
            );
          }
        });
      }

      assignedList.innerHTML = "";
      const sortedAssignees = Array.from(assignees.entries()).sort((a, b) => {
        const textA = String(a[1] || a[0]).toLowerCase();
        const textB = String(b[1] || b[0]).toLowerCase();
        return textA.localeCompare(textB);
      });

      if (sortedAssignees.length === 0) {
        assignedList.classList.add("empty");
      } else {
        assignedList.classList.remove("empty");
        sortedAssignees.forEach(([login, displayName]) => {
          const itemDiv = getDocument().createElement("div");
          itemDiv.className = "multi-select-item";

          const checkbox = getDocument().createElement("input");
          checkbox.type = "checkbox";
          checkbox.id = `assigned-${login}`;
          checkbox.value = login;
          checkbox.checked = selectedLogins.has(login);

          const label = getDocument().createElement("label");
          label.htmlFor = `assigned-${login}`;
          label.textContent = displayName;

          itemDiv.appendChild(checkbox);
          itemDiv.appendChild(label);
          assignedList.appendChild(itemDiv);
        });
      }

      if (Array.isArray(pendingSelections)) {
        const appliedCount = sortedAssignees.filter(([login]) =>
          selectedLogins.has(login),
        ).length;
        if (appliedCount > 0 || existingSelections.length > 0) {
          setPendingAssignedFilterSelectionsSafe(null);
        }
      }

      updateMultiSelectSummary("assigned-list");
    };

    const populateApproverOptions = (entries, repoFilter = "", actorsMap = {}) => {
      const approverList = getListElement("approver-list");
      if (!approverList) return;

      const existingSelections = getSelectedApproverLogins();
      const pendingSelections = getPendingApproverFilterSelectionsSafe();
      const seedSelections =
        existingSelections.length > 0
          ? existingSelections
          : Array.isArray(pendingSelections)
            ? pendingSelections
            : [];
      const selectedLogins = new Set(seedSelections);
      const approvers = new Map();

      for (const entry of entries) {
        if (repoFilter && entry?.repo !== repoFilter) continue;

        const row = entry?.data || {};
        collectApproversFromRowSafe(row).forEach((approver) => {
          const login = String(approver?.login || "").trim();
          if (!login) return;
          if (!approvers.has(login)) {
            approvers.set(
              login,
              resolveActorDisplayNameSafe(login, actorsMap, approver?.name),
            );
          }
        });
      }

      approverList.innerHTML = "";
      const sortedApprovers = Array.from(approvers.entries()).sort((a, b) => {
        const textA = String(a[1] || a[0]).toLowerCase();
        const textB = String(b[1] || b[0]).toLowerCase();
        return textA.localeCompare(textB);
      });

      if (sortedApprovers.length === 0) {
        approverList.classList.add("empty");
      } else {
        approverList.classList.remove("empty");
        sortedApprovers.forEach(([login, displayName]) => {
          const itemDiv = getDocument().createElement("div");
          itemDiv.className = "multi-select-item";

          const checkbox = getDocument().createElement("input");
          checkbox.type = "checkbox";
          checkbox.id = `approver-${login}`;
          checkbox.value = login;
          checkbox.checked = selectedLogins.has(login);

          const label = getDocument().createElement("label");
          label.htmlFor = `approver-${login}`;
          label.textContent = displayName;

          itemDiv.appendChild(checkbox);
          itemDiv.appendChild(label);
          approverList.appendChild(itemDiv);
        });
      }

      if (Array.isArray(pendingSelections)) {
        const appliedCount = sortedApprovers.filter(([login]) =>
          selectedLogins.has(login),
        ).length;
        if (appliedCount > 0 || existingSelections.length > 0) {
          setPendingApproverFilterSelectionsSafe(null);
        }
      }

      updateMultiSelectSummary("approver-list");
    };

    const renderManagementFilterSummary = ({
      summaryText = "",
      filterChips = [],
    } = {}) => {
      const doc = getDocument();
      if (!doc) {
        return;
      }

      const summaryNode = doc.getElementById("management-filter-summary");
      const chipsNode = doc.getElementById("management-filter-chips");

      if (summaryNode) {
        summaryNode.textContent = summaryText || "Applied filters summary unavailable.";
      }

      if (!chipsNode) {
        return;
      }

      chipsNode.innerHTML = "";
      const chips = Array.isArray(filterChips) ? filterChips.filter(Boolean) : [];
      if (chips.length === 0) {
        const chip = doc.createElement("span");
        chip.className = "applied-filter-chip";
        chip.textContent = "No filters applied";
        chipsNode.appendChild(chip);
        return;
      }

      chips.forEach((label) => {
        const chip = doc.createElement("span");
        chip.className = "applied-filter-chip";
        chip.textContent = String(label);
        chipsNode.appendChild(chip);
      });
    };

    const setupMultiSelectDropdownClosing = () => {
      const doc = getDocument();
      if (!doc || typeof doc.querySelectorAll !== "function") return;
      const dropdowns = doc.querySelectorAll(".multi-select-dropdown");
      if (dropdowns.length === 0) return;

      doc.addEventListener("click", (event) => {
        dropdowns.forEach((dropdown) => {
          if (!dropdown.contains(event.target)) {
            dropdown.open = false;
          }
        });
      });
    };

    return {
      getSelectedMultiSelectValues,
      getSelectedAuthorLogins,
      getSelectedAssignedLogins,
      getSelectedApproverLogins,
      getSelectedIncludeLabelNames,
      getSelectedExcludeLabelNames,
      updateMultiSelectSummary,
      collectSortedLabelOptions,
      populateIncludeLabelOptions,
      populateExcludeLabelOptions,
      populateAuthorOptions,
      populateAssignedOptions,
      populateApproverOptions,
      renderManagementFilterSummary,
      setupMultiSelectDropdownClosing,
    };
  };

  return {
    createPrFilterPanelComponent,
  };
});
