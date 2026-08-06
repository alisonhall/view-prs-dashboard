/** @jest-environment jsdom */

const {
  createPrAutoRenderUnsavedHelpers,
} = require("./pr-auto-render-unsaved.helpers.js");

describe("auto render unsaved helpers", () => {
  const createHelpers = () =>
    createPrAutoRenderUnsavedHelpers({
      getOptionalElementById: (id) => document.getElementById(id),
      readElementAttribute: (element, attributeName) =>
        element && typeof element.getAttribute === "function"
          ? String(element.getAttribute(attributeName) || "").trim()
          : "",
    });

  test("given tracked fields and notes sections, when collecting blocking PR numbers, then unique sorted PR numbers are returned", () => {
    document.body.innerHTML = `
      <section id="pr-sections">
        <div class="row-insights-content" data-pr-number="12">
          <input id="dirty-12" data-original-value="a" value="b" />
        </div>
        <div class="row-insights-content" data-pr-number="5">
          <input id="clean-5" data-original-value="x" value="x" />
        </div>
        <div class="pr-notes-section" data-pr-number="7" data-has-unsaved-notes="true"></div>
        <div class="pr-notes-section" data-pr-number="12" data-has-unsaved-notes="true"></div>
      </section>
    `;

    const {
      getDirtyTrackedFields,
      getUnsavedNotesSections,
      getBlockingPrNumbers,
    } = createHelpers();

    expect(getDirtyTrackedFields().map((item) => item.id)).toEqual(["dirty-12"]);
    expect(getUnsavedNotesSections()).toHaveLength(2);
    expect(getBlockingPrNumbers()).toEqual(["7", "12"]);
  });

  test("given a PR with dirty field and notes controls, when resolving first unsaved element, then dirty field wins then save button fallback is used", () => {
    document.body.innerHTML = `
      <section id="pr-sections">
        <div class="row-insights-content" data-pr-number="12">
          <input id="dirty-target" data-original-value="a" value="b" />
        </div>
        <div class="pr-notes-section" data-pr-number="13" data-has-unsaved-notes="true">
          <button class="pr-notes-save" id="save-13">Save</button>
          <textarea id="notes-13"></textarea>
        </div>
      </section>
    `;

    const { getFirstUnsavedElementForPrNumber } = createHelpers();

    expect(getFirstUnsavedElementForPrNumber("12")?.id).toBe("dirty-target");
    expect(getFirstUnsavedElementForPrNumber("13")?.id).toBe("save-13");
    expect(getFirstUnsavedElementForPrNumber("999")).toBeNull();
  });

  test("given malformed PR values, when normalizing PR numbers, then only digits are accepted", () => {
    const { normalizePrNumber } = createHelpers();

    expect(normalizePrNumber("42")).toBe("42");
    expect(normalizePrNumber(" 007 ")).toBe("007");
    expect(normalizePrNumber("abc")).toBe("");
  });
});
