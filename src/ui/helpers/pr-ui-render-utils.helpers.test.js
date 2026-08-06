/** @jest-environment jsdom */

const {
  createPrUiRenderUtilsHelpers,
} = require("./pr-ui-render-utils.helpers.js");

describe("pr ui render utils helpers", () => {
  test("given title display markers, when parsing marker state, then normalized marker value is returned", () => {
    const helpers = createPrUiRenderUtilsHelpers();

    expect(helpers.parseMarkerState("feature [CHK:pass]", "CHK")).toBe("PASS");
    expect(helpers.parseMarkerState("feature [MRG: merged ]", "MRG")).toBe("MERGED");
    expect(helpers.parseMarkerState("feature", "CHK")).toBe("-");
  });

  test("given circular input, when safe stringify is used, then fallback string conversion is returned", () => {
    const helpers = createPrUiRenderUtilsHelpers();
    const circular = {};
    circular.self = circular;

    const result = helpers.safeJsonStringify(circular);

    expect(typeof result).toBe("string");
    expect(result).toContain("[object Object]");
  });

  test("given class token toggles, when enabling and disabling tokens, then class names are updated without duplication", () => {
    const helpers = createPrUiRenderUtilsHelpers();
    const element = document.createElement("div");
    element.className = "alpha";

    helpers.setClassToken(element, "beta", true);
    helpers.setClassToken(element, "beta", true);
    expect(element.className).toBe("alpha beta");

    helpers.setClassToken(element, "beta", false);
    expect(element.className).toBe("alpha");
  });
});
