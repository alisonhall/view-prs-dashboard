/** @jest-environment jsdom */

const { createPrDomResetHelpers } = require("./pr-dom-reset.helpers.js");

describe("pr dom reset helpers", () => {
  test("given element with child nodes, when clearing element contents, then children and inner html are cleared", () => {
    document.body.innerHTML = `<div id="host"><span>a</span><span>b</span></div>`;
    const host = document.getElementById("host");
    const { clearElementContents } = createPrDomResetHelpers();

    clearElementContents(host);

    expect(host.innerHTML).toBe("");
    expect(host.children.length).toBe(0);
  });

  test("given null element, when clearing element contents, then helper exits safely", () => {
    const { clearElementContents } = createPrDomResetHelpers();

    expect(() => clearElementContents(null)).not.toThrow();
  });

  test("given non-dom fallback shape, when clearing element contents, then children array fallback is supported", () => {
    const element = {
      children: [{ id: 1 }],
      innerHTML: "<span>x</span>",
    };
    const { clearElementContents } = createPrDomResetHelpers();

    clearElementContents(element);

    expect(element.children).toEqual([]);
    expect(element.innerHTML).toBe("");
  });
});
