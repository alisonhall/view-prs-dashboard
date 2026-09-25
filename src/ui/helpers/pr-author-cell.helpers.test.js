const {
  createPrAuthorCellHelpers,
} = require("./pr-author-cell.helpers.js");

describe("pr author cell helpers", () => {
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

    test("given no getPreferredActorKey dependency is injected, when collecting, then a safe fallback key derivation is used", () => {
      const { collectPrAuthors } = createPrAuthorCellHelpers();

      const result = collectPrAuthors({
        authorLogin: "pr-author",
        author: "PR Author",
      });

      expect(result).toEqual([{ key: "pr-author", name: "PR Author", isPrimary: true }]);
    });
  });
});
