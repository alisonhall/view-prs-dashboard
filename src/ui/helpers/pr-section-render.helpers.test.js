/** @jest-environment jsdom */

const {
  createPrSectionRenderHelpers,
} = require("./pr-section-render.helpers.js");

describe("pr section render helpers", () => {
  test("given section configs and section builder, when appending sections, then rendered sections are appended in order", () => {
    const sectionsHost = document.createElement("div");
    const buildPrSection = jest.fn((config) => {
      const section = document.createElement("section");
      section.setAttribute("data-section-key", config.sectionKey);
      section.textContent = config.title;
      return section;
    });

    const { appendPrSections } = createPrSectionRenderHelpers({
      buildPrSection,
    });

    appendPrSections(sectionsHost, [
      { sectionKey: "open", title: "Open PRs" },
      { sectionKey: "merged", title: "Latest Merged PRs" },
    ]);

    expect(buildPrSection).toHaveBeenCalledTimes(2);
    expect(buildPrSection).toHaveBeenNthCalledWith(1, {
      sectionKey: "open",
      title: "Open PRs",
    });
    expect(buildPrSection).toHaveBeenNthCalledWith(2, {
      sectionKey: "merged",
      title: "Latest Merged PRs",
    });
    expect(
      Array.from(sectionsHost.children).map((node) =>
        node.getAttribute("data-section-key"),
      ),
    ).toEqual(["open", "merged"]);
  });

  test("given non-array section configs, when appending sections, then no sections are appended", () => {
    const sectionsHost = document.createElement("div");
    const buildPrSection = jest.fn();
    const { appendPrSections } = createPrSectionRenderHelpers({
      buildPrSection,
    });

    appendPrSections(sectionsHost, null);

    expect(buildPrSection).not.toHaveBeenCalled();
    expect(sectionsHost.children.length).toBe(0);
  });

  test("given missing section builder, when appending sections, then append operation throws", () => {
    const sectionsHost = document.createElement("div");
    const { appendPrSections } = createPrSectionRenderHelpers();

    expect(() => {
      appendPrSections(sectionsHost, [{ sectionKey: "open", title: "Open PRs" }]);
    }).toThrow(TypeError);
  });
});
