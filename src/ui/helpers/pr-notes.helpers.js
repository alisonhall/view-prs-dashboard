(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsPrNotesHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const normalizeNotesListForUi = (value) => {
    if (Array.isArray(value)) {
      const normalized = value
        .map((item) => String(item ?? ""))
        .filter((item) => item.length > 0);
      return normalized.length ? normalized : [""];
    }
    const single = String(value ?? "");
    return single ? [single] : [""];
  };

  const areStringListsEqual = (left, right) => {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      return false;
    }
    if (left.length !== right.length) {
      return false;
    }
    return left.every((value, index) => String(value) === String(right[index]));
  };

  const createMultiEntryField = ({
    document,
    title,
    placeholder,
    values,
    inputClassName,
    onChange,
  }) => {
    const label = document.createElement("label");
    label.className = "pr-notes-label";

    const header = document.createElement("div");
    header.className = "pr-notes-multi-header";

    const titleSpan = document.createElement("span");
    titleSpan.textContent = title;

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "pr-notes-add-entry";
    addBtn.textContent = "+";
    addBtn.setAttribute("aria-label", `Add ${title} entry`);
    addBtn.title = `Add ${title} entry`;

    header.appendChild(titleSpan);
    header.appendChild(addBtn);
    label.appendChild(header);

    const list = document.createElement("div");
    list.className = "pr-notes-multi-list";
    label.appendChild(list);

    const entries = [];

    const addEntry = (initialValue = "") => {
      const row = document.createElement("div");
      row.className = "pr-notes-multi-row";

      const input = document.createElement("input");
      input.type = "text";
      input.className = `pr-notes-input pr-notes-multi-input ${inputClassName}`;
      input.placeholder = placeholder;
      input.value = String(initialValue ?? "");
      input.addEventListener("input", () => onChange());

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "pr-notes-remove-entry";
      removeBtn.textContent = "-";
      removeBtn.setAttribute("aria-label", `Remove ${title} entry`);
      removeBtn.title = `Remove ${title} entry`;

      const entryRef = { row, input };
      removeBtn.onclick = () => {
        if (entries.length <= 1) {
          input.value = "";
          onChange();
          return;
        }
        const idx = entries.indexOf(entryRef);
        if (idx !== -1) {
          entries.splice(idx, 1);
        }
        row.parentNode && row.parentNode.removeChild(row);
        onChange();
      };

      row.appendChild(input);
      row.appendChild(removeBtn);
      list.appendChild(row);
      entries.push(entryRef);
      return entryRef;
    };

    values.forEach((value) => {
      addEntry(value);
    });

    if (!entries.length) {
      addEntry("");
    }

    addBtn.onclick = () => {
      addEntry("");
      onChange();
    };

    return {
      label,
      getValues: () =>
        entries.map((entry) => String(entry.input.value || "").trim()).filter(Boolean),
      setValues: (nextValues) => {
        const normalized = Array.isArray(nextValues) && nextValues.length
          ? nextValues
          : [""];

        while (entries.length) {
          const current = entries.pop();
          current?.row?.parentNode?.removeChild(current.row);
        }

        normalized.forEach((value) => {
          addEntry(value);
        });
      },
    };
  };

  const hasNotesChanges = ({
    commentRows,
    originalCommentCount,
    otherTextarea,
    difficultySelect,
    analysisTextarea,
    rallyStoriesField,
    rallyLinksField,
    originalRallyStoriesValues,
    originalRallyLinksValues,
  }) => {
    if (commentRows.length !== originalCommentCount) {
      return true;
    }
    if (otherTextarea.value !== (otherTextarea.dataset.originalValue ?? "")) {
      return true;
    }
    if (
      difficultySelect.value !== (difficultySelect.dataset.originalValue ?? "")
    ) {
      return true;
    }
    if (
      !areStringListsEqual(
        rallyStoriesField.getValues(),
        originalRallyStoriesValues,
      )
    ) {
      return true;
    }
    if (
      !areStringListsEqual(
        rallyLinksField.getValues(),
        originalRallyLinksValues,
      )
    ) {
      return true;
    }
    if (
      analysisTextarea.value !== (analysisTextarea.dataset.originalValue ?? "")
    ) {
      return true;
    }
    return commentRows.some(
      ({ authorSelect, toneSelect, noteTextarea }) =>
        authorSelect.value !== (authorSelect.dataset.originalValue ?? "") ||
        toneSelect.value !== (toneSelect.dataset.originalValue ?? "Neutral") ||
        noteTextarea.value !== (noteTextarea.dataset.originalValue ?? ""),
    );
  };

  const buildNotesPayload = ({
    commentRows,
    otherNotes,
    prDifficulty,
    rallyStories,
    rallyLinks,
    analysisOfPr,
  }) => ({
    comments: commentRows.map(({ id, authorSelect, toneSelect, noteTextarea }) => ({
      id,
      author: authorSelect.value,
      tone: toneSelect.value,
      note: noteTextarea.value,
    })),
    otherNotes,
    prDifficulty,
    rallyStories,
    rallyLinks,
    analysisOfPr,
  });

  const stampOriginalCommentValues = (commentRows) => {
    commentRows.forEach(({ authorSelect, toneSelect, noteTextarea }) => {
      authorSelect.dataset.originalValue = authorSelect.value;
      toneSelect.dataset.originalValue = toneSelect.value;
      noteTextarea.dataset.originalValue = noteTextarea.value;
    });
  };

  const createPrNotesHelpers = () => ({
    normalizeNotesListForUi,
    createMultiEntryField,
    hasNotesChanges,
    buildNotesPayload,
    stampOriginalCommentValues,
  });

  return {
    createPrNotesHelpers,
  };
});
