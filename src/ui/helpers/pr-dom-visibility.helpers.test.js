/** @jest-environment jsdom */

const {
  createPrDomVisibilityHelpers,
} = require("./pr-dom-visibility.helpers.js");

describe("pr dom visibility helpers", () => {
  test("given nested details ancestors, when expanding ancestor details, then each details ancestor is opened", () => {
    document.body.innerHTML = `
      <details id="outer">
        <div>
          <details id="inner">
            <div id="target"></div>
          </details>
        </div>
      </details>
    `;
    const target = document.getElementById("target");
    const outer = document.getElementById("outer");
    const inner = document.getElementById("inner");

    const { expandAncestorDetailsElements } = createPrDomVisibilityHelpers();
    expandAncestorDetailsElements(target);

    expect(outer.open).toBe(true);
    expect(outer.getAttribute("open")).toBe("");
    expect(inner.open).toBe(true);
    expect(inner.getAttribute("open")).toBe("");
  });

  test("given hidden insights row and collapsed toggle, when ensuring row visibility, then row toggle onclick is invoked", () => {
    document.body.innerHTML = `
      <table>
        <tbody>
          <tr id="pr-row"><td><button class="row-insights-toggle"></button></td></tr>
          <tr id="insights-row" hidden><td><span id="target"></span></td></tr>
        </tbody>
      </table>
    `;

    const toggle = document.querySelector(".row-insights-toggle");
    const target = document.getElementById("target");
    const onClick = jest.fn();
    toggle.onclick = onClick;
    toggle.setAttribute("aria-expanded", "false");

    const { ensureInsightsRowVisibleForElement } = createPrDomVisibilityHelpers({
      readElementAttribute: (element, attribute) =>
        element.getAttribute(attribute),
    });

    ensureInsightsRowVisibleForElement(target);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("given hidden insights row and already-expanded toggle, when ensuring row visibility, then toggle onclick is not invoked", () => {
    document.body.innerHTML = `
      <table>
        <tbody>
          <tr id="pr-row"><td><button class="row-insights-toggle"></button></td></tr>
          <tr id="insights-row" hidden><td><span id="target"></span></td></tr>
        </tbody>
      </table>
    `;

    const toggle = document.querySelector(".row-insights-toggle");
    const target = document.getElementById("target");
    const onClick = jest.fn();
    toggle.onclick = onClick;
    toggle.setAttribute("aria-expanded", "true");

    const { ensureInsightsRowVisibleForElement } = createPrDomVisibilityHelpers({
      readElementAttribute: (element, attribute) =>
        element.getAttribute(attribute),
    });

    ensureInsightsRowVisibleForElement(target);
    expect(onClick).not.toHaveBeenCalled();
  });

  test("given non-hidden or missing row context, when ensuring row visibility, then helper exits without invoking toggle", () => {
    document.body.innerHTML = `
      <table>
        <tbody>
          <tr id="row"><td><span id="target"></span></td></tr>
        </tbody>
      </table>
    `;

    const target = document.getElementById("target");
    const { ensureInsightsRowVisibleForElement } = createPrDomVisibilityHelpers();

    expect(() => ensureInsightsRowVisibleForElement(target)).not.toThrow();
    expect(() => ensureInsightsRowVisibleForElement(null)).not.toThrow();
  });
});
