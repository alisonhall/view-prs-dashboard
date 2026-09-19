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

  describe("collectPrAuthors", () => {
    const getPreferredActorKey = (login, name) => String(login || name || "").trim();

    test("given a PR author and distinct non-merge commit authors, when collecting, then the PR author comes first and each distinct commit author follows", () => {
      const { collectPrAuthors } = createPrAuthorCellHelpers({ getPreferredActorKey });

      const result = collectPrAuthors({
        authorLogin: "pr-author",
        author: "PR Author",
        commits: [
          {
            messageHeadline: "Add feature",
            authors: [{ login: "collab-1", name: "Collaborator One" }],
          },
          {
            messageHeadline: "Fix bug",
            authors: [{ login: "collab-2", name: "Collaborator Two" }],
          },
        ],
      });

      expect(result).toEqual([
        { key: "pr-author", name: "PR Author", isPrimary: true },
        { key: "collab-1", name: "Collaborator One", isPrimary: false },
        { key: "collab-2", name: "Collaborator Two", isPrimary: false },
      ]);
    });

    test("given a commit authored by the PR author, when collecting, then that commit author is not duplicated", () => {
      const { collectPrAuthors } = createPrAuthorCellHelpers({ getPreferredActorKey });

      const result = collectPrAuthors({
        authorLogin: "pr-author",
        author: "PR Author",
        commits: [
          { messageHeadline: "Add feature", authors: [{ login: "pr-author", name: "PR Author" }] },
          { messageHeadline: "Fix bug", authors: [{ login: "collab-1", name: "Collaborator One" }] },
        ],
      });

      expect(result).toEqual([
        { key: "pr-author", name: "PR Author", isPrimary: true },
        { key: "collab-1", name: "Collaborator One", isPrimary: false },
      ]);
    });

    test("given the same commit author appears on multiple commits, when collecting, then they are only included once", () => {
      const { collectPrAuthors } = createPrAuthorCellHelpers({ getPreferredActorKey });

      const result = collectPrAuthors({
        authorLogin: "pr-author",
        author: "PR Author",
        commits: [
          { messageHeadline: "Add feature", authors: [{ login: "collab-1", name: "Collaborator One" }] },
          { messageHeadline: "Address review", authors: [{ login: "collab-1", name: "Collaborator One" }] },
        ],
      });

      expect(result).toEqual([
        { key: "pr-author", name: "PR Author", isPrimary: true },
        { key: "collab-1", name: "Collaborator One", isPrimary: false },
      ]);
    });

    test("given a merge commit's author, when collecting, then that author is excluded", () => {
      const { collectPrAuthors } = createPrAuthorCellHelpers({ getPreferredActorKey });

      const result = collectPrAuthors({
        authorLogin: "pr-author",
        author: "PR Author",
        commits: [
          {
            messageHeadline: "Merge branch 'main' into feature/test",
            authors: [{ login: "merge-bot", name: "Merge Bot" }],
          },
          { messageHeadline: "Real change", authors: [{ login: "collab-1", name: "Collaborator One" }] },
        ],
      });

      expect(result).toEqual([
        { key: "pr-author", name: "PR Author", isPrimary: true },
        { key: "collab-1", name: "Collaborator One", isPrimary: false },
      ]);
    });

    test("given no PR author and no commits, when collecting, then an empty array is returned", () => {
      const { collectPrAuthors } = createPrAuthorCellHelpers({
        getPreferredActorKey: () => "",
      });

      expect(collectPrAuthors({})).toEqual([]);
    });

    test("given commits with no authors array, when collecting, then only the PR author is returned", () => {
      const { collectPrAuthors } = createPrAuthorCellHelpers({ getPreferredActorKey });

      const result = collectPrAuthors({
        authorLogin: "pr-author",
        author: "PR Author",
        commits: [{ messageHeadline: "Add feature" }],
      });

      expect(result).toEqual([{ key: "pr-author", name: "PR Author", isPrimary: true }]);
    });
  });

  test("given a PR with commit co-authors, when creating author cell, then the primary author and co-authors both render as identity nodes", () => {
    const createdLogins = [];
    const helpers = createPrAuthorCellHelpers({
      getPreferredActorKey: (login, name) => String(login || name || "").trim(),
      createActorIdentityElement: ({ login, fallbackName, className }) => {
        createdLogins.push(login);
        const node = document.createElement("span");
        node.className = className;
        node.textContent = String(fallbackName || "");
        return node;
      },
      getManualNotesSummary: () => ({ hasNotes: false, commentsCount: 0, hasOtherNotes: false }),
      documentRef: document,
    });

    const result = helpers.createAuthorCell(
      {},
      {
        authorLogin: "pr-author",
        author: "PR Author",
        commits: [
          { messageHeadline: "Add feature", authors: [{ login: "collab-1", name: "Collaborator One" }] },
        ],
      },
      {},
    );

    expect(createdLogins).toEqual(["pr-author", "collab-1"]);
    const names = Array.from(result.querySelectorAll(".author-cell-name")).map((node) => node.textContent);
    expect(names).toEqual(["PR Author", "Collaborator One"]);
    expect(result.querySelector(".author-cell-co-author")?.textContent).toBe("Collaborator One");
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
