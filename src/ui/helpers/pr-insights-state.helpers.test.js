/** @jest-environment jsdom */

const {
  createPrInsightsStateHelpers,
} = require("./pr-insights-state.helpers.js");

describe("pr insights state helpers", () => {
  const createHelpers = () =>
    createPrInsightsStateHelpers({
      collectNodesByClass: (root, className) =>
        root && typeof root.querySelectorAll === "function"
          ? Array.from(root.querySelectorAll(`.${className}`))
          : [],
      collectNodesByTag: (root, tagName) =>
        root && typeof root.querySelectorAll === "function"
          ? Array.from(root.querySelectorAll(String(tagName || "")))
          : [],
      readElementAttribute: (element, name) =>
        element && typeof element.getAttribute === "function"
          ? String(element.getAttribute(name) || "")
          : "",
    });

  test("given expanded insight toggle buttons, when capturing expanded state, then only expanded PR numbers are included", () => {
    document.body.innerHTML = `
      <div id="host">
        <button class="row-insights-toggle" data-pr-number="101" aria-expanded="true"></button>
        <button class="row-insights-toggle" data-pr-number="102" aria-expanded="false"></button>
      </div>
    `;
    const host = document.getElementById("host");
    const { captureExpandedInsightsState } = createHelpers();

    const state = captureExpandedInsightsState(host);

    expect(state instanceof Map).toBe(true);
    expect(state.get("101")).toBe(true);
    expect(state.has("102")).toBe(false);
  });

  test("given details panels, when capturing open inner sections state, then open detail keys are stored by PR number", () => {
    document.body.innerHTML = `
      <div id="host">
        <div class="row-insights-content" data-pr-number="101">
          <details data-insight-key="summary" open></details>
          <details data-insight-key="notes"></details>
        </div>
      </div>
    `;
    const host = document.getElementById("host");
    const { captureOpenInnerInsightSectionsState } = createHelpers();

    const state = captureOpenInnerInsightSectionsState(host);

    expect(state.get("101") instanceof Set).toBe(true);
    expect(state.get("101").has("summary")).toBe(true);
    expect(state.get("101").has("notes")).toBe(false);
  });

  test("given collapsed toggles and saved expanded state, when restoring expanded state, then matching toggle click handlers are invoked", () => {
    document.body.innerHTML = `
      <div id="host">
        <button class="row-insights-toggle" data-pr-number="101" aria-expanded="false"></button>
      </div>
    `;
    const host = document.getElementById("host");
    const button = host.querySelector(".row-insights-toggle");
    const onClick = jest.fn();
    button.onclick = onClick;

    const { restoreExpandedInsightsState } = createHelpers();
    restoreExpandedInsightsState(host, new Map([["101", true]]));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("given saved open keys and closed details, when restoring open inner sections state, then matching details are reopened", () => {
    document.body.innerHTML = `
      <div id="host">
        <div class="row-insights-content" data-pr-number="101">
          <details data-insight-key="summary"></details>
          <details data-insight-key="notes"></details>
        </div>
      </div>
    `;
    const host = document.getElementById("host");
    const details = host.querySelector("details[data-insight-key='summary']");

    const { restoreOpenInnerInsightSectionsState } = createHelpers();
    restoreOpenInnerInsightSectionsState(host, new Map([["101", new Set(["summary"])]]));

    expect(details.open).toBe(true);
    expect(details.getAttribute("open")).toBe("");
  });
});
