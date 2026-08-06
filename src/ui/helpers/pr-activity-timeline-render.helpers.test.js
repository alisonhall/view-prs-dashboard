/** @jest-environment jsdom */

const {
  createPrActivityTimelineRenderHelpers,
} = require("./pr-activity-timeline-render.helpers.js");

describe("pr activity timeline render helpers", () => {
  test("given empty timeline items, when rendering, then a dash placeholder is shown", () => {
    const container = document.createElement("td");
    const { renderTimelineItems } = createPrActivityTimelineRenderHelpers({
      createActorIdentityElement: () => null,
    });

    renderTimelineItems({ container, items: [] });

    expect(container.textContent).toBe("-");
  });

  test("given one timeline item with count 1, when rendering, then actor and singular label are shown", () => {
    const container = document.createElement("td");
    const { renderTimelineItems } = createPrActivityTimelineRenderHelpers({
      createActorIdentityElement: ({ fallbackName }) => {
        const node = document.createElement("span");
        node.textContent = String(fallbackName || "");
        return node;
      },
    });

    renderTimelineItems({
      container,
      items: [
        {
          actor: "dev1",
          fallbackName: "Dev One",
          label: "comment",
          count: 1,
        },
      ],
      row: {},
      actorsMap: {},
    });

    expect(container.textContent).toBe("Dev One comment");
  });

  test("given multiple timeline items and plural count, when rendering, then semicolon-separated activity text is shown", () => {
    const container = document.createElement("td");
    const { renderTimelineItems } = createPrActivityTimelineRenderHelpers({
      createActorIdentityElement: ({ fallbackName }) => {
        const node = document.createElement("span");
        node.textContent = String(fallbackName || "");
        return node;
      },
    });

    renderTimelineItems({
      container,
      items: [
        {
          actor: "dev1",
          fallbackName: "Dev One",
          label: "comment",
          count: 1,
        },
        {
          actor: "dev2",
          fallbackName: "Dev Two",
          label: "commits",
          count: 2,
        },
      ],
      row: {},
      actorsMap: {},
    });

    expect(container.textContent).toBe("Dev One comment; Dev Two commits (2)");
  });
});
