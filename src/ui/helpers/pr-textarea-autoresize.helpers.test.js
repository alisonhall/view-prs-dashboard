const { autoResizeTextarea } = require("./pr-textarea-autoresize.helpers.js");

describe("pr textarea autoresize helper", () => {
  test("given an element, when resizing, then its height is reset then set to its scrollHeight", () => {
    const el = { style: { height: "40px" } };
    Object.defineProperty(el, "scrollHeight", { value: 120 });
    autoResizeTextarea(el);
    expect(el.style.height).toBe("120px");
  });
});
