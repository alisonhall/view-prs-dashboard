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

  test("given expanded and collapsed insight toggle buttons with section keys, when capturing expanded state, then both expanded and collapsed states are stored per section", () => {
    document.body.innerHTML = `
      <div id="host">
        <button class="row-insights-toggle" data-pr-number="101" data-section-key="open" aria-expanded="true"></button>
        <button class="row-insights-toggle" data-pr-number="102" data-section-key="draft" aria-expanded="false"></button>
      </div>
    `;
    const host = document.getElementById("host");
    const { captureExpandedInsightsState } = createHelpers();

    const state = captureExpandedInsightsState(host);

    expect(state instanceof Map).toBe(true);
    expect(state.get("open:101")).toBe(true);
    expect(state.get("draft:102")).toBe(false); // Now captures collapsed state too
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
        <button class="row-insights-toggle" data-pr-number="101" data-section-key="open" aria-expanded="false"></button>
      </div>
    `;
    const host = document.getElementById("host");
    const button = host.querySelector(".row-insights-toggle");
    const onClick = jest.fn();
    button.onclick = onClick;

    const { restoreExpandedInsightsState } = createHelpers();
    restoreExpandedInsightsState(host, new Map([["open:101", true]]));

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

  test("given collapsed toggle and saved collapsed state, when restoring expanded state, then toggle is NOT clicked", () => {
    document.body.innerHTML = `
      <div id="host">
        <button class="row-insights-toggle" data-pr-number="101" data-section-key="open" aria-expanded="false"></button>
      </div>
    `;
    const host = document.getElementById("host");
    const button = host.querySelector(".row-insights-toggle");
    const onClick = jest.fn();
    button.onclick = onClick;

    const { restoreExpandedInsightsState } = createHelpers();
    restoreExpandedInsightsState(host, new Map([["open:101", false]])); // Saved as closed

    expect(onClick).not.toHaveBeenCalled(); // Should NOT toggle - already matches saved state
  });

  test("given expanded toggle and saved expanded state, when restoring expanded state, then toggle is NOT clicked", () => {
    document.body.innerHTML = `
      <div id="host">
        <button class="row-insights-toggle" data-pr-number="101" data-section-key="open" aria-expanded="true"></button>
      </div>
    `;
    const host = document.getElementById("host");
    const button = host.querySelector(".row-insights-toggle");
    const onClick = jest.fn();
    button.onclick = onClick;

    const { restoreExpandedInsightsState } = createHelpers();
    restoreExpandedInsightsState(host, new Map([["open:101", true]])); // Saved as expanded

    expect(onClick).not.toHaveBeenCalled(); // Should NOT toggle - already matches saved state
  });

  test("given expanded toggle and saved collapsed state, when restoring expanded state, then toggle IS clicked", () => {
    document.body.innerHTML = `
      <div id="host">
        <button class="row-insights-toggle" data-pr-number="101" data-section-key="open" aria-expanded="true"></button>
      </div>
    `;
    const host = document.getElementById("host");
    const button = host.querySelector(".row-insights-toggle");
    const onClick = jest.fn();
    button.onclick = onClick;

    const { restoreExpandedInsightsState } = createHelpers();
    restoreExpandedInsightsState(host, new Map([["open:101", false]])); // Saved as closed

    expect(onClick).toHaveBeenCalledTimes(1); // Should toggle to match saved collapsed state
  });

  test("given same PR in multiple sections with different states, when capturing, then each section's state is preserved independently", () => {
    document.body.innerHTML = `
      <div id="host">
        <button class="row-insights-toggle" data-pr-number="123" data-section-key="needs-attention" aria-expanded="true"></button>
        <button class="row-insights-toggle" data-pr-number="123" data-section-key="in-review" aria-expanded="false"></button>
        <button class="row-insights-toggle" data-pr-number="123" data-section-key="open" aria-expanded="false"></button>
      </div>
    `;
    const host = document.getElementById("host");
    const { captureExpandedInsightsState } = createHelpers();

    const state = captureExpandedInsightsState(host);

    expect(state instanceof Map).toBe(true);
    expect(state.get("needs-attention:123")).toBe(true); // Expanded in needs-attention
    expect(state.get("in-review:123")).toBe(false); // Closed in in-review
    expect(state.get("open:123")).toBe(false); // Closed in open
  });

  test("given same PR in multiple sections, when restoring, then each section gets its own saved state", () => {
    document.body.innerHTML = `
      <div id="host">
        <button class="row-insights-toggle" data-pr-number="123" data-section-key="needs-attention" aria-expanded="false"></button>
        <button class="row-insights-toggle" data-pr-number="123" data-section-key="in-review" aria-expanded="false"></button>
        <button class="row-insights-toggle" data-pr-number="123" data-section-key="open" aria-expanded="false"></button>
      </div>
    `;
    const host = document.getElementById("host");
    const buttons = host.querySelectorAll(".row-insights-toggle");
    const onClickNeedsAttention = jest.fn();
    const onClickInReview = jest.fn();
    const onClickOpen = jest.fn();
    buttons[0].onclick = onClickNeedsAttention;
    buttons[1].onclick = onClickInReview;
    buttons[2].onclick = onClickOpen;

    const { restoreExpandedInsightsState } = createHelpers();
    restoreExpandedInsightsState(
      host,
      new Map([
        ["needs-attention:123", true], // Should expand
        ["in-review:123", false], // Should stay collapsed
        ["open:123", false], // Should stay collapsed
      ]),
    );

    expect(onClickNeedsAttention).toHaveBeenCalledTimes(1); // Toggle to expand
    expect(onClickInReview).not.toHaveBeenCalled(); // Already matches
    expect(onClickOpen).not.toHaveBeenCalled(); // Already matches
  });
});
