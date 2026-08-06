/** @jest-environment jsdom */

const { createPrDomAccessHelpers } = require("./pr-dom-access.helpers.js");

describe("pr dom access helpers", () => {
  test("given document with matching id, when getting optional element by id, then matching element is returned", () => {
    document.body.innerHTML = '<div id="target"></div>';
    const helpers = createPrDomAccessHelpers({ documentRef: document });

    expect(helpers.getOptionalElementById("target")).toBe(
      document.getElementById("target"),
    );
  });

  test("given missing document or lookup error, when getting optional element by id, then null is returned", () => {
    const helpers = createPrDomAccessHelpers({
      documentRef: {
        getElementById: () => {
          throw new Error("boom");
        },
      },
    });

    expect(helpers.getOptionalElementById("target")).toBeNull();
    expect(
      createPrDomAccessHelpers({ documentRef: {} }).getOptionalElementById(
        "target",
      ),
    ).toBeNull();
  });

  test("given element attribute accessors, when reading element attribute, then getAttribute and attributes fallbacks are supported", () => {
    const helpers = createPrDomAccessHelpers();

    expect(
      helpers.readElementAttribute(
        {
          getAttribute: (name) => (name === "data-test" ? "value" : null),
        },
        "data-test",
      ),
    ).toBe("value");

    expect(
      helpers.readElementAttribute(
        { attributes: { "data-test": 123 } },
        "data-test",
      ),
    ).toBe("123");
  });
});
