/** @jest-environment jsdom */

const {
  createPrActivityEventDescriptionHelpers,
} = require("./pr-activity-event-description.helpers.js");

describe("pr activity event description helpers", () => {
  test("given a review event with state, when creating fragment, then actor identity node and review suffix are rendered", () => {
    const actorNode = document.createElement("span");
    actorNode.textContent = "Alison Hall";

    const { createActivityEventDescriptionFragment } =
      createPrActivityEventDescriptionHelpers({
        createActorIdentityElement: () => actorNode,
        documentRef: document,
      });

    const fragment = createActivityEventDescriptionFragment(
      { type: "review", actor: "ahall236_uhg", state: "COMMENTED" },
      {},
      {},
    );

    const host = document.createElement("div");
    host.appendChild(fragment);

    expect(host.textContent).toBe("Alison Hall review (COMMENTED)");
  });

  test("given a thread comment event, when creating fragment, then thread comment text is used", () => {
    const actorNode = document.createElement("span");
    actorNode.textContent = "PR Author";

    const { createActivityEventDescriptionFragment } =
      createPrActivityEventDescriptionHelpers({
        createActorIdentityElement: () => actorNode,
        documentRef: document,
      });

    const fragment = createActivityEventDescriptionFragment(
      { type: "comment", channel: "thread", actor: "pr-author" },
      {},
      {},
    );

    const host = document.createElement("div");
    host.appendChild(fragment);

    expect(host.textContent).toBe("PR Author thread comment");
  });

  test("given an unknown event type, when creating fragment, then fallback type label is appended", () => {
    const actorNode = document.createElement("span");
    actorNode.textContent = "Bot";

    const { createActivityEventDescriptionFragment } =
      createPrActivityEventDescriptionHelpers({
        createActorIdentityElement: () => actorNode,
        documentRef: document,
      });

    const fragment = createActivityEventDescriptionFragment(
      { type: "sync", actor: "build-bot" },
      {},
      {},
    );

    const host = document.createElement("div");
    host.appendChild(fragment);

    expect(host.textContent).toBe("Bot sync");
  });
});
