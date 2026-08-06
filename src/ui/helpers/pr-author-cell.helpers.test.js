/** @jest-environment jsdom */

const {
  createPrAuthorCellHelpers,
} = require("./pr-author-cell.helpers.js");

describe("pr author cell helpers", () => {
  test("given author identity and notes, when creating author cell, then actor node and notes indicator text are rendered", () => {
    const helpers = createPrAuthorCellHelpers({
      getPreferredActorKey: (login, name) => String(login || name || "").trim(),
      createActorIdentityElement: ({ fallbackName, className }) => {
        const node = document.createElement("div");
        node.className = `${className} actor-identity-pr-author`;
        node.textContent = String(fallbackName || "");
        return node;
      },
      getManualNotesSummary: () => ({
        hasNotes: true,
        commentsCount: 2,
        hasOtherNotes: true,
      }),
      documentRef: document,
    });

    const result = helpers.createAuthorCell({}, {
      authorLogin: "author-login",
      author: "Alison Hall",
    }, {});

    expect(result?.querySelector(".author-cell-name")?.textContent).toBe("Alison Hall");
    expect(String(result?.querySelector(".author-notes-indicator")?.className || "")).toContain(
      "author-notes-indicator-has",
    );
    expect(result?.querySelector(".author-notes-indicator")?.textContent).toBe("📝 Notes");
    expect(result?.querySelector(".author-notes-indicator")?.title).toBe(
      "2 manual comments + other notes",
    );
  });

  test("given no author key, when creating author cell, then dash placeholder is shown", () => {
    const helpers = createPrAuthorCellHelpers({
      getPreferredActorKey: () => "",
      createActorIdentityElement: () => null,
      getManualNotesSummary: () => ({ hasNotes: false, commentsCount: 0, hasOtherNotes: false }),
      documentRef: document,
    });

    const result = helpers.createAuthorCell({}, { authorLogin: "", author: "" }, {});

    expect(result?.querySelector(".author-cell-name")?.textContent).toBe("-");
    expect(String(result?.querySelector(".author-notes-indicator")?.className || "")).toContain(
      "author-notes-indicator-none",
    );
  });

  test("given one manual note and no other notes, when creating author cell, then singular notes title is used", () => {
    const helpers = createPrAuthorCellHelpers({
      getPreferredActorKey: (login) => String(login || "").trim(),
      createActorIdentityElement: ({ className }) => {
        const node = document.createElement("div");
        node.className = className;
        node.textContent = "Author";
        return node;
      },
      getManualNotesSummary: () => ({ hasNotes: true, commentsCount: 1, hasOtherNotes: false }),
      documentRef: document,
    });

    const result = helpers.createAuthorCell({}, { authorLogin: "author" }, {});

    expect(result?.querySelector(".author-notes-indicator")?.title).toBe(
      "1 manual comment",
    );
  });
});
