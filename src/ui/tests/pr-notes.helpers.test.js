const { createPrNotesHelpers } = require("../helpers/pr-notes.helpers.js");

class MockElement {
  constructor(tagName) {
    this.tagName = String(tagName || "").toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.className = "";
    this.textContent = "";
    this.value = "";
    this.type = "";
    this.placeholder = "";
    this.title = "";
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.onclick = null;
  }

  appendChild(child) {
    if (!child) return child;
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) {
      this.children.splice(index, 1);
      child.parentNode = null;
    }
    return child;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }

  trigger(type) {
    if (typeof this.listeners[type] === "function") {
      this.listeners[type]();
    }
  }
}

const createMockDocument = () => ({
  createElement: (tagName) => new MockElement(tagName),
});

const findByClass = (root, className) => {
  const matches = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    const classes = String(node.className || "");
    if (classes.split(/\s+/).includes(className)) {
      matches.push(node);
    }
    (node.children || []).forEach(visit);
  };
  visit(root);
  return matches;
};

describe("pr notes helpers", () => {
  const {
    normalizeNotesListForUi,
    createMultiEntryField,
    hasNotesChanges,
    buildNotesPayload,
    stampOriginalCommentValues,
  } = createPrNotesHelpers();

  test("normalizeNotesListForUi returns non-empty arrays for all inputs", () => {
    expect(normalizeNotesListForUi(["one", "", 2])).toEqual(["one", "2"]);
    expect(normalizeNotesListForUi([])).toEqual([""]);
    expect(normalizeNotesListForUi("single")).toEqual(["single"]);
    expect(normalizeNotesListForUi(null)).toEqual([""]);
  });

  test("createMultiEntryField supports add, remove, setValues, and getValues", () => {
    const document = createMockDocument();
    let onChangeCount = 0;

    const field = createMultiEntryField({
      document,
      title: "Rally story",
      placeholder: "RALLY-123",
      values: ["RALLY-1"],
      inputClassName: "rally-story-input",
      onChange: () => {
        onChangeCount += 1;
      },
    });

    const addButton = findByClass(field.label, "pr-notes-add-entry")[0];
    addButton.onclick();

    const inputsAfterAdd = findByClass(field.label, "pr-notes-multi-input");
    expect(inputsAfterAdd).toHaveLength(2);
    inputsAfterAdd[1].value = " RALLY-2 ";
    inputsAfterAdd[1].trigger("input");

    const removeButtons = findByClass(field.label, "pr-notes-remove-entry");
    removeButtons[0].onclick();

    expect(field.getValues()).toEqual(["RALLY-2"]);
    expect(onChangeCount).toBeGreaterThanOrEqual(3);

    field.setValues(["RALLY-7", "RALLY-8"]);
    expect(field.getValues()).toEqual(["RALLY-7", "RALLY-8"]);

    field.setValues([]);
    const inputsAfterReset = findByClass(field.label, "pr-notes-multi-input");
    expect(inputsAfterReset).toHaveLength(1);
    inputsAfterReset[0].value = "only-value";

    const removeAfterReset = findByClass(field.label, "pr-notes-remove-entry")[0];
    removeAfterReset.onclick();
    expect(field.getValues()).toEqual([]);
  });

  test("hasNotesChanges detects field-level changes and ignores unchanged values", () => {
    const commentRows = [
      {
        authorSelect: { value: "alice", dataset: { originalValue: "alice" } },
        toneSelect: { value: "Neutral", dataset: { originalValue: "Neutral" } },
        noteTextarea: { value: "Looks good", dataset: { originalValue: "Looks good" } },
      },
    ];

    const baselineArgs = {
      commentRows,
      originalCommentCount: 1,
      otherTextarea: { value: "", dataset: { originalValue: "" } },
      difficultySelect: { value: "", dataset: { originalValue: "" } },
      analysisTextarea: { value: "", dataset: { originalValue: "" } },
      rallyStoriesField: { getValues: () => ["RALLY-1"] },
      rallyLinksField: { getValues: () => ["https://example.test/story"] },
      originalRallyStoriesValues: ["RALLY-1"],
      originalRallyLinksValues: ["https://example.test/story"],
    };

    expect(hasNotesChanges(baselineArgs)).toBe(false);

    expect(hasNotesChanges({ ...baselineArgs, originalCommentCount: 0 })).toBe(true);
    expect(
      hasNotesChanges({
        ...baselineArgs,
        rallyStoriesField: { getValues: () => ["RALLY-2"] },
      }),
    ).toBe(true);
    expect(
      hasNotesChanges({
        ...baselineArgs,
        commentRows: [
          {
            ...commentRows[0],
            toneSelect: { value: "Concern", dataset: { originalValue: "Neutral" } },
          },
        ],
      }),
    ).toBe(true);
  });

  test("buildNotesPayload and stampOriginalCommentValues shape note rows", () => {
    const commentRows = [
      {
        id: "note-1",
        authorSelect: { value: "alice", dataset: {} },
        toneSelect: { value: "Positive", dataset: {} },
        noteTextarea: { value: "Solid approach", dataset: {} },
      },
    ];

    stampOriginalCommentValues(commentRows);
    expect(commentRows[0].authorSelect.dataset.originalValue).toBe("alice");
    expect(commentRows[0].toneSelect.dataset.originalValue).toBe("Positive");
    expect(commentRows[0].noteTextarea.dataset.originalValue).toBe("Solid approach");

    expect(
      buildNotesPayload({
        commentRows,
        otherNotes: "other",
        prDifficulty: "Medium",
        rallyStories: ["RALLY-1"],
        rallyLinks: ["https://example.test"],
        analysisOfPr: "analysis",
      }),
    ).toEqual({
      comments: [
        {
          id: "note-1",
          author: "alice",
          tone: "Positive",
          note: "Solid approach",
        },
      ],
      otherNotes: "other",
      prDifficulty: "Medium",
      rallyStories: ["RALLY-1"],
      rallyLinks: ["https://example.test"],
      analysisOfPr: "analysis",
    });
  });
});
