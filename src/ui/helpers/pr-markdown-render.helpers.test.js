/** @jest-environment jsdom */

const {
  createPrMarkdownRenderHelpers,
} = require("./pr-markdown-render.helpers.js");

describe("pr markdown render helpers", () => {
  const originalMarked = window.marked;

  afterEach(() => {
    window.marked = originalMarked;
  });

  test("given no window.marked, when rendering, then the raw trimmed text is returned", () => {
    delete window.marked;
    const { renderMarkdownAsHtml } = createPrMarkdownRenderHelpers();

    expect(renderMarkdownAsHtml("  hello  ")).toBe("hello");
  });

  test("given empty/falsy markdown, when rendering, then an empty string is returned without calling marked", () => {
    window.marked = { parse: jest.fn() };
    const { renderMarkdownAsHtml } = createPrMarkdownRenderHelpers();

    expect(renderMarkdownAsHtml("")).toBe("");
    expect(window.marked.parse).not.toHaveBeenCalled();
  });

  test("given markdown and window.marked available, when rendering, then the parsed html is returned", () => {
    window.marked = { parse: (text) => `<p>${text}</p>` };
    const { renderMarkdownAsHtml } = createPrMarkdownRenderHelpers();

    expect(renderMarkdownAsHtml("hello")).toBe("<p>hello</p>");
  });

  test("given an expired GitHub image URL in the parsed html, when rendering, then the img tag is replaced with a placeholder", () => {
    window.marked = {
      parse: () =>
        `<img src="https://private-user-images.githubusercontent.com/1/2.png" alt="x">`,
    };
    const { renderMarkdownAsHtml } = createPrMarkdownRenderHelpers();

    expect(renderMarkdownAsHtml("![x](y)")).toContain("Image unavailable");
    expect(renderMarkdownAsHtml("![x](y)")).not.toContain("<img");
  });

  test("given window.marked.parse throws, when rendering, then the raw trimmed text is returned and a warning is logged", () => {
    window.marked = {
      parse: () => {
        throw new Error("boom");
      },
    };
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { renderMarkdownAsHtml } = createPrMarkdownRenderHelpers();

    expect(renderMarkdownAsHtml("  hello  ")).toBe("hello");
    expect(warnSpy).toHaveBeenCalledWith("Failed to render markdown", expect.any(Error));
    warnSpy.mockRestore();
  });
});
