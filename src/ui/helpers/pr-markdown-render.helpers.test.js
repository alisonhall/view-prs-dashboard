/** @jest-environment jsdom */

const {
  createPrMarkdownRenderHelpers,
} = require("./pr-markdown-render.helpers.js");

// The real libraries the browser loads: the vendored marked UMD build (the
// npm package is ESM-only) and the dompurify package (same version as the
// vendored purify.min.js).
const realMarked = require("../vendor/marked.umd.js");
const realDOMPurify = require("dompurify");

describe("pr markdown render helpers", () => {
  const originalMarked = window.marked;
  const originalDOMPurify = window.DOMPurify;

  beforeEach(() => {
    window.DOMPurify = realDOMPurify;
  });

  afterEach(() => {
    window.marked = originalMarked;
    window.DOMPurify = originalDOMPurify;
  });

  test("given no window.marked, when rendering, then the trimmed text is returned HTML-escaped", () => {
    delete window.marked;
    const { renderMarkdownAsHtml } = createPrMarkdownRenderHelpers();

    expect(renderMarkdownAsHtml("  hello  ")).toBe("hello");
    expect(renderMarkdownAsHtml('<img src=x onerror="alert(1)">')).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
    );
  });

  test("given no window.DOMPurify, when rendering, then it fails closed to escaped text instead of unsanitized HTML", () => {
    window.marked = realMarked;
    delete window.DOMPurify;
    const { renderMarkdownAsHtml } = createPrMarkdownRenderHelpers();

    expect(renderMarkdownAsHtml("**bold** <script>alert(1)</script>")).toBe(
      "**bold** &lt;script&gt;alert(1)&lt;/script&gt;",
    );
  });

  test("given empty/falsy markdown, when rendering, then an empty string is returned without calling marked", () => {
    window.marked = { parse: jest.fn() };
    const { renderMarkdownAsHtml } = createPrMarkdownRenderHelpers();

    expect(renderMarkdownAsHtml("")).toBe("");
    expect(renderMarkdownAsHtml(null)).toBe("");
    expect(window.marked.parse).not.toHaveBeenCalled();
  });

  test("given ordinary markdown, when rendering, then it is formatted as HTML", () => {
    window.marked = realMarked;
    const { renderMarkdownAsHtml } = createPrMarkdownRenderHelpers();

    const html = renderMarkdownAsHtml(
      "**bold** and `code`\n\n- item\n\n[docs](https://example.com)\n\n```js\nconst a = 1 < 2;\n```",
    );

    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain("<li>item</li>");
    expect(html).toContain('<a href="https://example.com">docs</a>');
    expect(html).toContain("const a = 1 &lt; 2;");
  });

  test("given raw HTML in a comment, when rendering, then scripts and event handlers are stripped", () => {
    window.marked = realMarked;
    const { renderMarkdownAsHtml } = createPrMarkdownRenderHelpers();

    const html = renderMarkdownAsHtml(
      'Looks good <img src="x" onerror="alert(1)"> <script>alert(2)</script> <b onclick="alert(3)">ok</b> <iframe src="https://evil.example"></iframe>',
    );

    expect(html).toContain("Looks good");
    expect(html).toContain("<b>ok</b>");
    expect(html).not.toMatch(/onerror|onclick|<script|<iframe|alert\(/i);
  });

  test("given a javascript: link, when rendering, then the dangerous href is removed", () => {
    window.marked = realMarked;
    const { renderMarkdownAsHtml } = createPrMarkdownRenderHelpers();

    const html = renderMarkdownAsHtml('[click](javascript:alert(1)) <a href="javascript:alert(2)">raw</a>');

    expect(html).toContain("click");
    expect(html).toContain("raw");
    expect(html).not.toMatch(/javascript:/i);
  });

  test("given a form or style tag, when rendering, then it is removed like in the insights hook output", () => {
    window.marked = realMarked;
    const { renderMarkdownAsHtml } = createPrMarkdownRenderHelpers();

    const html = renderMarkdownAsHtml(
      '<style>body { display: none }</style><form action="https://evil.example"><input name="password"></form>after',
    );

    expect(html).toContain("after");
    expect(html).not.toMatch(/<style|<form/i);
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

  test("given window.marked.parse throws, when rendering, then the trimmed text is returned escaped and a warning is logged", () => {
    window.marked = {
      parse: () => {
        throw new Error("boom");
      },
    };
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { renderMarkdownAsHtml } = createPrMarkdownRenderHelpers();

    expect(renderMarkdownAsHtml("  <b>hello</b>  ")).toBe("&lt;b&gt;hello&lt;/b&gt;");
    expect(warnSpy).toHaveBeenCalledWith("Failed to render markdown", expect.any(Error));
    warnSpy.mockRestore();
  });
});
