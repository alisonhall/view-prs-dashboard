/** @jest-environment jsdom */

const {
  createPrMarkdownRenderHelpers,
} = require("./pr-markdown-render.helpers.ts");

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

    expect(renderMarkdownAsHtml("  hello  ")).toBe(`<div class="md-plain">hello</div>`);
    expect(renderMarkdownAsHtml('<img src=x onerror="alert(1)">')).toBe(
      `<div class="md-plain">&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</div>`,
    );
  });

  test("given no window.DOMPurify, when rendering, then it fails closed to escaped text instead of unsanitized HTML", () => {
    window.marked = realMarked;
    delete window.DOMPurify;
    const { renderMarkdownAsHtml } = createPrMarkdownRenderHelpers();

    expect(renderMarkdownAsHtml("**bold** <script>alert(1)</script>")).toBe(
      `<div class="md-plain">**bold** &lt;script&gt;alert(1)&lt;/script&gt;</div>`,
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
    expect(html).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer">docs</a>');
    expect(html).toContain("const a = 1 &lt; 2;");
  });

  test("given a line break within a paragraph, when rendering, then it stays a line break, as on GitHub", () => {
    window.marked = realMarked;
    const { renderMarkdownAsHtml } = createPrMarkdownRenderHelpers();

    expect(renderMarkdownAsHtml("line one\nline two\n\nnext paragraph")).toBe("<p>line one<br>line two</p>\n<p>next paragraph</p>\n");
    // Not in code: its lines are kept as they are.
    expect(renderMarkdownAsHtml("```\na\nb\n```")).toBe("<pre><code>a\nb\n</code></pre>\n");
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

  test("given an inline style that could overlay the page, when rendering, then the style attribute is removed but the text kept", () => {
    window.marked = realMarked;
    const { renderMarkdownAsHtml } = createPrMarkdownRenderHelpers();

    const html = renderMarkdownAsHtml(
      '<div style="position:fixed;inset:0;background:#fff;z-index:9999">Session expired, sign in</div>',
    );

    expect(html).toContain("Session expired, sign in");
    expect(html).not.toMatch(/style=|position:\s*fixed/i);
  });

  test("given class or id attributes, when rendering, then they are removed so a comment can't borrow the app's fixed-position classes or duplicate its ids", () => {
    window.marked = realMarked;
    const { renderMarkdownAsHtml } = createPrMarkdownRenderHelpers();

    const html = renderMarkdownAsHtml(
      '<div class="pr-json-modal" id="status">Viewer : someone-else</div>\n\n```js\nconst a = 1;\n```',
    );

    expect(html).toContain("Viewer : someone-else");
    expect(html).toContain("const a = 1;");
    expect(html).not.toMatch(/class=|id=/i);
  });

  test("given an expired GitHub image URL in the parsed html, when rendering, then the img tag is replaced with a placeholder that keeps its class", () => {
    window.marked = {
      parse: () =>
        `<img src="https://private-user-images.githubusercontent.com/1/2.png" alt="x">`,
    };
    const { renderMarkdownAsHtml } = createPrMarkdownRenderHelpers();

    const html = renderMarkdownAsHtml("![x](y)");
    expect(html).toContain("Image unavailable");
    expect(html).toContain('class="md-image-expired"');
    expect(html).not.toContain("<img");
  });

  test("given links, when rendering, then they open in a new tab without an opener (not taking the dashboard's tab away), except links within the text", () => {
    window.marked = realMarked;
    const { renderMarkdownAsHtml } = createPrMarkdownRenderHelpers();
    const container = document.createElement("div");
    container.innerHTML = renderMarkdownAsHtml('See [the issue](https://github.com/acme/app/issues/1), <a href="https://example.com" target="_self">this</a> and [below](#notes).');
    const [issue, raw, within] = container.querySelectorAll("a");

    expect(issue.getAttribute("target")).toBe("_blank");
    expect(issue.getAttribute("rel")).toBe("noopener noreferrer");
    expect(raw.getAttribute("target")).toBe("_blank");
    expect(raw.getAttribute("rel")).toBe("noopener noreferrer");
    expect(within.getAttribute("href")).toBe("#notes");
    expect(within.hasAttribute("target")).toBe(false);
  });

  describe("GitHub attachments", () => {
    const id = "af1d5a16-8556-4bd3-8d5b-079f77f86d33";
    const asset = `https://github.com/user-attachments/assets/${id}`;
    const source = { repo: "acme/app", prNumber: "7" };
    const proxied = (url) => `/view-prs/attachment?url=${encodeURIComponent(url)}&repo=acme%2Fapp&prNumber=7`;
    const render = (text, withSource = source) => {
      window.marked = realMarked;
      const container = document.createElement("div");
      container.innerHTML = createPrMarkdownRenderHelpers().renderMarkdownAsHtml(text, withSource || undefined);
      return container;
    };

    test("given the PR, an attachment image - markdown, HTML or an old signed link - comes through the server; others stay as they are", () => {
      const signed = `https://private-user-images.githubusercontent.com/1/2-${id}.png?jwt=old`;
      const container = render(`![shot](${asset})\n\n<img alt="html" src="${asset}">\n\n![old](${signed})\n\n![badge](https://img.shields.io/badge/x-y-green)`);
      const images = [...container.querySelectorAll("img")];

      expect(images.map((image) => image.getAttribute("src"))).toEqual([proxied(asset), proxied(asset), proxied(signed), "https://img.shields.io/badge/x-y-green"]);
      expect(images[0].getAttribute("alt")).toBe("shot");
      expect(images[0].getAttribute("loading")).toBe("lazy");
      expect(container.querySelector(".md-image-expired")).toBeNull();
    });

    test("given the PR, a bare attachment link alone in a paragraph is a video, with its GitHub link to fall back on; one among other text stays a link", () => {
      const container = render(`Before.\n\n${asset}\n\nSee ${asset} too.`);
      const video = container.querySelector("video");

      expect(video.getAttribute("src")).toBe(proxied(asset));
      expect(video.hasAttribute("controls")).toBe(true);
      expect(video.getAttribute("preload")).toBe("metadata");
      expect(video.className).toBe("md-video");
      expect(video.querySelector("a").getAttribute("href")).toBe(asset);
      expect(container.querySelectorAll("video")).toHaveLength(1);
      expect(container.querySelector("p:last-child a").getAttribute("href")).toBe(asset);
    });

    test("without the PR, an attachment image is the placeholder and a bare link stays a link", () => {
      const container = render(`![shot](${asset})\n\n${asset}`, null);
      expect(container.querySelector("img")).toBeNull();
      expect(container.querySelector(".md-image-expired")).toHaveTextContent("[image unavailable]");
      expect(container.querySelector("video")).toBeNull();
      expect(container.querySelector("a").getAttribute("href")).toBe(asset);
    });
  });

  test("given window.marked.parse throws, when rendering, then the trimmed text is returned escaped and a warning is logged", () => {
    window.marked = {
      parse: () => {
        throw new Error("boom");
      },
    };
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { renderMarkdownAsHtml } = createPrMarkdownRenderHelpers();

    expect(renderMarkdownAsHtml("  <b>hello</b>  ")).toBe(`<div class="md-plain">&lt;b&gt;hello&lt;/b&gt;</div>`);
    expect(warnSpy).toHaveBeenCalledWith("Failed to render markdown", expect.any(Error));
    warnSpy.mockRestore();
  });
});
