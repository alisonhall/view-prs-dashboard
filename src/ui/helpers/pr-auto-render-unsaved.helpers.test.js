/** @jest-environment jsdom */

const {
  createPrAutoRenderUnsavedHelpers,
} = require("./pr-auto-render-unsaved.helpers.js");

describe("auto render unsaved helpers", () => {
  const createHelpers = ({ getDirtyNotesPrNumbers } = {}) =>
    createPrAutoRenderUnsavedHelpers({
      getOptionalElementById: (id) => document.getElementById(id),
      readElementAttribute: (element, attributeName) =>
        element && typeof element.getAttribute === "function"
          ? String(element.getAttribute(attributeName) || "").trim()
          : "",
      getDirtyNotesPrNumbers,
    });

  test("given tracked fields and dirty notes PR numbers, when collecting blocking PR numbers, then unique sorted PR numbers are returned", () => {
    document.body.innerHTML = `
      <section id="pr-sections">
        <div class="row-insights-content" data-pr-number="12">
          <input id="dirty-12" data-original-value="a" value="b" />
        </div>
        <div class="row-insights-content" data-pr-number="5">
          <input id="clean-5" data-original-value="x" value="x" />
        </div>
      </section>
    `;

    const {
      getDirtyTrackedFields,
      getUnsavedNotesPrNumbers,
      getBlockingPrNumbers,
    } = createHelpers({ getDirtyNotesPrNumbers: () => ["7", "12"] });

    expect(getDirtyTrackedFields().map((item) => item.id)).toEqual(["dirty-12"]);
    expect(getUnsavedNotesPrNumbers()).toEqual(["7", "12"]);
    expect(getBlockingPrNumbers()).toEqual(["7", "12"]);
  });

  test("given no getDirtyNotesPrNumbers hook, when reading unsaved notes PR numbers, then it is a safe empty default", () => {
    const { getUnsavedNotesPrNumbers } = createHelpers();

    expect(getUnsavedNotesPrNumbers()).toEqual([]);
  });

  test("given malformed values from getDirtyNotesPrNumbers, when reading unsaved notes PR numbers, then only digit-only values are kept", () => {
    const { getUnsavedNotesPrNumbers } = createHelpers({
      getDirtyNotesPrNumbers: () => ["12", "abc", " 7 ", ""],
    });

    expect(getUnsavedNotesPrNumbers()).toEqual(["12", "7"]);
  });

  test("given a PR with dirty field and notes controls, when resolving first unsaved element, then dirty field wins then save button fallback is used", () => {
    document.body.innerHTML = `
      <section id="pr-sections">
        <div class="row-insights-content" data-pr-number="12">
          <input id="dirty-target" data-original-value="a" value="b" />
        </div>
        <div class="pr-notes-section" data-pr-number="13">
          <button class="pr-notes-save" id="save-13">Save</button>
          <textarea id="notes-13"></textarea>
        </div>
      </section>
    `;

    const { getFirstUnsavedElementForPrNumber } = createHelpers({
      getDirtyNotesPrNumbers: () => ["13"],
    });

    expect(getFirstUnsavedElementForPrNumber("12")?.id).toBe("dirty-target");
    expect(getFirstUnsavedElementForPrNumber("13")?.id).toBe("save-13");
    expect(getFirstUnsavedElementForPrNumber("999")).toBeNull();
  });

  test("given a dirty notes section with no save button, when resolving first unsaved element, then the first preferred field is used, falling back to the section itself", () => {
    document.body.innerHTML = `
      <section id="pr-sections">
        <div class="pr-notes-section" data-pr-number="14">
          <textarea id="notes-14"></textarea>
        </div>
        <div class="pr-notes-section" data-pr-number="15"></div>
      </section>
    `;

    const { getFirstUnsavedElementForPrNumber } = createHelpers({
      getDirtyNotesPrNumbers: () => ["14", "15"],
    });

    expect(getFirstUnsavedElementForPrNumber("14")?.id).toBe("notes-14");
    expect(getFirstUnsavedElementForPrNumber("15")?.dataset?.prNumber).toBe("15");
  });

  test("given malformed PR values, when normalizing PR numbers, then only digits are accepted", () => {
    const { normalizePrNumber } = createHelpers();

    expect(normalizePrNumber("42")).toBe("42");
    expect(normalizePrNumber(" 007 ")).toBe("007");
    expect(normalizePrNumber("abc")).toBe("");
  });
});
